/**
 * src/core/rules_core.ts
 *
 * Pure, deterministic Monopoly rules engine — the single source of truth for
 * game-state transitions. Runs identically in the browser (solo mode) and in
 * Deno (Supabase Edge Function for online mode).
 * Ground rules: PURE (applyAction never mutates its input; returns a fresh
 * GameState + ordered GameEvent[] for UI replay), DETERMINISTIC (no
 * Math.random/Date.now — dice arrive inside ROLL, card choice inside
 * DRAW_CARD; shuffling is a caller/server concern) and JSON-SAFE.
 *
 * Logic is ported faithfully from src/game/game.js + src/core/rules.js with
 * exactly four pre-approved bug fixes:
 *   FIX-1 negative steps — backward moves wrap correctly; GO salary only on
 *         forward wraps; "Đi lùi 3 bước" walks backward, no salary, no hang.
 *   FIX-2 payment pipeline — shortfalls liquidate (houses at half houseCost,
 *         then mortgages at price/2); the creditor receives only what was
 *         raised; remaining shortfall bankrupts the payer (tiles to bank).
 *   FIX-3 jail unification — one rule for humans and bots: roll; doubles exit
 *         + move (no extra turn); jailTurns++ per failed attempt; 3rd failure
 *         forces the $50 fine through the same pipeline, then exit + move.
 *         USE_JAIL_CARD exits without rolling cost.
 *   FIX-4 airport card — move to tile 35 + $500; no silent ownership grant;
 *         normal landing rules run after the move.
 */

import type {
    Action,
    ActionResult,
    CardDeck,
    GameEvent,
    GameMode,
    GameState,
    PlayerSetup,
    PlayerState,
    TileState,
    TradeOffer
} from './types.ts';
import {
    BOARD,
    BOARD_SIZE,
    CHANCE_CARDS,
    CHEST_CARDS,
    GAME_CONFIG,
    JAIL_POSITION
} from './board.ts';

export { BOARD, BOARD_SIZE, CHANCE_CARDS, CHEST_CARDS, GAME_CONFIG, JAIL_POSITION };

// ---------------------------------------------------------------------------
// Errors
// ---------------------------------------------------------------------------

/** Thrown by applyAction/helpers on illegal actions. `message` starts with `code`. */
export class RuleViolation extends Error {
    readonly code: string;

    constructor(code: string, detail?: string) {
        super(detail ? `${code}: ${detail}` : code);
        this.name = 'RuleViolation';
        this.code = code;
    }
}

function fail(code: string, detail?: string): never {
    throw new RuleViolation(code, detail);
}

// ---------------------------------------------------------------------------
// Rent tables (src/core/rules.js — authoritative)
// ---------------------------------------------------------------------------

const RENT_HOUSE_MULTIPLIERS = [1, 5, 15, 45, 80] as const; // index = house count
const RENT_HOTEL_MULTIPLIER = 125;
const RAILROAD_RENT = [0, 25, 50, 100, 200] as const; // by count owned

const MORTGAGE_REFUND_RATE = 0.5; // game.js toggleMortgage refund
const MORTGAGE_REDEEM_RATE = 0.6; // game.js toggleMortgage redeem cost

// ---------------------------------------------------------------------------
// Small pure helpers
// ---------------------------------------------------------------------------

/** FIX-1: destination for forward AND backward moves, always in 0..39. */
export function computeDestination(pos: number, steps: number): number {
    return ((pos + steps) % BOARD_SIZE + BOARD_SIZE) % BOARD_SIZE;
}

/** FIX-1: GO salary only for forward moves that wrap past (or land on) GO. */
export function passedGo(from: number, steps: number): boolean {
    return steps > 0 && from + steps >= BOARD_SIZE;
}

function cloneState(s: GameState): GameState {
    const out: GameState = {
        mode: s.mode,
        currentPlayerIndex: s.currentPlayerIndex,
        players: s.players.map((p) => ({ ...p })),
        tiles: s.tiles.map((t) => ({ ...t })),
        phase: s.phase,
        doublesCount: s.doublesCount ?? 0,
        pendingDouble: s.pendingDouble ?? false,
        winner: s.winner ?? null
    };
    if (s.rngSeed !== undefined) out.rngSeed = s.rngSeed;
    return out;
}

function getPlayer(state: GameState, playerId: number): PlayerState {
    if (!Number.isInteger(playerId) || playerId < 0 || playerId >= state.players.length) {
        fail('NO_SUCH_PLAYER', `playerId=${playerId}`);
    }
    return state.players[playerId];
}

