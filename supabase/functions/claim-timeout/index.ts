/**
 * supabase/functions/claim-timeout/index.ts
 *
 * Turn-timeout enforcer (Deno Edge Function). Any seated room member may call
 * it; it verifies games.turn_deadline has passed on the SERVER clock, then
 * force-finishes the stalled player's turn by applying neutral actions through
 * the same rules core as game-action:
 *
 *   await_roll          -> ROLL (server dice)
 *   await_buy_decision  -> SKIP_BUY
 *   await_card          -> DRAW_CARD (server cardIndex, deck from tile)
 *   await_end           -> END_TURN
 *
 * ...looping (bounded) until the turn passes to another player or the game
 * ends — a lone END_TURN is illegal in most phases, so the minimal chain is
 * required for correctness. Each forced step is persisted to game_actions and
 * broadcast as a normal 'action' (payload gains forced: true) so clients
 * replay it exactly like a player-initiated action.
 *
 * Request (POST, Authorization: Bearer <user JWT>): { "roomId": "<uuid>" }
 * Responses:
 *   200 { ok, fromSeq, toSeq, version, state }
 *   409 { error: DEADLINE_NOT_REACHED | NO_DEADLINE | GAME_OVER | VERSION_CONFLICT | NO_PROGRESS }
 *   401/403/404 { error: <code> }
 */

import { createClient } from 'npm:@supabase/supabase-js@2';
import type { SupabaseClient } from 'npm:@supabase/supabase-js@2';
import {
    applyAction,
    RuleViolation,
    BOARD,
    CHANCE_CARDS,
    CHEST_CARDS,
} from '../_shared/rules_core.ts';
import type { Action, GameEvent, GameState, VictoryEvent } from '../_shared/types.ts';

const TURN_SECONDS = 90;
/** Doubles chains can extend a forced turn; this bounds the worst case. */
const MAX_FORCED_STEPS = 12;

const SUPABASE_URL = Deno.env.get('SUPABASE_URL') ?? '';
const ANON_KEY = Deno.env.get('SUPABASE_ANON_KEY') ?? '';
const SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';

const CORS_HEADERS: Record<string, string> = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

function json(status: number, body: unknown): Response {
    return new Response(JSON.stringify(body), {
        status,
        headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' },
    });
}

function randomInt(maxExclusive: number): number {
    const buf = new Uint32Array(1);
    const limit = Math.floor(0x100000000 / maxExclusive) * maxExclusive;
    let x = 0;
    do {
        crypto.getRandomValues(buf);
        x = buf[0];
    } while (x >= limit);
    return x % maxExclusive;
}

const rollDie = (): number => 1 + randomInt(6);

async function broadcast(
    admin: SupabaseClient,
    roomId: string,
    event: string,
    payload: Record<string, unknown>,
): Promise<void> {
    const channel = admin.channel(`room:${roomId}`);
    try {
        await channel.send({ type: 'broadcast', event, payload });
    } catch (e) {
        console.error('[claim-timeout] broadcast failed:', e);
    } finally {
        await admin.removeChannel(channel);
    }
}

/** The neutral action that unblocks the current phase for the stalled seat. */
function forcedActionFor(state: GameState, seat: number): Action {
    switch (state.phase) {
        case 'await_roll':
            return { type: 'ROLL', playerId: seat, d1: rollDie(), d2: rollDie() };
        case 'await_buy_decision':
            return { type: 'SKIP_BUY', playerId: seat };
        case 'await_card': {
            const tileType = BOARD[state.players[seat]?.position ?? 0]?.type;
            const deck = tileType === 'CHANCE' ? 'chance' : 'chest';
            const len = deck === 'chance' ? CHANCE_CARDS.length : CHEST_CARDS.length;
            return { type: 'DRAW_CARD', playerId: seat, deck, cardIndex: randomInt(len) };
        }
        default: // await_end
            return { type: 'END_TURN', playerId: seat };
    }
}

interface GameRow {
    id: string;
    state: GameState;
    version: number;
    turn_deadline: string | null;
}

