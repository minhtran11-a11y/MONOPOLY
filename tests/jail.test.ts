/**
 * tests/jail.test.ts
 *
 * FIX-3 deep regression suite for the unified jail rule in
 * src/core/rules_core.ts:
 * - arrest via the GOTOJAIL tile (30) and via the chance goto_jail card (index 9)
 * - doubles exit: EXITED_JAIL how=doubles, move by the dice total,
 *   pendingDouble stays false (jail doubles never grant an extra turn)
 * - failed attempts: jailTurns increments, STAYED_IN_JAIL, phase await_end
 * - 3rd failed attempt: forced $50 fine through the FIX-2 payment pipeline
 *   (house liquidation, mortgaging, bankruptcy-in-jail with no move)
 * - USE_JAIL_CARD: consumes one card, stays await_roll, NO_JAIL_CARD /
 *   NOT_IN_JAIL violations, and the follow-up free roll where doubles DO
 *   grant an extra turn
 * - BUILD blocked while jailed (implementation code: IN_JAIL); mortgage
 *   toggling allowed while jailed
 *
 * Arrange-only mutation of structuredClone(initialState(...)) is used to
 * reach deep states; every ACT goes through the public API.
 */

import { describe, expect, it } from 'vitest';
import {
    GAME_CONFIG,
    JAIL_POSITION,
    RuleViolation,
    applyAction,
    initialState,
    jailStep
} from '../src/core/rules_core.ts';
import type { Action, GameEvent, GameState, PlayerSetup } from '../src/core/types.ts';

const PLAYER_SETUPS: PlayerSetup[] = [
    { name: 'A', isBot: false, colorHex: '#f00', tokenKind: 'pawn' },
    { name: 'B', isBot: true, colorHex: '#00f', tokenKind: 'pawn' }
];

const START = GAME_CONFIG.START_MONEY; // 1500
const FINE = GAME_CONFIG.JAIL_EXIT_FEE; // 50

function freshState(): GameState {
    return initialState(PLAYER_SETUPS, 'bot');
}

/** Player 0 locked up on tile 10 awaiting their roll; `mutate` for deeper setups. */
function jailedState(mutate?: (draft: GameState) => void): GameState {
    const s = structuredClone(freshState());
    s.currentPlayerIndex = 0;
    s.phase = 'await_roll';
    s.players[0].inJail = true;
    s.players[0].jailTurns = 0;
    s.players[0].position = JAIL_POSITION;
    if (mutate) mutate(s);
    return s;
}

function roll(playerId: number, d1: number, d2: number): Action {
    return { type: 'ROLL', playerId, d1, d2 };
}

function eventTypes(events: GameEvent[]): string[] {
    return events.map((e) => e.type);
}

function findEvent<T extends GameEvent['type']>(events: GameEvent[], type: T): Extract<GameEvent, { type: T }> {
    const found = events.find((e) => e.type === type);
    if (!found) throw new Error(`expected a ${type} event, got [${eventTypes(events).join(', ')}]`);
    return found as Extract<GameEvent, { type: T }>;
}

function totalPlayerMoney(s: GameState): number {
    return s.players.reduce((sum, p) => sum + p.money, 0);
}

function captureViolation(fn: () => unknown): RuleViolation {
    try {
        fn();
    } catch (error) {
        if (error instanceof RuleViolation) return error;
        throw error;
    }
    throw new Error('expected a RuleViolation to be thrown');
}

describe('going to jail', () => {
    it('sends the player to jail when landing on the go-to-jail tile', () => {
        const s = structuredClone(freshState());
        s.players[0].position = 24;

        const { state, events } = applyAction(s, roll(0, 2, 4)); // 24 -> 30 GOTOJAIL

        expect(eventTypes(events)).toEqual(['MOVED', 'WENT_TO_JAIL']);
        expect(findEvent(events, 'MOVED').to).toBe(30);
        expect(findEvent(events, 'WENT_TO_JAIL').playerId).toBe(0);
        const p = state.players[0];
        expect(p.position).toBe(JAIL_POSITION);
        expect(p.inJail).toBe(true);
        expect(p.jailTurns).toBe(0);
        expect(state.phase).toBe('await_end');
    });

    it('does not grant an extra turn when a doubles roll lands on go-to-jail', () => {
        const s = structuredClone(freshState());
        s.players[0].position = 24;

        const { state, events } = applyAction(s, roll(0, 3, 3)); // doubles onto 30

        expect(state.players[0].inJail).toBe(true);
        expect(state.pendingDouble).toBe(false); // arrest cancels the pending double
        expect(state.phase).toBe('await_end');
        expect(eventTypes(events)).not.toContain('EXTRA_TURN');
    });

    it('sends the player to jail via the chance go-to-jail card without movement or salary events', () => {
        const s = structuredClone(freshState());
        s.players[0].position = 22; // CHANCE tile
        s.phase = 'await_card';

        const { state, events } = applyAction(s, { type: 'DRAW_CARD', playerId: 0, deck: 'chance', cardIndex: 9 });

        expect(eventTypes(events)).toEqual(['CARD', 'WENT_TO_JAIL']);
        const p = state.players[0];
        expect(p.position).toBe(JAIL_POSITION);
        expect(p.inJail).toBe(true);
        expect(p.jailTurns).toBe(0);
        expect(p.money).toBe(START); // no GO salary on the way to jail
        expect(state.phase).toBe('await_end');
    });
});

