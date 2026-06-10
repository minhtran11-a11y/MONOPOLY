/**
 * tests/cards.test.ts
 *
 * Card-deck behavior of the pure Monopoly rules core:
 * - every CHANCE (16) and CHEST (11) card executes without throw from a clean
 *   state, keeps the state JSON-safe and conserves money against the event log;
 * - FIX-4 regression: airport chance card (index 0) moves + pays $500 but
 *   grants NO ownership of tile 35;
 * - backward card walks a backward path with no GO salary (FIX-1 via cards);
 * - move_to bonus vs passedGo salary semantics asserted from board.ts data;
 * - go-to-jail card, collect/pay/collect_all/jail_free money deltas;
 * - DRAW_CARD violations (WRONG_PHASE, BAD_CARD_INDEX, WRONG_DECK).
 *
 * Note: neither deck contains per-player street-repair cards (no such effect
 * kind exists in CardEffectDef), so repair coverage is intentionally absent.
 */

import { describe, expect, it } from 'vitest';
import {
    BOARD,
    BOARD_SIZE,
    CHANCE_CARDS,
    CHEST_CARDS,
    GAME_CONFIG,
    RuleViolation,
    applyAction,
    cardEffect,
    initialState,
    passedGo
} from '../src/core/rules_core.ts';
import type {
    CardDeck,
    CardEffectDef,
    GameEvent,
    GameState,
    PlayerSetup
} from '../src/core/types.ts';

// ---------------------------------------------------------------------------
// Arrange helpers
// ---------------------------------------------------------------------------

const CHANCE_TILE = 7; // canonical CHANCE tile (others: 22, 36)
const CHEST_TILE = 17; // canonical CHEST tile (others: 2, 33)
const START_MONEY = GAME_CONFIG.START_MONEY; // 1500
const SALARY = GAME_CONFIG.PASS_GO_MONEY; // 200

const TWO_PLAYERS: PlayerSetup[] = [
    { name: 'A', isBot: false, colorHex: '#f00', tokenKind: 'pawn' },
    { name: 'B', isBot: true, colorHex: '#00f', tokenKind: 'pawn' }
];

const THREE_PLAYERS: PlayerSetup[] = [
    ...TWO_PLAYERS,
    { name: 'C', isBot: true, colorHex: '#0f0', tokenKind: 'pawn' }
];

/** Clean state with player 0 standing on `tileId` in await_card phase. */
function onCardTile(
    tileId: number,
    setups: PlayerSetup[] = TWO_PLAYERS,
    mutate?: (s: GameState) => void
): GameState {
    const s = structuredClone(initialState(setups, 'bot'));
    s.players[0].position = tileId;
    s.phase = 'await_card';
    if (mutate) mutate(s);
    return s;
}

function draw(state: GameState, deck: CardDeck, cardIndex: number) {
    return applyAction(state, { type: 'DRAW_CARD', playerId: 0, deck, cardIndex });
}

function sumMoney(state: GameState): number {
    return state.players.reduce((acc, p) => acc + p.money, 0);
}

/** Net bank→players flow implied by the event log (negative = paid to bank). */
function bankFlow(events: GameEvent[]): number {
    let delta = 0;
    for (const e of events) {
        switch (e.type) {
            case 'COLLECTED':
            case 'SALARY':
                delta += e.amount;
                break;
            case 'HOUSE_SOLD':
                delta += e.refund;
                break;
            case 'MORTGAGED':
                delta += e.amount;
                break;
            case 'UNMORTGAGED':
                delta -= e.amount;
                break;
            case 'PAID':
                // Player-to-player transfers net to zero across the table.
                if (e.to === 'bank') delta -= e.raised ?? e.amount;
                break;
            default:
                break;
        }
    }
    return delta;
}

function eventsOf<T extends GameEvent['type']>(
    events: GameEvent[],
    type: T
): Extract<GameEvent, { type: T }>[] {
    return events.filter((e): e is Extract<GameEvent, { type: T }> => e.type === type);
}

