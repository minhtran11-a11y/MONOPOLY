/**
 * tests/payment.test.ts
 *
 * FIX-2 deep suite — the payment pipeline of the pure rules core:
 *   - liquidation order: houses sold in board order at floor(houseCost / 2),
 *     then mortgages at floor(price / 2);
 *   - the creditor receives exactly min(raisable, amount);
 *   - PAID event `raised` field semantics (present only on shortfall);
 *   - BANKRUPT event + tile reset (owner null, houses 0, isMortgaged false)
 *     + payer money 0;
 *   - money conservation across full event sequences;
 *   - bank payments (TAX) through the same pipeline;
 *   - liquidate() helper directly;
 *   - DECLARE_BANKRUPTCY action;
 *   - VICTORY + game_over when one survivor remains.
 *
 * Deep states are arranged by mutating a structuredClone of initialState()
 * output; every Act goes through the public API (applyAction / liquidate).
 *
 * Board economics used as oracles (src/core/board.ts):
 *   tile 1 / 3:  PROPERTY price 60, houseCost 50 → house refund 25, mortgage 30
 *   tile 6 / 8:  PROPERTY price 100             → mortgage 50
 *   tile 39:     PROPERTY rent 50, houseCost 200 → hotel rent 6250, refund 100
 *   tile 4:      TAX 200
 *   tiles 5/15/25/35: RAILROADs → rent 200 when one player owns all four
 */

import { describe, expect, test } from 'vitest';
import {
    applyAction,
    initialState,
    liquidate,
    RuleViolation
} from '../src/core/rules_core.ts';
import type { GameEvent, GameState, PlayerSetup } from '../src/core/types.ts';

// ---------------------------------------------------------------------------
// Arrange helpers
// ---------------------------------------------------------------------------

const TWO_PLAYERS: PlayerSetup[] = [
    { name: 'A', isBot: false, colorHex: '#f00', tokenKind: 'pawn' },
    { name: 'B', isBot: true, colorHex: '#00f', tokenKind: 'pawn' }
];

const THREE_PLAYERS: PlayerSetup[] = [
    ...TWO_PLAYERS,
    { name: 'C', isBot: true, colorHex: '#0f0', tokenKind: 'pawn' }
];

/** Fresh, mutation-safe state (player 0 starts; everyone has $1500 at GO). */
function freshState(playerCount: 2 | 3 = 2): GameState {
    return structuredClone(initialState(playerCount === 2 ? TWO_PLAYERS : THREE_PLAYERS, 'bot'));
}

type EventOf<T extends GameEvent['type']> = Extract<GameEvent, { type: T }>;

function eventsOf<T extends GameEvent['type']>(events: GameEvent[], type: T): EventOf<T>[] {
    return events.filter((e): e is EventOf<T> => e.type === type);
}

function singleEvent<T extends GameEvent['type']>(events: GameEvent[], type: T): EventOf<T> {
    const found = eventsOf(events, type);
    expect(found, `expected exactly one ${type} event`).toHaveLength(1);
    return found[0];
}

function totalMoney(state: GameState): number {
    return state.players.reduce((sum, p) => sum + p.money, 0);
}

/**
 * Net money the bank injected into players (positive) or drained from them
 * (negative), reconstructed purely from the event log. PAID to a player is
 * a transfer between players and contributes nothing; PAID to the bank
 * removes only what was actually transferred (raised on shortfall).
 */
function bankDelta(events: GameEvent[]): number {
    let delta = 0;
    for (const e of events) {
        switch (e.type) {
            case 'HOUSE_SOLD':
                delta += e.refund;
                break;
            case 'MORTGAGED':
                delta += e.amount;
                break;
            case 'UNMORTGAGED':
                delta -= e.amount;
                break;
            case 'SALARY':
            case 'COLLECTED':
                delta += e.amount;
                break;
            case 'PAID':
                if (e.to === 'bank') delta -= e.raised ?? e.amount;
                break;
            default:
                break;
        }
    }
    return delta;
}

