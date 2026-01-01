import React, { useEffect, useRef, useState, useMemo } from 'react';

type Suit = '♠' | '♥' | '♦' | '♣';
type Rank = '6' | '7' | '8' | '9' | '10' | 'J' | 'Q' | 'K' | 'A';
type Card = { suit: Suit; rank: Rank };

type Player = { id: string; name: string; type: 'human' | 'bot'; hand: Card[] };
type TableSlot = { attack: Card; defend?: Card };
type GameState = {
    deck: Card[];
    trumpSuit: Suit;
    trumpCard: Card;
    players: [Player, Player];
    attacker: number;
    defender: number;
    table: TableSlot[];
    phase: 'attack' | 'defend' | 'cleanup' | 'finished';
    winnerId?: string;
    message?: string;
};

const RANK_ORDER: Record<Rank, number> = {
    '6': 0, '7': 1, '8': 2, '9': 3, '10': 4, 'J': 5, 'Q': 6, 'K': 7, 'A': 8,
};
function isTrump(card: Card, trump: Suit) { return card.suit === trump; }
function canBeat(attack: Card, defend: Card, trump: Suit) {
    if (attack.suit === defend.suit) return RANK_ORDER[defend.rank] > RANK_ORDER[attack.rank];
    if (isTrump(defend, trump) && !isTrump(attack, trump)) return true;
    return false;
}
function ranksOnTable(state: GameState): Set<Rank> {
    const set = new Set<Rank>();
    for (const s of state.table) { set.add(s.attack.rank); if (s.defend) set.add(s.defend.rank); }
    return set;
}

