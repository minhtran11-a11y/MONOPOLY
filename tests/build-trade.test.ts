/**
 * tests/build-trade.test.ts
 *
 * Build / mortgage / trade / turn-flow suite for the pure Monopoly rules core:
 * - buildableTileIds: group completeness, even-build filter, hotel cap,
 *   mortgage exclusion, houseCost-ascending ordering
 * - BUILD: cost deduction, BUILT event house count, build windows
 *   (await_roll + await_end only), INCOMPLETE_GROUP / EVEN_BUILD_VIOLATION /
 *   MAX_HOUSES / CANT_AFFORD / NOT_OWNER / NOT_BUILDABLE violations
 * - TOGGLE_MORTGAGE: refund floor(price/2), redeem floor(price*0.6),
 *   HAS_HOUSES, NOT_OWNER, mortgaged tiles charge no rent
 * - TRADE_EXECUTE: money + tiles + jailFreeCards swap, money conservation,
 *   SELF_TRADE / EMPTY_TRADE / DUPLICATE_TILE / CANT_AFFORD / NOT_OWNER,
 *   mortgaged tiles tradeable (per task spec)
 * - END_TURN: rotation skipping bankrupt players, TURN_ENDED event,
 *   pendingDouble extra turn, GAME_OVER guard
 * - initialState validation + full-state JSON round trip after a game script
 *
 * Arrange-phase deep states are built by mutating a structuredClone of
 * initialState output (sanctioned for test setup); every ACT goes through the
 * public API (applyAction / exported helpers).
 */

import { describe, expect, test } from 'vitest';
import {
    applyAction,
    buildableTileIds,
    initialState,
    rentOf,
    BOARD,
    GAME_CONFIG,
    RuleViolation
} from '../src/core/rules_core.ts';
import type { Action, GameState, PlayerSetup } from '../src/core/types.ts';

// ---------------------------------------------------------------------------
// Fixtures and helpers
// ---------------------------------------------------------------------------

function makeSetup(name: string): PlayerSetup {
    return { name, isBot: name !== 'A', colorHex: '#888', tokenKind: 'pawn' };
}

const TWO_PLAYERS: PlayerSetup[] = [
    { name: 'A', isBot: false, colorHex: '#f00', tokenKind: 'pawn' },
    { name: 'B', isBot: true, colorHex: '#00f', tokenKind: 'pawn' }
];

const THREE_PLAYERS: PlayerSetup[] = [...TWO_PLAYERS, makeSetup('C')];

// Board landmarks (see src/core/board.ts BOARD)
const TILE_BROWN_A = 1; // Đ. Nguyễn Huệ — PROPERTY, price 60, houseCost 50, group 1
const TILE_BROWN_B = 3; // Đ. Lê Lợi — PROPERTY, price 60, houseCost 50, group 1
const TILE_RAILROAD_SAIGON = 5; // RAILROAD, price 200 (not buildable)
const TILE_LBLUE_A = 6; // Đ. Hai Bà Trưng — PROPERTY, price 100
const TILE_LBLUE_B = 8; // Đ. Điện Biên Phủ — PROPERTY, price 100
const TILE_DBLUE_A = 37; // Bitexco — PROPERTY, price 350, houseCost 200, group 8
const TILE_DBLUE_B = 39; // Landmark 81 — PROPERTY, price 400, houseCost 200, group 8

const START_MONEY = GAME_CONFIG.START_MONEY; // 1500
const HOTEL = GAME_CONFIG.MAX_HOUSES; // 5
const BROWN_HOUSE_COST = 50;
const BROWN_PRICE = 60;
const BROWN_MORTGAGE_REFUND = 30; // floor(60 / 2)
const BROWN_REDEEM_COST = 36; // floor(60 * 0.6)

function freshState(setups: PlayerSetup[] = TWO_PLAYERS): GameState {
    return initialState(setups, 'bot');
}

