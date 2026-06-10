/**
 * tests/rent.test.ts
 *
 * Rent matrix for the pure rules core (src/core/rules_core.ts):
 * - rentOf(): property base / full-group double / house multipliers / hotel,
 *   railroad count tiers, utility dice multipliers + flat card fallback,
 *   mortgage and zero-rent guards.
 * - Integration: rent actually moves money through applyAction(ROLL) landings,
 *   including the RENT_FREE waivers (mortgaged / owner in jail / owner bankrupt).
 *
 * Board facts used (src/core/board.ts):
 *   tile 1  PROPERTY rent 2,  group 1 = {1, 3}        tile 3 PROPERTY rent 4
 *   tile 6  PROPERTY rent 6,  group 2 = {6, 8, 9}
 *   tile 39 PROPERTY rent 50, group 8 = {37, 39}
 *   railroads {5, 15, 25, 35} — tier rents 25/50/100/200
 *   utilities {12, 28} — flat fallback rent 20, dice x4 (one) / x10 (both)
 */

import { describe, expect, test } from 'vitest';
import { applyAction, initialState, rentOf, GAME_CONFIG } from '../src/core/rules_core.ts';
import type { GameEvent, GameState, PlayerSetup } from '../src/core/types.ts';

const PLAYER_SETUPS: PlayerSetup[] = [
    { name: 'A', isBot: false, colorHex: '#f00', tokenKind: 'pawn' },
    { name: 'B', isBot: true, colorHex: '#00f', tokenKind: 'pawn' }
];

const P0 = 0;
const P1 = 1;

const RAILROAD_TILE_IDS = [5, 15, 25, 35];
const ELECTRIC_UTILITY = 12;
const WATER_UTILITY = 28;

/** Fresh 2-player game, deep-cloned so each test may arrange tiles/players freely. */
function arrange(mutate?: (draft: GameState) => void): GameState {
    const draft = structuredClone(initialState(PLAYER_SETUPS, 'bot'));
    if (mutate) mutate(draft);
    return draft;
}

function totalMoney(state: GameState): number {
    return state.players.reduce((sum, p) => sum + p.money, 0);
}

function getEvent<K extends GameEvent['type']>(events: GameEvent[], type: K): Extract<GameEvent, { type: K }> {
    const found = events.find((e): e is Extract<GameEvent, { type: K }> => e.type === type);
    if (!found) throw new Error(`expected a ${type} event, got [${events.map((e) => e.type).join(', ')}]`);
    return found;
}

function eventTypes(events: GameEvent[]): string[] {
    return events.map((e) => e.type);
}

// ---------------------------------------------------------------------------
// rentOf — property base rent
// ---------------------------------------------------------------------------

describe('rentOf — property base rent', () => {
    test('returns base rent when the owner does not hold the full color group', () => {
        // Arrange: tile 6 (rent 6) is the only group-2 tile player 1 owns.
        const state = arrange((s) => {
            s.tiles[6].owner = P1;
        });

        // Act + Assert
        expect(rentOf(state, 6)).toBe(6);
    });

    test('returns double base rent on each tile when the owner holds the entire color group with no houses', () => {
        // Arrange: player 1 owns the complete brown group {1, 3}.
        const state = arrange((s) => {
            s.tiles[1].owner = P1;
            s.tiles[3].owner = P1;
        });

        // Act + Assert: base 2 -> 4 and base 4 -> 8.
        expect(rentOf(state, 1)).toBe(4);
        expect(rentOf(state, 3)).toBe(8);
    });

    test('returns single base rent when the color group is split between two owners', () => {
        // Arrange: brown group split — tile 1 to player 0, tile 3 to player 1.
        const state = arrange((s) => {
            s.tiles[1].owner = P0;
            s.tiles[3].owner = P1;
        });

        // Act + Assert: no monopoly, no doubling.
        expect(rentOf(state, 1)).toBe(2);
        expect(rentOf(state, 3)).toBe(4);
    });

    test('keeps the full-group double on an unmortgaged tile when a sibling group tile is mortgaged', () => {
        // Arrange: player 1 owns the whole brown group but tile 3 is mortgaged.
        const state = arrange((s) => {
            s.tiles[1].owner = P1;
            s.tiles[3].owner = P1;
            s.tiles[3].isMortgaged = true;
        });

        // Act + Assert: group ownership (not mortgage status) drives the double.
        expect(rentOf(state, 1)).toBe(4);
    });
});

