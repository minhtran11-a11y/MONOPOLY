/**
 * tests/move.test.ts
 *
 * Movement suite for the pure Monopoly rules core:
 * - computeDestination (forward, backward, wraps, identity, FIX-1 regression)
 * - passedGo edge cases (steps <= 0 never pay; from+steps >= 40 pays)
 * - ROLL MOVED event path correctness, forward and backward (card moves)
 * - GO salary credited exactly once per forward wrap
 * - landing chain after a move (tax, free parking, visiting jail, buy offer)
 * - zero-step moves resolve to a phase instead of hanging
 * - doubles -> pendingDouble -> EXTRA_TURN flow, END_TURN handling
 * - BAD_DICE / NOT_YOUR_TURN / WRONG_PHASE violations
 */

import { describe, expect, test } from 'vitest';
import {
    applyAction,
    cardEffect,
    computeDestination,
    initialState,
    passedGo,
    BOARD_SIZE,
    GAME_CONFIG,
    RuleViolation
} from '../src/core/rules_core.ts';
import type { GameEvent, GameState, PlayerSetup } from '../src/core/types.ts';

// ---------------------------------------------------------------------------
// Fixtures and helpers
// ---------------------------------------------------------------------------

const PLAYER_SETUPS: PlayerSetup[] = [
    { name: 'A', isBot: false, colorHex: '#f00', tokenKind: 'pawn' },
    { name: 'B', isBot: true, colorHex: '#00f', tokenKind: 'pawn' }
];

// Board landmarks (see src/core/board.ts BOARD)
const TILE_INCOME_TAX = 4; // TAX, price 200
const TILE_RAILROAD_SAIGON = 5; // RAILROAD, price 200
const TILE_PROP_HAI_BA_TRUNG = 6; // PROPERTY, price 100
const TILE_JAIL_VISIT = 10;
const TILE_CHEST_MID = 17; // CHEST
const TILE_PROP_HUNG_VUONG = 19; // PROPERTY, price 200
const TILE_PARKING = 20;
const TILE_CHANCE_MID = 22; // CHANCE
const TILE_AIRPORT = 35; // RAILROAD, price 200
const TILE_CHANCE_LATE = 36; // CHANCE
const TILE_LUXURY_TAX = 38; // TAX, price 100

// Card indices (see src/core/board.ts CHANCE_CARDS / CHEST_CARDS)
const CHANCE_AIRPORT_DIRECTOR = 0; // move_to 35, bonus 500 (FIX-4)
const CHANCE_BACK_THREE = 12; // move_steps -3
const CHANCE_NEAREST_PLAYER = 13; // move_to_nearest_player, bonus 350
const CHEST_BACK_TO_GO = 8; // move_to 0, bonus 200

const START_MONEY = GAME_CONFIG.START_MONEY; // 1500
const SALARY = GAME_CONFIG.PASS_GO_MONEY; // 200

function freshState(): GameState {
    return initialState(PLAYER_SETUPS, 'bot');
}

/** Arrange a deep scenario by mutating a structuredClone of a fresh state. */
function stateWith(mutate: (draft: GameState) => void): GameState {
    const draft = structuredClone(freshState());
    mutate(draft);
    return draft;
}

function eventsOf<T extends GameEvent['type']>(
    events: GameEvent[],
    type: T
): Extract<GameEvent, { type: T }>[] {
    return events.filter((e) => e.type === type) as Extract<GameEvent, { type: T }>[];
}

function totalMoney(state: GameState): number {
    return state.players.reduce((sum, p) => sum + p.money, 0);
}

function captureViolation(fn: () => unknown): RuleViolation {
    try {
        fn();
    } catch (error) {
        expect(error).toBeInstanceOf(RuleViolation);
        return error as RuleViolation;
    }
    throw new Error('expected a RuleViolation to be thrown');
}

// ---------------------------------------------------------------------------
// computeDestination
// ---------------------------------------------------------------------------

