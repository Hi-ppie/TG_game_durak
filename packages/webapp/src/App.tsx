import React, { useEffect, useRef, useState } from 'react';

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

export function App() {
    const wsRef = useRef<WebSocket | null>(null);
    const [you, setYou] = useState<string | null>(null);
    const [state, setState] = useState<GameState | null>(null);
    const [error, setError] = useState<string | null>(null);

    useEffect(() => {
        const ws = new WebSocket('ws://localhost:8080');
        wsRef.current = ws;
        ws.onopen = () => {
            ws.send(JSON.stringify({ type: 'hello' }));
        };
        ws.onmessage = (ev) => {
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
        };
        ws.onclose = () => {};
        ws.onerror = (err) => console.error('[webapp] ws error:', err);
        return () => ws.close();
    }, []);

    if (!state) {
        return <div style={{ padding: 16 }}>Подключаемся...</div>;
    }

    const meIdx = state.players.findIndex((p) => p.id === you);
    const oppIdx = meIdx === 0 ? 1 : 0;
    const me = state.players[meIdx];
    const opp = state.players[oppIdx];

    const isMyTurnAttack = state.phase === 'attack' && state.attacker === meIdx;
    const isMyTurnDefend = state.phase === 'defend' && state.defender === meIdx;

    const sendAction = (action: any) => {
        const ws = wsRef.current;
        if (!ws || ws.readyState !== ws.OPEN) return;
        ws.send(JSON.stringify({ type: 'action', action }));
    };

    const onCardClick = (card: Card) => {
        if (state.phase === 'finished') return;
        if (isMyTurnAttack) {
            sendAction({ kind: 'attack', card });
        } else if (isMyTurnDefend) {
            // Защищаем первую непокрытую атаку
            const idx = state.table.findIndex((s) => !s.defend);
            if (idx >= 0) {
                sendAction({ kind: 'defend', attackIndex: idx, card });
            }
        }
    };

    const take = () => sendAction({ kind: 'take' });
    const done = () => sendAction({ kind: 'done' });

    const trump = state.trumpSuit;
    const deckCount = state.deck.length;

    return (
        <div style={{ maxWidth: 900, margin: '24px auto', fontFamily: 'system-ui' }}>
            <h1>Durak Local</h1>
            <p>
                Козырь: <b>{trump}</b> · В колоде: {deckCount} · Фаза: {state.phase}{' '}
                · Ходит: {state.players[state.attacker].name}
            </p>
            {state.message && <p style={{ color: '#666' }}>{state.message}</p>}
            {error && <p style={{ color: 'crimson' }}>Ошибка: {error}</p>}
            {state.winnerId && <p>Победитель: {state.winnerId === me.id ? 'Вы' : 'Бот'}</p>}

            <section style={{ marginTop: 16 }}>
                <h3>Стол</h3>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                    {state.table.map((slot, i) => (
                        <div key={i} style={{ border: '1px solid #ccc', padding: 8 }}>
                            <div>Атака: <CardView card={slot.attack} trump={trump} /></div>
                            <div>Защита: {slot.defend ? <CardView card={slot.defend} trump={trump} /> : '—'}</div>
                        </div>
                    ))}
                    {state.table.length === 0 && <div>Стол пуст</div>}
                </div>
            </section>

            <section style={{ marginTop: 16 }}>
                <h3>Ваша рука ({me.hand.length})</h3>
                <HandView hand={me.hand} trump={trump} onClick={onCardClick} clickable={isMyTurnAttack || isMyTurnDefend} />
            </section>

            <section style={{ marginTop: 16 }}>
                <h3>Рука оппонента ({opp.hand.length})</h3>
                {/* Для теста показываем карты бота. В реальной игре скрываем. */}
                <HandView hand={opp.hand} trump={trump} onClick={() => {}} clickable={false} />
            </section>

            <section style={{ marginTop: 16, display: 'flex', gap: 8 }}>
                <button onClick={take} disabled={!isMyTurnDefend || state.phase === 'finished'}>Взять</button>
                <button onClick={done} disabled={!isMyTurnAttack || state.phase === 'finished'}>Завершить ход</button>
            </section>
        </div>
    );
}

function CardView({ card, trump }: { card: Card; trump: Suit }) {
    const isTrump = card.suit === trump;
    return (
        <span
            style={{
                display: 'inline-block',
                padding: '6px 8px',
                border: '1px solid #999',
                borderRadius: 4,
                background: isTrump ? '#ffe9a8' : '#f5f5f5',
                minWidth: 44,
                textAlign: 'center',
            }}
            title={isTrump ? 'Козырь' : ''}
        >
      {card.rank} {card.suit}
    </span>
    );
}

function HandView({
                      hand,
                      trump,
                      onClick,
                      clickable,
                  }: {
    hand: Card[];
    trump: Suit;
    onClick: (c: Card) => void;
    clickable: boolean;
}) {
    return (
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
            {hand.map((c, idx) => (
                <button
                    key={idx}
                    onClick={() => onClick(c)}
                    disabled={!clickable}
                    style={{ cursor: clickable ? 'pointer' : 'default', background: 'transparent', border: 'none', padding: 0 }}
                >
                    <CardView card={c} trump={trump} />
                </button>
            ))}
        </div>
    );
}