function expectViolation(fn: () => unknown, code: string): void {
    let caught: unknown;
    try {
        fn();
    } catch (error) {
        caught = error;
    }
    expect(caught, `expected a RuleViolation with code ${code}`).toBeInstanceOf(RuleViolation);
    expect((caught as RuleViolation).code).toBe(code);
}

/**
 * Player 0 ($100, standing on 36) is about to roll 1+2 onto player 1's hotel
 * on tile 39 (rent 50 x 125 = 6250). Player 0 owns tile 1 (2 houses), tile 3
 * (1 house) and the bare tiles 6 and 8. Full liquidation raises only
 * 3x25 (houses) + 30+30+50+50 (mortgages) = 235; player 0 goes bankrupt.
 */
function arrangeHotelCrash(playerCount: 2 | 3 = 2): GameState {
    const s = freshState(playerCount);
    s.players[0].money = 100;
    s.players[0].position = 36;
    s.tiles[39].owner = 1;
    s.tiles[39].houses = 5;
    s.tiles[1].owner = 0;
    s.tiles[1].houses = 2;
    s.tiles[3].owner = 0;
    s.tiles[3].houses = 1;
    s.tiles[6].owner = 0;
    s.tiles[8].owner = 0;
    return s;
}

const HOTEL_RENT_39 = 6250; // rent 50 x hotel multiplier 125
const CRASH_RAISED = 335; // $100 cash + 3x$25 house refunds + $30+$30+$50+$50 mortgages

// ---------------------------------------------------------------------------
// liquidate() helper directly
// ---------------------------------------------------------------------------