describe('computeDestination', () => {
    test('returns 38 when moving 3 steps backward from tile 1 (FIX-1 regression)', () => {
        expect(computeDestination(1, -3)).toBe(38);
    });

    test('adds steps without wrapping for plain forward moves', () => {
        expect(computeDestination(0, 5)).toBe(5);
        expect(computeDestination(10, 7)).toBe(17);
        expect(computeDestination(0, 39)).toBe(39);
    });

    test('wraps forward past GO when from + steps reaches the board size', () => {
        expect(computeDestination(38, 4)).toBe(2);
        expect(computeDestination(39, 1)).toBe(0);
        expect(computeDestination(36, 39)).toBe(35);
    });

    test('returns the same tile for zero steps (identity)', () => {
        expect(computeDestination(0, 0)).toBe(0);
        expect(computeDestination(7, 0)).toBe(7);
        expect(computeDestination(39, 0)).toBe(39);
    });

    test('wraps backward across GO including moves longer than one lap', () => {
        expect(computeDestination(0, -1)).toBe(39);
        expect(computeDestination(2, -5)).toBe(37);
        expect(computeDestination(5, -45)).toBe(0); // more than one lap backward
        expect(computeDestination(0, -40)).toBe(0); // exactly one lap backward
        expect(computeDestination(5, 40)).toBe(5); // exactly one lap forward
    });

    test('stays within 0..39 across a deterministic sweep of positions and steps', () => {
        for (const pos of [0, 13, 39]) {
            for (let steps = -50; steps <= 50; steps += 1) {
                const dest = computeDestination(pos, steps);
                expect(dest).toBeGreaterThanOrEqual(0);
                expect(dest).toBeLessThan(BOARD_SIZE);
                expect(Number.isInteger(dest)).toBe(true);
            }
        }
    });
});

// ---------------------------------------------------------------------------
// passedGo
// ---------------------------------------------------------------------------

describe('passedGo', () => {
    test('returns true when one step from tile 39 lands exactly on GO', () => {
        expect(passedGo(39, 1)).toBe(true);
    });

    test('returns true for a full 40-step lap starting from GO', () => {
        expect(passedGo(0, 40)).toBe(true);
    });

    test('returns false when 39 steps from GO stop on the last tile without wrapping', () => {
        expect(passedGo(0, 39)).toBe(false);
    });

    test('returns false for zero steps regardless of position', () => {
        expect(passedGo(0, 0)).toBe(false);
        expect(passedGo(5, 0)).toBe(false);
        expect(passedGo(39, 0)).toBe(false);
    });

    test('returns false for backward moves even when they cross GO (FIX-1)', () => {
        expect(passedGo(1, -3)).toBe(false);
        expect(passedGo(0, -1)).toBe(false);
        expect(passedGo(39, -40)).toBe(false);
    });
});

// ---------------------------------------------------------------------------
// ROLL: MOVED event path correctness (forward)
// ---------------------------------------------------------------------------

describe('ROLL movement and MOVED events', () => {
    test('emits MOVED with a sequential path and updates position on a forward roll', () => {
        // Arrange
        const s0 = freshState();
        const snapshot = structuredClone(s0);

        // Act
        const { state, events } = applyAction(s0, { type: 'ROLL', playerId: 0, d1: 2, d2: 3 });

        // Assert
        const moved = eventsOf(events, 'MOVED');
        expect(moved).toHaveLength(1);
        expect(moved[0]).toEqual({
            type: 'MOVED',
            playerId: 0,
            from: 0,
            to: TILE_RAILROAD_SAIGON,
            path: [1, 2, 3, 4, 5],
            passedGo: false
        });
        expect(state.players[0].position).toBe(TILE_RAILROAD_SAIGON);
        // applyAction never mutates its input state
        expect(s0).toEqual(snapshot);
    });

    test('emits a MOVED path that wraps past GO when the roll crosses tile 0', () => {
        // Arrange
        const s0 = stateWith((d) => {
            d.players[0].position = 38;
        });

        // Act
        const { state, events } = applyAction(s0, { type: 'ROLL', playerId: 0, d1: 3, d2: 1 });

        // Assert
        const moved = eventsOf(events, 'MOVED');
        expect(moved).toHaveLength(1);
        expect(moved[0].from).toBe(38);
        expect(moved[0].to).toBe(2);
        expect(moved[0].path).toEqual([39, 0, 1, 2]);
        expect(moved[0].passedGo).toBe(true);
        expect(state.players[0].position).toBe(2);
    });
});