export function App() {
    const wsRef = useRef<WebSocket | null>(null);
    const [you, setYou] = useState<string | null>(null);
    const [state, setState] = useState<GameState | null>(null);
    const [error, setError] = useState<string | null>(null);
    const [wsStatus, setWsStatus] = useState<'connecting' | 'open' | 'closed' | 'error'>('connecting');
    const [wsUrl, setWsUrl] = useState<string>('');
    const [screen, setScreen] = useState<'menu' | 'game'>('menu');

    const WS_HOST = '127.0.0.1';
    const WS_PORT = String(import.meta.env.VITE_WS_PORT ?? '8080');
    const WS_URL = `ws://${WS_HOST}:${WS_PORT}`;

    useEffect(() => {
        if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
            setWsUrl(WS_URL);
            setWsStatus('open');
            return;
        }
        setWsUrl(WS_URL);
        setWsStatus('connecting');

        const ws = new WebSocket(WS_URL);
        wsRef.current = ws;

        ws.onopen = () => {
            setWsStatus('open');
            ws.send(JSON.stringify({ type: 'hello' }));
        };
        ws.onmessage = (ev) => {
            try {
                const data = JSON.parse(ev.data);
                if (data.type === 'hello') {
                    setYou(data.you);
                } else if (data.type === 'menu') {
                    setState(null);
                    setScreen('menu');
                } else if (data.type === 'state') {
                    setYou(data.you);
                    setState(data.state);
                    setError(null);
                    setScreen('game');
                } else if (data.type === 'error') {
                    setError(data.message);
                }
            } catch {
                // ignore
            }
        };
        ws.onerror = () => setWsStatus('error');
        ws.onclose = () => setWsStatus('closed');

        return () => { /* no-op in dev/HMR */ };
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [WS_URL]);

    // Производные значения — всегда в хуках
    const meIdx = useMemo(() => (state ? state.players.findIndex((p) => p.id === you) : -1), [state, you]);
    const oppIdx = useMemo(() => {
        if (!state) return -1;
        return meIdx === 0 ? 1 : meIdx === 1 ? 0 : -1;
    }, [state, meIdx]);
    const isMyTurnAttack = useMemo(() => !!state && meIdx >= 0 && state.phase === 'attack' && state.attacker === meIdx, [state, meIdx]);
    const isMyTurnDefend = useMemo(() => !!state && meIdx >= 0 && state.phase === 'defend' && state.defender === meIdx, [state, meIdx]);
    const attackAllowedRanks = useMemo(() => {
        if (!state) return null;
        if (state.table.length === 0) return null;
        return ranksOnTable(state);
    }, [state]);
    const openAttackIdx = useMemo(() => (!state ? -1 : state.table.findIndex((s) => !s.defend)), [state]);
    const defenseAllowedByIndex = useMemo(() => {
        if (!state) return () => false;
        if (openAttackIdx < 0) return () => false;
        const attackCard = state.table[openAttackIdx].attack;
        return (card: Card) => canBeat(attackCard, card, state.trumpSuit);
    }, [state, openAttackIdx]);

    const send = (payload: any) => {
        const ws = wsRef.current;
        if (!ws || ws.readyState !== ws.OPEN) return;
        ws.send(JSON.stringify(payload));
    };
    const sendAction = (action: any) => send({ type: 'action', action });
    const startGame = () => send({ type: 'start' });
    const resetGame = () => send({ type: 'reset' });
    const backToMenu = () => { send({ type: 'leave' }); setScreen('menu'); setState(null); };
    const concede = () => send({ type: 'concede' });

    const cardClickable = (card: Card): boolean => {
        if (!state || state.phase === 'finished') return false;
        if (isMyTurnAttack) {
            if (!attackAllowedRanks) return true;
            return attackAllowedRanks.has(card.rank);
        } else if (isMyTurnDefend) {
            if (openAttackIdx < 0) return false;
            return defenseAllowedByIndex(card);
        }
        return false;
    };
    const onCardClick = (card: Card) => {
        if (!state) return;
        if (!cardClickable(card)) return;
        if (isMyTurnAttack) sendAction({ kind: 'attack', card });
        else if (isMyTurnDefend) sendAction({ kind: 'defend', attackIndex: openAttackIdx, card });
    };

    // Меню
    if (screen === 'menu') {
        return (
            <div className="app">
                <div className="panel header">
                    <h1 style={{ margin: 0 }}>Durak Local</h1>
                    <div className="status">
                        <span className="badge">WS: {wsUrl}</span>
                        <span className="badge">Статус: {wsStatus}</span>
                    </div>
                </div>
                <div className="panel" style={{ marginTop: 12 }}>
                    <h3 className="section-title">Главное меню</h3>
                    <p>Одна партия против бота. Нажмите, чтобы начать.</p>
                    <div className="actions">
                        <button onClick={startGame} disabled={wsStatus !== 'open'}>Начать игру</button>
                    </div>
                    {error && <div className="panel" style={{ marginTop: 12, background: '#ffe3e3', borderColor: '#ffb3b3', color: '#7a2222' }}>Ошибка: {error}</div>}
                </div>
            </div>
        );
    }

    // Игра (ровная раскладка + колода по центру)
    if (!state) {
        return (
            <div className="app">
                <div className="panel">Подключаемся... · WS: {wsUrl} · {wsStatus}</div>
            </div>
        );
    }

    const me = state.players[meIdx];
    const opp = oppIdx >= 0 ? state.players[oppIdx] : state.players[meIdx === 0 ? 1 : 0];
    const trump = state.trumpSuit;
    const deckCount = state.deck.length;

    const take = () => sendAction({ kind: 'take' });
    const done = () => sendAction({ kind: 'done' });

    return (
        <div className="app">
            {/* Заголовок */}
            <div className="panel header">
                <h1 style={{ margin: 0 }}>Durak Local</h1>
                <div className="status">
                    <span className="badge">WS: {wsUrl}</span>
                    <span className="badge">Козырь: <b>{trump}</b></span>
                    <span className="badge">В колоде: {deckCount}</span>
                    <span className="badge">Фаза: {state.phase}</span>
                    <span className="badge">Ходит: {state.players[state.attacker].name}</span>
                </div>
            </div>

            {/* Доска: верхняя рука (рубашки), центр (колода и козырь), справа стол, нижняя рука (веер) */}
            <div className="board">
                <div className="board-row top">
                    <HandFan hand={opp.hand} trump={trump} clickable={false} onClick={() => {}} showBack />
                </div>

                <div className="board-row center">
                    <div className="center-inner">
                        <div className="center-middle">
                            <DeckStack count={deckCount} />
                            <div className="trump-on-deck">
                                <CardView card={state.trumpCard} trump={trump} clickable={false} />
                            </div>
                        </div>
                        <div className="center-right">
                            <div className="panel">
                                <h3 className="section-title">Стол</h3>
                                <div className="table">
                                    {state.table.map((slot, i) => (
                                        <div key={i} className="slot">
                                            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                                                <span>Атака:</span>
                                                <CardView card={slot.attack} trump={trump} clickable={false} />
                                            </div>
                                            <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginTop: 8 }}>
                                                <span>Защита:</span>
                                                {slot.defend ? (
                                                    <CardView card={slot.defend} trump={trump} clickable={false} />
                                                ) : (
                                                    <span>—</span>
                                                )}
                                            </div>
                                        </div>
                                    ))}
                                    {state.table.length === 0 && <div className="slot">Стол пуст</div>}
                                </div>
                            </div>
                        </div>
                    </div>
                </div>

                <div className="board-row bottom">
                    <HandFan
                        hand={me.hand}
                        trump={trump}
                        clickable={state.phase !== 'finished'}
                        onClick={(c) => onCardClick(c)}
                        computeClickable={(c) => state.phase !== 'finished' && cardClickable(c)}
                    />
                </div>
            </div>

            {/* Сообщения и действия */}
            {state.message && (
                <div className="panel" style={{ marginTop: 12, background: '#fffbe6', borderColor: '#ffe58f' }}>
                    {state.message}
                </div>
            )}
            {error && (
                <div className="panel" style={{ marginTop: 12, background: '#ffe3e3', borderColor: '#ffb3b3', color: '#7a2222' }}>
                    Ошибка: {error}
                </div>
            )}

            {/* Панель завершения игры */}
            {state.phase === 'finished' && (
                <div className="panel" style={{ marginTop: 12, background: '#e6ffed', borderColor: '#abf5b5', color: '#1a7f37' }}>
                    <h3 className="section-title">Игра завершена</h3>
                    <p>{state.winnerId ? (state.winnerId === me.id ? 'Вы победили!' : 'Бот победил') : 'Ничья'}</p>
                    <div className="actions">
                        <button onClick={resetGame}>Играть снова</button>
                        <button onClick={backToMenu}>В главное меню</button>
                    </div>
                </div>
            )}

            {/* Кнопки хода, добавлена «Сдаться» */}
            <div className="panel actions" style={{ marginTop: 12 }}>
                <button onClick={take} disabled={!isMyTurnDefend || state.phase === 'finished'}>Взять</button>
                <button onClick={done} disabled={!isMyTurnAttack || state.phase === 'finished'}>Завершить ход</button>
                <button onClick={concede} disabled={state.phase === 'finished'}>Сдаться</button>
            </div>
        </div>
    );
}