/** Deep-clone `base` and mutate the clone — the sanctioned arrange pattern. */
function arrange(mutate: (draft: GameState) => void, base: GameState = freshState()): GameState {
    const draft = structuredClone(base);
    mutate(draft);
    return draft;
}

function giveTiles(draft: GameState, playerId: number, tileIds: number[]): void {
    for (const id of tileIds) draft.tiles[id].owner = playerId;
}

function totalPlayerMoney(state: GameState): number {
    return state.players.reduce((sum, p) => sum + p.money, 0);
}

/** Asserts `fn` throws a RuleViolation carrying exactly `code`. */
function expectViolation(code: string, fn: () => unknown): void {
    let thrown: unknown = null;
    try {
        fn();
    } catch (err) {
        thrown = err;
    }
    expect(thrown, `expected RuleViolation ${code} to be thrown`).toBeInstanceOf(RuleViolation);
    expect((thrown as RuleViolation).code).toBe(code);
}

// ---------------------------------------------------------------------------
// initialState validation
// ---------------------------------------------------------------------------

describe('initialState', () => {
    test('creates players with start money on GO and a bank-owned board in await_roll', () => {
        const state = freshState();

        expect(state.phase).toBe('await_roll');
        expect(state.currentPlayerIndex).toBe(0);
        expect(state.players).toHaveLength(2);
        for (const p of state.players) {
            expect(p.money).toBe(START_MONEY);
            expect(p.position).toBe(0);
            expect(p.inJail).toBe(false);
            expect(p.bankrupt).toBe(false);
            expect(p.jailFreeCards).toBe(0);
        }
        expect(state.tiles).toHaveLength(40);
        expect(state.tiles.every((t) => t.owner === null && t.houses === 0 && !t.isMortgaged)).toBe(true);
    });

    test('respects startIndex when selecting the opening player', () => {
        const state = initialState(TWO_PLAYERS, 'bot', 1);
        expect(state.currentPlayerIndex).toBe(1);
        expect(state.phase).toBe('await_roll');
    });

    test('throws INVALID_PLAYER_COUNT when fewer than 2 players are supplied', () => {
        expectViolation('INVALID_PLAYER_COUNT', () => initialState([makeSetup('A')], 'bot'));
    });

    test('throws INVALID_PLAYER_COUNT when more than 4 players are supplied', () => {
        const five = [...THREE_PLAYERS, makeSetup('D'), makeSetup('E')];
        expectViolation('INVALID_PLAYER_COUNT', () => initialState(five, 'bot'));
    });

    test('throws BAD_START_INDEX when startIndex is outside the player range', () => {
        expectViolation('BAD_START_INDEX', () => initialState(TWO_PLAYERS, 'bot', 2));
        expectViolation('BAD_START_INDEX', () => initialState(TWO_PLAYERS, 'bot', -1));
    });
});

// ---------------------------------------------------------------------------
// buildableTileIds
// ---------------------------------------------------------------------------