function requireTurn(state: GameState, playerId: number): PlayerState {
    if (state.phase === 'game_over') fail('GAME_OVER');
    const p = getPlayer(state, playerId);
    if (playerId !== state.currentPlayerIndex) fail('NOT_YOUR_TURN', `current=${state.currentPlayerIndex}`);
    if (p.bankrupt) fail('PLAYER_BANKRUPT');
    return p;
}

function requirePhase(state: GameState, ...phases: GameState['phase'][]): void {
    if (!phases.includes(state.phase)) fail('WRONG_PHASE', `phase=${state.phase}, expected ${phases.join('|')}`);
}

function requireTileId(tileId: number): void {
    if (!Number.isInteger(tileId) || tileId < 0 || tileId >= BOARD_SIZE) fail('BAD_TILE', `tileId=${tileId}`);
}

function requireDie(d: number): void {
    if (!Number.isInteger(d) || d < 1 || d > 6) fail('BAD_DICE', `die=${d}`);
}

// ---------------------------------------------------------------------------
// Rent + buildables (port of src/core/rules.js)
// ---------------------------------------------------------------------------

function ownsAllInGroup(state: GameState, tileId: number): boolean {
    const def = BOARD[tileId];
    const ts = state.tiles[tileId];
    if (!def || !ts || ts.owner === null || def.groupId === undefined) return false;
    const groupDefs = BOARD.filter((d) => d.groupId === def.groupId);
    if (groupDefs.length === 0) return false;
    return groupDefs.every((d) => state.tiles[d.id].owner === ts.owner);
}

/**
 * Rent owed on a tile (0 for unowned/mortgaged/non-rentable). For utilities,
 * pass the dice total of the roll that caused the landing (4x / 10x rules.js
 * multiplier); without one — e.g. card-induced landings — the flat fallback
 * rent applies, matching rules.js.
 */
export function rentOf(state: GameState, tileId: number, diceTotal?: number): number {
    if (!Number.isInteger(tileId) || tileId < 0 || tileId >= BOARD_SIZE) return 0;
    const def = BOARD[tileId];
    const ts = state.tiles[tileId];
    if (!ts || ts.owner === null) return 0;
    if (ts.isMortgaged) return 0;

    if (def.type === 'RAILROAD') {
        const count = BOARD.filter((d, i) => d.type === 'RAILROAD' && state.tiles[i].owner === ts.owner).length;
        return RAILROAD_RENT[count] ?? 0;
    }
    if (def.type === 'UTILITY') {
        const count = BOARD.filter((d, i) => d.type === 'UTILITY' && state.tiles[i].owner === ts.owner).length;
        const mult = count >= 2 ? 10 : 4;
        return diceTotal !== undefined && diceTotal > 0 ? diceTotal * mult : def.rent ?? 0;
    }
    if (def.type !== 'PROPERTY') return 0;

    const base = def.rent ?? 0;
    if (ts.houses === GAME_CONFIG.MAX_HOUSES) return base * RENT_HOTEL_MULTIPLIER;
    if (ts.houses > 0) return base * (RENT_HOUSE_MULTIPLIERS[ts.houses] ?? 0);
    return ownsAllInGroup(state, tileId) ? base * 2 : base;
}

/**
 * Tile ids where `playerId` may build right now: full unmortgaged color group
 * owned, even-build rule (only tiles at the group's minimum house count),
 * below hotel. Sorted by houseCost ascending (cheapest first, like rules.js).
 */
export function buildableTileIds(state: GameState, playerId: number): number[] {
    const groupIds = new Set<number>();
    for (const def of BOARD) {
        if (def.type !== 'PROPERTY' || def.groupId === undefined) continue;
        const ts = state.tiles[def.id];
        if (ts.owner === playerId && !ts.isMortgaged) groupIds.add(def.groupId);
    }

    const result: { id: number; houseCost: number }[] = [];
    for (const gid of [...groupIds].sort((a, b) => a - b)) {
        const groupDefs = BOARD.filter((d) => d.groupId === gid);
        const ownsAll = groupDefs.every((d) => {
            const ts = state.tiles[d.id];
            return ts.owner === playerId && !ts.isMortgaged;
        });
        if (!ownsAll) continue;
        const minHouses = Math.min(...groupDefs.map((d) => state.tiles[d.id].houses));
        for (const d of groupDefs) {
            const ts = state.tiles[d.id];
            if (ts.houses < GAME_CONFIG.MAX_HOUSES && ts.houses === minHouses) {
                result.push({ id: d.id, houseCost: d.houseCost ?? 0 });
            }
        }
    }
    result.sort((a, b) => a.houseCost - b.houseCost); // stable: ties keep board order
    return result.map((r) => r.id);
}

// ---------------------------------------------------------------------------
// In-place mutators (operate on a private draft; never on caller state)
// ---------------------------------------------------------------------------