// ---------------------------------------------------------------------------
// Backward moves via cards (FIX-1)
// ---------------------------------------------------------------------------

describe('backward card moves (FIX-1)', () => {
    test('walks backward with a descending path and no salary on the back-3 chance card', () => {
        // Arrange: player stands on the mid-board Chance tile in await_card phase
        const s0 = stateWith((d) => {
            d.players[0].position = TILE_CHANCE_MID;
            d.phase = 'await_card';
        });

        // Act
        const { state, events } = applyAction(s0, {
            type: 'DRAW_CARD',
            playerId: 0,
            deck: 'chance',
            cardIndex: CHANCE_BACK_THREE
        });

        // Assert
        const moved = eventsOf(events, 'MOVED');
        expect(moved).toHaveLength(1);
        expect(moved[0].from).toBe(TILE_CHANCE_MID);
        expect(moved[0].to).toBe(TILE_PROP_HUNG_VUONG);
        expect(moved[0].path).toEqual([21, 20, 19]);
        expect(moved[0].passedGo).toBe(false);
        expect(eventsOf(events, 'SALARY')).toHaveLength(0);
        expect(state.players[0].position).toBe(TILE_PROP_HUNG_VUONG);
        // landed on an unowned affordable property -> buy offer
        expect(state.phase).toBe('await_buy_decision');
        expect(state.players[0].money).toBe(START_MONEY);
    });

    test('wraps backward through GO without paying salary and resolves the landing', () => {
        // Arrange: tile 1 minus 3 steps wraps to tile 38 (luxury tax)
        const s0 = stateWith((d) => {
            d.players[0].position = 1;
        });

        // Act: cardEffect is the exported pure helper for card resolution
        const { state, events } = cardEffect(s0, 0, 'chance', CHANCE_BACK_THREE);

        // Assert
        const moved = eventsOf(events, 'MOVED');
        expect(moved).toHaveLength(1);
        expect(moved[0].from).toBe(1);
        expect(moved[0].to).toBe(TILE_LUXURY_TAX);
        expect(moved[0].path).toEqual([0, 39, 38]);
        expect(moved[0].passedGo).toBe(false);
        expect(eventsOf(events, 'SALARY')).toHaveLength(0);
        // landing chain ran: luxury tax (100) paid to the bank, no salary credited
        const paid = eventsOf(events, 'PAID');
        expect(paid).toHaveLength(1);
        expect(paid[0]).toEqual({ type: 'PAID', from: 0, to: 'bank', amount: 100 });
        expect(state.players[0].money).toBe(START_MONEY - 100);
        expect(totalMoney(state)).toBe(2 * START_MONEY - 100);
        expect(state.phase).toBe('await_end');
    });
});

// ---------------------------------------------------------------------------
// GO salary
// ---------------------------------------------------------------------------

