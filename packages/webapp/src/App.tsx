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

    const PORT = String(import.meta.env.VITE_WS_PORT ?? '8080');
    const URL = `ws://${location.hostname}:${PORT}`;

    useEffect(() => {
        setWsUrl(URL);
        setWsStatus('connecting');

        const ws = new WebSocket(URL);
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
                } else if (data.type === 'state') {
                    setYou(data.you);
                    setState(data.state);
                    setError(null);
                } else if (data.type === 'error') {
                    setError(data.message);
                }
            } catch { /* ignore non-JSON */ }
        };
        ws.onerror = () => setWsStatus('error');
        ws.onclose = () => setWsStatus('closed');

        return () => ws.close();
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [URL]);

    if (!state) {
        return (
            <div className="app">
                <div className="panel">
                    <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                        <div>Подключаемся...</div>
                        <div style={{ fontSize: 12, color: '#666' }}>
                            WS: {wsUrl} · статус: {wsStatus}
                        </div>
                    </div>
                    {error && (
                        <div className="panel" style={{ marginTop: 12, background: '#ffe3e3', borderColor: '#ffb3b3', color: '#7a2222' }}>
                            Ошибка: {error}
                        </div>
                    )}
                </div>
            </div>
        );
    }

    const meIdx = state.players.findIndex((p) => p.id === you);
    const oppIdx = meIdx === 0 ? 1 : 0;
    const me = state.players[meIdx];
    const opp = state.players[oppIdx];

    const isMyTurnAttack = state.phase === 'attack' && state.attacker === meIdx;
    const isMyTurnDefend = state.phase === 'defend' && state.defender === meIdx;

    const attackAllowedRanks = useMemo(() => {
        if (state.table.length === 0) return null;
        return ranksOnTable(state);
    }, [state]);
    const openAttackIdx = useMemo(() => state.table.findIndex((s) => !s.defend), [state.table]);
    const defenseAllowedByIndex = useMemo(() => {
        if (openAttackIdx < 0) return () => false;
        const attackCard = state.table[openAttackIdx].attack;
        return (card: Card) => canBeat(attackCard, card, state.trumpSuit);
    }, [openAttackIdx, state.table, state.trumpSuit]);

    const sendAction = (action: any) => {
        const ws = wsRef.current;
        if (!ws || ws.readyState !== ws.OPEN) return;
        ws.send(JSON.stringify({ type: 'action', action }));
    };

    const cardClickable = (card: Card): boolean => {
        if (state.phase === 'finished') return false;
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
        if (!cardClickable(card)) return;
        if (isMyTurnAttack) {
            sendAction({ kind: 'attack', card });
        } else if (isMyTurnDefend) {
            sendAction({ kind: 'defend', attackIndex: openAttackIdx, card });
        }
    };

    const take = () => sendAction({ kind: 'take' });
    const done = () => sendAction({ kind: 'done' });

    const trump = state.trumpSuit;
    const deckCount = state.deck.length;

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
            {state.winnerId && (
                <div className="panel" style={{ marginTop: 12, background: '#e6ffed', borderColor: '#abf5b5', color: '#1a7f37' }}>
                    Победитель: {state.winnerId === me.id ? 'Вы' : 'Бот'}
                </div>
            )}

            <div className="panel" style={{ marginTop: 12 }}>
                <div className="deck-area">
                    <div className="deck-stack">
                        <div className="deck-count">{deckCount}</div>
                    </div>
                    <div className="trump-holder">
                        <CardView card={state.trumpCard} trump={trump} clickable={false} />
                    </div>
                </div>
            </div>

            <div className="panel" style={{ marginTop: 12 }}>
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

            <div className="panel" style={{ marginTop: 12 }}>
                <h3 className="section-title">Ваша рука ({me.hand.length})</h3>
                <div className="hand">
                    {me.hand.map((c, idx) => (
                        <CardView
                            key={idx}
                            card={c}
                            trump={trump}
                            clickable={cardClickable(c)}
                            onClick={() => onCardClick(c)}
                        />
                    ))}
                </div>
            </div>

            <div className="panel" style={{ marginTop: 12 }}>
                <h3 className="section-title">Рука оппонента ({opp.hand.length})</h3>
                <div className="hand">
                    {opp.hand.map((c, idx) => (
                        <CardView key={idx} card={c} trump={trump} clickable={false} />
                    ))}
                </div>
            </div>

            <div className="panel actions" style={{ marginTop: 12 }}>
                <button onClick={take} disabled={!isMyTurnDefend || state.phase === 'finished'}>Взять</button>
                <button onClick={done} disabled={!isMyTurnAttack || state.phase === 'finished'}>Завершить ход</button>
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
        isT ? 'trump' : '',
        clickable ? 'clickable' : 'disabled',
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