// ---------------------------------------------------------------------------
// rentOf — houses and hotel
// ---------------------------------------------------------------------------

describe('rentOf — houses and hotel', () => {
    test.each([
        { houses: 1, expected: 10 },
        { houses: 2, expected: 30 },
        { houses: 3, expected: 90 },
        { houses: 4, expected: 160 }
    ])('returns $expected for a base-rent-2 property with $houses house(s)', ({ houses, expected }) => {
        // Arrange: full brown monopoly with `houses` houses on tile 1 (base rent 2).
        const state = arrange((s) => {
            s.tiles[1].owner = P1;
            s.tiles[3].owner = P1;
            s.tiles[1].houses = houses;
        });

        // Act + Assert: multipliers 5/15/45/80 by house count.
        expect(rentOf(state, 1)).toBe(expected);
    });

    test('returns 125x base rent for a hotel (5 houses)', () => {
        // Arrange: hotels on tile 1 (base 2) and tile 39 (base 50, the priciest property).
        const state = arrange((s) => {
            s.tiles[1].owner = P1;
            s.tiles[3].owner = P1;
            s.tiles[1].houses = GAME_CONFIG.MAX_HOUSES;
            s.tiles[37].owner = P1;
            s.tiles[39].owner = P1;
            s.tiles[39].houses = GAME_CONFIG.MAX_HOUSES;
        });

        // Act + Assert
        expect(rentOf(state, 1)).toBe(250);
        expect(rentOf(state, 39)).toBe(6250);
    });

    test('uses the house multiplier instead of the monopoly double once houses exist', () => {
        // Arrange: full group owned, exactly one house on tile 1.
        const state = arrange((s) => {
            s.tiles[1].owner = P1;
            s.tiles[3].owner = P1;
            s.tiles[1].houses = 1;
        });

        // Act + Assert: 2 * 5 = 10, NOT (2 * 2) * 5 and NOT 2 * 2.
        expect(rentOf(state, 1)).toBe(10);
    });
});

// ---------------------------------------------------------------------------
// rentOf — railroads
// ---------------------------------------------------------------------------

describe('rentOf — railroads', () => {
    test.each([
        { count: 1, expected: 25 },
        { count: 2, expected: 50 },
        { count: 3, expected: 100 },
        { count: 4, expected: 200 }
    ])('returns $expected when the owner holds $count railroad(s)', ({ count, expected }) => {
        // Arrange: player 1 owns the first `count` railroads in board order.
        const state = arrange((s) => {
            for (const id of RAILROAD_TILE_IDS.slice(0, count)) s.tiles[id].owner = P1;
        });

        // Act + Assert: rent on tile 5 reflects the owner's railroad count.
        expect(rentOf(state, 5)).toBe(expected);
    });

    test('counts only railroads owned by the landed tile owner', () => {
        // Arrange: player 1 owns railroads 5 and 15; player 0 owns railroad 25.
        const state = arrange((s) => {
            s.tiles[5].owner = P1;
            s.tiles[15].owner = P1;
            s.tiles[25].owner = P0;
        });

        // Act + Assert: each owner's tier is computed independently.
        expect(rentOf(state, 5)).toBe(50);
        expect(rentOf(state, 25)).toBe(25);
    });

    test('counts a mortgaged sibling railroad toward the tier of an unmortgaged one', () => {
        // Arrange: player 1 owns railroads 5 and 15; 15 is mortgaged.
        const state = arrange((s) => {
            s.tiles[5].owner = P1;
            s.tiles[15].owner = P1;
            s.tiles[15].isMortgaged = true;
        });

        // Act + Assert: the mortgaged sibling still counts; rent on it is 0.
        expect(rentOf(state, 5)).toBe(50);
        expect(rentOf(state, 15)).toBe(0);
    });

    test('ignores diceTotal for property and railroad rent', () => {
        // Arrange
        const state = arrange((s) => {
            s.tiles[6].owner = P1;
            s.tiles[5].owner = P1;
        });

        // Act + Assert: diceTotal only matters for utilities.
        expect(rentOf(state, 6, 12)).toBe(6);
        expect(rentOf(state, 5, 12)).toBe(25);
    });
});

