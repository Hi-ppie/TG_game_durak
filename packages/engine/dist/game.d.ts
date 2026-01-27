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
export type Phase = 'attack' | 'defend' | 'throw' | 'finished';
export type GameState = {
    deck: Deck;
    trumpSuit: Suit;
    trumpCard: Card;
    players: [Player, Player];
    attacker: number;
    defender: number;
    table: TableSlot[];
    phase: Phase;
    winnerId?: string;
    message?: string;
};
export declare function makeDeck(): Deck;
export declare function shuffle<T>(arr: T[]): T[];
export declare function isTrump(card: Card, trumpSuit: Suit): boolean;
export declare function canBeat(attack: Card, defend: Card, trumpSuit: Suit): boolean;
export declare function sortHand(hand: Card[], trumpSuit: Suit): Card[];
export declare function startGame(humanId: string, botId: string): GameState;
export declare function refillHands(state: GameState): void;
export declare function ranksOnTable(state: GameState): Set<Rank>;
export declare function legalAttacks(state: GameState, playerIndex: number): Card[];
export declare function canAddAttack(state: GameState): boolean;
export declare function legalDefenses(state: GameState, playerIndex: number, attackIndex: number): Card[];
export type ActionAttack = {
    kind: 'attack';
    card: Card;
};
export type ActionDefend = {
    kind: 'defend';
    attackIndex: number;
    card: Card;
};
export type ActionTake = {
    kind: 'take';
};
export type ActionDone = {
    kind: 'done';
};
export type Action = ActionAttack | ActionDefend | ActionTake | ActionDone;
export type ApplyResult = {
    ok: true;
    state: GameState;
} | {
    ok: false;
    error: string;
    state: GameState;
};
export declare function applyAction(state: GameState, playerId: string, action: Action): ApplyResult;
export declare function botDecide(state: GameState): Action | null;