describe('jail roll: doubles exit', () => {
    it('exits jail and moves by the dice total when doubles are rolled', () => {
        const s = jailedState();

        const { state, events } = applyAction(s, roll(0, 3, 3));

        expect(eventTypes(events)).toEqual(['EXITED_JAIL', 'MOVED']);
        expect(findEvent(events, 'EXITED_JAIL')).toEqual({ type: 'EXITED_JAIL', playerId: 0, how: 'doubles' });
        expect(findEvent(events, 'MOVED')).toEqual({
            type: 'MOVED',
            playerId: 0,
            from: JAIL_POSITION,
            to: 16,
            path: [11, 12, 13, 14, 15, 16],
            passedGo: false
        });
        const p = state.players[0];
        expect(p.inJail).toBe(false);
        expect(p.jailTurns).toBe(0);
        expect(p.position).toBe(16);
        expect(state.phase).toBe('await_buy_decision'); // tile 16 is unowned and affordable
        expect(state.pendingDouble).toBe(false); // FIX-3: jail doubles never bank an extra turn
    });

    it('does not grant an extra turn when the doubles exit lands on a neutral tile', () => {
        const s = jailedState();

        const { state, events } = applyAction(s, roll(0, 5, 5)); // 10 -> 20 PARKING

        expect(state.players[0].position).toBe(20);
        expect(state.phase).toBe('await_end'); // a free-roll double would have re-opened await_roll
        expect(state.pendingDouble).toBe(false);
        expect(eventTypes(events)).not.toContain('EXTRA_TURN');
    });

    it('does not grant an extra turn after resolving the buy decision that followed a doubles exit', () => {
        const s = jailedState();
        const afterRoll = applyAction(s, roll(0, 3, 3)).state; // await_buy_decision on tile 16

        const { state, events } = applyAction(afterRoll, { type: 'SKIP_BUY', playerId: 0 });

        expect(state.phase).toBe('await_end');
        expect(eventTypes(events)).not.toContain('EXTRA_TURN');
        expect(state.currentPlayerIndex).toBe(0);
    });

    it('charges utility rent from the jail roll total when the doubles exit lands on an owned utility', () => {
        const s = jailedState((draft) => {
            draft.tiles[12].owner = 1; // opponent owns one utility
        });

        const { state, events } = applyAction(s, roll(0, 1, 1)); // 10 -> 12, dice total 2

        expect(eventTypes(events)).toEqual(['EXITED_JAIL', 'MOVED', 'RENT_DUE', 'PAID']);
        expect(findEvent(events, 'RENT_DUE')).toEqual({ type: 'RENT_DUE', tileId: 12, amount: 8 }); // 2 x 4
        expect(findEvent(events, 'PAID')).toEqual({ type: 'PAID', from: 0, to: 1, amount: 8 });
        expect(state.players[0].money).toBe(START - 8);
        expect(state.players[1].money).toBe(START + 8);
        expect(totalPlayerMoney(state)).toBe(2 * START); // player-to-player rent conserves money
    });

    it('exits via doubles on the third attempt without paying the fine', () => {
        const s = jailedState((draft) => {
            draft.players[0].jailTurns = 2;
        });

        const { state, events } = applyAction(s, roll(0, 4, 4)); // 10 -> 18

        expect(findEvent(events, 'EXITED_JAIL').how).toBe('doubles');
        expect(eventTypes(events)).not.toContain('PAID');
        const p = state.players[0];
        expect(p.money).toBe(START);
        expect(p.position).toBe(18);
        expect(p.inJail).toBe(false);
        expect(p.jailTurns).toBe(0);
    });
});