describe('liquidate() helper', () => {
    test('returns zero raised and no events when cash already meets the target', () => {
        // Arrange
        const s = freshState();
        s.tiles[1].owner = 0;
        s.tiles[1].houses = 2;

        // Act
        const result = liquidate(s, 0, 300); // player 0 already has $1500

        // Assert
        expect(result.raised).toBe(0);
        expect(result.events).toEqual([]);
        expect(result.state.players[0].money).toBe(1500);
        expect(result.state.tiles[1].houses).toBe(2);
    });

    test('sells houses in board order even when a later tile refunds more', () => {
        // Arrange: tile 1 refunds 25, tile 39 refunds 100; board order must win.
        const s = freshState();
        s.players[0].money = 0;
        s.tiles[1].owner = 0;
        s.tiles[1].houses = 1;
        s.tiles[39].owner = 0;
        s.tiles[39].houses = 1;
        s.tiles[37].owner = 1; // opponent asset must never be touched
        s.tiles[37].houses = 2;

        // Act
        const result = liquidate(s, 0, 120);

        // Assert
        expect(result.events).toEqual([
            { type: 'HOUSE_SOLD', playerId: 0, tileId: 1, refund: 25, housesLeft: 0 },
            { type: 'HOUSE_SOLD', playerId: 0, tileId: 39, refund: 100, housesLeft: 0 }
        ]);
        expect(result.raised).toBe(125);
        expect(result.state.tiles[37].houses).toBe(2);
        expect(result.state.tiles[37].owner).toBe(1);
    });

    test('drains all houses on a tile before moving to the next tile', () => {
        // Arrange
        const s = freshState();
        s.players[0].money = 0;
        s.tiles[1].owner = 0;
        s.tiles[1].houses = 3;
        s.tiles[3].owner = 0;
        s.tiles[3].houses = 1;

        // Act
        const result = liquidate(s, 0, 90);

        // Assert: tile 1 sold down to zero (housesLeft 2,1,0) before tile 3.
        const sales = eventsOf(result.events, 'HOUSE_SOLD');
        expect(sales.map((e) => e.tileId)).toEqual([1, 1, 1, 3]);
        expect(sales.map((e) => e.housesLeft)).toEqual([2, 1, 0, 0]);
        expect(result.raised).toBe(100);
    });

    test('stops selling as soon as the target is met and leaves later houses intact', () => {
        // Arrange
        const s = freshState();
        s.players[0].money = 0;
        s.tiles[1].owner = 0;
        s.tiles[1].houses = 1;
        s.tiles[3].owner = 0;
        s.tiles[3].houses = 2;

        // Act: one $25 refund already covers the $20 target.
        const result = liquidate(s, 0, 20);

        // Assert
        expect(eventsOf(result.events, 'HOUSE_SOLD')).toHaveLength(1);
        expect(result.raised).toBe(25);
        expect(result.state.tiles[3].houses).toBe(2);
        expect(result.state.tiles[1].isMortgaged).toBe(false);
        expect(result.state.tiles[3].isMortgaged).toBe(false);
    });

    test('mortgages at floor(price / 2) only after house sales fall short', () => {
        // Arrange: one house ($25) cannot reach $80; mortgages must follow.
        const s = freshState();
        s.players[0].money = 0;
        s.tiles[1].owner = 0;
        s.tiles[1].houses = 1;
        s.tiles[6].owner = 0;

        // Act
        const result = liquidate(s, 0, 80);

        // Assert: house first, then tile 1 (now house-free) and tile 6 mortgaged.
        expect(result.events).toEqual([
            { type: 'HOUSE_SOLD', playerId: 0, tileId: 1, refund: 25, housesLeft: 0 },
            { type: 'MORTGAGED', tileId: 1, amount: 30 },
            { type: 'MORTGAGED', tileId: 6, amount: 50 }
        ]);
        expect(result.raised).toBe(105);
        expect(result.state.tiles[1].isMortgaged).toBe(true);
        expect(result.state.tiles[6].isMortgaged).toBe(true);
    });

    test('skips already-mortgaged tiles during the mortgage pass', () => {
        // Arrange
        const s = freshState();
        s.players[0].money = 0;
        s.tiles[6].owner = 0;
        s.tiles[6].isMortgaged = true;
        s.tiles[8].owner = 0;

        // Act
        const result = liquidate(s, 0, 40);

        // Assert: only tile 8 is mortgaged; tile 6 produces no second event.
        expect(result.events).toEqual([{ type: 'MORTGAGED', tileId: 8, amount: 50 }]);
        expect(result.raised).toBe(50);
        expect(result.state.tiles[6].isMortgaged).toBe(true);
    });

    test('does not mutate the input state', () => {
        // Arrange
        const s = freshState();
        s.players[0].money = 0;
        s.tiles[1].owner = 0;
        s.tiles[1].houses = 1;
        s.tiles[6].owner = 0;
        const snapshot = JSON.stringify(s);

        // Act
        const result = liquidate(s, 0, 80);

        // Assert
        expect(JSON.stringify(s)).toBe(snapshot);
        expect(result.state).not.toBe(s);
    });

    test('throws BAD_AMOUNT when the target is negative', () => {
        const s = freshState();
        expectViolation(() => liquidate(s, 0, -1), 'BAD_AMOUNT');
    });

    test('throws PLAYER_BANKRUPT when the player is already bankrupt', () => {
        const s = freshState();
        s.players[0].bankrupt = true;
        expectViolation(() => liquidate(s, 0, 100), 'PLAYER_BANKRUPT');
    });
});

// ---------------------------------------------------------------------------
// Rent shortfall via ROLL (full pipeline)
// ---------------------------------------------------------------------------