/** FIX-2 step 1+2: sell houses at half houseCost, then mortgage at price/2. */
function liquidateInPlace(draft: GameState, events: GameEvent[], playerId: number, target: number): number {
    const p = draft.players[playerId];
    const before = p.money;

    // 1. Sell houses first (board order, one house at a time — game.js handleLiquidation).
    for (const ts of draft.tiles) {
        if (ts.owner !== playerId || ts.houses <= 0) continue;
        const refund = Math.floor((BOARD[ts.id].houseCost ?? 0) / 2);
        while (ts.houses > 0 && p.money < target) {
            p.money += refund;
            ts.houses -= 1;
            events.push({ type: 'HOUSE_SOLD', playerId, tileId: ts.id, refund, housesLeft: ts.houses });
        }
        if (p.money >= target) break;
    }

    // 2. Mortgage remaining properties at price/2 (FIX-2 extension of the
    //    "future expansion" comment in handleLiquidation; rate matches toggleMortgage).
    if (p.money < target) {
        for (const ts of draft.tiles) {
            if (p.money >= target) break;
            if (ts.owner !== playerId || ts.isMortgaged || ts.houses > 0) continue;
            const price = BOARD[ts.id].price;
            if (price === undefined) continue;
            const refund = Math.floor(price * MORTGAGE_REFUND_RATE);
            ts.isMortgaged = true;
            p.money += refund;
            events.push({ type: 'MORTGAGED', tileId: ts.id, amount: refund });
        }
    }
    return p.money - before;
}

function checkVictory(draft: GameState, events: GameEvent[]): void {
    if (draft.phase === 'game_over') return;
    const active = draft.players.filter((p) => !p.bankrupt);
    if (active.length === 1) {
        draft.winner = active[0].id;
        draft.phase = 'game_over';
        events.push({ type: 'VICTORY', playerId: active[0].id });
    }
}

/** game.js handleBankruptcy: tiles return to the bank (FIX-2: creditor got only what was raised). */
function bankruptInPlace(draft: GameState, events: GameEvent[], playerId: number, creditorId: number | null): void {
    const p = draft.players[playerId];
    if (p.bankrupt) return;
    p.bankrupt = true;
    p.money = 0;
    for (const ts of draft.tiles) {
        if (ts.owner === playerId) {
            ts.owner = null;
            ts.houses = 0;
            ts.isMortgaged = false;
        }
    }
    events.push({ type: 'BANKRUPT', playerId, creditorId });
    checkVictory(draft, events);
}

/**
 * FIX-2 payment pipeline (replaces game.js payMoney): liquidate on shortfall,
 * transfer min(available, amount), bankrupt on remaining shortfall.
 */
function payTo(draft: GameState, events: GameEvent[], fromId: number, to: number | 'bank', amount: number): void {
    const payer = draft.players[fromId];
    if (payer.money < amount) {
        liquidateInPlace(draft, events, fromId, amount);
    }
    const paid = Math.min(payer.money, amount);
    payer.money -= paid;
    if (to !== 'bank') draft.players[to].money += paid;

    if (paid < amount) {
        events.push({ type: 'PAID', from: fromId, to, amount, raised: paid });
        bankruptInPlace(draft, events, fromId, to === 'bank' ? null : to);
    } else {
        events.push({ type: 'PAID', from: fromId, to, amount });
    }
}

/** game.js nextTurn: advance to the next non-bankrupt player, victory check. */
function advanceTurn(draft: GameState, events: GameEvent[]): void {
    draft.pendingDouble = false;
    draft.doublesCount = 0;
    checkVictory(draft, events);
    if (draft.phase === 'game_over') return;

    const n = draft.players.length;
    const prev = draft.currentPlayerIndex;
    let idx = prev;
    let count = 0;
    do {
        idx = (idx + 1) % n;
        count += 1;
        if (count > n) break;
    } while (draft.players[idx].bankrupt && idx !== prev);

    draft.currentPlayerIndex = idx;
    draft.phase = 'await_roll';
    events.push({ type: 'TURN_ENDED', playerId: prev, nextPlayerId: idx });
}

/** game.js checkEndTurnPhase: doubles grant another roll, otherwise wait for END_TURN. */
function endPhase(draft: GameState, events: GameEvent[]): void {
    if (draft.phase === 'game_over') return;
    const p = draft.players[draft.currentPlayerIndex];
    if (!p || p.bankrupt) {
        advanceTurn(draft, events);
        return;
    }
    if (draft.pendingDouble && !p.inJail) {
        draft.pendingDouble = false;
        draft.doublesCount = (draft.doublesCount ?? 0) + 1;
        draft.phase = 'await_roll';
        events.push({ type: 'EXTRA_TURN', playerId: p.id });
        return;
    }
    draft.pendingDouble = false;
    draft.phase = 'await_end';
}

