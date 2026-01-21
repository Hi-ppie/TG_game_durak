export type Suit = '♠' | '♥' | '♦' | '♣';
export type Rank = '6' | '7' | '8' | '9' | '10' | 'J' | 'Q' | 'K' | 'A';

export type Card = {
    suit: Suit;
    rank: Rank;
};

export type Deck = Card[];

export type PlayerType = 'human' | 'bot';

export type Player = {
    id: string;
    name: string;
    type: PlayerType;
    hand: Card[];
};

export type TableSlot = {
    attack: Card;
    defend?: Card;
};

// Добавили фазу 'throw' — докидывание атаки после решения "беру"
export type Phase = 'attack' | 'defend' | 'throw' | 'finished';

export type GameState = {
    deck: Deck;
    trumpSuit: Suit;
    trumpCard: Card;
    players: [Player, Player];
    attacker: number; // index in players
    defender: number; // index in players
    table: TableSlot[];
    phase: Phase;
    winnerId?: string;
    message?: string; // для отладки/подсказок
};

const RANK_ORDER: Record<Rank, number> = {
    '6': 0,
    '7': 1,
    '8': 2,
    '9': 3,
    '10': 4,
    'J': 5,
    'Q': 6,
    'K': 7,
    'A': 8,
};

export function makeDeck(): Deck {
    const suits: Suit[] = ['♠', '♥', '♦', '♣'];
    const ranks: Rank[] = ['6', '7', '8', '9', '10', 'J', 'Q', 'K', 'A'];
    const deck: Deck = [];
    for (const s of suits) {
        for (const r of ranks) {
            deck.push({ suit: s, rank: r });
        }
    }
    return deck;
}

export function shuffle<T>(arr: T[]): T[] {
    const a = arr.slice();
    for (let i = a.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [a[i], a[j]] = [a[j], a[i]];
    }
    return a;
}

export function isTrump(card: Card, trumpSuit: Suit) {
    return card.suit === trumpSuit;
}

export function canBeat(attack: Card, defend: Card, trumpSuit: Suit): boolean {
    if (attack.suit === defend.suit) {
        return RANK_ORDER[defend.rank] > RANK_ORDER[attack.rank];
    }
    if (isTrump(defend, trumpSuit) && !isTrump(attack, trumpSuit)) {
        return true;
    }
    return false;
}

export function sortHand(hand: Card[], trumpSuit: Suit): Card[] {
    return hand.slice().sort((a, b) => {
        const ta = isTrump(a, trumpSuit);
        const tb = isTrump(b, trumpSuit);
        if (ta !== tb) return ta ? 1 : -1;
        if (a.suit !== b.suit) return a.suit.localeCompare(b.suit);
        return RANK_ORDER[a.rank] - RANK_ORDER[b.rank];
    });
}

export function startGame(humanId: string, botId: string): GameState {
    let deck = shuffle(makeDeck());
    const trumpCard = deck[deck.length - 1];
    const trumpSuit = trumpCard.suit;

    const players: [Player, Player] = [
        { id: humanId, name: 'You', type: 'human', hand: [] },
        { id: botId, name: 'Bot', type: 'bot', hand: [] },
    ];

    const state: GameState = {
        deck,
        trumpCard,
        trumpSuit,
        players,
        attacker: 0,
        defender: 1,
        table: [],
        phase: 'attack',
    };

    refillHands(state);
    return state;
}

// Раздача до 6 карт: сначала атакующий, потом защищающий
export function refillHands(state: GameState) {
    const order = [state.attacker, state.defender];
    for (const idx of order) {
        while (state.players[idx].hand.length < 6 && state.deck.length > 0) {
            const card = state.deck.pop()!;
            state.players[idx].hand.push(card);
        }
    }
    // сортировка для удобства
    state.players[0].hand = sortHand(state.players[0].hand, state.trumpSuit);
    state.players[1].hand = sortHand(state.players[1].hand, state.trumpSuit);
}

export function ranksOnTable(state: GameState): Set<Rank> {
    const set = new Set<Rank>();
    for (const slot of state.table) {
        set.add(slot.attack.rank);
        if (slot.defend) set.add(slot.defend.rank);
    }
    return set;
}

// Атаки разрешены в фазах 'attack' и 'throw'
export function legalAttacks(state: GameState, playerIndex: number): Card[] {
    if ((state.phase !== 'attack' && state.phase !== 'throw') || playerIndex !== state.attacker) return [];
    const hand = state.players[playerIndex].hand;
    if (state.table.length === 0) return hand;
    const ranks = ranksOnTable(state);
    return hand.filter((c) => ranks.has(c.rank));
}

