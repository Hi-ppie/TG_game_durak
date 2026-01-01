import { WebSocketServer, type WebSocket } from 'ws';
import {
    startGame,
    applyAction,
    botDecide,
    type GameState,
    type Action,
} from '@durak/engine';

type Client = { id: string; ws: WebSocket };
type Room = {
    id: string;
    clients: Map<string, Client>;
    state: GameState | null;
    humanId: string | null;
    botId: string | null;
};

const PORT = Number(process.env.PORT ?? 8080);
const wss = new WebSocketServer({ port: PORT }, () => {
    console.log(`[server] WebSocket listening on ws://localhost:${PORT}`);
});

const room: Room = {
    id: 'room-1',
    clients: new Map(),
    state: null,
    humanId: null,
    botId: null,
};

function broadcast(payload: unknown) {
    const data = JSON.stringify(payload);
    for (const { ws } of room.clients.values()) {
        if (ws.readyState === ws.OPEN) ws.send(data);
    }
}

function sendTo(clientId: string, payload: unknown) {
    const c = room.clients.get(clientId);
    if (c && c.ws.readyState === c.ws.OPEN) c.ws.send(JSON.stringify(payload));
}

function ensureGameStarted(humanId: string) {
    if (!room.botId) room.botId = 'bot-' + Math.random().toString(36).slice(2);
    if (!room.state) {
        room.state = startGame(humanId, room.botId);
        console.log('[server] Game started. Trump:', room.state.trumpSuit);
    }
}

function publishState() {
    if (!room.state) return;
    const state = room.state;
    for (const clientId of room.clients.keys()) {
        sendTo(clientId, { type: 'state', you: clientId, state });
    }
}

function processBotTurns() {
    if (!room.state) return;
    let guard = 50;
    while (guard-- > 0) {
        const act = botDecide(room.state);
        if (!act) break;
        const res = applyAction(room.state, room.botId!, act);
        room.state = res.state;
        if (!res.ok) {
            console.log('[bot] action error:', res.error);
            break;
        }
        if (room.state.phase === 'finished') break;
        if (act.kind === 'attack' || act.kind === 'defend' || act.kind === 'take') break;
    }
}

wss.on('connection', (ws) => {
    const id = Math.random().toString(36).slice(2);
    room.clients.set(id, { id, ws });
    console.log(`[server] Client connected: ${id}`);

    ws.on('message', (raw) => {
        let msg: any;
        try { msg = JSON.parse(String(raw)); } catch { return; }

        if (msg?.type === 'hello') {
            room.humanId ??= id;
            ensureGameStarted(room.humanId);
            sendTo(id, { type: 'hello', you: id });
            publishState();
            return;
        }

        if (msg?.type === 'action') {
            if (!room.state) return;
            const action = msg.action as Action;
            const res = applyAction(room.state, id, action);
            room.state = res.state;
            if (!res.ok) {
                sendTo(id, { type: 'error', message: res.error });
            } else {
                processBotTurns();
                publishState();
            }
            return;
        }
    });

    ws.on('close', () => {
        room.clients.delete(id);
        console.log(`[server] Client disconnected: ${id}`);
    });

    sendTo(id, { type: 'welcome', id });
});