describe('rent shortfall liquidation via ROLL', () => {
    test('sells houses in board order then mortgages everything when rent exceeds cash', () => {
        // Arrange
        const s = arrangeHotelCrash();

        // Act
        const { events } = applyAction(s, { type: 'ROLL', playerId: 0, d1: 1, d2: 2 });

        // Assert: rent demanded, then the exact liquidation cascade.
        expect(singleEvent(events, 'RENT_DUE')).toEqual({ type: 'RENT_DUE', tileId: 39, amount: HOTEL_RENT_39 });
        const sales = eventsOf(events, 'HOUSE_SOLD');
        expect(sales.map((e) => e.tileId)).toEqual([1, 1, 3]);
        expect(sales.map((e) => e.refund)).toEqual([25, 25, 25]);
        expect(sales.map((e) => e.housesLeft)).toEqual([1, 0, 0]);
        const mortgages = eventsOf(events, 'MORTGAGED');
        expect(mortgages.map((e) => e.tileId)).toEqual([1, 3, 6, 8]);
        expect(mortgages.map((e) => e.amount)).toEqual([30, 30, 50, 50]);
        const types = events.map((e) => e.type);
        expect(types.lastIndexOf('HOUSE_SOLD')).toBeLessThan(types.indexOf('MORTGAGED'));
    });

    test('pays the creditor exactly the raised amount, not the demanded rent', () => {
        // Arrange
        const s = arrangeHotelCrash();

        // Act
        const { state } = applyAction(s, { type: 'ROLL', playerId: 0, d1: 1, d2: 2 });

        // Assert: creditor gains min(raisable, amount) = 335; payer ends at 0.
        expect(state.players[1].money).toBe(1500 + CRASH_RAISED);
        expect(state.players[0].money).toBe(0);
    });

    test('reports the demanded amount and the raised shortfall in the PAID event', () => {
        // Arrange
        const s = arrangeHotelCrash();

        // Act
        const { events } = applyAction(s, { type: 'ROLL', playerId: 0, d1: 1, d2: 2 });

        // Assert
        expect(singleEvent(events, 'PAID')).toEqual({
            type: 'PAID',
            from: 0,
            to: 1,
            amount: HOTEL_RENT_39,
            raised: CRASH_RAISED
        });
    });

    test('emits BANKRUPT naming the rent creditor after the shortfall payment', () => {
        // Arrange
        const s = arrangeHotelCrash();

        // Act
        const { events, state } = applyAction(s, { type: 'ROLL', playerId: 0, d1: 1, d2: 2 });

        // Assert
        expect(singleEvent(events, 'BANKRUPT')).toEqual({ type: 'BANKRUPT', playerId: 0, creditorId: 1 });
        const types = events.map((e) => e.type);
        expect(types.indexOf('BANKRUPT')).toBeGreaterThan(types.indexOf('PAID'));
        expect(state.players[0].bankrupt).toBe(true);
    });

    test('returns every tile of the bankrupt payer to the bank', () => {
        // Arrange
        const s = arrangeHotelCrash();

        // Act
        const { state } = applyAction(s, { type: 'ROLL', playerId: 0, d1: 1, d2: 2 });

        // Assert: owner null, houses 0, isMortgaged false on all former holdings.
        for (const tileId of [1, 3, 6, 8]) {
            expect(state.tiles[tileId].owner, `tile ${tileId} owner`).toBeNull();
            expect(state.tiles[tileId].houses, `tile ${tileId} houses`).toBe(0);
            expect(state.tiles[tileId].isMortgaged, `tile ${tileId} mortgage`).toBe(false);
        }
        expect(state.tiles[39].owner).toBe(1); // creditor keeps the hotel
        expect(state.tiles[39].houses).toBe(5);
    });

    test('conserves money: player total delta equals the net bank delta from events', () => {
        // Arrange
        const s = arrangeHotelCrash();
        const before = totalMoney(s);

        // Act
        const { state, events } = applyAction(s, { type: 'ROLL', playerId: 0, d1: 1, d2: 2 });

        // Assert: only liquidation refunds (3x25 + 30+30+50+50 = 235) enter play.
        expect(totalMoney(state) - before).toBe(bankDelta(events));
        expect(bankDelta(events)).toBe(235);
    });

    test('does not mutate the input state during a liquidation cascade', () => {
        // Arrange
        const s = arrangeHotelCrash();
        const snapshot = JSON.stringify(s);

        // Act
        applyAction(s, { type: 'ROLL', playerId: 0, d1: 1, d2: 2 });

        // Assert
        expect(JSON.stringify(s)).toBe(snapshot);
    });
});