function expectViolation(fn: () => unknown, code: string): void {
    let caught: unknown = null;
    try {
        fn();
    } catch (error: unknown) {
        caught = error;
    }
    expect(caught, `expected RuleViolation ${code}`).toBeInstanceOf(RuleViolation);
    expect((caught as RuleViolation).code).toBe(code);
}

/** Shared validity assertions for the loop-all-cards tests. */
function assertCleanDrawResult(
    label: string,
    before: GameState,
    after: GameState,
    events: GameEvent[]
): void {
    // Resolves to a real phase — never hangs, never reaches game_over from clean.
    expect(['await_end', 'await_buy_decision', 'await_card'], label).toContain(after.phase);
    for (const p of after.players) {
        expect(Number.isInteger(p.money), `${label} money integer`).toBe(true);
        expect(p.money, `${label} money >= 0`).toBeGreaterThanOrEqual(0);
        expect(p.position, label).toBeGreaterThanOrEqual(0);
        expect(p.position, label).toBeLessThan(BOARD_SIZE);
        expect(p.bankrupt, label).toBe(false);
    }
    // No card may silently grant ownership or build from a clean board (FIX-4 generalised).
    for (const t of after.tiles) {
        expect(t.owner, `${label} tile ${t.id} owner`).toBeNull();
        expect(t.houses, label).toBe(0);
        expect(t.isMortgaged, label).toBe(false);
    }
    // Money conservation: player-sum delta must equal the bank flow in the log.
    expect(sumMoney(after) - sumMoney(before), `${label} conservation`).toBe(bankFlow(events));
    // JSON round-trip (state is JSON-safe by contract).
    expect(JSON.parse(JSON.stringify(after)), `${label} json`).toStrictEqual(after);
}

// ---------------------------------------------------------------------------
// Deck data integrity
// ---------------------------------------------------------------------------

describe('deck data integrity', () => {
    it('has 16 chance and 11 chest cards, all with text and a known effect kind (no repair cards exist)', () => {
        const knownKinds = new Set<CardEffectDef['kind']>([
            'move_to',
            'move_to_or_collect',
            'move_to_or_pay',
            'collect',
            'collect_all',
            'pay',
            'goto_jail',
            'jail_free',
            'move_steps',
            'move_to_nearest_player',
            'move_to_farthest_player'
        ]);

        expect(CHANCE_CARDS).toHaveLength(16);
        expect(CHEST_CARDS).toHaveLength(11);

        for (const card of [...CHANCE_CARDS, ...CHEST_CARDS]) {
            expect(typeof card.text).toBe('string');
            expect(card.text.length).toBeGreaterThan(0);
            expect(knownKinds.has(card.effect.kind), card.text).toBe(true);
            // Documents that per-player street-repair cards are absent from both decks.
            expect(card.effect.kind.includes('repair'), card.text).toBe(false);
        }
    });
});

// ---------------------------------------------------------------------------
// Every card executes from a clean state
// ---------------------------------------------------------------------------

describe('every chance card executes cleanly from a clean state', () => {
    for (let i = 0; i < CHANCE_CARDS.length; i += 1) {
        const kind = CHANCE_CARDS[i].effect.kind;
        it(`chance card ${i} (${kind}) resolves without throw, conserves money and round-trips JSON`, () => {
            // Arrange
            const start = onCardTile(CHANCE_TILE);
            const snapshot = structuredClone(start);

            // Act
            const { state: next, events } = draw(start, 'chance', i);

            // Assert
            expect(start, 'input state must not be mutated').toStrictEqual(snapshot);
            expect(events[0]).toStrictEqual({
                type: 'CARD',
                deck: 'chance',
                cardIndex: i,
                text: CHANCE_CARDS[i].text
            });
            assertCleanDrawResult(`chance[${i}]`, snapshot, next, events);
        });
    }
});