// ---------------------------------------------------------------------------
// rentOf — utilities
// ---------------------------------------------------------------------------

describe('rentOf — utilities', () => {
    test('returns 4x the dice total when only one utility is owned', () => {
        // Arrange
        const state = arrange((s) => {
            s.tiles[ELECTRIC_UTILITY].owner = P1;
        });

        // Act + Assert
        expect(rentOf(state, ELECTRIC_UTILITY, 7)).toBe(28);
        expect(rentOf(state, ELECTRIC_UTILITY, 12)).toBe(48);
    });

    test('returns 10x the dice total when both utilities are owned', () => {
        // Arrange
        const state = arrange((s) => {
            s.tiles[ELECTRIC_UTILITY].owner = P1;
            s.tiles[WATER_UTILITY].owner = P1;
        });

        // Act + Assert
        expect(rentOf(state, ELECTRIC_UTILITY, 7)).toBe(70);
        expect(rentOf(state, WATER_UTILITY, 7)).toBe(70);
    });

    test('falls back to the flat rent when no dice total is provided (card-driven landing)', () => {
        // Arrange: even with both utilities owned, no diceTotal means flat rent.
        const state = arrange((s) => {
            s.tiles[ELECTRIC_UTILITY].owner = P1;
            s.tiles[WATER_UTILITY].owner = P1;
        });

        // Act + Assert: board flat rent for utilities is 20.
        expect(rentOf(state, ELECTRIC_UTILITY)).toBe(20);
    });

    test('falls back to the flat rent when the dice total is zero', () => {
        // Arrange
        const state = arrange((s) => {
            s.tiles[ELECTRIC_UTILITY].owner = P1;
        });

        // Act + Assert: diceTotal must be > 0 to engage the multiplier.
        expect(rentOf(state, ELECTRIC_UTILITY, 0)).toBe(20);
    });
});

// ---------------------------------------------------------------------------
// rentOf — zero-rent guards
// ---------------------------------------------------------------------------

describe('rentOf — zero-rent guards', () => {
    test('returns 0 for an unowned tile', () => {
        // Arrange
        const state = arrange();

        // Act + Assert
        expect(rentOf(state, 1)).toBe(0);
        expect(rentOf(state, 5)).toBe(0);
        expect(rentOf(state, ELECTRIC_UTILITY, 7)).toBe(0);
    });

    test('returns 0 for a mortgaged property even when the owner holds the full group', () => {
        // Arrange: full brown monopoly but the landed tile itself is mortgaged.
        const state = arrange((s) => {
            s.tiles[1].owner = P1;
            s.tiles[3].owner = P1;
            s.tiles[1].isMortgaged = true;
        });

        // Act + Assert
        expect(rentOf(state, 1)).toBe(0);
    });

    test('returns 0 for a mortgaged railroad and a mortgaged utility regardless of dice total', () => {
        // Arrange
        const state = arrange((s) => {
            s.tiles[5].owner = P1;
            s.tiles[5].isMortgaged = true;
            s.tiles[ELECTRIC_UTILITY].owner = P1;
            s.tiles[ELECTRIC_UTILITY].isMortgaged = true;
        });

        // Act + Assert
        expect(rentOf(state, 5)).toBe(0);
        expect(rentOf(state, ELECTRIC_UTILITY, 12)).toBe(0);
    });

    test('returns 0 for out-of-range or non-integer tile ids', () => {
        // Arrange
        const state = arrange((s) => {
            s.tiles[1].owner = P1;
        });

        // Act + Assert
        expect(rentOf(state, 40)).toBe(0);
        expect(rentOf(state, -1)).toBe(0);
        expect(rentOf(state, 1.5)).toBe(0);
    });

    test('returns 0 for non-rentable tile types even when force-assigned an owner', () => {
        // Arrange: owners forced onto START, TAX and CHANCE tiles.
        const state = arrange((s) => {
            s.tiles[0].owner = P1;
            s.tiles[4].owner = P1;
            s.tiles[7].owner = P1;
        });

        // Act + Assert
        expect(rentOf(state, 0)).toBe(0);
        expect(rentOf(state, 4)).toBe(0);
        expect(rentOf(state, 7)).toBe(0);
    });
});