// ---------------------------------------------------------------------------
// Exact and sufficient payments (min() boundary, raised omission)
// ---------------------------------------------------------------------------

describe('exact and sufficient rent payments', () => {
    test('pays in full without bankruptcy when liquidation raises exactly the rent', () => {
        // Arrange: 4 opponent railroads → rent 200; $100 cash + 4x$25 refunds = 200.
        const s = freshState();
        s.players[0].money = 100;
        s.players[0].position = 2;
        for (const railId of [5, 15, 25, 35]) s.tiles[railId].owner = 1;
        s.tiles[1].owner = 0;
        s.tiles[1].houses = 2;
        s.tiles[3].owner = 0;
        s.tiles[3].houses = 2;

        // Act: roll 1+2 lands on railroad 5.
        const { state, events } = applyAction(s, { type: 'ROLL', playerId: 0, d1: 1, d2: 2 });

        // Assert: exact raise → full payment, no raised field, no bankruptcy.
        expect(singleEvent(events, 'RENT_DUE').amount).toBe(200);
        expect(eventsOf(events, 'HOUSE_SOLD')).toHaveLength(4);
        expect(eventsOf(events, 'MORTGAGED')).toHaveLength(0);
        const paid = singleEvent(events, 'PAID');
        expect(paid).toEqual({ type: 'PAID', from: 0, to: 1, amount: 200 });
        expect('raised' in paid).toBe(false);
        expect(eventsOf(events, 'BANKRUPT')).toHaveLength(0);
        expect(state.players[0].money).toBe(0);
        expect(state.players[0].bankrupt).toBe(false);
        expect(state.players[1].money).toBe(1700);
        expect(state.tiles[1].owner).toBe(0); // survivor keeps the now-bare tiles
        expect(state.tiles[3].owner).toBe(0);
        expect(state.phase).toBe('await_end');
    });

    test('omits the raised field and skips liquidation when cash covers the rent', () => {
        // Arrange: tile 39 alone (group incomplete) rents its base 50.
        const s = freshState();
        s.players[0].position = 36;
        s.tiles[39].owner = 1;

        // Act
        const { state, events } = applyAction(s, { type: 'ROLL', playerId: 0, d1: 1, d2: 2 });

        // Assert
        const paid = singleEvent(events, 'PAID');
        expect(paid).toEqual({ type: 'PAID', from: 0, to: 1, amount: 50 });
        expect('raised' in paid).toBe(false);
        expect(eventsOf(events, 'HOUSE_SOLD')).toHaveLength(0);
        expect(eventsOf(events, 'MORTGAGED')).toHaveLength(0);
        expect(state.players[0].money).toBe(1450);
        expect(state.players[1].money).toBe(1550);
        expect(state.phase).toBe('await_end');
    });
});

// ---------------------------------------------------------------------------
// Bankruptcy with three players (no premature victory)
// ---------------------------------------------------------------------------