describe('every chest card executes cleanly from a clean state', () => {
    for (let i = 0; i < CHEST_CARDS.length; i += 1) {
        const kind = CHEST_CARDS[i].effect.kind;
        it(`chest card ${i} (${kind}) resolves without throw, conserves money and round-trips JSON`, () => {
            // Arrange
            const start = onCardTile(CHEST_TILE);
            const snapshot = structuredClone(start);

            // Act
            const { state: next, events } = draw(start, 'chest', i);

            // Assert
            expect(start, 'input state must not be mutated').toStrictEqual(snapshot);
            expect(events[0]).toStrictEqual({
                type: 'CARD',
                deck: 'chest',
                cardIndex: i,
                text: CHEST_CARDS[i].text
            });
            assertCleanDrawResult(`chest[${i}]`, snapshot, next, events);
        });
    }
});

// ---------------------------------------------------------------------------
// FIX-4 regression — airport chance card grants no ownership
// ---------------------------------------------------------------------------

describe('FIX-4 regression: airport chance card (index 0)', () => {
    it('moves to tile 35, credits exactly $500, leaves tile 35 bank-owned and offers a buy decision', () => {
        // Arrange
        const start = onCardTile(CHANCE_TILE);

        // Act
        const { state: next, events } = draw(start, 'chance', 0);

        // Assert
        const me = next.players[0];
        expect(me.position).toBe(35);
        expect(me.money).toBe(START_MONEY + 500); // bonus only — 7→35 does not wrap GO
        expect(next.tiles[35].owner).toBeNull(); // NO silent ownership grant
        expect(next.phase).toBe('await_buy_decision'); // tile 35 affordable → normal landing rules
        expect(eventsOf(events, 'BOUGHT')).toHaveLength(0);
        expect(eventsOf(events, 'SALARY')).toHaveLength(0);
        expect(eventsOf(events, 'COLLECTED')).toStrictEqual([
            { type: 'COLLECTED', playerId: 0, amount: 500 }
        ]);
        const moved = eventsOf(events, 'MOVED');
        expect(moved).toHaveLength(1);
        expect(moved[0].from).toBe(CHANCE_TILE);
        expect(moved[0].to).toBe(35);
        expect(moved[0].passedGo).toBe(false);
    });

    it('pays rent instead of granting ownership when tile 35 is already owned', () => {
        // Arrange: opponent owns the airport (1 railroad → rent 25).
        const start = onCardTile(CHANCE_TILE, TWO_PLAYERS, (s) => {
            s.tiles[35].owner = 1;
        });

        // Act
        const { state: next, events } = draw(start, 'chance', 0);

        // Assert
        expect(next.tiles[35].owner).toBe(1); // ownership untouched
        expect(next.players[0].money).toBe(START_MONEY + 500 - 25);
        expect(next.players[1].money).toBe(START_MONEY + 25);
        expect(eventsOf(events, 'RENT_DUE')).toStrictEqual([
            { type: 'RENT_DUE', tileId: 35, amount: 25 }
        ]);
        expect(eventsOf(events, 'PAID')).toStrictEqual([
            { type: 'PAID', from: 0, to: 1, amount: 25 }
        ]);
        expect(next.phase).toBe('await_end');
        expect(sumMoney(next) - 2 * START_MONEY).toBe(bankFlow(events));
    });
});

// ---------------------------------------------------------------------------
// Backward card (FIX-1 semantics through cards)
// ---------------------------------------------------------------------------

describe('backward move card', () => {
    it('walks a backward path with no GO salary and resolves the landing (chance 12 from tile 36)', () => {
        // Arrange: "Đi lùi 3 bước" drawn on chance tile 36 → lands on chest 33.
        const start = onCardTile(36);

        // Act
        const { state: next, events } = draw(start, 'chance', 12);

        // Assert
        const moved = eventsOf(events, 'MOVED');
        expect(moved).toHaveLength(1);
        expect(moved[0]).toStrictEqual({
            type: 'MOVED',
            playerId: 0,
            from: 36,
            to: 33,
            path: [35, 34, 33], // backward, tile by tile
            passedGo: false
        });
        expect(eventsOf(events, 'SALARY')).toHaveLength(0); // backward never pays GO
        expect(next.players[0].position).toBe(33);
        expect(next.players[0].money).toBe(START_MONEY);
        expect(next.phase).toBe('await_card'); // tile 33 is a CHEST tile → draw again
    });
});