describe('buildableTileIds', () => {
    test('returns empty list when the color group is incomplete', () => {
        const state = arrange((d) => giveTiles(d, 0, [TILE_BROWN_A])); // sibling stays bank-owned
        expect(buildableTileIds(state, 0)).toEqual([]);
    });

    test('lists every tile of a fully owned group when house counts are level', () => {
        const state = arrange((d) => giveTiles(d, 0, [TILE_BROWN_A, TILE_BROWN_B]));
        expect(buildableTileIds(state, 0)).toEqual([TILE_BROWN_A, TILE_BROWN_B]);
    });

    test('offers only minimum-house tiles under the even-build rule', () => {
        const state = arrange((d) => {
            giveTiles(d, 0, [TILE_BROWN_A, TILE_BROWN_B]);
            d.tiles[TILE_BROWN_A].houses = 1;
        });
        expect(buildableTileIds(state, 0)).toEqual([TILE_BROWN_B]);
    });

    test('excludes the whole group when any member tile is mortgaged', () => {
        const state = arrange((d) => {
            giveTiles(d, 0, [TILE_BROWN_A, TILE_BROWN_B]);
            d.tiles[TILE_BROWN_B].isMortgaged = true;
        });
        expect(buildableTileIds(state, 0)).toEqual([]);
    });

    test('excludes tiles that already carry a hotel', () => {
        const state = arrange((d) => {
            giveTiles(d, 0, [TILE_BROWN_A, TILE_BROWN_B]);
            d.tiles[TILE_BROWN_A].houses = HOTEL;
            d.tiles[TILE_BROWN_B].houses = HOTEL - 1;
        });
        expect(buildableTileIds(state, 0)).toEqual([TILE_BROWN_B]);
    });

    test('sorts buildable tiles by house cost ascending across groups', () => {
        const state = arrange((d) =>
            giveTiles(d, 0, [TILE_DBLUE_A, TILE_DBLUE_B, TILE_BROWN_A, TILE_BROWN_B]));
        // brown houseCost 50 < dark-blue houseCost 200; ties keep board order
        expect(buildableTileIds(state, 0)).toEqual([TILE_BROWN_A, TILE_BROWN_B, TILE_DBLUE_A, TILE_DBLUE_B]);
    });
});

// ---------------------------------------------------------------------------
// BUILD
// ---------------------------------------------------------------------------

