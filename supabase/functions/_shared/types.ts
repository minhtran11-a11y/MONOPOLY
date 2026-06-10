// AUTO-COPIED from src/core — do not edit. Regenerate with: node scripts/sync-shared.mjs
/**
 * src/core/types.ts
 *
 * Shared type definitions for the pure Monopoly rules core (rules_core.ts).
 *
 * Design constraints:
 * - JSON-safe: every state/action/event shape round-trips JSON.stringify/parse
 *   (no functions, no class instances, no undefined inside arrays; optional
 *   keys are OMITTED rather than set to undefined).
 * - Environment-free: usable unchanged in the browser and in Deno
 *   (Supabase Edge Functions).
 *
 * GameState is a strict superset of the persistence snapshot produced by
 * src/game/persistence.js (snapshot() ~lines 10-27); the snapshot's `ts`
 * field is storage metadata and intentionally NOT part of GameState.
 */

// ---------------------------------------------------------------------------
// Core literals
// ---------------------------------------------------------------------------

export type GameMode = 'bot' | 'online';

/** Mirrors TILE_TYPES in src/core/constants.js. */
export type TileType =
    | 'START'
    | 'PROPERTY'
    | 'RAILROAD'
    | 'UTILITY'
    | 'CHEST'
    | 'CHANCE'
    | 'TAX'
    | 'JAIL'
    | 'PARKING'
    | 'GOTOJAIL';

export type CardDeck = 'chance' | 'chest';

/**
 * Turn phases derived from the game.js modal/turn flow:
 * - await_roll:         startTurn modal (roll, optionally build/mortgage first).
 * - await_buy_decision: landed on an unowned, affordable tile (buy/skip modal).
 * - await_card:         landed on CHANCE/CHEST; caller must supply DRAW_CARD
 *                       with a cardIndex (deck order is a caller concern).
 * - await_end:          checkEndTurnPhase modal (build/mortgage, then END_TURN).
 * - game_over:          handleVictory reached; no further actions accepted.
 */
export type GamePhase =
    | 'await_roll'
    | 'await_buy_decision'
    | 'await_card'
    | 'await_end'
    | 'game_over';

// ---------------------------------------------------------------------------
// Static board / card definitions
// ---------------------------------------------------------------------------

/**
 * Static definition of one of the 40 board tiles (shape ported faithfully
 * from src/core/data.js boardData; runtime fields owner/houses/isMortgaged
 * live in TileState instead).
 */
export interface TileDef {
    readonly id: number;
    readonly name: string;
    readonly type: TileType;
    /** Board paint color as 0xRRGGBB (constants.js COLORS values). */
    readonly color: number;
    /** Purchase price (PROPERTY/RAILROAD/UTILITY) or tax amount (TAX tiles). */
    readonly price?: number;
    /** Base rent (PROPERTY) / flat fallback rent (RAILROAD, UTILITY). */
    readonly rent?: number;
    /** Color-set key (1..8); present on PROPERTY tiles only. */
    readonly groupId?: number;
    /** Cost of one house; present on PROPERTY tiles only. */
    readonly houseCost?: number;
}

/**
 * Declarative card effect metadata. The reducer interprets these; callers
 * (UI, server) can also inspect them to know deck sizes and card behavior.
 */