describe('rent bankruptcy with three players', () => {
    function arrangeThinCrash(): GameState {
        const s = freshState(3);
        s.players[0].money = 50; // nothing to liquidate
        s.players[0].position = 36;
        s.tiles[39].owner = 1;
        s.tiles[39].houses = 5;
        return s;
    }

    test('advances the turn without victory when two players survive a bankruptcy', () => {
        // Arrange
        const s = arrangeThinCrash();

        // Act
        const { state, events } = applyAction(s, { type: 'ROLL', playerId: 0, d1: 1, d2: 2 });

        // Assert
        expect(singleEvent(events, 'BANKRUPT')).toEqual({ type: 'BANKRUPT', playerId: 0, creditorId: 1 });
        expect(eventsOf(events, 'VICTORY')).toHaveLength(0);
        expect(singleEvent(events, 'TURN_ENDED')).toEqual({ type: 'TURN_ENDED', playerId: 0, nextPlayerId: 1 });
        expect(state.phase).toBe('await_roll');
        expect(state.currentPlayerIndex).toBe(1);
        expect(state.winner).toBeNull();
    });

    test('creditor receives only the payer cash on a bankruptcy with nothing to liquidate', () => {
        // Arrange
        const s = arrangeThinCrash();
        const before = totalMoney(s);

        // Act
        const { state, events } = applyAction(s, { type: 'ROLL', playerId: 0, d1: 1, d2: 2 });

        // Assert: min(raisable, amount) = the $50 on hand; nothing minted or burned.
        expect(singleEvent(events, 'PAID')).toEqual({
            type: 'PAID',
            from: 0,
            to: 1,
            amount: HOTEL_RENT_39,
            raised: 50
        });
        expect(state.players[1].money).toBe(1550);
        expect(totalMoney(state) - before).toBe(bankDelta(events));
        expect(bankDelta(events)).toBe(0); // pure player-to-player transfer
    });
});

// ---------------------------------------------------------------------------
// Bank payments (TAX) through the same pipeline
// ---------------------------------------------------------------------------

describe('tax payments through the payment pipeline', () => {
    test('sells houses to cover a tax bill and pays the bank in full', () => {
        // Arrange: $160 + two $25 refunds covers the $200 income tax.
        const s = freshState();
        s.players[0].money = 160;
        s.players[0].position = 1;
        s.tiles[1].owner = 0;
        s.tiles[1].houses = 2;
        s.tiles[3].owner = 0;
        s.tiles[3].houses = 2;
        const before = totalMoney(s);

        // Act: roll 1+2 lands on TAX tile 4.
        const { state, events } = applyAction(s, { type: 'ROLL', playerId: 0, d1: 1, d2: 2 });

        // Assert
        const sales = eventsOf(events, 'HOUSE_SOLD');
        expect(sales.map((e) => e.tileId)).toEqual([1, 1]);
        expect(sales.map((e) => e.refund)).toEqual([25, 25]);
        expect(state.tiles[3].houses).toBe(2); // untouched once the target is met
        const paid = singleEvent(events, 'PAID');
        expect(paid).toEqual({ type: 'PAID', from: 0, to: 'bank', amount: 200 });
        expect('raised' in paid).toBe(false);
        expect(eventsOf(events, 'BANKRUPT')).toHaveLength(0);
        expect(state.players[0].money).toBe(10);
        expect(state.phase).toBe('await_end');
        expect(totalMoney(state) - before).toBe(bankDelta(events));
        expect(bankDelta(events)).toBe(-150); // +50 refunds, -200 tax
    });

    test('bankrupts with a null creditor when the tax cannot be covered', () => {
        // Arrange: three players so the game continues after the bankruptcy.
        const s = freshState(3);
        s.players[0].money = 50;
        s.players[0].position = 1;
        const before = totalMoney(s);

        // Act
        const { state, events } = applyAction(s, { type: 'ROLL', playerId: 0, d1: 1, d2: 2 });

        // Assert
        expect(singleEvent(events, 'PAID')).toEqual({ type: 'PAID', from: 0, to: 'bank', amount: 200, raised: 50 });
        expect(singleEvent(events, 'BANKRUPT')).toEqual({ type: 'BANKRUPT', playerId: 0, creditorId: null });
        expect(eventsOf(events, 'VICTORY')).toHaveLength(0);
        expect(state.players[0].money).toBe(0);
        expect(state.currentPlayerIndex).toBe(1);
        expect(state.phase).toBe('await_roll');
        expect(totalMoney(state) - before).toBe(bankDelta(events));
        expect(bankDelta(events)).toBe(-50); // bank takes only what was raised
    });

    test('tax bankruptcy of the penultimate player triggers victory', () => {
        // Arrange
        const s = freshState(2);
        s.players[0].money = 50;
        s.players[0].position = 1;

        // Act
        const { state, events } = applyAction(s, { type: 'ROLL', playerId: 0, d1: 1, d2: 2 });

        // Assert
        expect(singleEvent(events, 'BANKRUPT')).toEqual({ type: 'BANKRUPT', playerId: 0, creditorId: null });
        expect(singleEvent(events, 'VICTORY')).toEqual({ type: 'VICTORY', playerId: 1 });
        expect(state.phase).toBe('game_over');
        expect(state.winner).toBe(1);
    });
});