describe('GO salary', () => {
    test('credits PASS_GO_MONEY exactly once when a roll wraps past GO', () => {
        // Arrange
        const s0 = stateWith((d) => {
            d.players[0].position = 39;
        });

        // Act: 39 + 6 wraps to tile 5
        const { state, events } = applyAction(s0, { type: 'ROLL', playerId: 0, d1: 2, d2: 4 });

        // Assert
        const salary = eventsOf(events, 'SALARY');
        expect(salary).toHaveLength(1);
        expect(salary[0]).toEqual({ type: 'SALARY', playerId: 0, amount: SALARY });
        expect(state.players[0].money).toBe(START_MONEY + SALARY);
        expect(totalMoney(state)).toBe(2 * START_MONEY + SALARY);
        expect(state.players[0].position).toBe(TILE_RAILROAD_SAIGON);
    });

    test('pays no salary when the roll does not cross GO', () => {
        // Arrange
        const s0 = freshState();

        // Act: 0 + 9 lands on tile 9, no wrap
        const { state, events } = applyAction(s0, { type: 'ROLL', playerId: 0, d1: 4, d2: 5 });

        // Assert
        expect(eventsOf(events, 'SALARY')).toHaveLength(0);
        expect(state.players[0].money).toBe(START_MONEY);
    });

    test('pays the card bonus plus exactly one salary when a chest card returns the player to GO', () => {
        // Arrange: player on Chest tile 17; card 8 moves forward to GO with a 200 bonus
        const s0 = stateWith((d) => {
            d.players[0].position = TILE_CHEST_MID;
            d.phase = 'await_card';
        });

        // Act
        const { state, events } = applyAction(s0, {
            type: 'DRAW_CARD',
            playerId: 0,
            deck: 'chest',
            cardIndex: CHEST_BACK_TO_GO
        });

        // Assert: bonus credited before the move, then a single pass-GO salary
        const collected = eventsOf(events, 'COLLECTED');
        expect(collected).toHaveLength(1);
        expect(collected[0].amount).toBe(200);
        const moved = eventsOf(events, 'MOVED');
        expect(moved).toHaveLength(1);
        expect(moved[0].to).toBe(0);
        expect(moved[0].passedGo).toBe(true);
        const salary = eventsOf(events, 'SALARY');
        expect(salary).toHaveLength(1);
        expect(salary[0].amount).toBe(SALARY);
        expect(state.players[0].money).toBe(START_MONEY + 200 + SALARY);
        expect(totalMoney(state)).toBe(2 * START_MONEY + 200 + SALARY);
        expect(state.phase).toBe('await_end'); // START tile is a no-op landing
    });
});

// ---------------------------------------------------------------------------
// Landing chain after a move
// ---------------------------------------------------------------------------