export type CardEffectDef =
    /** Move forward to `target`; `bonus` is credited BEFORE the move (game.js moveToTile). */
    | { readonly kind: 'move_to'; readonly target: number; readonly bonus?: number }
    /** If already standing on `target`, collect `collectIfThere`; otherwise move to it. */
    | { readonly kind: 'move_to_or_collect'; readonly target: number; readonly collectIfThere: number }
    /** If already standing on `target`, pay `payIfThere` to the bank; otherwise collect `moveBonus` and move. */
    | { readonly kind: 'move_to_or_pay'; readonly target: number; readonly payIfThere: number; readonly moveBonus: number }
    | { readonly kind: 'collect'; readonly amount: number }
    /** Every non-bankrupt player (including the drawer) collects `amount`. */
    | { readonly kind: 'collect_all'; readonly amount: number }
    /** Pay `amount` to the bank (through the liquidation/bankruptcy pipeline). */
    | { readonly kind: 'pay'; readonly amount: number }
    | { readonly kind: 'goto_jail' }
    | { readonly kind: 'jail_free' }
    /** Relative move; negative = backwards (no GO salary on backward moves). */
    | { readonly kind: 'move_steps'; readonly steps: number }
    /** Move forward to the nearest other living player; `bonus` credited before the move. */
    | { readonly kind: 'move_to_nearest_player'; readonly bonus: number }
    /** Move forward to the farthest other living player. */
    | { readonly kind: 'move_to_farthest_player' };

export interface CardDef {
    readonly text: string;
    readonly effect: CardEffectDef;
}

// ---------------------------------------------------------------------------
// Runtime state
// ---------------------------------------------------------------------------

/** Per-player runtime state (field set matches the persistence snapshot). */
export interface PlayerState {
    id: number;
    name: string;
    money: number;
    position: number;
    inJail: boolean;
    jailTurns: number;
    jailFreeCards: number;
    bankrupt: boolean;
    isBot: boolean;
    colorHex: string;
    tokenKind: string;
}

/** Per-tile runtime state (field set matches the persistence snapshot). */
export interface TileState {
    id: number;
    owner: number | null;
    houses: number;
    isMortgaged: boolean;
}

export interface GameState {
    mode: GameMode;
    currentPlayerIndex: number;
    players: PlayerState[];
    tiles: TileState[];
    phase: GamePhase;
    /** Consecutive doubles-granted extra turns in the current turn (informational; the source game has no 3-doubles rule). */
    doublesCount?: number;
    /**
     * True while the current movement chain originated from a doubles roll and
     * an extra roll is owed at end-phase. Must survive await_buy_decision /
     * await_card interludes (game.js threads `isDouble` through callbacks).
     */
    pendingDouble?: boolean;
    /** Reserved for the server/local shuffler; never read by the rules core. */
    rngSeed?: string;
    winner?: number | null;
}

/** Input for initialState(); mirrors createPlayers() in src/3d/engine.js. */
export interface PlayerSetup {
    name: string;
    isBot: boolean;
    colorHex: string;
    tokenKind: string;
}

// ---------------------------------------------------------------------------
// Trades
// ---------------------------------------------------------------------------

/**
 * One side of a trade (src/ui/trade.js): money plus unmortgaged,
 * house-free properties. jailFreeCards is modeled for completeness even
 * though the current trade UI does not expose it.
 */
export interface TradeOffer {
    money: number;
    tileIds: number[];
    jailFreeCards?: number;
}

// ---------------------------------------------------------------------------
// Actions (inputs to applyAction) — dice values and card indices arrive
// INSIDE actions so the core stays deterministic.
// ---------------------------------------------------------------------------

export interface RollAction { type: 'ROLL'; playerId: number; d1: number; d2: number }
export interface BuyAction { type: 'BUY'; playerId: number; tileId: number }
/** Decline the purchase offered in await_buy_decision (btn-skip in game.js). */
export interface SkipBuyAction { type: 'SKIP_BUY'; playerId: number }
export interface BuildAction { type: 'BUILD'; playerId: number; tileId: number }
export interface ToggleMortgageAction { type: 'TOGGLE_MORTGAGE'; playerId: number; tileId: number }
export interface DrawCardAction { type: 'DRAW_CARD'; playerId: number; deck: CardDeck; cardIndex: number }
export interface UseJailCardAction { type: 'USE_JAIL_CARD'; playerId: number }
export interface EndTurnAction { type: 'END_TURN'; playerId: number }
export interface DeclareBankruptcyAction { type: 'DECLARE_BANKRUPTCY'; playerId: number }
/** An ACCEPTED trade (acceptance/negotiation is a caller concern; trade.js executes accepted trades directly). */
export interface TradeExecuteAction { type: 'TRADE_EXECUTE'; from: number; to: number; give: TradeOffer; get: TradeOffer }