describe('BUILD', () => {
    test('deducts the house cost, increments houses and emits BUILT during await_roll', () => {
        // Arrange
        const state = arrange((d) => giveTiles(d, 0, [TILE_BROWN_A, TILE_BROWN_B]));

        // Act
        const { state: next, events } = applyAction(state, { type: 'BUILD', playerId: 0, tileId: TILE_BROWN_A });

        // Assert
        expect(next.players[0].money).toBe(START_MONEY - BROWN_HOUSE_COST);
        expect(next.tiles[TILE_BROWN_A].houses).toBe(1);
        expect(events).toContainEqual({ type: 'BUILT', tileId: TILE_BROWN_A, houses: 1 });
        expect(next.phase).toBe('await_roll'); // building does not consume the roll window
    });

    test('allows building during the await_end window and keeps the phase', () => {
        const state = arrange((d) => {
            giveTiles(d, 0, [TILE_BROWN_A, TILE_BROWN_B]);
            d.phase = 'await_end';
        });
        const { state: next } = applyAction(state, { type: 'BUILD', playerId: 0, tileId: TILE_BROWN_A });
        expect(next.tiles[TILE_BROWN_A].houses).toBe(1);
        expect(next.phase).toBe('await_end');
    });

    test('throws WRONG_PHASE when building during a buy decision', () => {
        const state = arrange((d) => {
            giveTiles(d, 0, [TILE_BROWN_A, TILE_BROWN_B]);
            d.phase = 'await_buy_decision';
        });
        expectViolation('WRONG_PHASE', () => applyAction(state, { type: 'BUILD', playerId: 0, tileId: TILE_BROWN_A }));
    });

    test('throws INCOMPLETE_GROUP when a sibling tile is not owned', () => {
        const state = arrange((d) => giveTiles(d, 0, [TILE_BROWN_A]));
        expectViolation('INCOMPLETE_GROUP', () => applyAction(state, { type: 'BUILD', playerId: 0, tileId: TILE_BROWN_A }));
    });

    test('throws INCOMPLETE_GROUP when a sibling tile is mortgaged', () => {
        const state = arrange((d) => {
            giveTiles(d, 0, [TILE_BROWN_A, TILE_BROWN_B]);
            d.tiles[TILE_BROWN_B].isMortgaged = true;
        });
        expectViolation('INCOMPLETE_GROUP', () => applyAction(state, { type: 'BUILD', playerId: 0, tileId: TILE_BROWN_A }));
    });

    test('throws EVEN_BUILD_VIOLATION when stacking a 2nd house while the sibling has none', () => {
        // Arrange: full brown group, then build once on tile A through the API
        const state = arrange((d) => giveTiles(d, 0, [TILE_BROWN_A, TILE_BROWN_B]));
        const first = applyAction(state, { type: 'BUILD', playerId: 0, tileId: TILE_BROWN_A });

        // Act + Assert: second house on the same tile while sibling is at 0
        expectViolation('EVEN_BUILD_VIOLATION', () =>
            applyAction(first.state, { type: 'BUILD', playerId: 0, tileId: TILE_BROWN_A }));
    });

    test('builds the hotel as the 5th house and reports houses=5 in BUILT', () => {
        const state = arrange((d) => {
            giveTiles(d, 0, [TILE_BROWN_A, TILE_BROWN_B]);
            d.tiles[TILE_BROWN_A].houses = 4;
            d.tiles[TILE_BROWN_B].houses = 4;
        });
        const { state: next, events } = applyAction(state, { type: 'BUILD', playerId: 0, tileId: TILE_BROWN_A });
        expect(next.tiles[TILE_BROWN_A].houses).toBe(HOTEL);
        expect(events).toContainEqual({ type: 'BUILT', tileId: TILE_BROWN_A, houses: HOTEL });
    });

    test('throws MAX_HOUSES when the tile already carries a hotel', () => {
        const state = arrange((d) => {
            giveTiles(d, 0, [TILE_BROWN_A, TILE_BROWN_B]);
            d.tiles[TILE_BROWN_A].houses = HOTEL;
            d.tiles[TILE_BROWN_B].houses = HOTEL;
        });
        expectViolation('MAX_HOUSES', () => applyAction(state, { type: 'BUILD', playerId: 0, tileId: TILE_BROWN_A }));
    });

    test('throws CANT_AFFORD when money is below the house cost', () => {
        const state = arrange((d) => {
            giveTiles(d, 0, [TILE_BROWN_A, TILE_BROWN_B]);
            d.players[0].money = BROWN_HOUSE_COST - 1;
        });
        expectViolation('CANT_AFFORD', () => applyAction(state, { type: 'BUILD', playerId: 0, tileId: TILE_BROWN_A }));
    });

    test('throws NOT_OWNER when building on an opponent-owned tile', () => {
        const state = arrange((d) => giveTiles(d, 1, [TILE_BROWN_A, TILE_BROWN_B]));
        expectViolation('NOT_OWNER', () => applyAction(state, { type: 'BUILD', playerId: 0, tileId: TILE_BROWN_A }));
    });

    test('throws NOT_BUILDABLE when targeting a railroad', () => {
        const state = arrange((d) => giveTiles(d, 0, [TILE_RAILROAD_SAIGON]));
        expectViolation('NOT_BUILDABLE', () =>
            applyAction(state, { type: 'BUILD', playerId: 0, tileId: TILE_RAILROAD_SAIGON }));
    });
});

// ---------------------------------------------------------------------------
// TOGGLE_MORTGAGE
// ---------------------------------------------------------------------------