// Можно ли добавить ещё атаки (ограничение: максимум до размера руки защитника)
export function canAddAttack(state: GameState): boolean {
    const openCount = state.table.length;
    const defenderHand = state.players[state.defender].hand.length;
    if (openCount >= defenderHand) return false;
    // Должны быть доступные карты по рангу
    const ranks = ranksOnTable(state);
    const hand = state.players[state.attacker].hand;
    return hand.some((c) => ranks.has(c.rank)) || state.table.length === 0;
}

export function legalDefenses(state: GameState, playerIndex: number, attackIndex: number): Card[] {
    if (state.phase !== 'defend' || playerIndex !== state.defender) return [];
    const slot = state.table[attackIndex];
    if (!slot || slot.defend) return [];
    const hand = state.players[playerIndex].hand;
    return hand.filter((c) => canBeat(slot.attack, c, state.trumpSuit));
}

function removeCardFromHand(hand: Card[], card: Card): boolean {
    const i = hand.findIndex((c) => c.suit === card.suit && c.rank === card.rank);
    if (i >= 0) {
        hand.splice(i, 1);
        return true;
    }
    return false;
}

function moveTableToDefender(state: GameState) {
    const defender = state.players[state.defender];
    for (const slot of state.table) {
        defender.hand.push(slot.attack);
        if (slot.defend) defender.hand.push(slot.defend);
    }
    state.table = [];
}

// Действия игрока
export type ActionAttack = { kind: 'attack'; card: Card };
export type ActionDefend = { kind: 'defend'; attackIndex: number; card: Card };
export type ActionTake = { kind: 'take' };
export type ActionDone = { kind: 'done' };
export type Action = ActionAttack | ActionDefend | ActionTake | ActionDone;

export type ApplyResult =
    | { ok: true; state: GameState }
    | { ok: false; error: string; state: GameState };

// Основной редьюсер игровых действий
export function applyAction(state: GameState, playerId: string, action: Action): ApplyResult {
    if (state.phase === 'finished') {
        return { ok: false, error: 'Игра завершена', state };
    }

    const me = state.players.findIndex((p) => p.id === playerId);
    if (me < 0) return { ok: false, error: 'Игрок не найден', state };

    if (action.kind === 'attack') {
        if (me !== state.attacker) return { ok: false, error: 'Сейчас не ваш ход атаковать', state };
        const legal = legalAttacks(state, me);
        const allowed = legal.some((c) => c.suit === action.card.suit && c.rank === action.card.rank);
        if (!allowed) return { ok: false, error: 'Этой картой нельзя атаковать сейчас', state };

        // В фазе 'throw' тоже можно атаковать, но с лимитом по руке защитника
        if (state.phase === 'throw' && !canAddAttack(state)) {
            return { ok: false, error: 'Докидывать больше нельзя (лимит по руке защитника)', state };
        }

        const ok = removeCardFromHand(state.players[me].hand, action.card);
        if (!ok) return { ok: false, error: 'Карты нет в руке', state };

        state.table.push({ attack: action.card });

        // После атаки переходим в защиту, если не фаза 'throw'
        if (state.phase !== 'throw') {
            state.phase = 'defend';
            state.message = 'Атакуйте ещё или ждите защиту';
        } else {
            state.phase = 'throw';
            state.message = 'Докидывайте доступные карты или завершите ход';
        }

        return { ok: true, state: advanceIfNeeded(state) };
    }

    if (action.kind === 'defend') {
        if (me !== state.defender) return { ok: false, error: 'Сейчас не ваш ход защищаться', state };
        const legals = legalDefenses(state, me, action.attackIndex);
        const allowed = legals.some((c) => c.suit === action.card.suit && c.rank === action.card.rank);
        if (!allowed) return { ok: false, error: 'Этой картой нельзя побить атаку', state };

        const ok = removeCardFromHand(state.players[me].hand, action.card);
        if (!ok) return { ok: false, error: 'Карты нет в руке', state };

        state.table[action.attackIndex].defend = action.card;

        // Проверим: все ли атаки побиты? Если да — атакующий может добавить (phase снова attack),
        // но если добавить нечего или игрок нажмёт "done", будет завершение.
        const allDefended = state.table.every((s) => !!s.defend);
        state.phase = allDefended ? 'attack' : 'defend';
        state.message = allDefended ? 'Можно добавить атаку или завершить ход' : 'Защититесь от оставшихся атак';

        return { ok: true, state: advanceIfNeeded(state) };
    }

    if (action.kind === 'take') {
        if (me !== state.defender) return { ok: false, error: 'Только защищающийся может взять', state };
        // Защитник решил взять — переходим в фазу докидывания для атакующего
        state.phase = 'throw';
        state.message = 'Защитник берёт. Атакующий может докинуть карты и затем завершить ход';
        return { ok: true, state };
    }

    if (action.kind === 'done') {
        if (me !== state.attacker) return { ok: false, error: 'Только атакующий завершает ход', state };

        if (state.phase === 'attack') {
            // Завершение хода возможно только если все атаки побиты
            const allDefended = state.table.length > 0 && state.table.every((s) => !!s.defend);
            if (!allDefended) return { ok: false, error: 'Есть непобитые атаки. Либо добавьте, либо защитник пусть возьмёт', state };

            // Сбросить карты со стола (в отбой) — здесь отбой не хранится, просто очищаем стол
            state.table = [];
            // Раздать карты: сначала атакующему, потом защищающему
            refillHands(state);
            // Поменять роли
            [state.attacker, state.defender] = [state.defender, state.attacker];
            state.phase = 'attack';
            state.message = 'Ход завершён. Роли сменились';
            checkFinish(state);
            return { ok: true, state };
        }

        if (state.phase === 'throw') {
            // Защитник берёт все карты со стола; роли не меняются
            moveTableToDefender(state);
            refillHands(state);
            // Роли сохраняются: атакующий остаётся атакующим
            state.phase = 'attack';
            state.message = 'Защитник взял. Атакуйте снова';
            checkFinish(state);
            return { ok: true, state };
        }

        return { ok: false, error: 'Сейчас нельзя завершить ход', state };
    }

    return { ok: false, error: 'Неизвестное действие', state };
}