// ---------------------------------------------------------------------------
// DECLARE_BANKRUPTCY action
// ---------------------------------------------------------------------------

describe('DECLARE_BANKRUPTCY action', () => {
    function arrangeDeclarer(playerCount: 2 | 3): GameState {
        const s = freshState(playerCount);
        s.players[0].money = 800;
        s.tiles[1].owner = 0;
        s.tiles[1].houses = 2;
        s.tiles[6].owner = 0;
        s.tiles[6].isMortgaged = true;
        return s;
    }

    test('zeroes the player money and returns all tiles to the bank', () => {
        // Arrange
        const s = arrangeDeclarer(3);

        // Act
        const { state, events } = applyAction(s, { type: 'DECLARE_BANKRUPTCY', playerId: 0 });

        // Assert
        expect(singleEvent(events, 'BANKRUPT')).toEqual({ type: 'BANKRUPT', playerId: 0, creditorId: null });
        expect(state.players[0].money).toBe(0);
        expect(state.players[0].bankrupt).toBe(true);
        expect(state.tiles[1]).toEqual({ id: 1, owner: null, houses: 0, isMortgaged: false });
        expect(state.tiles[6]).toEqual({ id: 6, owner: null, houses: 0, isMortgaged: false });
    });

    test('advances the turn to the next player after a voluntary bankruptcy', () => {
        // Arrange
        const s = arrangeDeclarer(3);

        // Act
        const { state, events } = applyAction(s, { type: 'DECLARE_BANKRUPTCY', playerId: 0 });

        // Assert
        expect(singleEvent(events, 'TURN_ENDED')).toEqual({ type: 'TURN_ENDED', playerId: 0, nextPlayerId: 1 });
        expect(eventsOf(events, 'VICTORY')).toHaveLength(0);
        expect(state.currentPlayerIndex).toBe(1);
        expect(state.phase).toBe('await_roll');
    });

    test('triggers VICTORY and game_over when only one player remains', () => {
        // Arrange
        const s = arrangeDeclarer(2);

        // Act
        const { state, events } = applyAction(s, { type: 'DECLARE_BANKRUPTCY', playerId: 0 });

        // Assert
        expect(singleEvent(events, 'VICTORY')).toEqual({ type: 'VICTORY', playerId: 1 });
        expect(state.phase).toBe('game_over');
        expect(state.winner).toBe(1);
        expect(state.players[0].bankrupt).toBe(true);
    });

    test('rejects a bankruptcy declaration from a player out of turn', () => {
        const s = freshState(); // player 0 to act
        expectViolation(() => applyAction(s, { type: 'DECLARE_BANKRUPTCY', playerId: 1 }), 'NOT_YOUR_TURN');
    });

    test('rejects further actions once the game is over', () => {
        // Arrange: declaring with two players ends the game immediately.
        const s = arrangeDeclarer(2);
        const { state: over } = applyAction(s, { type: 'DECLARE_BANKRUPTCY', playerId: 0 });

        // Act + Assert
        expectViolation(() => applyAction(over, { type: 'END_TURN', playerId: 1 }), 'GAME_OVER');
    });
});