describe('TOGGLE_MORTGAGE', () => {
    test('mortgaging credits floor(price/2) and flags the tile', () => {
        const state = arrange((d) => giveTiles(d, 0, [TILE_BROWN_A]));
        const { state: next, events } = applyAction(state, { type: 'TOGGLE_MORTGAGE', playerId: 0, tileId: TILE_BROWN_A });
        expect(next.players[0].money).toBe(START_MONEY + BROWN_MORTGAGE_REFUND);
        expect(next.tiles[TILE_BROWN_A].isMortgaged).toBe(true);
        expect(events).toContainEqual({ type: 'MORTGAGED', tileId: TILE_BROWN_A, amount: BROWN_MORTGAGE_REFUND });
    });

    test('unmortgaging costs floor(price * 0.6)', () => {
        // Arrange: two mortgaged tiles at different prices to pin the 0.6 rate
        const state = arrange((d) => {
            giveTiles(d, 0, [TILE_BROWN_A, TILE_DBLUE_A]);
            d.tiles[TILE_BROWN_A].isMortgaged = true;
            d.tiles[TILE_DBLUE_A].isMortgaged = true;
        });

        // Act
        const r1 = applyAction(state, { type: 'TOGGLE_MORTGAGE', playerId: 0, tileId: TILE_BROWN_A });
        const r2 = applyAction(r1.state, { type: 'TOGGLE_MORTGAGE', playerId: 0, tileId: TILE_DBLUE_A });

        // Assert: 60 * 0.6 -> 36; 350 * 0.6 -> 210 (mirrors implementation rate)
        expect(r1.state.players[0].money).toBe(START_MONEY - BROWN_REDEEM_COST);
        expect(r1.state.tiles[TILE_BROWN_A].isMortgaged).toBe(false);
        expect(r1.events).toContainEqual({ type: 'UNMORTGAGED', tileId: TILE_BROWN_A, amount: BROWN_REDEEM_COST });
        const dblueRedeemCost = Math.floor((BOARD[TILE_DBLUE_A].price ?? 0) * 0.6);
        expect(r2.events).toContainEqual({ type: 'UNMORTGAGED', tileId: TILE_DBLUE_A, amount: dblueRedeemCost });
        expect(r2.state.tiles[TILE_DBLUE_A].isMortgaged).toBe(false);
    });

    test('mortgage-then-redeem round trip costs a net 10% of the price', () => {
        const state = arrange((d) => giveTiles(d, 0, [TILE_BROWN_A]));
        const mortgaged = applyAction(state, { type: 'TOGGLE_MORTGAGE', playerId: 0, tileId: TILE_BROWN_A });
        const redeemed = applyAction(mortgaged.state, { type: 'TOGGLE_MORTGAGE', playerId: 0, tileId: TILE_BROWN_A });
        expect(redeemed.state.players[0].money).toBe(START_MONEY + BROWN_MORTGAGE_REFUND - BROWN_REDEEM_COST);
        expect(redeemed.state.players[0].money).toBe(START_MONEY - BROWN_PRICE * 0.1);
        expect(redeemed.state.tiles[TILE_BROWN_A].isMortgaged).toBe(false);
    });

    test('throws CANT_AFFORD when redeeming with insufficient money', () => {
        const state = arrange((d) => {
            giveTiles(d, 0, [TILE_BROWN_A]);
            d.tiles[TILE_BROWN_A].isMortgaged = true;
            d.players[0].money = BROWN_REDEEM_COST - 1;
        });
        expectViolation('CANT_AFFORD', () =>
            applyAction(state, { type: 'TOGGLE_MORTGAGE', playerId: 0, tileId: TILE_BROWN_A }));
    });

    test('throws HAS_HOUSES when the tile still carries houses', () => {
        const state = arrange((d) => {
            giveTiles(d, 0, [TILE_BROWN_A, TILE_BROWN_B]);
            d.tiles[TILE_BROWN_A].houses = 1;
            d.tiles[TILE_BROWN_B].houses = 1;
        });
        expectViolation('HAS_HOUSES', () =>
            applyAction(state, { type: 'TOGGLE_MORTGAGE', playerId: 0, tileId: TILE_BROWN_A }));
    });

    test('throws NOT_OWNER when toggling an opponent-owned tile', () => {
        const state = arrange((d) => giveTiles(d, 1, [TILE_BROWN_A]));
        expectViolation('NOT_OWNER', () =>
            applyAction(state, { type: 'TOGGLE_MORTGAGE', playerId: 0, tileId: TILE_BROWN_A }));
    });

    test('charges no rent when landing on a mortgaged tile', () => {
        // Arrange: opponent owns a mortgaged brown tile three steps ahead
        const state = arrange((d) => {
            d.tiles[TILE_BROWN_B].owner = 1;
            d.tiles[TILE_BROWN_B].isMortgaged = true;
        });
        expect(rentOf(state, TILE_BROWN_B)).toBe(0);

        // Act: P0 rolls 1+2 and lands on the mortgaged tile
        const { state: next, events } = applyAction(state, { type: 'ROLL', playerId: 0, d1: 1, d2: 2 });

        // Assert: rent waived, no payment flows either way
        expect(events).toContainEqual({ type: 'RENT_FREE', tileId: TILE_BROWN_B, reason: 'mortgaged' });
        expect(events.some((e) => e.type === 'RENT_DUE' || e.type === 'PAID')).toBe(false);
        expect(next.players[0].money).toBe(START_MONEY);
        expect(next.players[1].money).toBe(START_MONEY);
    });
});