// Автопереходы
function advanceIfNeeded(state: GameState): GameState {
    if (state.phase === 'attack') {
        if (!canAddAttack(state)) {
            // Нечего добавить — атакующий должен нажать "done". Автопереход не делаем.
        }
    }
    checkFinish(state);
    return state;
}

function checkFinish(state: GameState) {
    const deckEmpty = state.deck.length === 0;
    const p0Empty = state.players[0].hand.length === 0;
    const p1Empty = state.players[1].hand.length === 0;

    if (deckEmpty && (p0Empty || p1Empty)) {
        if (p0Empty && p1Empty) {
            state.phase = 'finished';
            state.winnerId = undefined; // ничья
            state.message = 'Ничья';
        } else if (p0Empty) {
            state.phase = 'finished';
            state.winnerId = state.players[0].id;
            state.message = `${state.players[0].name} победил`;
        } else {
            state.phase = 'finished';
            state.winnerId = state.players[1].id;
            state.message = `${state.players[1].name} победил`;
        }
    }
}

// Логика бота: минимальная карта для атаки/защиты/докидки
export function botDecide(state: GameState): Action | null {
    const botIdx = state.players.findIndex((p) => p.type === 'bot');
    if (botIdx < 0) return null;

    if (state.phase === 'attack' && botIdx === state.attacker) {
        const legals = legalAttacks(state, botIdx);
        if (legals.length === 0) {
            return { kind: 'done' };
        }
        const lowest = legals.slice().sort((a, b) => {
            const ta = isTrump(a, state.trumpSuit);
            const tb = isTrump(b, state.trumpSuit);
            if (ta !== tb) return ta ? 1 : -1;
            if (a.suit !== b.suit) return a.suit.localeCompare(b.suit);
            return RANK_ORDER[a.rank] - RANK_ORDER[b.rank];
        })[0];
        return { kind: 'attack', card: lowest };
    }

    if (state.phase === 'defend' && botIdx === state.defender) {
        const firstOpen = state.table.findIndex((s) => !s.defend);
        if (firstOpen < 0) {
            // всё побито — ход атаки или завершение
            return null;
        }
        const legals = legalDefenses(state, botIdx, firstOpen);
        if (legals.length === 0) {
            // нечем биться — беру
            return { kind: 'take' };
        }
        const lowest = legals.slice().sort((a, b) => {
            const ta = isTrump(a, state.trumpSuit);
            const tb = isTrump(b, state.trumpSuit);
            if (ta !== tb) return ta ? 1 : -1;
            if (a.suit !== b.suit) return a.suit.localeCompare(b.suit);
            return RANK_ORDER[a.rank] - RANK_ORDER[b.rank];
        })[0];
        return { kind: 'defend', attackIndex: firstOpen, card: lowest };
    }

    if (state.phase === 'throw' && botIdx === state.attacker) {
        // Бот-атакующий докидывает по возможности, иначе завершает
        if (!canAddAttack(state)) {
            return { kind: 'done' };
        }
        const legals = legalAttacks(state, botIdx);
        if (legals.length === 0) {
            return { kind: 'done' };
        }
        const lowest = legals.slice().sort((a, b) => {
            const ta = isTrump(a, state.trumpSuit);
            const tb = isTrump(b, state.trumpSuit);
            if (ta !== tb) return ta ? 1 : -1;
            if (a.suit !== b.suit) return a.suit.localeCompare(b.suit);
            return RANK_ORDER[a.rank] - RANK_ORDER[b.rank];
        })[0];
        return { kind: 'attack', card: lowest };
    }

    return null;
}