// ---------------------------------------------------------------------------
// move_to bonus vs passedGo salary semantics (asserted from board.ts data)
// ---------------------------------------------------------------------------

describe('moving cards: bonus and GO-salary semantics per board data', () => {
    type MovingEffect = Extract<
        CardEffectDef,
        { kind: 'move_to' | 'move_to_or_collect' | 'move_to_or_pay' }
    >;
    interface MovingCase {
        deck: CardDeck;
        index: number;
        fromTile: number;
        effect: MovingEffect;
    }

    const movingCases: MovingCase[] = [];
    CHANCE_CARDS.forEach((card, index) => {
        const eff = card.effect;
        if (eff.kind === 'move_to' || eff.kind === 'move_to_or_collect' || eff.kind === 'move_to_or_pay') {
            movingCases.push({ deck: 'chance', index, fromTile: CHANCE_TILE, effect: eff });
        }
    });
    CHEST_CARDS.forEach((card, index) => {
        const eff = card.effect;
        if (eff.kind === 'move_to' || eff.kind === 'move_to_or_collect' || eff.kind === 'move_to_or_pay') {
            movingCases.push({ deck: 'chest', index, fromTile: CHEST_TILE, effect: eff });
        }
    });

    it('credits the card bonus before the move and the $200 salary only on a forward GO wrap', () => {
        expect(movingCases.length).toBeGreaterThan(0);

        for (const { deck, index, fromTile, effect } of movingCases) {
            const label = `${deck}[${index}]`;
            // Sanity: from the canonical tiles the "already there" branch never triggers.
            expect(effect.target, label).not.toBe(fromTile);

            const bonus =
                effect.kind === 'move_to'
                    ? effect.bonus ?? 0
                    : effect.kind === 'move_to_or_pay'
                        ? effect.moveBonus
                        : 0;
            const steps = (effect.target - fromTile + BOARD_SIZE) % BOARD_SIZE;
            const wraps = passedGo(fromTile, steps);
            const landing = BOARD[effect.target];
            const taxOnLanding = landing.type === 'TAX' ? landing.price ?? 0 : 0;
            const expectedDelta = bonus + (wraps ? SALARY : 0) - taxOnLanding;

            const { state: next, events } = draw(onCardTile(fromTile), deck, index);

            expect(next.players[0].position, label).toBe(effect.target);
            expect(next.players[0].money - START_MONEY, label).toBe(expectedDelta);
            expect(next.players[0].inJail, label).toBe(false); // move_to 10 is "just visiting"
            expect(eventsOf(events, 'SALARY'), label).toHaveLength(wraps ? 1 : 0);
            const collected = eventsOf(events, 'COLLECTED');
            if (bonus > 0) {
                expect(collected, label).toStrictEqual([{ type: 'COLLECTED', playerId: 0, amount: bonus }]);
            } else {
                expect(collected, label).toHaveLength(0);
            }
            const moved = eventsOf(events, 'MOVED');
            expect(moved, label).toHaveLength(1);
            expect(moved[0].passedGo, label).toBe(wraps);
        }
    });

    it('returns-to-GO chest card pays bonus plus salary ($200 + $200 = x2 reward)', () => {
        // Arrange: chest card 8 "Quay lại điểm bắt đầu. Nhận x2 tiền thưởng."
        const start = onCardTile(CHEST_TILE);

        // Act
        const { state: next, events } = draw(start, 'chest', 8);

        // Assert: bonus credited before the move, salary on the wrap to GO.
        expect(eventsOf(events, 'COLLECTED')).toStrictEqual([
            { type: 'COLLECTED', playerId: 0, amount: SALARY }
        ]);
        expect(eventsOf(events, 'SALARY')).toStrictEqual([
            { type: 'SALARY', playerId: 0, amount: SALARY }
        ]);
        expect(next.players[0].position).toBe(0);
        expect(next.players[0].money).toBe(START_MONEY + 2 * SALARY);
        expect(next.phase).toBe('await_end');
    });
});