describe('jail roll: failed attempts', () => {
    it('increments jailTurns and stays in jail on a non-doubles roll', () => {
        const s = jailedState();

        const { state, events } = applyAction(s, roll(0, 2, 3));

        expect(eventTypes(events)).toEqual(['STAYED_IN_JAIL']);
        expect(findEvent(events, 'STAYED_IN_JAIL')).toEqual({ type: 'STAYED_IN_JAIL', playerId: 0, jailTurns: 1 });
        const p = state.players[0];
        expect(p.inJail).toBe(true);
        expect(p.jailTurns).toBe(1);
        expect(p.position).toBe(JAIL_POSITION); // no movement on a failed attempt
        expect(p.money).toBe(START); // failed attempts cost nothing before the 3rd
        expect(state.phase).toBe('await_end');
    });

    it('increments jailTurns to two on the second failed attempt', () => {
        const s = jailedState((draft) => {
            draft.players[0].jailTurns = 1;
        });

        const { state, events } = applyAction(s, roll(0, 1, 4));

        expect(findEvent(events, 'STAYED_IN_JAIL').jailTurns).toBe(2);
        expect(state.players[0].jailTurns).toBe(2);
        expect(state.players[0].inJail).toBe(true);
        expect(state.phase).toBe('await_end');
    });

    it('passes the turn to the next player after a failed attempt', () => {
        const s = jailedState();
        const afterRoll = applyAction(s, roll(0, 2, 3)).state;

        const { state, events } = applyAction(afterRoll, { type: 'END_TURN', playerId: 0 });

        expect(findEvent(events, 'TURN_ENDED')).toEqual({ type: 'TURN_ENDED', playerId: 0, nextPlayerId: 1 });
        expect(state.currentPlayerIndex).toBe(1);
        expect(state.phase).toBe('await_roll');
        expect(state.players[0].inJail).toBe(true); // still locked up for the next round
        expect(state.players[0].jailTurns).toBe(1);
    });
});

