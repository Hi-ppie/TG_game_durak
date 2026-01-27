import React, { useEffect, useRef, useState, useMemo } from 'react';
import { calculateCircularCardLayout, calculateCircularCardLayoutMirrored } from './cardLayout';

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
    phase: 'attack' | 'defend' | 'throw' | 'finished';
    winnerId?: string;
    message?: string;
};

// Configuration for card layout
const CARD_LAYOUT_CONFIG = {
    radius: 350,  // Radius of the invisible circle for card positioning
    screenWidth: 900,  // Width of the hand-fan container
    screenHeight: 240,  // Height of the hand-fan container
    cardHeight: 124,  // Height of a card
};

// Глобальный WebSocket
let WS_SINGLETON: WebSocket | null = null;
let WS_INITIALIZED = false;
let WS_HANDLERS_ATTACHED = false;

const WS_HOST = '127.0.0.1';
const WS_PORT = String(import.meta.env.VITE_WS_PORT ?? '8080');
const WS_URL = `ws://${WS_HOST}:${WS_PORT}`;

// Персистентный playerId
const stored = localStorage.getItem('playerId');
const PLAYER_ID = stored ?? crypto.randomUUID();
if (!stored) localStorage.setItem('playerId', PLAYER_ID);

function isTrump(card: Card, trump: Suit) { return card.suit === trump; }
function canBeat(attack: Card, defend: Card, trump: Suit) {
    const RANK_ORDER: Record<Rank, number> = {
        '6': 0,'7': 1,'8': 2,'9': 3,'10': 4,'J': 5,'Q': 6,'K': 7,'A': 8,
    };
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
    const [you, setYou] = useState<string | null>(null);
    const [state, setState] = useState<GameState | null>(null);
    const [error, setError] = useState<string | null>(null);
    const [wsStatus, setWsStatus] = useState<'connecting' | 'open' | 'closed' | 'error'>('connecting');
    const [wsUrl] = useState<string>(WS_URL);
    const [screen, setScreen] = useState<'menu' | 'game'>('menu');

    const onOpenRef = useRef<(ev: Event) => void>();
    const onMessageRef = useRef<(ev: MessageEvent) => void>();
    const onErrorRef = useRef<(ev: Event) => void>();
    const onCloseRef = useRef<(ev: CloseEvent) => void>();

    useEffect(() => {
        if (!WS_INITIALIZED) {
            WS_INITIALIZED = true;
            WS_SINGLETON = new WebSocket(WS_URL);
            console.log('[webapp] creating ws', WS_URL);
        }
        attachHandlers();
        return () => {};
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    function attachHandlers() {
        if (!WS_SINGLETON || WS_HANDLERS_ATTACHED) return;

        const onopen = () => {
            console.log('[webapp] ws open', WS_URL);
            setWsStatus('open');
            WS_SINGLETON!.send(JSON.stringify({ type: 'hello', playerId: PLAYER_ID }));
        };
        const onmessage = (ev: MessageEvent) => {
            try {
                const data = JSON.parse(ev.data);
                console.log('[webapp] msg:', data.type, data);
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
                    console.warn('[webapp] server error:', data.message);
                    setError(data.message);
                }
            } catch {
                console.warn('[webapp] non-JSON message:', ev.data);
            }
        };
        const onerror = (ev: Event) => {
            console.error('[webapp] ws error:', ev);
            setWsStatus('error');
        };
        const onclose = (ev: CloseEvent) => {
            console.warn('[webapp] ws closed:', ev.code, ev.reason);
            setWsStatus('closed');
        };

        onOpenRef.current = onopen;
        onMessageRef.current = onmessage;
        onErrorRef.current = onerror;
        onCloseRef.current = onclose;

        WS_SINGLETON.addEventListener('open', onopen);
        WS_SINGLETON.addEventListener('message', onmessage);
        WS_SINGLETON.addEventListener('error', onerror);
        WS_SINGLETON.addEventListener('close', onclose);

        if (WS_SINGLETON.readyState === WebSocket.OPEN) onopen();
        else if (WS_SINGLETON.readyState === WebSocket.CLOSED) setWsStatus('closed');
        else setWsStatus('connecting');

        WS_HANDLERS_ATTACHED = true;
    }

    const meIdx = useMemo(() => (state ? state.players.findIndex((p) => p.id === you) : -1), [state, you]);
    const oppIdx = useMemo(() => {
        if (!state) return -1;
        return meIdx === 0 ? 1 : meIdx === 1 ? 0 : -1;
    }, [state, meIdx]);

    const isMyTurnAttack = useMemo(() =>
            !!state && meIdx >= 0 && (state.phase === 'attack' || state.phase === 'throw') && state.attacker === meIdx,
        [state, meIdx]
    );
    const isMyTurnDefend = useMemo(() =>
            !!state && meIdx >= 0 && state.phase === 'defend' && state.defender === meIdx,
        [state, meIdx]
    );

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

    const canThrow = useMemo(() => state?.phase === 'throw', [state?.phase]);

    const throwSlotsLeft = useMemo(() => {
        if (!state) return 0;
        const defenderHand = state.players[state.defender].hand.length;
        const onTable = state.table.length;
        const left = defenderHand - onTable;
        return left > 0 ? left : 0;
    }, [state]);

    const send = (payload: any) => {
        const ws = WS_SINGLETON;
        if (!ws || ws.readyState !== WebSocket.OPEN) {
            console.warn('[webapp] send skipped; ws not open');
            return;
        }
        ws.send(JSON.stringify({ ...payload, playerId: PLAYER_ID }));
    };
    const sendAction = (action: any) => send({ type: 'action', action });
    const startGame = () => { setScreen('game'); setState(null); setError(null); send({ type: 'start' }); };
    const resetGame = () => { setScreen('game'); setState(null); setError(null); send({ type: 'reset' }); };
    const backToMenu = () => { send({ type: 'leave' }); setScreen('menu'); setState(null); setError(null); };
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

    if (!state) {
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
                    <h3 className="section-title">Загрузка состояния…</h3>
                    <p>Игра запущена на сервере, ждём первое состояние.</p>
                    {error && <div className="panel" style={{ marginTop: 12, background: '#ffe3e3', borderColor: '#ffb3b3', color: '#7a2222' }}>Ошибка: {error}</div>}
                </div>
            </div>
        );
    }

    if (meIdx < 0) {
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
                    <h3 className="section-title">Ждём идентификацию клиента…</h3>
                    <p>Если экран завис — перезагрузите страницу (F5). Это безопасно.</p>
                    {error && <div className="panel" style={{ marginTop: 12, background: '#ffe3e3', borderColor: '#ffb3b3', color: '#7a2222' }}>Ошибка: {error}</div>}
                </div>
            </div>
        );
    }

    const oppIdxSafe = oppIdx >= 0 ? oppIdx : (meIdx === 0 ? 1 : 0);
    const me = state.players[meIdx];
    const opp = state.players[oppIdxSafe];
    const trump = state.trumpSuit;
    const deckCount = state.deck.length;

    const take = () => sendAction({ kind: 'take' });
    const done = () => sendAction({ kind: 'done' });

    return (
        <div className="app">
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

            <div className="board">
                <div className="board-row top">
                    <HandFan hand={opp.hand} trump={trump} clickable={false} onClick={() => {}} showBack mirror />
                </div>

                <div className="board-row center">
                    <div className="center-inner">
                        <div className="center-middle">
                            <DeckStack count={deckCount} />
                            <div className="trump-under">
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

            {state.message && (
                <div className="panel" style={{ marginTop: 12, background: '#fffbe6', borderColor: '#ffe58f' }}>
                    {state.message}
                    {canThrow && (
                        <div style={{ marginTop: 8, fontSize: 14 }}>
                            Защитник берёт. Можно докинуть ещё <b>{throwSlotsLeft}</b> {throwSlotsLeft === 1 ? 'карту' : 'карты'} по рангу, затем нажмите «Завершить ход».
                        </div>
                    )}
                </div>
            )}
            {error && (
                <div className="panel" style={{ marginTop: 12, background: '#ffe3e3', borderColor: '#ffb3b3', color: '#7a2222' }}>
                    Ошибка: {error}
                </div>
            )}

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

            <div className="panel actions" style={{ marginTop: 12 }}>
                <button onClick={take} disabled={!isMyTurnDefend || state.phase === 'finished'}>Взять</button>
                <button onClick={done} disabled={!isMyTurnAttack || state.phase === 'finished'}>
                    {canThrow ? 'Завершить ход (передать защитнику)' : 'Завершить ход'}
                </button>
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
                     mirror = false, // true для оппонента
                 }: {
    hand: Card[];
    trump: Suit;
    onClick: (c: Card) => void;
    clickable: boolean;
    computeClickable?: (c: Card) => boolean;
    showBack?: boolean;
    mirror?: boolean;
}) {
    const n = hand.length;

    // Calculate positions using the circular layout function
    const positions = mirror 
        ? calculateCircularCardLayoutMirrored(n, CARD_LAYOUT_CONFIG)
        : calculateCircularCardLayout(n, CARD_LAYOUT_CONFIG);

    return (
        <div className="hand-fan">
            {hand.map((c, idx) => {
                const pos = positions[idx];
                const canClick = computeClickable ? computeClickable(c) : clickable;

                return (
                    <button
                        key={idx}
                        className="fan-button"
                        onClick={() => onClick(c)}
                        disabled={!canClick}
                        style={{
                            transform: `translate(${pos.x}px, ${pos.y}px) rotate(${pos.rotation}deg)`,
                            zIndex: pos.zIndex,
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