// ---------------------------------------------------------------------------
// Integration — rent flows through applyAction(ROLL) landings
// ---------------------------------------------------------------------------

describe('rent payment through applyAction(ROLL)', () => {
    test('transfers base rent from the lander to the owner and emits RENT_DUE + PAID', () => {
        // Arrange: player 1 owns tile 6 (rent 6); player 0 rolls 2+4 from GO.
        const start = arrange((s) => {
            s.tiles[6].owner = P1;
        });
        const moneyBefore = totalMoney(start);

        // Act
        const { state: next, events } = applyAction(start, { type: 'ROLL', playerId: P0, d1: 2, d2: 4 });

        // Assert: landing, demand and settlement events plus the money transfer.
        expect(getEvent(events, 'MOVED').to).toBe(6);
        expect(getEvent(events, 'RENT_DUE')).toMatchObject({ tileId: 6, amount: 6 });
        const paid = getEvent(events, 'PAID');
        expect(paid).toMatchObject({ from: P0, to: P1, amount: 6 });
        expect(paid.raised).toBeUndefined();
        expect(next.players[P0].money).toBe(GAME_CONFIG.START_MONEY - 6);
        expect(next.players[P1].money).toBe(GAME_CONFIG.START_MONEY + 6);
        expect(totalMoney(next)).toBe(moneyBefore);
        expect(next.phase).toBe('await_end');
    });

    test('charges the doubled full-group rent when landing on a monopoly tile', () => {
        // Arrange: player 1 owns the whole brown group; player 0 rolls 1+2 onto tile 3.
        const start = arrange((s) => {
            s.tiles[1].owner = P1;
            s.tiles[3].owner = P1;
        });

        // Act
        const { state: next, events } = applyAction(start, { type: 'ROLL', playerId: P0, d1: 1, d2: 2 });

        // Assert: base 4 doubled to 8.
        expect(getEvent(events, 'RENT_DUE')).toMatchObject({ tileId: 3, amount: 8 });
        expect(next.players[P0].money).toBe(GAME_CONFIG.START_MONEY - 8);
        expect(next.players[P1].money).toBe(GAME_CONFIG.START_MONEY + 8);
        expect(totalMoney(next)).toBe(totalMoney(start));
    });

    test('charges hotel rent when landing on a hotel property', () => {
        // Arrange: hotel on tile 3 (base 4 -> 500); player 0 rolls 1+2 onto it.
        const start = arrange((s) => {
            s.tiles[1].owner = P1;
            s.tiles[3].owner = P1;
            s.tiles[3].houses = GAME_CONFIG.MAX_HOUSES;
        });

        // Act
        const { state: next, events } = applyAction(start, { type: 'ROLL', playerId: P0, d1: 1, d2: 2 });

        // Assert: 4 * 125 = 500 changes hands.
        expect(getEvent(events, 'RENT_DUE')).toMatchObject({ tileId: 3, amount: 500 });
        expect(next.players[P0].money).toBe(GAME_CONFIG.START_MONEY - 500);
        expect(next.players[P1].money).toBe(GAME_CONFIG.START_MONEY + 500);
        expect(totalMoney(next)).toBe(totalMoney(start));
    });

    test('charges 4x the roll total when landing on a single owned utility', () => {
        // Arrange: player 0 stands on tile 5 and rolls 3+4 = 7 onto utility 12.
        const start = arrange((s) => {
            s.players[P0].position = 5;
            s.tiles[ELECTRIC_UTILITY].owner = P1;
        });

        // Act
        const { state: next, events } = applyAction(start, { type: 'ROLL', playerId: P0, d1: 3, d2: 4 });

        // Assert: 7 * 4 = 28.
        expect(getEvent(events, 'MOVED').to).toBe(ELECTRIC_UTILITY);
        expect(getEvent(events, 'RENT_DUE')).toMatchObject({ tileId: ELECTRIC_UTILITY, amount: 28 });
        expect(next.players[P0].money).toBe(GAME_CONFIG.START_MONEY - 28);
        expect(next.players[P1].money).toBe(GAME_CONFIG.START_MONEY + 28);
        expect(totalMoney(next)).toBe(totalMoney(start));
    });

    test('charges 10x the roll total when the utility owner holds both utilities', () => {
        // Arrange: both utilities owned by player 1; player 0 rolls 3+4 = 7 onto tile 12.
        const start = arrange((s) => {
            s.players[P0].position = 5;
            s.tiles[ELECTRIC_UTILITY].owner = P1;
            s.tiles[WATER_UTILITY].owner = P1;
        });

        // Act
        const { state: next, events } = applyAction(start, { type: 'ROLL', playerId: P0, d1: 3, d2: 4 });

        // Assert: 7 * 10 = 70.
        expect(getEvent(events, 'RENT_DUE')).toMatchObject({ tileId: ELECTRIC_UTILITY, amount: 70 });
        expect(next.players[P0].money).toBe(GAME_CONFIG.START_MONEY - 70);
        expect(next.players[P1].money).toBe(GAME_CONFIG.START_MONEY + 70);
        expect(totalMoney(next)).toBe(totalMoney(start));
    });

    test('charges the four-railroad tier when landing on one of four owned railroads', () => {
        // Arrange: player 1 owns all four railroads; player 0 rolls 2+3 onto tile 5.
        const start = arrange((s) => {
            for (const id of RAILROAD_TILE_IDS) s.tiles[id].owner = P1;
        });

        // Act
        const { state: next, events } = applyAction(start, { type: 'ROLL', playerId: P0, d1: 2, d2: 3 });

        // Assert: top tier 200.
        expect(getEvent(events, 'RENT_DUE')).toMatchObject({ tileId: 5, amount: 200 });
        expect(next.players[P0].money).toBe(GAME_CONFIG.START_MONEY - 200);
        expect(next.players[P1].money).toBe(GAME_CONFIG.START_MONEY + 200);
        expect(totalMoney(next)).toBe(totalMoney(start));
    });

    test('charges nothing when landing on your own property', () => {
        // Arrange: player 0 owns tile 6 and rolls 2+4 onto it.
        const start = arrange((s) => {
            s.tiles[6].owner = P0;
        });

        // Act
        const { state: next, events } = applyAction(start, { type: 'ROLL', playerId: P0, d1: 2, d2: 4 });

        // Assert: no rent traffic at all, turn proceeds to await_end.
        expect(eventTypes(events)).not.toContain('RENT_DUE');
        expect(eventTypes(events)).not.toContain('RENT_FREE');
        expect(eventTypes(events)).not.toContain('PAID');
        expect(next.players[P0].money).toBe(GAME_CONFIG.START_MONEY);
        expect(next.players[P1].money).toBe(GAME_CONFIG.START_MONEY);
        expect(next.phase).toBe('await_end');
    });

    test('waives rent with RENT_FREE when the landed tile is mortgaged', () => {
        // Arrange: player 1 owns tile 6 but it is mortgaged.
        const start = arrange((s) => {
            s.tiles[6].owner = P1;
            s.tiles[6].isMortgaged = true;
        });

        // Act
        const { state: next, events } = applyAction(start, { type: 'ROLL', playerId: P0, d1: 2, d2: 4 });

        // Assert: waiver event, no payment, money untouched.
        expect(getEvent(events, 'RENT_FREE')).toMatchObject({ tileId: 6, reason: 'mortgaged' });
        expect(eventTypes(events)).not.toContain('RENT_DUE');
        expect(eventTypes(events)).not.toContain('PAID');
        expect(next.players[P0].money).toBe(GAME_CONFIG.START_MONEY);
        expect(next.players[P1].money).toBe(GAME_CONFIG.START_MONEY);
        expect(next.phase).toBe('await_end');
    });

    test('waives rent with RENT_FREE when the owner is in jail', () => {
        // Arrange: tile 6 owned by player 1, who sits in jail.
        const start = arrange((s) => {
            s.tiles[6].owner = P1;
            s.players[P1].inJail = true;
            s.players[P1].position = 10;
        });

        // Act
        const { state: next, events } = applyAction(start, { type: 'ROLL', playerId: P0, d1: 2, d2: 4 });

        // Assert
        expect(getEvent(events, 'RENT_FREE')).toMatchObject({ tileId: 6, reason: 'owner_in_jail' });
        expect(eventTypes(events)).not.toContain('PAID');
        expect(next.players[P0].money).toBe(GAME_CONFIG.START_MONEY);
        expect(next.players[P1].money).toBe(GAME_CONFIG.START_MONEY);
    });

    test('waives rent with RENT_FREE when the owner is bankrupt but still holds the tile', () => {
        // Arrange: defensive branch — owner flagged bankrupt while the tile
        // still points at them (normal bankruptcy returns tiles to the bank).
        const start = arrange((s) => {
            s.tiles[6].owner = P1;
            s.players[P1].bankrupt = true;
        });

        // Act
        const { state: next, events } = applyAction(start, { type: 'ROLL', playerId: P0, d1: 2, d2: 4 });

        // Assert
        expect(getEvent(events, 'RENT_FREE')).toMatchObject({ tileId: 6, reason: 'owner_bankrupt' });
        expect(eventTypes(events)).not.toContain('PAID');
        expect(next.players[P0].money).toBe(GAME_CONFIG.START_MONEY);
        expect(next.players[P1].money).toBe(GAME_CONFIG.START_MONEY);
    });

    test('charges the flat utility fallback on a card-driven landing without dice', () => {
        // Arrange: player 0 stands on CHANCE tile 7 in await_card; chance card 3
        // ("move to Cong Ty Dien or collect") moves them to utility 12 owned by player 1.
        const start = arrange((s) => {
            s.players[P0].position = 7;
            s.phase = 'await_card';
            s.tiles[ELECTRIC_UTILITY].owner = P1;
        });

        // Act
        const { state: next, events } = applyAction(start, {
            type: 'DRAW_CARD',
            playerId: P0,
            deck: 'chance',
            cardIndex: 3
        });

        // Assert: flat 20 (not a dice multiple) lands in the owner's pocket.
        expect(getEvent(events, 'CARD')).toMatchObject({ deck: 'chance', cardIndex: 3 });
        expect(getEvent(events, 'MOVED')).toMatchObject({ to: ELECTRIC_UTILITY, passedGo: false });
        expect(getEvent(events, 'RENT_DUE')).toMatchObject({ tileId: ELECTRIC_UTILITY, amount: 20 });
        expect(getEvent(events, 'PAID')).toMatchObject({ from: P0, to: P1, amount: 20 });
        expect(next.players[P0].money).toBe(GAME_CONFIG.START_MONEY - 20);
        expect(next.players[P1].money).toBe(GAME_CONFIG.START_MONEY + 20);
        expect(totalMoney(next)).toBe(totalMoney(start));
        expect(next.phase).toBe('await_end');
    });
});