// ---------------------------------------------------------------------------
// Exact-tile branch cards (only reachable through the cardEffect helper,
// because DRAW_CARD requires standing on a CHANCE/CHEST tile)
// ---------------------------------------------------------------------------

describe('exact-tile branch cards', () => {
    it('move_to_or_collect pays the jackpot without moving when already standing on the target', () => {
        // Arrange: chance 3 targets tile 12 with collectIfThere 5000.
        const start = onCardTile(12);

        // Act
        const { state: next, events } = cardEffect(start, 0, 'chance', 3);

        // Assert
        expect(next.players[0].position).toBe(12); // no movement
        expect(next.players[0].money).toBe(START_MONEY + 5000);
        expect(eventsOf(events, 'MOVED')).toHaveLength(0);
        expect(eventsOf(events, 'COLLECTED')).toStrictEqual([
            { type: 'COLLECTED', playerId: 0, amount: 5000 }
        ]);
        expect(next.phase).toBe('await_end');
    });

    it('move_to_or_pay charges the penalty without moving when already standing on the target', () => {
        // Arrange: chest 5 targets tile 14 with payIfThere 500.
        const start = onCardTile(14);

        // Act
        const { state: next, events } = cardEffect(start, 0, 'chest', 5);

        // Assert
        expect(next.players[0].position).toBe(14); // no movement
        expect(next.players[0].money).toBe(START_MONEY - 500);
        expect(eventsOf(events, 'MOVED')).toHaveLength(0);
        expect(eventsOf(events, 'PAID')).toStrictEqual([
            { type: 'PAID', from: 0, to: 'bank', amount: 500 }
        ]);
        expect(next.phase).toBe('await_end');
    });
});

// ---------------------------------------------------------------------------
// Go-to-jail card
// ---------------------------------------------------------------------------

describe('go-to-jail card', () => {
    it('teleports to jail without salary or movement and cancels a pending double', () => {
        // Arrange: doubles were rolled (pendingDouble survives the await_card interlude).
        const start = onCardTile(22, TWO_PLAYERS, (s) => {
            s.pendingDouble = true;
        });

        // Act
        const { state: next, events } = draw(start, 'chance', 9);

        // Assert
        const me = next.players[0];
        expect(me.position).toBe(10);
        expect(me.inJail).toBe(true);
        expect(me.jailTurns).toBe(0);
        expect(me.money).toBe(START_MONEY); // teleport: no GO salary even though 22→10 forward would wrap
        expect(eventsOf(events, 'WENT_TO_JAIL')).toStrictEqual([
            { type: 'WENT_TO_JAIL', playerId: 0 }
        ]);
        expect(eventsOf(events, 'MOVED')).toHaveLength(0);
        expect(eventsOf(events, 'SALARY')).toHaveLength(0);
        expect(eventsOf(events, 'EXTRA_TURN')).toHaveLength(0); // arrest forfeits the doubles turn
        expect(next.pendingDouble).toBe(false);
        expect(next.phase).toBe('await_end');
    });
});

// ---------------------------------------------------------------------------
// Collect / pay / collect_all / jail_free
// ---------------------------------------------------------------------------

