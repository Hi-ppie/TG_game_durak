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

function sendTo(clientId: string, payload: unknown) {
    const c = room.clients.get(clientId);
    if (c && c.ws.readyState === c.ws.OPEN) c.ws.send(JSON.stringify(payload));
}

function publishMenu() {
    for (const clientId of room.clients.keys()) {
        sendTo(clientId, { type: 'menu', you: room.humanId });
    }
}

function publishState() {
    if (!room.state) return;
    const state = room.state;
    for (const clientId of room.clients.keys()) {
        // Всегда указываем you = текущий humanId
        sendTo(clientId, { type: 'state', you: room.humanId, state });
    }
}

function ensureBotId() {
    if (!room.botId) room.botId = 'bot-' + Math.random().toString(36).slice(2);
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

    // Если нет управляемого клиента — им становится текущий
    if (!room.humanId) {
        room.humanId = id;
        console.log('[server] Human assigned:', room.humanId);
    } else {
        console.log(`[server] Spectator connected: ${id}`);
    }
    ensureBotId();

    // Приветствие и текущий экран
    sendTo(id, { type: 'hello', you: room.humanId });
    if (room.state) publishState();
    else publishMenu();

    ws.on('message', (raw) => {
        let msg: any;
        try { msg = JSON.parse(String(raw)); } catch { return; }

        if (msg?.type === 'hello') {
            sendTo(id, { type: 'hello', you: room.humanId });
            if (room.state) publishState(); else publishMenu();
            return;
        }

        if (msg?.type === 'start') {
            // Тот, кто стартует — становится управляющим
            room.humanId = id;
            ensureBotId();
            room.state = startGame(room.humanId!, room.botId!);
            console.log('[server] Game started. Trump:', room.state.trumpSuit);
            publishState();
            return;
        }

        if (msg?.type === 'reset') {
            room.humanId = id; // перехватываем управление
            ensureBotId();
            room.state = startGame(room.humanId!, room.botId!);
            console.log('[server] Game reset. Trump:', room.state.trumpSuit);
            publishState();
            return;
        }

        if (msg?.type === 'leave') {
            room.humanId = id; // текущий клиент — главный в меню
            room.state = null;
            publishMenu();
            return;
        }

        if (msg?.type === 'concede') {
            // Сдаться: завершить партию победой бота
            if (!room.state) return;
            if (id !== room.humanId) {
                sendTo(id, { type: 'error', message: 'Сдаться может только активный игрок' });
                return;
            }
            room.state.phase = 'finished';
            room.state.winnerId = room.botId!;
            room.state.message = 'Вы сдались. Бот победил';
            publishState();
            return;
        }

        if (msg?.type === 'action') {
            if (!room.state) return;
            // Если действие пришло не от human — считаем, что этот клиент перехватил управление (удобно для локального dev)
            if (id !== room.humanId) {
                room.humanId = id;
                console.log('[server] Control switched to:', id);
            }
            const action = msg.action as Action;
            const res = applyAction(room.state, room.humanId!, action);
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

    ws.on('close', (code, buf) => {
        room.clients.delete(id);
        const reason = buf && buf.toString ? buf.toString() : '';
        console.log(`[server] Client disconnected: ${id} (code=${code}${reason ? `, reason=${reason}` : ''})`);
        // Ничего не сбрасываем: управление можно перехватить действием или через start/reset
    });
});