Deno.serve(async (req: Request) => {
    if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS_HEADERS });
    if (req.method !== 'POST') return json(405, { error: 'METHOD_NOT_ALLOWED' });

    const authHeader = req.headers.get('Authorization');
    if (!authHeader) return json(401, { error: 'NO_AUTH' });

    const userClient = createClient(SUPABASE_URL, ANON_KEY, {
        global: { headers: { Authorization: authHeader } },
        auth: { persistSession: false },
    });
    const { data: userData, error: userErr } = await userClient.auth.getUser();
    if (userErr || !userData?.user) return json(401, { error: 'INVALID_JWT' });
    const userId = userData.user.id;

    let body: { roomId?: unknown };
    try {
        body = await req.json();
    } catch {
        return json(400, { error: 'BAD_JSON' });
    }
    const roomId = typeof body.roomId === 'string' ? body.roomId : '';
    if (!roomId) return json(400, { error: 'MISSING_ROOM_ID' });

    const admin = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
        auth: { persistSession: false },
    });

    try {
        // Caller must sit in this room (any member may claim a timeout).
        const { data: seatRow } = await admin
            .from('room_players')
            .select('seat_index')
            .eq('room_id', roomId)
            .eq('user_id', userId)
            .maybeSingle();
        if (!seatRow) return json(403, { error: 'NOT_IN_ROOM' });

        for (let attempt = 0; attempt < 2; attempt++) {
            const { data: gameRow, error: gErr } = await admin
                .from('games')
                .select('id, state, version, turn_deadline')
                .eq('room_id', roomId)
                .maybeSingle();
            if (gErr || !gameRow) return json(404, { error: 'GAME_NOT_FOUND' });
            const game = gameRow as GameRow;
            const state = game.state;

            if (state.phase === 'game_over') return json(409, { error: 'GAME_OVER' });
            if (!game.turn_deadline) return json(409, { error: 'NO_DEADLINE' });
            // Server clock decides — never the caller's clock.
            if (new Date(game.turn_deadline).getTime() > Date.now()) {
                return json(409, { error: 'DEADLINE_NOT_REACHED' });
            }

            const timedOutSeat = state.currentPlayerIndex;
            const steps: { action: Action; events: GameEvent[] }[] = [];
            let cur = state;
            while (
                cur.phase !== 'game_over' &&
                cur.currentPlayerIndex === timedOutSeat &&
                steps.length < MAX_FORCED_STEPS
            ) {
                const forced = forcedActionFor(cur, timedOutSeat);
                try {
                    const res = applyAction(cur, forced);
                    steps.push({ action: forced, events: res.events });
                    cur = res.state;
                } catch (e) {
                    if (e instanceof RuleViolation) {
                        console.error('[claim-timeout] forced action rejected:', e.code);
                        break;
                    }
                    throw e;
                }
            }
            if (steps.length === 0) return json(409, { error: 'NO_PROGRESS' });

            const newVersion = game.version + steps.length;
            const deadline = cur.phase === 'game_over'
                ? null
                : new Date(Date.now() + TURN_SECONDS * 1000).toISOString();

            const { data: updated, error: updErr } = await admin
                .from('games')
                .update({ state: cur, version: newVersion, turn_deadline: deadline })
                .eq('id', game.id)
                .eq('version', game.version)
                .select('id');
            if (updErr) return json(500, { error: 'INTERNAL' });
            if (!updated || updated.length === 0) continue; // someone acted in time -> retry once

            const rows = steps.map((s, i) => ({
                game_id: game.id,
                seq: game.version + 1 + i,
                seat: timedOutSeat,
                action: s.action,
                events: s.events,
            }));
            const { error: logErr } = await admin.from('game_actions').insert(rows);
            if (logErr) console.error('[claim-timeout] action log insert failed:', logErr.message);

            // Victory bookkeeping (a forced roll can rent-bankrupt the absentee).
            const allEvents = steps.flatMap((s) => s.events);
            const victory = allEvents.find((e): e is VictoryEvent => e.type === 'VICTORY');
            if (victory) {
                await admin.from('rooms').update({ status: 'finished' }).eq('id', roomId);
                const { data: winnerSeat } = await admin
                    .from('room_players')
                    .select('user_id')
                    .eq('room_id', roomId)
                    .eq('seat_index', victory.playerId)
                    .maybeSingle();
                if (winnerSeat) {
                    const { data: profile } = await admin
                        .from('profiles').select('games_won').eq('id', winnerSeat.user_id).maybeSingle();
                    if (profile) {
                        await admin
                            .from('profiles')
                            .update({ games_won: (profile.games_won ?? 0) + 1 })
                            .eq('id', winnerSeat.user_id);
                    }
                }
            }

            // Same broadcast pipeline as game-action, one message per forced step.
            for (let i = 0; i < steps.length; i++) {
                await broadcast(admin, roomId, 'action', {
                    seq: game.version + 1 + i,
                    action: steps[i].action,
                    events: steps[i].events,
                    stateVersion: game.version + 1 + i,
                    forced: true,
                });
            }

            return json(200, {
                ok: true,
                fromSeq: game.version + 1,
                toSeq: newVersion,
                version: newVersion,
                state: cur,
            });
        }
        return json(409, { error: 'VERSION_CONFLICT' });
    } catch (e) {
        console.error('[claim-timeout] unhandled error:', e);
        return json(500, { error: 'INTERNAL' });
    }
});