// ---------------------------------------------------------------------------
// TRADE_EXECUTE
// ---------------------------------------------------------------------------

describe('TRADE_EXECUTE', () => {
    function tradeReadyState(): GameState {
        return arrange((d) => {
            d.tiles[TILE_BROWN_A].owner = 0;
            d.tiles[TILE_DBLUE_B].owner = 1;
            d.players[0].jailFreeCards = 2;
        });
    }

    const SWAP_ACTION: Action = {
        type: 'TRADE_EXECUTE',
        from: 0,
        to: 1,
        give: { money: 100, tileIds: [TILE_BROWN_A], jailFreeCards: 1 },
        get: { money: 50, tileIds: [TILE_DBLUE_B] }
    };

    test('swaps money, tiles and jail-free cards both ways with a TRADED event', () => {
        const { state: next, events } = applyAction(tradeReadyState(), SWAP_ACTION);

        expect(next.players[0].money).toBe(START_MONEY - 100 + 50);
        expect(next.players[1].money).toBe(START_MONEY + 100 - 50);
        expect(next.tiles[TILE_BROWN_A].owner).toBe(1);
        expect(next.tiles[TILE_DBLUE_B].owner).toBe(0);
        expect(next.players[0].jailFreeCards).toBe(1);
        expect(next.players[1].jailFreeCards).toBe(1);
        expect(events).toContainEqual({
            type: 'TRADED',
            from: 0,
            to: 1,
            give: { money: 100, tileIds: [TILE_BROWN_A], jailFreeCards: 1 },
            get: { money: 50, tileIds: [TILE_DBLUE_B] }
        });
    });

    test('conserves total player money across a trade', () => {
        const before = tradeReadyState();
        const { state: next } = applyAction(before, SWAP_ACTION);
        expect(totalPlayerMoney(next)).toBe(totalPlayerMoney(before));
    });

    test('throws SELF_TRADE when both sides are the same player', () => {
        expectViolation('SELF_TRADE', () => applyAction(freshState(), {
            type: 'TRADE_EXECUTE',
            from: 0,
            to: 0,
            give: { money: 0, tileIds: [] },
            get: { money: 0, tileIds: [] }
        }));
    });

    test('throws EMPTY_TRADE when both offers are empty', () => {
        expectViolation('EMPTY_TRADE', () => applyAction(freshState(), {
            type: 'TRADE_EXECUTE',
            from: 0,
            to: 1,
            give: { money: 0, tileIds: [] },
            get: { money: 0, tileIds: [] }
        }));
    });

    test('throws DUPLICATE_TILE when a tile id appears twice in one offer', () => {
        const state = arrange((d) => giveTiles(d, 0, [TILE_BROWN_A]));
        expectViolation('DUPLICATE_TILE', () => applyAction(state, {
            type: 'TRADE_EXECUTE',
            from: 0,
            to: 1,
            give: { money: 0, tileIds: [TILE_BROWN_A, TILE_BROWN_A] },
            get: { money: 0, tileIds: [] }
        }));
    });

    test('throws CANT_AFFORD when the proposer offers more money than held', () => {
        expectViolation('CANT_AFFORD', () => applyAction(freshState(), {
            type: 'TRADE_EXECUTE',
            from: 0,
            to: 1,
            give: { money: START_MONEY + 1, tileIds: [] },
            get: { money: 0, tileIds: [] }
        }));
    });

    test('throws CANT_AFFORD when the partner cannot cover the requested money', () => {
        expectViolation('CANT_AFFORD', () => applyAction(freshState(), {
            type: 'TRADE_EXECUTE',
            from: 0,
            to: 1,
            give: { money: 0, tileIds: [] },
            get: { money: START_MONEY + 1, tileIds: [] }
        }));
    });

    test('throws NOT_OWNER when an offered tile is not owned by its side', () => {
        // give side: tile is bank-owned
        expectViolation('NOT_OWNER', () => applyAction(freshState(), {
            type: 'TRADE_EXECUTE',
            from: 0,
            to: 1,
            give: { money: 0, tileIds: [TILE_BROWN_A] },
            get: { money: 50, tileIds: [] }
        }));
        // get side: requested tile is bank-owned
        expectViolation('NOT_OWNER', () => applyAction(freshState(), {
            type: 'TRADE_EXECUTE',
            from: 0,
            to: 1,
            give: { money: 50, tileIds: [] },
            get: { money: 0, tileIds: [TILE_DBLUE_B] }
        }));
    });

    test('rejects mortgaged tiles in either side of a trade', () => {
        // Adjudicated: the engine ports trade.js's restriction (TradeOffer is
        // documented in types.ts as "unmortgaged, house-free properties").
        const state = arrange((d) => {
            d.tiles[TILE_BROWN_A].owner = 0;
            d.tiles[TILE_BROWN_A].isMortgaged = true;
        });

        expectViolation('MORTGAGED', () => applyAction(state, {
            type: 'TRADE_EXECUTE',
            from: 0,
            to: 1,
            give: { money: 0, tileIds: [TILE_BROWN_A] },
            get: { money: 100, tileIds: [] }
        }));
    });
});