describe('collect, pay and jail-free cards', () => {
    it('collect and pay cards apply exact bank deltas and conserve money', () => {
        // Collect $500 (chance 4).
        const collectRes = draw(onCardTile(CHANCE_TILE), 'chance', 4);
        expect(collectRes.state.players[0].money).toBe(START_MONEY + 500);
        expect(eventsOf(collectRes.events, 'COLLECTED')).toStrictEqual([
            { type: 'COLLECTED', playerId: 0, amount: 500 }
        ]);
        expect(collectRes.state.phase).toBe('await_end');
        expect(sumMoney(collectRes.state) - 2 * START_MONEY).toBe(bankFlow(collectRes.events));

        // Pay $50 (chance 6).
        const payRes = draw(onCardTile(CHANCE_TILE), 'chance', 6);
        expect(payRes.state.players[0].money).toBe(START_MONEY - 50);
        expect(eventsOf(payRes.events, 'PAID')).toStrictEqual([
            { type: 'PAID', from: 0, to: 'bank', amount: 50 }
        ]);
        expect(payRes.state.phase).toBe('await_end');
        expect(sumMoney(payRes.state) - 2 * START_MONEY).toBe(bankFlow(payRes.events));
    });

    it('pay card with no money and no assets bankrupts the drawer and hands victory to the survivor', () => {
        // Arrange: drawer is broke and owns nothing → $15 fine cannot be raised.
        const start = onCardTile(CHANCE_TILE, TWO_PLAYERS, (s) => {
            s.players[0].money = 0;
        });

        // Act
        const { state: next, events } = draw(start, 'chance', 8);

        // Assert: creditor (the bank) receives only what was raised — nothing.
        expect(eventsOf(events, 'PAID')).toStrictEqual([
            { type: 'PAID', from: 0, to: 'bank', amount: 15, raised: 0 }
        ]);
        expect(eventsOf(events, 'BANKRUPT')).toStrictEqual([
            { type: 'BANKRUPT', playerId: 0, creditorId: null }
        ]);
        expect(eventsOf(events, 'VICTORY')).toStrictEqual([{ type: 'VICTORY', playerId: 1 }]);
        expect(next.players[0].bankrupt).toBe(true);
        expect(next.players[0].money).toBe(0);
        expect(next.winner).toBe(1);
        expect(next.phase).toBe('game_over');
        expect(sumMoney(next) - sumMoney(start)).toBe(bankFlow(events)); // 0 raised → 0 flow
    });

    it('collect_all credits every living player once and skips bankrupt ones', () => {
        // Arrange: three players, player 1 already bankrupt.
        const start = onCardTile(CHANCE_TILE, THREE_PLAYERS, (s) => {
            s.players[1].bankrupt = true;
            s.players[1].money = 0;
        });

        // Act: chance 5 — everyone collects $250.
        const { state: next, events } = draw(start, 'chance', 5);

        // Assert
        expect(next.players[0].money).toBe(START_MONEY + 250);
        expect(next.players[1].money).toBe(0); // bankrupt player excluded
        expect(next.players[2].money).toBe(START_MONEY + 250);
        expect(eventsOf(events, 'COLLECTED')).toStrictEqual([
            { type: 'COLLECTED', playerId: 0, amount: 250 },
            { type: 'COLLECTED', playerId: 2, amount: 250 }
        ]);
        expect(next.phase).toBe('await_end');
        expect(sumMoney(next) - sumMoney(start)).toBe(bankFlow(events));
    });

    it('jail-free card adds a get-out-of-jail card without moving or changing money', () => {
        // Arrange: chest 2 "Mãn Hạn Tù".
        const start = onCardTile(CHEST_TILE);

        // Act
        const { state: next, events } = draw(start, 'chest', 2);

        // Assert
        expect(next.players[0].jailFreeCards).toBe(1);
        expect(next.players[0].position).toBe(CHEST_TILE);
        expect(next.players[0].money).toBe(START_MONEY);
        expect(events).toHaveLength(1); // only the CARD event itself
        expect(next.phase).toBe('await_end');
    });
});

// ---------------------------------------------------------------------------
// Nearest / farthest player cards
// ---------------------------------------------------------------------------