describe('landing chain after a move', () => {
    test('pays income tax to the bank in full when landing on the tax tile', () => {
        // Arrange
        const s0 = freshState();

        // Act: 0 + 4 lands on income tax (200)
        const { state, events } = applyAction(s0, { type: 'ROLL', playerId: 0, d1: 1, d2: 3 });

        // Assert
        const paid = eventsOf(events, 'PAID');
        expect(paid).toHaveLength(1);
        expect(paid[0].from).toBe(0);
        expect(paid[0].to).toBe('bank');
        expect(paid[0].amount).toBe(200);
        expect('raised' in paid[0]).toBe(false); // full payment, no shortfall marker
        expect(state.players[0].money).toBe(START_MONEY - 200);
        expect(state.players[1].money).toBe(START_MONEY); // opponent untouched
        expect(totalMoney(state)).toBe(2 * START_MONEY - 200);
        expect(state.phase).toBe('await_end');
    });

    test('treats free parking as a no-op landing', () => {
        // Arrange
        const s0 = stateWith((d) => {
            d.players[0].position = 15;
        });

        // Act: 15 + 5 lands on parking (20)
        const { state, events } = applyAction(s0, { type: 'ROLL', playerId: 0, d1: 2, d2: 3 });

        // Assert: only the MOVED event, no money movement, turn resolves
        expect(events).toHaveLength(1);
        expect(events[0].type).toBe('MOVED');
        expect(state.players[0].position).toBe(TILE_PARKING);
        expect(state.players[0].money).toBe(START_MONEY);
        expect(totalMoney(state)).toBe(2 * START_MONEY);
        expect(state.phase).toBe('await_end');
    });

    test('treats visiting jail as a no-op landing without arresting the player', () => {
        // Arrange
        const s0 = stateWith((d) => {
            d.players[0].position = 5;
        });

        // Act: 5 + 5 lands on the jail tile as a visitor (non-doubles dice)
        const { state, events } = applyAction(s0, { type: 'ROLL', playerId: 0, d1: 2, d2: 3 });

        // Assert
        expect(events).toHaveLength(1);
        expect(events[0].type).toBe('MOVED');
        expect(state.players[0].position).toBe(TILE_JAIL_VISIT);
        expect(state.players[0].inJail).toBe(false);
        expect(state.players[0].money).toBe(START_MONEY);
        expect(state.phase).toBe('await_end');
    });

    test('offers an unowned affordable property for purchase without changing ownership', () => {
        // Arrange
        const s0 = freshState();

        // Act: 0 + 3 lands on tile 3 (price 60)
        const { state, events } = applyAction(s0, { type: 'ROLL', playerId: 0, d1: 1, d2: 2 });

        // Assert: offer pending, nothing bought or paid yet
        expect(state.phase).toBe('await_buy_decision');
        expect(state.tiles[3].owner).toBeNull();
        expect(state.players[0].money).toBe(START_MONEY);
        expect(eventsOf(events, 'BOUGHT')).toHaveLength(0);
        expect(eventsOf(events, 'PAID')).toHaveLength(0);
    });

    test('airport chance card wraps the board, pays salary once, and leaves tile 35 bank-owned (FIX-4)', () => {
        // Arrange: player on Chance tile 36; card 0 moves forward to tile 35 with a 500 bonus
        const s0 = stateWith((d) => {
            d.players[0].position = TILE_CHANCE_LATE;
            d.phase = 'await_card';
        });

        // Act
        const { state, events } = applyAction(s0, {
            type: 'DRAW_CARD',
            playerId: 0,
            deck: 'chance',
            cardIndex: CHANCE_AIRPORT_DIRECTOR
        });

        // Assert: bonus + one wrap salary; forward-only 39-step path; no ownership grant
        const collected = eventsOf(events, 'COLLECTED');
        expect(collected).toHaveLength(1);
        expect(collected[0].amount).toBe(500);
        const moved = eventsOf(events, 'MOVED');
        expect(moved).toHaveLength(1);
        expect(moved[0].from).toBe(TILE_CHANCE_LATE);
        expect(moved[0].to).toBe(TILE_AIRPORT);
        expect(moved[0].path).toHaveLength(39);
        expect(moved[0].path[0]).toBe(37);
        expect(moved[0].path[38]).toBe(TILE_AIRPORT);
        expect(moved[0].passedGo).toBe(true);
        expect(eventsOf(events, 'SALARY')).toHaveLength(1);
        expect(state.players[0].money).toBe(START_MONEY + 500 + SALARY);
        expect(state.tiles[TILE_AIRPORT].owner).toBeNull(); // FIX-4: no silent grant
        expect(state.phase).toBe('await_buy_decision'); // affordable -> normal buy offer
    });
});

// ---------------------------------------------------------------------------
// Zero-step resolution
// ---------------------------------------------------------------------------

describe('zero-step moves', () => {
    test('resolves to await_end without a MOVED event when the nearest player shares the tile', () => {
        // Arrange: both players on Chance tile 7 -> nearest-player target distance is 0
        const s0 = stateWith((d) => {
            d.players[0].position = 7;
            d.players[1].position = 7;
            d.phase = 'await_card';
        });

        // Act
        const { state, events } = applyAction(s0, {
            type: 'DRAW_CARD',
            playerId: 0,
            deck: 'chance',
            cardIndex: CHANCE_NEAREST_PLAYER
        });

        // Assert: bonus still credited, no movement, phase resolved (no hang)
        const collected = eventsOf(events, 'COLLECTED');
        expect(collected).toHaveLength(1);
        expect(collected[0].amount).toBe(350);
        expect(eventsOf(events, 'MOVED')).toHaveLength(0);
        expect(state.players[0].position).toBe(7);
        expect(state.players[0].money).toBe(START_MONEY + 350);
        expect(state.phase).toBe('await_end');
    });

    test('resolves a move_to card targeting the current tile without movement, salary, or ownership', () => {
        // Arrange: player already standing on tile 35; airport card targets tile 35
        const s0 = stateWith((d) => {
            d.players[0].position = TILE_AIRPORT;
        });

        // Act
        const { state, events } = cardEffect(s0, 0, 'chance', CHANCE_AIRPORT_DIRECTOR);

        // Assert: bonus only; zero-step move skips MOVED/SALARY and resolves the phase
        expect(eventsOf(events, 'MOVED')).toHaveLength(0);
        expect(eventsOf(events, 'SALARY')).toHaveLength(0);
        expect(state.players[0].position).toBe(TILE_AIRPORT);
        expect(state.players[0].money).toBe(START_MONEY + 500);
        expect(state.tiles[TILE_AIRPORT].owner).toBeNull();
        expect(state.phase).toBe('await_end');
    });
});