export type Action =
    | RollAction
    | BuyAction
    | SkipBuyAction
    | BuildAction
    | ToggleMortgageAction
    | DrawCardAction
    | UseJailCardAction
    | EndTurnAction
    | DeclareBankruptcyAction
    | TradeExecuteAction;

// ---------------------------------------------------------------------------
// Events (outputs of applyAction) — one entry per animation/log/toast point
// in game.js so the UI layer can replay what happened.
// ---------------------------------------------------------------------------

export interface MovedEvent { type: 'MOVED'; playerId: number; from: number; to: number; path: number[]; passedGo: boolean }
/** Pass-GO salary (GAME_CONFIG.PASS_GO_MONEY). */
export interface SalaryEvent { type: 'SALARY'; playerId: number; amount: number }
/** Card-sourced credit (card bonus, "collect" cards, exact-tile jackpots). */
export interface CollectedEvent { type: 'COLLECTED'; playerId: number; amount: number }
export interface RentDueEvent { type: 'RENT_DUE'; tileId: number; amount: number }
/** Rent waived: tile mortgaged / owner in jail / owner bankrupt (game.js house rule). */
export interface RentFreeEvent { type: 'RENT_FREE'; tileId: number; reason: 'mortgaged' | 'owner_in_jail' | 'owner_bankrupt' }
/**
 * A payment demand was settled. `amount` is the demanded sum; when the payer
 * could not raise it in full, `raised` carries what was actually transferred
 * and a BANKRUPT event follows.
 */
export interface PaidEvent { type: 'PAID'; from: number; to: number | 'bank'; amount: number; raised?: number }
/** Forced house sale during liquidation (half houseCost refund). */
export interface HouseSoldEvent { type: 'HOUSE_SOLD'; playerId: number; tileId: number; refund: number; housesLeft: number }
export interface CardEvent { type: 'CARD'; deck: CardDeck; cardIndex: number; text: string }
export interface WentToJailEvent { type: 'WENT_TO_JAIL'; playerId: number }
export interface StayedInJailEvent { type: 'STAYED_IN_JAIL'; playerId: number; jailTurns: number }
export interface ExitedJailEvent { type: 'EXITED_JAIL'; playerId: number; how: 'doubles' | 'fine' | 'card' }
export interface BoughtEvent { type: 'BOUGHT'; tileId: number }
/** `houses` is the new count on the tile (5 = hotel). */
export interface BuiltEvent { type: 'BUILT'; tileId: number; houses: number }
/** `amount` = refund received (mortgage) or cost paid (redeem). */
export interface MortgagedEvent { type: 'MORTGAGED'; tileId: number; amount: number }
export interface UnmortgagedEvent { type: 'UNMORTGAGED'; tileId: number; amount: number }
export interface TradedEvent { type: 'TRADED'; from: number; to: number; give: TradeOffer; get: TradeOffer }
export interface BankruptEvent { type: 'BANKRUPT'; playerId: number; creditorId: number | null }
export interface ExtraTurnEvent { type: 'EXTRA_TURN'; playerId: number }
export interface TurnEndedEvent { type: 'TURN_ENDED'; playerId: number; nextPlayerId: number }
export interface VictoryEvent { type: 'VICTORY'; playerId: number }

export type GameEvent =
    | MovedEvent
    | SalaryEvent
    | CollectedEvent
    | RentDueEvent
    | RentFreeEvent
    | PaidEvent
    | HouseSoldEvent
    | CardEvent
    | WentToJailEvent
    | StayedInJailEvent
    | ExitedJailEvent
    | BoughtEvent
    | BuiltEvent
    | MortgagedEvent
    | UnmortgagedEvent
    | TradedEvent
    | BankruptEvent
    | ExtraTurnEvent
    | TurnEndedEvent
    | VictoryEvent;

export interface ActionResult {
    state: GameState;
    events: GameEvent[];
}