/** game.js handleSpaceLanded + handleUnownedProperty/handleRentPayment/handleSpecialTile. */
function landOn(draft: GameState, events: GameEvent[], playerId: number, diceTotal?: number): void {
    const p = draft.players[playerId];
    const def = BOARD[p.position];
    const ts = draft.tiles[p.position];

    if (def.type === 'PROPERTY' || def.type === 'RAILROAD' || def.type === 'UTILITY') {
        if (ts.owner === null) {
            if (p.money >= (def.price ?? 0)) {
                draft.phase = 'await_buy_decision'; // caller decides BUY or SKIP_BUY (bot policy lives outside the core)
            } else {
                endPhase(draft, events); // game.js: cannot afford → no offer
            }
            return;
        }
        if (ts.owner === playerId) {
            endPhase(draft, events);
            return;
        }
        const owner = draft.players[ts.owner];
        if (owner.bankrupt || owner.inJail || ts.isMortgaged) {
            const reason = ts.isMortgaged ? 'mortgaged' : owner.inJail ? 'owner_in_jail' : 'owner_bankrupt';
            events.push({ type: 'RENT_FREE', tileId: ts.id, reason });
        } else {
            const rent = rentOf(draft, ts.id, diceTotal);
            events.push({ type: 'RENT_DUE', tileId: ts.id, amount: rent });
            payTo(draft, events, playerId, ts.owner, rent);
        }
        endPhase(draft, events);
        return;
    }

    if (def.type === 'TAX') {
        payTo(draft, events, playerId, 'bank', def.price ?? 0);
        endPhase(draft, events);
        return;
    }
    if (def.type === 'GOTOJAIL') {
        sendToJail(draft, events, playerId);
        endPhase(draft, events);
        return;
    }
    if (def.type === 'CHANCE' || def.type === 'CHEST') {
        draft.phase = 'await_card'; // caller supplies DRAW_CARD with cardIndex
        return;
    }
    endPhase(draft, events); // START / JAIL (visiting) / PARKING
}

function sendToJail(draft: GameState, events: GameEvent[], playerId: number): void {
    const p = draft.players[playerId];
    p.inJail = true;
    p.jailTurns = 0;
    p.position = JAIL_POSITION;
    draft.pendingDouble = false; // game.js forces isDouble = false on arrest
    events.push({ type: 'WENT_TO_JAIL', playerId });
}

/** Move by `steps` (negative = backwards, FIX-1), then resolve the landing. */
function moveBy(draft: GameState, events: GameEvent[], playerId: number, steps: number, diceTotal?: number): void {
    if (steps === 0) {
        // Zero-step card moves (e.g. nearest player shares the tile): original
        // game.js would hang on an empty animation path; the core simply skips
        // the move and resolves the turn.
        endPhase(draft, events);
        return;
    }
    const p = draft.players[playerId];
    const from = p.position;
    const to = computeDestination(from, steps);
    const gotSalary = passedGo(from, steps);

    const path: number[] = [];
    const dir = steps > 0 ? 1 : -1;
    for (let i = 1; i <= Math.abs(steps); i += 1) path.push(computeDestination(from, i * dir));

    p.position = to;
    events.push({ type: 'MOVED', playerId, from, to, path, passedGo: gotSalary });
    if (gotSalary) {
        p.money += GAME_CONFIG.PASS_GO_MONEY;
        events.push({ type: 'SALARY', playerId, amount: GAME_CONFIG.PASS_GO_MONEY });
    }
    landOn(draft, events, playerId, diceTotal);
}

/**
 * FIX-3 unified jail roll (canonical semantics from the bot branch,
 * game.js:131-148, with the fine routed through the payment pipeline).
 */
function jailStepInPlace(draft: GameState, events: GameEvent[], playerId: number, d1: number, d2: number): void {
    const p = draft.players[playerId];
    const total = d1 + d2;
    draft.pendingDouble = false; // jail rolls never earn an extra turn

    if (d1 === d2) {
        p.inJail = false;
        p.jailTurns = 0;
        events.push({ type: 'EXITED_JAIL', playerId, how: 'doubles' });
        moveBy(draft, events, playerId, total, total);
        return;
    }

    p.jailTurns += 1;
    if (p.jailTurns >= 3) {
        payTo(draft, events, playerId, 'bank', GAME_CONFIG.JAIL_EXIT_FEE); // can liquidate/bankrupt
        if (p.bankrupt) {
            endPhase(draft, events);
            return;
        }
        p.inJail = false;
        p.jailTurns = 0;
        events.push({ type: 'EXITED_JAIL', playerId, how: 'fine' });
        moveBy(draft, events, playerId, total, total);
        return;
    }
    events.push({ type: 'STAYED_IN_JAIL', playerId, jailTurns: p.jailTurns });
    endPhase(draft, events);
}