// ---------------------------------------------------------------------------
// Doubles, pendingDouble and EXTRA_TURN
// ---------------------------------------------------------------------------

describe('doubles and extra turns', () => {
    test('grants an EXTRA_TURN immediately after landing resolution on a doubles roll', () => {
        // Arrange
        const s0 = freshState();

        // Act: 2 + 2 doubles, lands on income tax which resolves immediately
        const { state, events } = applyAction(s0, { type: 'ROLL', playerId: 0, d1: 2, d2: 2 });

        // Assert
        const extra = eventsOf(events, 'EXTRA_TURN');
        expect(extra).toHaveLength(1);
        expect(extra[0].playerId).toBe(0);
        expect(state.phase).toBe('await_roll');
        expect(state.currentPlayerIndex).toBe(0); // same player rolls again
        expect(state.pendingDouble).toBe(false); // consumed by the grant
        expect(state.doublesCount).toBe(1);
        expect(state.players[0].money).toBe(START_MONEY - 200); // tax still paid
    });

    test('keeps pendingDouble through the buy interlude and grants the extra roll after SKIP_BUY', () => {
        // Arrange: 3 + 3 doubles lands on unowned tile 6 -> buy decision pending
        const s0 = freshState();
        const afterRoll = applyAction(s0, { type: 'ROLL', playerId: 0, d1: 3, d2: 3 });
        expect(afterRoll.state.phase).toBe('await_buy_decision');
        expect(afterRoll.state.pendingDouble).toBe(true); // survives the interlude

        // Act
        const { state, events } = applyAction(afterRoll.state, { type: 'SKIP_BUY', playerId: 0 });

        // Assert
        expect(eventsOf(events, 'EXTRA_TURN')).toHaveLength(1);
        expect(state.phase).toBe('await_roll');
        expect(state.currentPlayerIndex).toBe(0);
        expect(state.pendingDouble).toBe(false);
    });

    test('grants the extra roll after BUY following a doubles roll', () => {
        // Arrange
        const s0 = freshState();
        const afterRoll = applyAction(s0, { type: 'ROLL', playerId: 0, d1: 3, d2: 3 });

        // Act
        const { state, events } = applyAction(afterRoll.state, {
            type: 'BUY',
            playerId: 0,
            tileId: TILE_PROP_HAI_BA_TRUNG
        });

        // Assert
        expect(eventsOf(events, 'BOUGHT')).toHaveLength(1);
        expect(eventsOf(events, 'EXTRA_TURN')).toHaveLength(1);
        expect(state.tiles[TILE_PROP_HAI_BA_TRUNG].owner).toBe(0);
        expect(state.players[0].money).toBe(START_MONEY - 100);
        expect(state.phase).toBe('await_roll');
        expect(state.currentPlayerIndex).toBe(0);
    });

    test('a non-doubles roll waits in await_end and END_TURN advances to the next player', () => {
        // Arrange: 1 + 3 lands on income tax, no doubles
        const s0 = freshState();
        const afterRoll = applyAction(s0, { type: 'ROLL', playerId: 0, d1: 1, d2: 3 });
        expect(afterRoll.state.phase).toBe('await_end');
        expect(afterRoll.state.pendingDouble).toBe(false);
        expect(eventsOf(afterRoll.events, 'EXTRA_TURN')).toHaveLength(0);

        // Act
        const { state, events } = applyAction(afterRoll.state, { type: 'END_TURN', playerId: 0 });

        // Assert
        const ended = eventsOf(events, 'TURN_ENDED');
        expect(ended).toHaveLength(1);
        expect(ended[0]).toEqual({ type: 'TURN_ENDED', playerId: 0, nextPlayerId: 1 });
        expect(state.currentPlayerIndex).toBe(1);
        expect(state.phase).toBe('await_roll');
        expect(state.doublesCount).toBe(0);
    });

    test('rejects END_TURN with WRONG_PHASE right after an extra turn is granted', () => {
        // Arrange: doubles roll resolved -> phase is await_roll again
        const s0 = freshState();
        const afterDoubles = applyAction(s0, { type: 'ROLL', playerId: 0, d1: 2, d2: 2 });
        expect(afterDoubles.state.phase).toBe('await_roll');

        // Act + Assert
        const err = captureViolation(() =>
            applyAction(afterDoubles.state, { type: 'END_TURN', playerId: 0 })
        );
        expect(err.code).toBe('WRONG_PHASE');
    });
});