describe('jail roll: third failed attempt forces the fine', () => {
    it('pays the $50 fine through the pipeline and exits with how=fine', () => {
        const s = jailedState((draft) => {
            draft.players[0].jailTurns = 2;
        });

        const { state, events } = applyAction(s, roll(0, 3, 4)); // total 7 -> tile 17 CHEST

        expect(eventTypes(events)).toEqual(['PAID', 'EXITED_JAIL', 'MOVED']);
        const paid = findEvent(events, 'PAID');
        expect(paid).toEqual({ type: 'PAID', from: 0, to: 'bank', amount: FINE });
        expect(paid).not.toHaveProperty('raised'); // fully covered, no shortfall marker
        expect(findEvent(events, 'EXITED_JAIL').how).toBe('fine');
        expect(findEvent(events, 'MOVED')).toMatchObject({ from: JAIL_POSITION, to: 17 });
        const p = state.players[0];
        expect(p.money).toBe(START - FINE);
        expect(p.inJail).toBe(false);
        expect(p.jailTurns).toBe(0);
        expect(p.position).toBe(17);
        expect(state.phase).toBe('await_card'); // landing rules run normally after the exit
    });

    it('sells houses at half house cost to raise the fine when cash is short', () => {
        const s = jailedState((draft) => {
            draft.players[0].jailTurns = 2;
            draft.players[0].money = 0;
            draft.tiles[1].owner = 0;
            draft.tiles[1].houses = 2; // houseCost 50 -> refund 25 per house
            draft.tiles[3].owner = 0;
        });

        const { state, events } = applyAction(s, roll(0, 2, 3)); // total 5 -> tile 15

        expect(eventTypes(events)).toEqual(['HOUSE_SOLD', 'HOUSE_SOLD', 'PAID', 'EXITED_JAIL', 'MOVED']);
        expect(events.slice(0, 2)).toEqual([
            { type: 'HOUSE_SOLD', playerId: 0, tileId: 1, refund: 25, housesLeft: 1 },
            { type: 'HOUSE_SOLD', playerId: 0, tileId: 1, refund: 25, housesLeft: 0 }
        ]);
        expect(findEvent(events, 'PAID')).toEqual({ type: 'PAID', from: 0, to: 'bank', amount: FINE });
        expect(findEvent(events, 'EXITED_JAIL').how).toBe('fine');
        const p = state.players[0];
        expect(p.money).toBe(0); // raised exactly 50, paid exactly 50
        expect(p.inJail).toBe(false);
        expect(p.position).toBe(15);
        expect(state.tiles[1].houses).toBe(0);
        expect(state.tiles[1].isMortgaged).toBe(false); // house sales covered it, no mortgage needed
        expect(state.tiles[3].isMortgaged).toBe(false);
        expect(state.phase).toBe('await_end'); // broke player gets no buy offer on tile 15
    });

    it('mortgages properties at half price to raise the fine when no houses remain', () => {
        const s = jailedState((draft) => {
            draft.players[0].jailTurns = 2;
            draft.players[0].money = 10;
            draft.tiles[1].owner = 0; // price 60 -> mortgage refund 30
            draft.tiles[3].owner = 0; // price 60 -> mortgage refund 30
        });

        const { state, events } = applyAction(s, roll(0, 1, 3)); // total 4 -> tile 14

        expect(eventTypes(events)).toEqual(['MORTGAGED', 'MORTGAGED', 'PAID', 'EXITED_JAIL', 'MOVED']);
        expect(events.slice(0, 2)).toEqual([
            { type: 'MORTGAGED', tileId: 1, amount: 30 },
            { type: 'MORTGAGED', tileId: 3, amount: 30 }
        ]);
        const p = state.players[0];
        expect(p.money).toBe(10 + 30 + 30 - FINE); // 20 left after the forced fine
        expect(state.tiles[1]).toMatchObject({ owner: 0, isMortgaged: true });
        expect(state.tiles[3]).toMatchObject({ owner: 0, isMortgaged: true });
        expect(p.inJail).toBe(false);
        expect(p.position).toBe(14);
        expect(state.phase).toBe('await_end'); // 20 cannot afford tile 14 -> no buy offer
    });

    it('bankrupts the jailed player when the fine cannot be raised and does not move them', () => {
        const s = jailedState((draft) => {
            draft.players[0].jailTurns = 2;
            draft.players[0].money = 10;
            draft.tiles[1].owner = 0;
            draft.tiles[1].isMortgaged = true; // nothing left to liquidate
        });

        const { state, events } = applyAction(s, roll(0, 2, 5));

        expect(eventTypes(events)).toEqual(['PAID', 'BANKRUPT', 'VICTORY']);
        expect(findEvent(events, 'PAID')).toEqual({ type: 'PAID', from: 0, to: 'bank', amount: FINE, raised: 10 });
        expect(findEvent(events, 'BANKRUPT')).toEqual({ type: 'BANKRUPT', playerId: 0, creditorId: null });
        expect(eventTypes(events)).not.toContain('EXITED_JAIL');
        expect(eventTypes(events)).not.toContain('MOVED'); // FIX-3: bankrupt players do not move out
        const p = state.players[0];
        expect(p.bankrupt).toBe(true);
        expect(p.money).toBe(0);
        expect(p.position).toBe(JAIL_POSITION);
        expect(state.tiles[1]).toEqual({ id: 1, owner: null, houses: 0, isMortgaged: false }); // back to the bank
        expect(state.phase).toBe('game_over'); // two-player game: the opponent wins
        expect(state.winner).toBe(1);
        expect(findEvent(events, 'VICTORY').playerId).toBe(1);
    });
});