function CardView({
                      card,
                      trump,
                      clickable,
                      onClick,
                  }: {
    card: Card;
    trump: Suit;
    clickable: boolean;
    onClick?: () => void;
}) {
    const red = card.suit === '♥' || card.suit === '♦';
    const isT = card.suit === trump;
    const color = red ? 'var(--red)' : 'var(--black)';
    const className = [
        'card',
        'face',
        isT ? 'trump' : '',
        clickable ? 'clickable' : '',
    ].join(' ').trim();

    return (
        <div className={className} onClick={clickable ? onClick : undefined}>
            <div className="corner tl" style={{ color }}>
                {card.rank} {card.suit}
            </div>
            <div className="pip" style={{ color }}>{card.suit}</div>
            <div className="corner br" style={{ color }}>
                {card.rank} {card.suit}
            </div>
        </div>
    );
}

function CardBack() {
    return <div className="card back" />;
}

function DeckStack({ count }: { count: number }) {
    return (
        <div className="deck-center">
            <div className="deck-stack">
                <CardBack />
                <CardBack />
                <CardBack />
                <div className="deck-count">{count}</div>
            </div>
        </div>
    );
}

function HandFan({
                     hand,
                     trump,
                     onClick,
                     clickable,
                     computeClickable,
                     showBack,
                 }: {
    hand: Card[];
    trump: Suit;
    onClick: (c: Card) => void;
    clickable: boolean;
    computeClickable?: (c: Card) => boolean;
    showBack?: boolean;
}) {
    const n = hand.length;
    const maxAngle = Math.min(12, 4 + n); // ровнее веер
    const startAngle = -maxAngle;
    const endAngle = maxAngle;
    const angleStep = n > 1 ? (endAngle - startAngle) / (n - 1) : 0;

    return (
        <div className="hand-fan">
            {hand.map((c, idx) => {
                const angle = startAngle + idx * angleStep;
                const offsetX = idx * 24 - (n - 1) * 12; // ровная центрировка
                const z = idx;
                const canClick = computeClickable ? computeClickable(c) : clickable;

                return (
                    <button
                        key={idx}
                        className="fan-button"
                        onClick={() => onClick(c)}
                        disabled={!canClick}
                        style={{
                            transform: `translate(${offsetX}px, 0px) rotate(${angle}deg)`,
                            zIndex: z,
                            cursor: canClick ? 'pointer' : 'default',
                        }}
                    >
                        {showBack ? <CardBack /> : <CardView card={c} trump={trump} clickable={canClick} />}
                    </button>
                );
            })}
        </div>
    );
}