// ---------------------------------------------------------------------------
// Violations
// ---------------------------------------------------------------------------

describe('rule violations', () => {
    test('throws BAD_DICE for dice outside 1..6 and non-integer dice', () => {
        const s0 = freshState();
        expect(captureViolation(() => applyAction(s0, { type: 'ROLL', playerId: 0, d1: 0, d2: 3 })).code).toBe('BAD_DICE');
        expect(captureViolation(() => applyAction(s0, { type: 'ROLL', playerId: 0, d1: 3, d2: 7 })).code).toBe('BAD_DICE');
        expect(captureViolation(() => applyAction(s0, { type: 'ROLL', playerId: 0, d1: 2.5, d2: 3 })).code).toBe('BAD_DICE');
    });

    test('throws NOT_YOUR_TURN when a non-current player rolls', () => {
        // Arrange
        const s0 = freshState(); // current player is 0

        // Act
        const err = captureViolation(() => applyAction(s0, { type: 'ROLL', playerId: 1, d1: 2, d2: 3 }));

        // Assert
        expect(err).toBeInstanceOf(RuleViolation);
        expect(err.name).toBe('RuleViolation');
        expect(err.code).toBe('NOT_YOUR_TURN');
        expect(err.message.startsWith('NOT_YOUR_TURN')).toBe(true);
    });

    test('throws WRONG_PHASE when rolling again during await_end', () => {
        // Arrange: a resolved non-doubles roll parks the turn in await_end
        const s0 = freshState();
        const afterRoll = applyAction(s0, { type: 'ROLL', playerId: 0, d1: 1, d2: 3 });
        expect(afterRoll.state.phase).toBe('await_end');

        // Act + Assert
        const err = captureViolation(() =>
            applyAction(afterRoll.state, { type: 'ROLL', playerId: 0, d1: 2, d2: 3 })
        );
        expect(err.code).toBe('WRONG_PHASE');
    });

    test('throws WRONG_PHASE when END_TURN arrives during await_roll', () => {
        const s0 = freshState();
        const err = captureViolation(() => applyAction(s0, { type: 'END_TURN', playerId: 0 }));
        expect(err.code).toBe('WRONG_PHASE');
    });

    test('throws WRONG_PHASE when DRAW_CARD arrives during await_roll', () => {
        const s0 = freshState();
        const err = captureViolation(() =>
            applyAction(s0, { type: 'DRAW_CARD', playerId: 0, deck: 'chance', cardIndex: 0 })
        );
        expect(err.code).toBe('WRONG_PHASE');
    });
});