describe('nearest and farthest player cards', () => {
    it('nearest-player card credits $350 then moves forward to the closest living player', () => {
        // Arrange: drawer on 7; B at 12 (distance 5), C at 30 (distance 23) → target 12.
        const start = onCardTile(CHANCE_TILE, THREE_PLAYERS, (s) => {
            s.players[1].position = 12;
            s.players[2].position = 30;
        });

        // Act
        const { state: next, events } = draw(start, 'chance', 13);

        // Assert
        expect(next.players[0].position).toBe(12);
        expect(next.players[0].money).toBe(START_MONEY + 350); // bonus before the move, no wrap
        expect(eventsOf(events, 'COLLECTED')).toStrictEqual([
            { type: 'COLLECTED', playerId: 0, amount: 350 }
        ]);
        expect(eventsOf(events, 'SALARY')).toHaveLength(0);
        const moved = eventsOf(events, 'MOVED');
        expect(moved).toHaveLength(1);
        expect(moved[0].path).toStrictEqual([8, 9, 10, 11, 12]);
        expect(next.phase).toBe('await_buy_decision'); // tile 12 (utility) unowned and affordable
    });

    it('farthest-player card targets the greatest forward distance and collects salary on the wrap', () => {
        // Arrange: drawer on 17; B at 12 (forward distance 35), C at 30 (distance 13) → target 12.
        const start = onCardTile(CHEST_TILE, THREE_PLAYERS, (s) => {
            s.players[1].position = 12;
            s.players[2].position = 30;
        });

        // Act: chest 4 — move to the farthest player (no bonus on this card).
        const { state: next, events } = draw(start, 'chest', 4);

        // Assert
        expect(next.players[0].position).toBe(12);
        expect(eventsOf(events, 'SALARY')).toStrictEqual([
            { type: 'SALARY', playerId: 0, amount: SALARY }
        ]); // 17 + 35 steps wraps past GO
        expect(eventsOf(events, 'COLLECTED')).toHaveLength(0);
        expect(next.players[0].money).toBe(START_MONEY + SALARY);
        expect(next.phase).toBe('await_buy_decision');
    });

    it('nearest-player card resolves without hanging when the nearest player shares the tile (zero-step move)', () => {
        // Arrange: both players on chance tile 7 → forward distance 0 → zero-step move.
        const start = onCardTile(CHANCE_TILE, TWO_PLAYERS, (s) => {
            s.players[1].position = CHANCE_TILE;
        });

        // Act
        const { state: next, events } = draw(start, 'chance', 13);

        // Assert: FIX-1 — zero-step moves skip the move and resolve the phase.
        expect(next.players[0].position).toBe(CHANCE_TILE);
        expect(next.players[0].money).toBe(START_MONEY + 350); // bonus still credited before the (empty) move
        expect(eventsOf(events, 'MOVED')).toHaveLength(0);
        expect(next.phase).toBe('await_end');
    });
});

// ---------------------------------------------------------------------------
// DRAW_CARD violations
// ---------------------------------------------------------------------------

describe('DRAW_CARD violations', () => {
    it('fails with WRONG_PHASE outside the await_card phase', () => {
        // await_roll (fresh game)
        const fresh = initialState(TWO_PLAYERS, 'bot');
        expectViolation(() => draw(fresh, 'chance', 0), 'WRONG_PHASE');

        // await_end (arranged on a chance tile, but the card moment has passed)
        const ended = onCardTile(CHANCE_TILE, TWO_PLAYERS, (s) => {
            s.phase = 'await_end';
        });
        expectViolation(() => draw(ended, 'chance', 0), 'WRONG_PHASE');
    });

    it('fails with BAD_CARD_INDEX for out-of-range or non-integer indexes in either deck', () => {
        const onChance = onCardTile(CHANCE_TILE);
        expectViolation(() => draw(onChance, 'chance', 16), 'BAD_CARD_INDEX'); // deck size 16 → max 15
        expectViolation(() => draw(onChance, 'chance', -1), 'BAD_CARD_INDEX');
        expectViolation(() => draw(onChance, 'chance', 2.5), 'BAD_CARD_INDEX');

        const onChest = onCardTile(CHEST_TILE);
        expectViolation(() => draw(onChest, 'chest', 11), 'BAD_CARD_INDEX'); // deck size 11 → max 10
    });

    it('fails with WRONG_DECK when the deck does not match the tile being stood on', () => {
        // Standing on a CHANCE tile but drawing chest.
        expectViolation(() => draw(onCardTile(CHANCE_TILE), 'chest', 0), 'WRONG_DECK');

        // Standing on a CHEST tile but drawing chance.
        expectViolation(() => draw(onCardTile(CHEST_TILE), 'chance', 0), 'WRONG_DECK');

        // Standing on a non-card tile (arranged await_card on GO).
        expectViolation(() => draw(onCardTile(0), 'chance', 0), 'WRONG_DECK');
    });
});