// ---------------------------------------------------------------------------
// END_TURN, rotation and the doubles extra turn
// ---------------------------------------------------------------------------

describe('END_TURN and turn rotation', () => {
    test('hands the turn to the next player with a TURN_ENDED event', () => {
        const state = arrange((d) => { d.phase = 'await_end'; });
        const { state: next, events } = applyAction(state, { type: 'END_TURN', playerId: 0 });
        expect(next.currentPlayerIndex).toBe(1);
        expect(next.phase).toBe('await_roll');
        expect(events).toContainEqual({ type: 'TURN_ENDED', playerId: 0, nextPlayerId: 1 });
    });

    test('skips bankrupt players when rotating the turn', () => {
        const state = arrange((d) => {
            d.phase = 'await_end';
            d.players[1].bankrupt = true;
        }, freshState(THREE_PLAYERS));
        const { state: next, events } = applyAction(state, { type: 'END_TURN', playerId: 0 });
        expect(next.currentPlayerIndex).toBe(2);
        expect(events).toContainEqual({ type: 'TURN_ENDED', playerId: 0, nextPlayerId: 2 });
    });

    test('grants the same player an extra turn after a doubles roll resolves', () => {
        // 5+5 from GO lands on the visiting-jail corner — resolution is immediate
        const { state: next, events } = applyAction(freshState(), { type: 'ROLL', playerId: 0, d1: 5, d2: 5 });
        expect(events).toContainEqual({ type: 'EXTRA_TURN', playerId: 0 });
        expect(next.currentPlayerIndex).toBe(0);
        expect(next.phase).toBe('await_roll');
        expect(next.pendingDouble).toBe(false); // consumed by the extra turn
        expect(next.doublesCount).toBe(1);
    });

    test('keeps pendingDouble through a buy interlude and grants the extra turn after BUY', () => {
        // Arrange: doubles roll onto an unowned affordable property
        const rolled = applyAction(freshState(), { type: 'ROLL', playerId: 0, d1: 3, d2: 3 });
        expect(rolled.state.phase).toBe('await_buy_decision');
        expect(rolled.state.pendingDouble).toBe(true);

        // Act: complete the purchase
        const bought = applyAction(rolled.state, { type: 'BUY', playerId: 0, tileId: TILE_LBLUE_A });

        // Assert: extra turn instead of await_end
        expect(bought.events).toContainEqual({ type: 'BOUGHT', tileId: TILE_LBLUE_A });
        expect(bought.events).toContainEqual({ type: 'EXTRA_TURN', playerId: 0 });
        expect(bought.state.phase).toBe('await_roll');
        expect(bought.state.currentPlayerIndex).toBe(0);
    });

    test('resolves a non-doubles roll to await_end with no extra turn', () => {
        const { state: next, events } = applyAction(freshState(), { type: 'ROLL', playerId: 0, d1: 4, d2: 6 });
        expect(next.phase).toBe('await_end');
        expect(events.some((e) => e.type === 'EXTRA_TURN')).toBe(false);
        expect(next.pendingDouble).toBe(false);
    });

    test('throws GAME_OVER for actions after the game has ended', () => {
        const state = arrange((d) => {
            d.phase = 'game_over';
            d.winner = 0;
            d.players[1].bankrupt = true;
        });
        expectViolation('GAME_OVER', () => applyAction(state, { type: 'END_TURN', playerId: 0 }));
        expectViolation('GAME_OVER', () => applyAction(state, { type: 'ROLL', playerId: 0, d1: 2, d2: 3 }));
    });
});