// --- Card resolution (game.js handleCardDraw, deterministic) ----------------

function nearestPlayerTarget(draft: GameState, playerId: number): number {
    const p = draft.players[playerId];
    let best = BOARD_SIZE + 1;
    let target = p.position;
    for (const pl of draft.players) {
        if (pl.id === playerId || pl.bankrupt) continue;
        const d = (pl.position - p.position + BOARD_SIZE) % BOARD_SIZE;
        if (d < best) { best = d; target = pl.position; }
    }
    return target;
}

function farthestPlayerTarget(draft: GameState, playerId: number): number {
    const p = draft.players[playerId];
    let best = -1;
    let target = p.position;
    for (const pl of draft.players) {
        if (pl.id === playerId || pl.bankrupt) continue;
        const d = (pl.position - p.position + BOARD_SIZE) % BOARD_SIZE;
        if (d > best) { best = d; target = pl.position; }
    }
    return target;
}

function applyCardInPlace(draft: GameState, events: GameEvent[], playerId: number, deck: CardDeck, cardIndex: number): void {
    const cards = deck === 'chance' ? CHANCE_CARDS : CHEST_CARDS;
    const card = cards[cardIndex];
    const p = draft.players[playerId];
    events.push({ type: 'CARD', deck, cardIndex, text: card.text });

    // game.js moveToTile: bonus is credited BEFORE the move; movement is
    // forward-only ((target - current + 40) % 40); normal landing rules run.
    const moveToTarget = (target: number, bonus?: number): void => {
        if (bonus !== undefined && bonus > 0) {
            p.money += bonus;
            events.push({ type: 'COLLECTED', playerId, amount: bonus });
        }
        const steps = (target - p.position + BOARD_SIZE) % BOARD_SIZE;
        moveBy(draft, events, playerId, steps);
    };

    const effect = card.effect;
    switch (effect.kind) {
        case 'move_to': // FIX-4: airport card is now a plain move_to with bonus
            moveToTarget(effect.target, effect.bonus);
            return;
        case 'move_to_or_collect':
            if (p.position === effect.target) {
                p.money += effect.collectIfThere;
                events.push({ type: 'COLLECTED', playerId, amount: effect.collectIfThere });
                endPhase(draft, events);
            } else {
                moveToTarget(effect.target);
            }
            return;
        case 'move_to_or_pay':
            if (p.position === effect.target) {
                payTo(draft, events, playerId, 'bank', effect.payIfThere);
                endPhase(draft, events);
            } else {
                moveToTarget(effect.target, effect.moveBonus);
            }
            return;
        case 'collect':
            p.money += effect.amount;
            events.push({ type: 'COLLECTED', playerId, amount: effect.amount });
            endPhase(draft, events);
            return;
        case 'collect_all':
            for (const pl of draft.players) {
                if (pl.bankrupt) continue;
                pl.money += effect.amount;
                events.push({ type: 'COLLECTED', playerId: pl.id, amount: effect.amount });
            }
            endPhase(draft, events);
            return;
        case 'pay':
            payTo(draft, events, playerId, 'bank', effect.amount);
            endPhase(draft, events);
            return;
        case 'goto_jail':
            sendToJail(draft, events, playerId);
            endPhase(draft, events);
            return;
        case 'jail_free':
            p.jailFreeCards += 1;
            endPhase(draft, events);
            return;
        case 'move_steps': // FIX-1: backward path, no GO salary when negative
            moveBy(draft, events, playerId, effect.steps);
            return;
        case 'move_to_nearest_player':
            moveToTarget(nearestPlayerTarget(draft, playerId), effect.bonus);
            return;
        case 'move_to_farthest_player':
            moveToTarget(farthestPlayerTarget(draft, playerId));
            return;
    }
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Build a fresh game. `startIndex` selects the opening player (game.js picks
 * one at random; randomness is a caller concern here). Defaults to 0.
 */
export function initialState(playerSetups: PlayerSetup[], mode: GameMode, startIndex = 0): GameState {
    if (!Array.isArray(playerSetups) || playerSetups.length < 2 || playerSetups.length > 4) {
        fail('INVALID_PLAYER_COUNT', `got ${Array.isArray(playerSetups) ? playerSetups.length : typeof playerSetups}`);
    }
    for (const s of playerSetups) {
        if (!s || typeof s.name !== 'string' || typeof s.isBot !== 'boolean'
            || typeof s.colorHex !== 'string' || typeof s.tokenKind !== 'string') {
            fail('BAD_PLAYER_SETUP');
        }
    }
    if (!Number.isInteger(startIndex) || startIndex < 0 || startIndex >= playerSetups.length) {
        fail('BAD_START_INDEX', `startIndex=${startIndex}`);
    }

    const players: PlayerState[] = playerSetups.map((s, i) => ({
        id: i,
        name: s.name,
        money: GAME_CONFIG.START_MONEY,
        position: 0,
        inJail: false,
        jailTurns: 0,
        jailFreeCards: 0,
        bankrupt: false,
        isBot: s.isBot,
        colorHex: s.colorHex,
        tokenKind: s.tokenKind
    }));
    const tiles: TileState[] = BOARD.map((t) => ({ id: t.id, owner: null, houses: 0, isMortgaged: false }));

    return {
        mode,
        currentPlayerIndex: startIndex,
        players,
        tiles,
        phase: 'await_roll',
        doublesCount: 0,
        pendingDouble: false,
        winner: null
    };
}

// --- Action handlers ---------------------------------------------------------

function handleRoll(draft: GameState, events: GameEvent[], playerId: number, d1: number, d2: number): void {
    const p = requireTurn(draft, playerId);
    requirePhase(draft, 'await_roll');
    requireDie(d1);
    requireDie(d2);
    if (p.inJail) {
        jailStepInPlace(draft, events, playerId, d1, d2);
        return;
    }
    draft.pendingDouble = d1 === d2;
    moveBy(draft, events, playerId, d1 + d2, d1 + d2);
}

function handleBuy(draft: GameState, events: GameEvent[], playerId: number, tileId: number): void {
    const p = requireTurn(draft, playerId);
    requirePhase(draft, 'await_buy_decision');
    requireTileId(tileId);
    if (tileId !== p.position) fail('WRONG_TILE', `standing on ${p.position}`);
    const def = BOARD[tileId];
    const ts = draft.tiles[tileId];
    if (def.price === undefined) fail('NOT_BUYABLE');
    if (ts.owner !== null) fail('ALREADY_OWNED');
    if (p.money < def.price) fail('CANT_AFFORD', `need ${def.price}, have ${p.money}`);
    p.money -= def.price;
    ts.owner = playerId;
    events.push({ type: 'BOUGHT', tileId });
    endPhase(draft, events);
}

function handleBuild(draft: GameState, events: GameEvent[], playerId: number, tileId: number): void {
    const p = requireTurn(draft, playerId);
    requirePhase(draft, 'await_roll', 'await_end');
    requireTileId(tileId);
    if (p.inJail) fail('IN_JAIL'); // game.js gates the build menu by !p.inJail
    const def = BOARD[tileId];
    const ts = draft.tiles[tileId];
    if (def.type !== 'PROPERTY') fail('NOT_BUILDABLE');
    if (ts.owner !== playerId) fail('NOT_OWNER');
    if (ts.isMortgaged) fail('MORTGAGED');
    if (ts.houses >= GAME_CONFIG.MAX_HOUSES) fail('MAX_HOUSES');

    const groupDefs = BOARD.filter((d) => d.groupId === def.groupId);
    const ownsAll = groupDefs.every((d) => draft.tiles[d.id].owner === playerId && !draft.tiles[d.id].isMortgaged);
    if (!ownsAll) fail('INCOMPLETE_GROUP');
    const minHouses = Math.min(...groupDefs.map((d) => draft.tiles[d.id].houses));
    if (ts.houses !== minHouses) fail('EVEN_BUILD_VIOLATION');

    const cost = def.houseCost ?? 0;
    if (p.money < cost) fail('CANT_AFFORD', `need ${cost}, have ${p.money}`);
    p.money -= cost;
    ts.houses += 1;
    events.push({ type: 'BUILT', tileId, houses: ts.houses });
}

function handleToggleMortgage(draft: GameState, events: GameEvent[], playerId: number, tileId: number): void {
    const p = requireTurn(draft, playerId);
    requirePhase(draft, 'await_roll', 'await_end');
    requireTileId(tileId);
    const ts = draft.tiles[tileId];
    if (ts.owner !== playerId) fail('NOT_OWNER');
    if (ts.houses > 0) fail('HAS_HOUSES'); // game.js: sell houses before mortgaging
    const price = BOARD[tileId].price ?? 0;

    if (ts.isMortgaged) {
        const cost = Math.floor(price * MORTGAGE_REDEEM_RATE);
        if (p.money < cost) fail('CANT_AFFORD', `need ${cost}, have ${p.money}`);
        p.money -= cost;
        ts.isMortgaged = false;
        events.push({ type: 'UNMORTGAGED', tileId, amount: cost });
    } else {
        const refund = Math.floor(price * MORTGAGE_REFUND_RATE);
        p.money += refund;
        ts.isMortgaged = true;
        events.push({ type: 'MORTGAGED', tileId, amount: refund });
    }
}

function handleDrawCard(draft: GameState, events: GameEvent[], playerId: number, deck: CardDeck, cardIndex: number): void {
    const p = requireTurn(draft, playerId);
    requirePhase(draft, 'await_card');
    const tileType = BOARD[p.position].type;
    const expected: CardDeck | null = tileType === 'CHANCE' ? 'chance' : tileType === 'CHEST' ? 'chest' : null;
    if (expected === null || deck !== expected) fail('WRONG_DECK', `expected ${expected ?? 'none'}`);
    const cards = deck === 'chance' ? CHANCE_CARDS : CHEST_CARDS;
    if (!Number.isInteger(cardIndex) || cardIndex < 0 || cardIndex >= cards.length) {
        fail('BAD_CARD_INDEX', `deck ${deck} has ${cards.length} cards`);
    }
    applyCardInPlace(draft, events, playerId, deck, cardIndex);
}

function handleUseJailCard(draft: GameState, events: GameEvent[], playerId: number): void {
    const p = requireTurn(draft, playerId);
    requirePhase(draft, 'await_roll');
    if (!p.inJail) fail('NOT_IN_JAIL');
    if (p.jailFreeCards <= 0) fail('NO_JAIL_CARD');
    p.jailFreeCards -= 1;
    p.inJail = false;
    p.jailTurns = 0;
    events.push({ type: 'EXITED_JAIL', playerId, how: 'card' });
    // Phase stays await_roll: the player now rolls as a free player.
}

function validateOffer(offer: TradeOffer): void {
    if (!offer || !Number.isInteger(offer.money) || offer.money < 0) fail('BAD_AMOUNT');
    if (!Array.isArray(offer.tileIds)) fail('BAD_TILE', 'tileIds must be an array');
    for (const id of offer.tileIds) requireTileId(id);
    if (new Set(offer.tileIds).size !== offer.tileIds.length) fail('DUPLICATE_TILE');
    if (offer.jailFreeCards !== undefined && (!Number.isInteger(offer.jailFreeCards) || offer.jailFreeCards < 0)) {
        fail('BAD_AMOUNT', 'jailFreeCards');
    }
}

function normalizeOffer(offer: TradeOffer): TradeOffer {
    const out: TradeOffer = { money: offer.money, tileIds: [...offer.tileIds] };
    if (offer.jailFreeCards !== undefined && offer.jailFreeCards > 0) out.jailFreeCards = offer.jailFreeCards;
    return out;
}

/** trade.js submit(): validation + direct execution of an accepted trade. */
function handleTrade(draft: GameState, events: GameEvent[], from: number, to: number, give: TradeOffer, get: TradeOffer): void {
    const me = requireTurn(draft, from);
    requirePhase(draft, 'await_roll', 'await_end');
    const partner = getPlayer(draft, to);
    if (to === from) fail('SELF_TRADE');
    if (partner.bankrupt) fail('PLAYER_BANKRUPT', 'partner');
    validateOffer(give);
    validateOffer(get);

    const giveJail = give.jailFreeCards ?? 0;
    const getJail = get.jailFreeCards ?? 0;
    const isEmpty = give.money === 0 && get.money === 0 && give.tileIds.length === 0
        && get.tileIds.length === 0 && giveJail === 0 && getJail === 0;
    if (isEmpty) fail('EMPTY_TRADE');
    if (me.money < give.money) fail('CANT_AFFORD', 'proposer money');
    if (partner.money < get.money) fail('CANT_AFFORD', 'partner money');
    if (giveJail > me.jailFreeCards || getJail > partner.jailFreeCards) fail('NO_JAIL_CARD');

    const checkTiles = (ids: number[], ownerId: number): void => {
        for (const id of ids) {
            const ts = draft.tiles[id];
            if (ts.owner !== ownerId) fail('NOT_OWNER', `tile ${id}`);
            if (ts.houses > 0) fail('HAS_HOUSES', `tile ${id}`); // trade.js lists house-free tiles only
            if (ts.isMortgaged) fail('MORTGAGED', `tile ${id}`);
        }
    };
    checkTiles(give.tileIds, from);
    checkTiles(get.tileIds, to);

    me.money -= give.money;
    partner.money += give.money;
    partner.money -= get.money;
    me.money += get.money;
    for (const id of give.tileIds) draft.tiles[id].owner = to;
    for (const id of get.tileIds) draft.tiles[id].owner = from;
    me.jailFreeCards -= giveJail;
    partner.jailFreeCards += giveJail;
    partner.jailFreeCards -= getJail;
    me.jailFreeCards += getJail;

    events.push({ type: 'TRADED', from, to, give: normalizeOffer(give), get: normalizeOffer(get) });
}

/**
 * The reducer. Validates `action` against `state`, returns the next state and
 * the events describing what happened. Throws RuleViolation (message starts
 * with a stable code such as 'NOT_YOUR_TURN', 'WRONG_PHASE', 'CANT_AFFORD',
 * 'NOT_OWNER', 'EVEN_BUILD_VIOLATION', ...) on illegal actions. Never mutates
 * the input state.
 */
export function applyAction(state: GameState, action: Action): ActionResult {
    const draft = cloneState(state);
    const events: GameEvent[] = [];

    switch (action.type) {
        case 'ROLL':
            handleRoll(draft, events, action.playerId, action.d1, action.d2);
            break;
        case 'BUY':
            handleBuy(draft, events, action.playerId, action.tileId);
            break;
        case 'SKIP_BUY':
            requireTurn(draft, action.playerId);
            requirePhase(draft, 'await_buy_decision');
            endPhase(draft, events);
            break;
        case 'BUILD':
            handleBuild(draft, events, action.playerId, action.tileId);
            break;
        case 'TOGGLE_MORTGAGE':
            handleToggleMortgage(draft, events, action.playerId, action.tileId);
            break;
        case 'DRAW_CARD':
            handleDrawCard(draft, events, action.playerId, action.deck, action.cardIndex);
            break;
        case 'USE_JAIL_CARD':
            handleUseJailCard(draft, events, action.playerId);
            break;
        case 'END_TURN':
            requireTurn(draft, action.playerId);
            requirePhase(draft, 'await_end');
            advanceTurn(draft, events);
            break;
        case 'DECLARE_BANKRUPTCY': {
            requireTurn(draft, action.playerId);
            bankruptInPlace(draft, events, action.playerId, null);
            endPhase(draft, events); // current player is bankrupt → advances the turn
            break;
        }
        case 'TRADE_EXECUTE':
            handleTrade(draft, events, action.from, action.to, action.give, action.get);
            break;
        default: {
            const t = (action as { type?: unknown }).type;
            fail('UNKNOWN_ACTION', String(t));
        }
    }
    return { state: draft, events };
}

// --- Exported test helpers ----------------------------------------------------

/**
 * Liquidate `playerId`'s assets toward `target` money (FIX-2 order: houses at
 * half houseCost, then mortgages at price/2). Pure: returns a new state, the
 * net amount raised, and the HOUSE_SOLD/MORTGAGED events.
 */
export function liquidate(state: GameState, playerId: number, target: number): { state: GameState; raised: number; events: GameEvent[] } {
    if (!Number.isFinite(target) || target < 0) fail('BAD_AMOUNT', `target=${target}`);
    const draft = cloneState(state);
    const p = getPlayer(draft, playerId);
    if (p.bankrupt) fail('PLAYER_BANKRUPT');
    const events: GameEvent[] = [];
    const raised = liquidateInPlace(draft, events, playerId, target);
    return { state: draft, raised, events };
}

/**
 * FIX-3 jail roll for `playerId` (assumed to be the acting player). Pure
 * helper exposed for unit tests; applyAction(ROLL) routes here when the
 * current player is in jail.
 */
export function jailStep(state: GameState, playerId: number, d1: number, d2: number): ActionResult {
    requireDie(d1);
    requireDie(d2);
    const draft = cloneState(state);
    const p = getPlayer(draft, playerId);
    if (p.bankrupt) fail('PLAYER_BANKRUPT');
    if (!p.inJail) fail('NOT_IN_JAIL');
    const events: GameEvent[] = [];
    jailStepInPlace(draft, events, playerId, d1, d2);
    return { state: draft, events };
}

/**
 * Apply card `cardIndex` of `deck` to `playerId` (assumed to be the acting
 * player), including any movement and follow-up landing resolution. Pure
 * helper exposed for unit tests; phase/turn validation lives in applyAction.
 */
export function cardEffect(state: GameState, playerId: number, deck: CardDeck, cardIndex: number): ActionResult {
    const cards = deck === 'chance' ? CHANCE_CARDS : CHEST_CARDS;
    if (!Number.isInteger(cardIndex) || cardIndex < 0 || cardIndex >= cards.length) {
        fail('BAD_CARD_INDEX', `deck ${deck} has ${cards.length} cards`);
    }
    const draft = cloneState(state);
    const p = getPlayer(draft, playerId);
    if (p.bankrupt) fail('PLAYER_BANKRUPT');
    const events: GameEvent[] = [];
    applyCardInPlace(draft, events, playerId, deck, cardIndex);
    return { state: draft, events };
}
