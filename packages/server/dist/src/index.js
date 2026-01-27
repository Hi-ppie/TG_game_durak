import { WebSocketServer } from 'ws';
import { startGame, applyAction, botDecide, } from '@durak/engine';
const PORT = Number(process.env.PORT ?? 8080);
const wss = new WebSocketServer({ port: PORT }, () => {
    console.log(`[server] WebSocket listening on ws://localhost:${PORT}`);
});
const room = {
    id: 'room-1',
    clients: new Map(),
    state: null,
    currentPlayerId: null,
    botId: null,
};
function ensureBotId() {
    if (!room.botId)
        room.botId = 'bot-' + Math.random().toString(36).slice(2);
}
function sendTo(clientId, payload) {
    const c = room.clients.get(clientId);
    if (c && c.ws.readyState === c.ws.OPEN)
        c.ws.send(JSON.stringify(payload));
}
function broadcast(payload) {
    for (const cid of room.clients.keys())
        sendTo(cid, payload);
}
function publishMenu() {
    for (const cid of room.clients.keys()) {
        sendTo(cid, { type: 'menu', you: room.currentPlayerId });
    }
}
function publishState() {
    if (!room.state)
        return;
    for (const cid of room.clients.keys()) {
        sendTo(cid, { type: 'state', you: room.currentPlayerId, state: room.state });
    }
}
function processBotTurns() {
    if (!room.state || !room.botId)
        return;
    let guard = 50;
    while (guard-- > 0) {
        const act = botDecide(room.state);
        if (!act)
            break;
        const res = applyAction(room.state, room.botId, act);
        room.state = res.state;
        if (!res.ok) {
            console.log('[bot] action error:', res.error);
            break;
        }
        if (act.kind === 'attack' || act.kind === 'defend' || act.kind === 'take' || act.kind === 'done')
            break;
        if (room.state.phase === 'finished')
            break;
    }
}
wss.on('connection', (ws) => {
    const id = Math.random().toString(36).slice(2);
    room.clients.set(id, { id, ws });
    console.log(`[server] Client connected: ${id}`);
    ensureBotId();
    // Ждём hello с playerId
    ws.on('message', (raw) => {
        let msg;
        try {
            msg = JSON.parse(String(raw));
        }
        catch {
            return;
        }
        // Все сообщения должны содержать playerId
        const playerId = msg?.playerId;
        if (!playerId) {
            sendTo(id, { type: 'error', message: 'playerId is required' });
            return;
        }
        const client = room.clients.get(id);
        if (client)
            client.playerId = playerId;
        if (msg?.type === 'hello') {
            // Если есть игра и в ней есть этот playerId — просто отдаем state
            if (room.state && room.state.players.some((p) => p.id === playerId)) {
                room.currentPlayerId = playerId;
                publishState();
            }
            else if (!room.state) {
                // Нет игры — показываем меню
                room.currentPlayerId = playerId;
                publishMenu();
            }
            else {
                // Есть игра, но другой игрок — показываем меню (как зрителю)
                sendTo(id, { type: 'menu', you: room.currentPlayerId });
            }
            return;
        }
        if (msg?.type === 'start') {
            room.currentPlayerId = playerId;
            ensureBotId();
            room.state = startGame(playerId, room.botId); // human id = playerId
            console.log('[server] Game started. Trump:', room.state.trumpSuit);
            publishState();
            return;
        }
        if (msg?.type === 'reset') {
            room.currentPlayerId = playerId;
            ensureBotId();
            room.state = startGame(playerId, room.botId);
            console.log('[server] Game reset. Trump:', room.state.trumpSuit);
            publishState();
            return;
        }
        if (msg?.type === 'leave') {
            if (room.currentPlayerId === playerId) {
                room.state = null;
            }
            publishMenu();
            return;
        }
        if (msg?.type === 'concede') {
            if (!room.state)
                return;
            if (room.currentPlayerId !== playerId) {
                sendTo(id, { type: 'error', message: 'Сдаться может только активный игрок' });
                return;
            }
            room.state.phase = 'finished';
            room.state.winnerId = room.botId;
            room.state.message = 'Вы сдались. Бот победил';
            publishState();
            return;
        }
        if (msg?.type === 'action') {
            if (!room.state)
                return;
            if (room.currentPlayerId !== playerId) {
                sendTo(id, { type: 'error', message: 'Сейчас ход другого игрока' });
                return;
            }
            const action = msg.action;
            const res = applyAction(room.state, playerId, action);
            room.state = res.state;
            if (!res.ok) {
                sendTo(id, { type: 'error', message: res.error });
            }
            else {
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
        // Не сбрасываем партию: playerId может вернуться и продолжить
    });
});