describe('USE_JAIL_CARD', () => {
    it('consumes the card, frees the player and stays in await_roll', () => {
        const s = jailedState((draft) => {
            draft.players[0].jailFreeCards = 1;
            draft.players[0].jailTurns = 1;
        });

        const { state, events } = applyAction(s, { type: 'USE_JAIL_CARD', playerId: 0 });

        expect(eventTypes(events)).toEqual(['EXITED_JAIL']);
        expect(findEvent(events, 'EXITED_JAIL')).toEqual({ type: 'EXITED_JAIL', playerId: 0, how: 'card' });
        const p = state.players[0];
        expect(p.jailFreeCards).toBe(0);
        expect(p.inJail).toBe(false);
        expect(p.jailTurns).toBe(0);
        expect(p.position).toBe(JAIL_POSITION); // no movement until the free roll
        expect(p.money).toBe(START); // exiting by card is free
        expect(state.phase).toBe('await_roll');
        expect(state.currentPlayerIndex).toBe(0);
    });

    it('consumes exactly one card when the player holds several', () => {
        const s = jailedState((draft) => {
            draft.players[0].jailFreeCards = 2;
        });

        const { state } = applyAction(s, { type: 'USE_JAIL_CARD', playerId: 0 });

        expect(state.players[0].jailFreeCards).toBe(1);
    });

    it('throws NO_JAIL_CARD when the jailed player holds no card', () => {
        const s = jailedState();

        const violation = captureViolation(() => applyAction(s, { type: 'USE_JAIL_CARD', playerId: 0 }));

        expect(violation.code).toBe('NO_JAIL_CARD');
    });

    it('throws NOT_IN_JAIL when a free player tries to use a card', () => {
        const s = structuredClone(freshState());
        s.players[0].jailFreeCards = 1;

        const violation = captureViolation(() => applyAction(s, { type: 'USE_JAIL_CARD', playerId: 0 }));

        expect(violation.code).toBe('NOT_IN_JAIL');
    });

    it('throws WRONG_PHASE when the card is used outside await_roll', () => {
        const s = jailedState((draft) => {
            draft.players[0].jailFreeCards = 1;
            draft.phase = 'await_end';
        });

        const violation = captureViolation(() => applyAction(s, { type: 'USE_JAIL_CARD', playerId: 0 }));

        expect(violation.code).toBe('WRONG_PHASE');
    });

    it('grants an extra turn when the free roll after the card comes up doubles', () => {
        const s = jailedState((draft) => {
            draft.players[0].jailFreeCards = 1;
        });
        const freed = applyAction(s, { type: 'USE_JAIL_CARD', playerId: 0 }).state;

        const { state, events } = applyAction(freed, roll(0, 5, 5)); // 10 -> 20 PARKING

        expect(eventTypes(events)).toEqual(['MOVED', 'EXTRA_TURN']);
        expect(findEvent(events, 'EXTRA_TURN').playerId).toBe(0);
        expect(state.phase).toBe('await_roll'); // unlike a jail doubles exit, this roll was free
        expect(state.currentPlayerIndex).toBe(0);
        expect(state.doublesCount).toBe(1);
        expect(state.pendingDouble).toBe(false); // consumed by the extra-turn grant
    });
});

describe('building and mortgaging while jailed', () => {
    it('rejects BUILD with IN_JAIL even when the full group is owned', () => {
        const s = jailedState((draft) => {
            draft.tiles[1].owner = 0;
            draft.tiles[3].owner = 0; // full brown group, money plentiful
        });

        const violation = captureViolation(() => applyAction(s, { type: 'BUILD', playerId: 0, tileId: 1 }));

        expect(violation.code).toBe('IN_JAIL');
    });

    it('allows mortgaging a property while in jail', () => {
        const s = jailedState((draft) => {
            draft.tiles[1].owner = 0;
        });

        const { state, events } = applyAction(s, { type: 'TOGGLE_MORTGAGE', playerId: 0, tileId: 1 });

        expect(eventTypes(events)).toEqual(['MORTGAGED']);
        expect(findEvent(events, 'MORTGAGED')).toEqual({ type: 'MORTGAGED', tileId: 1, amount: 30 }); // 60 * 0.5
        expect(state.tiles[1].isMortgaged).toBe(true);
        expect(state.players[0].money).toBe(START + 30);
        expect(state.players[0].inJail).toBe(true);
        expect(state.phase).toBe('await_roll'); // mortgaging never advances the phase
    });

    it('allows redeeming a mortgage while in jail', () => {
        const s = jailedState((draft) => {
            draft.tiles[1].owner = 0;
            draft.tiles[1].isMortgaged = true;
        });

        const { state, events } = applyAction(s, { type: 'TOGGLE_MORTGAGE', playerId: 0, tileId: 1 });

        expect(findEvent(events, 'UNMORTGAGED')).toEqual({ type: 'UNMORTGAGED', tileId: 1, amount: 36 }); // 60 * 0.6
        expect(state.tiles[1].isMortgaged).toBe(false);
        expect(state.players[0].money).toBe(START - 36);
        expect(state.players[0].inJail).toBe(true);
    });
});

describe('jailStep helper', () => {
    it('matches applyAction(ROLL) exactly for a jailed current player', () => {
        const s = jailedState((draft) => {
            draft.players[0].jailTurns = 2;
        });

        const viaAction = applyAction(s, roll(0, 3, 4));
        const viaHelper = jailStep(s, 0, 3, 4);

        expect(viaHelper.state).toEqual(viaAction.state);
        expect(viaHelper.events).toEqual(viaAction.events);
    });

    it('throws NOT_IN_JAIL for a player who is not jailed', () => {
        const s = freshState();

        const violation = captureViolation(() => jailStep(s, 0, 2, 3));

        expect(violation.code).toBe('NOT_IN_JAIL');
    });
});

describe('purity', () => {
    it('does not mutate the input state when resolving a jail roll', () => {
        const s = jailedState();
        const snapshot = structuredClone(s);

        applyAction(s, roll(0, 2, 3));

        expect(s).toEqual(snapshot);
    });
});