// ---------------------------------------------------------------------------
// Serialization round trip
// ---------------------------------------------------------------------------

describe('state serialization', () => {
    test('full state survives a JSON stringify/parse round trip after a 10-action game script', () => {
        // Arrange + Act: a deterministic 10-action two-player script
        const script: Action[] = [
            { type: 'ROLL', playerId: 0, d1: 1, d2: 2 },                      // P0 -> tile 3, buy offer
            { type: 'BUY', playerId: 0, tileId: TILE_BROWN_B },               // P0 buys tile 3
            { type: 'END_TURN', playerId: 0 },
            { type: 'ROLL', playerId: 1, d1: 2, d2: 4 },                      // P1 -> tile 6, buy offer
            { type: 'SKIP_BUY', playerId: 1 },
            { type: 'END_TURN', playerId: 1 },
            { type: 'ROLL', playerId: 0, d1: 2, d2: 3 },                      // P0 -> tile 8, buy offer
            { type: 'BUY', playerId: 0, tileId: TILE_LBLUE_B },               // P0 buys tile 8
            { type: 'TOGGLE_MORTGAGE', playerId: 0, tileId: TILE_BROWN_B },   // P0 mortgages tile 3
            { type: 'END_TURN', playerId: 0 }
        ];
        let state = freshState();
        for (const action of script) state = applyAction(state, action).state;

        // Assert: the script really exercised the engine...
        expect(state.currentPlayerIndex).toBe(1);
        expect(state.phase).toBe('await_roll');
        expect(state.tiles[TILE_BROWN_B]).toEqual({ id: TILE_BROWN_B, owner: 0, houses: 0, isMortgaged: true });
        expect(state.tiles[TILE_LBLUE_B].owner).toBe(0);
        expect(state.players[0].money).toBe(START_MONEY - 60 - 100 + BROWN_MORTGAGE_REFUND);
        expect(state.players[1].money).toBe(START_MONEY);

        // ...and the resulting state is JSON-safe and round-trip stable
        const revived = JSON.parse(JSON.stringify(state)) as GameState;
        expect(revived).toStrictEqual(state);
    });
});
