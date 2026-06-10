/**
 * supabase/functions/game-action/index.ts
 *
 * Authoritative referee for online Monopoly games (Deno Edge Function).
 *
 * Request (POST, Authorization: Bearer <user JWT>):
 *   Start:  { "roomId": "<uuid>", "type": "START_GAME" }
 *   Action: { "roomId": "<uuid>", "action": <ClientAction> }
 *
 * ClientAction is the rules-core Action WITHOUT server-generated fields:
 *   - playerId / from are ALWAYS overwritten with the caller's seat
 *   - ROLL: d1/d2 are rolled server-side (crypto RNG)
 *   - DRAW_CARD: cardIndex is drawn server-side (deck optional; derived from
 *     the tile under the player when omitted)
 *
 * Responses (JSON, CORS-enabled):
 *   200 { ok, seq, version, action, events, state }   (action echo includes injected dice/cardIndex)
 *   400 { error: <RuleViolation.code | BAD_* > }
 *   401/403/404/409 { error: <code> }
 *
 * Side effects per accepted action:
 *   - games: optimistic update (state, version=version+1, turn_deadline)
 *     WHERE version = expected; retried once on conflict
 *   - game_actions: insert { seq: version+1, seat, action, events }
 *   - realtime broadcast on channel `room:{roomId}` event 'action'
 *     payload { seq, action, events, stateVersion }
 *   - on VICTORY: rooms.status -> 'finished', winner profiles.games_won += 1
 *
 * Seat mapping invariant: room_players.seat_index === GameState player id.
 * START_GAME compacts seats to 0..n-1 (in seat order) before building state.
 */

import { createClient } from 'npm:@supabase/supabase-js@2';
import type { SupabaseClient } from 'npm:@supabase/supabase-js@2';
import {
    applyAction,
    initialState,
    RuleViolation,
    BOARD,
    CHANCE_CARDS,
    CHEST_CARDS,
} from '../_shared/rules_core.ts';
import type {
    Action,
    CardDeck,
    GameEvent,
    GameState,
    PlayerSetup,
    TradeOffer,
    VictoryEvent,
} from '../_shared/types.ts';

const TURN_SECONDS = 90;

const SUPABASE_URL = Deno.env.get('SUPABASE_URL') ?? '';
const ANON_KEY = Deno.env.get('SUPABASE_ANON_KEY') ?? '';
const SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';

// ---------------------------------------------------------------------------
// HTTP helpers (CORS for browser functions.invoke)
// ---------------------------------------------------------------------------

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

// ---------------------------------------------------------------------------
// Server-side RNG (crypto, rejection sampling — no modulo bias)
// ---------------------------------------------------------------------------

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

// ---------------------------------------------------------------------------
// Row shapes (subset of columns we read)
// ---------------------------------------------------------------------------

interface RoomRow {
    id: string;
    host_id: string;
    status: string;
    max_players: number;
}

interface RoomPlayerRow {
    user_id: string;
    seat_index: number;
    display_name: string;
    color_hex: string;
    token_kind: string;
    is_ready: boolean;
}

interface GameRow {
    id: string;
    state: GameState;
    version: number;
}

// ---------------------------------------------------------------------------
// Broadcast (HTTP fallback send works without subscribing to the channel)
// ---------------------------------------------------------------------------

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
        console.error('[game-action] broadcast failed:', e);
    } finally {
        await admin.removeChannel(channel);
    }
}

// ---------------------------------------------------------------------------
// Action building: inject caller seat + server RNG, never trust client fields
// ---------------------------------------------------------------------------

const VALID_TYPES = new Set([
    'ROLL', 'BUY', 'SKIP_BUY', 'BUILD', 'TOGGLE_MORTGAGE', 'DRAW_CARD',
    'USE_JAIL_CARD', 'END_TURN', 'DECLARE_BANKRUPTCY', 'TRADE_EXECUTE',
]);

/** Coerce to int; invalid values become -1 so the rules core rejects them. */
function asInt(v: unknown): number {
    return typeof v === 'number' && Number.isInteger(v) ? v : -1;
}

/** Loose offer coercion; full validation happens inside the rules core. */
function asOffer(v: unknown): TradeOffer {
    const o = (v && typeof v === 'object' ? v : {}) as Record<string, unknown>;
    const offer: TradeOffer = {
        money: typeof o.money === 'number' ? o.money : 0,
        tileIds: Array.isArray(o.tileIds) ? o.tileIds.map((x) => asInt(x)) : [],
    };
    if (typeof o.jailFreeCards === 'number') offer.jailFreeCards = o.jailFreeCards;
    return offer;
}

function buildServerAction(raw: Record<string, unknown>, seat: number, state: GameState): Action {
    const type = String(raw.type);
    switch (type) {
        case 'ROLL':
            return { type: 'ROLL', playerId: seat, d1: rollDie(), d2: rollDie() };
        case 'DRAW_CARD': {
            const deck: CardDeck = raw.deck === 'chance' || raw.deck === 'chest'
                ? raw.deck
                : (BOARD[state.players[seat]?.position ?? 0]?.type === 'CHANCE' ? 'chance' : 'chest');
            const len = deck === 'chance' ? CHANCE_CARDS.length : CHEST_CARDS.length;
            return { type: 'DRAW_CARD', playerId: seat, deck, cardIndex: randomInt(len) };
        }
        case 'BUY':
            return { type: 'BUY', playerId: seat, tileId: asInt(raw.tileId) };
        case 'BUILD':
            return { type: 'BUILD', playerId: seat, tileId: asInt(raw.tileId) };
        case 'TOGGLE_MORTGAGE':
            return { type: 'TOGGLE_MORTGAGE', playerId: seat, tileId: asInt(raw.tileId) };
        case 'SKIP_BUY':
            return { type: 'SKIP_BUY', playerId: seat };
        case 'USE_JAIL_CARD':
            return { type: 'USE_JAIL_CARD', playerId: seat };
        case 'END_TURN':
            return { type: 'END_TURN', playerId: seat };
        case 'DECLARE_BANKRUPTCY':
            return { type: 'DECLARE_BANKRUPTCY', playerId: seat };
        case 'TRADE_EXECUTE':
            return {
                type: 'TRADE_EXECUTE',
                from: seat,
                to: asInt(raw.to),
                give: asOffer(raw.give),
                get: asOffer(raw.get),
            };
        default:
            throw new RuleViolation('UNKNOWN_ACTION', type);
    }
}

// ---------------------------------------------------------------------------
// Victory bookkeeping
// ---------------------------------------------------------------------------

async function handleVictorySideEffects(
    admin: SupabaseClient,
    roomId: string,
    events: GameEvent[],
): Promise<void> {
    const victory = events.find((e): e is VictoryEvent => e.type === 'VICTORY');
    if (!victory) return;

    const { error: roomErr } = await admin
        .from('rooms').update({ status: 'finished' }).eq('id', roomId);
    if (roomErr) console.error('[game-action] finish room failed:', roomErr.message);

    const { data: winnerSeat } = await admin
        .from('room_players')
        .select('user_id')
        .eq('room_id', roomId)
        .eq('seat_index', victory.playerId)
        .maybeSingle();
    if (!winnerSeat) return;

    const { data: profile } = await admin
        .from('profiles').select('games_won').eq('id', winnerSeat.user_id).maybeSingle();
    if (profile) {
        const { error: wonErr } = await admin
            .from('profiles')
            .update({ games_won: (profile.games_won ?? 0) + 1 })
            .eq('id', winnerSeat.user_id);
        if (wonErr) console.error('[game-action] games_won update failed:', wonErr.message);
    }
}

// ---------------------------------------------------------------------------
// START_GAME (host-only)
// ---------------------------------------------------------------------------

async function handleStartGame(
    admin: SupabaseClient,
    roomId: string,
    userId: string,
): Promise<Response> {
    const { data: room, error: roomErr } = await admin
        .from('rooms').select('id, host_id, status, max_players').eq('id', roomId).maybeSingle();
    if (roomErr || !room) return json(404, { error: 'ROOM_NOT_FOUND' });
    const r = room as RoomRow;
    if (r.host_id !== userId) return json(403, { error: 'NOT_HOST' });
    if (r.status !== 'lobby') return json(409, { error: 'ALREADY_STARTED' });

    const { data: memberRows, error: mErr } = await admin
        .from('room_players')
        .select('user_id, seat_index, display_name, color_hex, token_kind, is_ready')
        .eq('room_id', roomId)
        .order('seat_index', { ascending: true });
    if (mErr) return json(500, { error: 'INTERNAL' });
    const members = (memberRows ?? []) as RoomPlayerRow[];

    if (members.length < 2) return json(400, { error: 'NOT_ENOUGH_PLAYERS' });
    // Host is implicitly ready (they are pressing Start); everyone else must be.
    const notReady = members.filter((m) => m.user_id !== r.host_id && !m.is_ready);
    if (notReady.length > 0) return json(400, { error: 'PLAYERS_NOT_READY' });

    // Compact seats to 0..n-1 so seat_index === GameState player id. Processing
    // in ascending seat order only ever moves seats DOWN, so the
    // unique(room_id, seat_index) constraint cannot collide mid-loop.
    for (let i = 0; i < members.length; i++) {
        if (members[i].seat_index !== i) {
            const { error: seatErr } = await admin
                .from('room_players')
                .update({ seat_index: i })
                .eq('room_id', roomId)
                .eq('user_id', members[i].user_id);
            if (seatErr) return json(500, { error: 'INTERNAL' });
            members[i] = { ...members[i], seat_index: i };
        }
    }

    const setups: PlayerSetup[] = members.map((m) => ({
        name: m.display_name,
        isBot: false,
        colorHex: m.color_hex,
        tokenKind: m.token_kind,
    }));
    const startIndex = randomInt(setups.length);

    let state: GameState;
    try {
        state = initialState(setups, 'online', startIndex);
    } catch (e) {
        if (e instanceof RuleViolation) return json(400, { error: e.code });
        throw e;
    }

    const deadline = new Date(Date.now() + TURN_SECONDS * 1000).toISOString();
    const { error: insErr } = await admin
        .from('games')
        .insert({ room_id: roomId, state, version: 0, turn_deadline: deadline });
    if (insErr) return json(409, { error: 'GAME_EXISTS' }); // unique(room_id)

    const { error: statusErr } = await admin
        .from('rooms').update({ status: 'playing' }).eq('id', roomId);
    if (statusErr) console.error('[game-action] room status update failed:', statusErr.message);

    await broadcast(admin, roomId, 'started', { roomId, stateVersion: 0, state });
    return json(200, { ok: true, seq: 0, version: 0, state });
}

// ---------------------------------------------------------------------------
// Game action (any seated player; rules core enforces turn/phase)
// ---------------------------------------------------------------------------

async function handleGameAction(
    admin: SupabaseClient,
    roomId: string,
    userId: string,
    rawAction: unknown,
): Promise<Response> {
    if (!rawAction || typeof rawAction !== 'object') return json(400, { error: 'BAD_ACTION' });
    const raw = rawAction as Record<string, unknown>;
    if (typeof raw.type !== 'string' || !VALID_TYPES.has(raw.type)) {
        return json(400, { error: 'UNKNOWN_ACTION' });
    }

    const { data: seatRow } = await admin
        .from('room_players')
        .select('seat_index')
        .eq('room_id', roomId)
        .eq('user_id', userId)
        .maybeSingle();
    if (!seatRow) return json(403, { error: 'NOT_IN_ROOM' });
    const seat = (seatRow as { seat_index: number }).seat_index;

    // Optimistic concurrency: one retry on version conflict.
    for (let attempt = 0; attempt < 2; attempt++) {
        const { data: gameRow, error: gErr } = await admin
            .from('games').select('id, state, version').eq('room_id', roomId).maybeSingle();
        if (gErr || !gameRow) return json(404, { error: 'GAME_NOT_FOUND' });
        const game = gameRow as GameRow;

        let action: Action;
        let result: { state: GameState; events: GameEvent[] };
        try {
            action = buildServerAction(raw, seat, game.state);
            result = applyAction(game.state, action);
        } catch (e) {
            if (e instanceof RuleViolation) {
                return json(400, { error: e.code, code: e.code, message: e.message });
            }
            throw e;
        }

        const newVersion = game.version + 1;
        const deadline = result.state.phase === 'game_over'
            ? null
            : new Date(Date.now() + TURN_SECONDS * 1000).toISOString();

        const { data: updated, error: updErr } = await admin
            .from('games')
            .update({ state: result.state, version: newVersion, turn_deadline: deadline })
            .eq('id', game.id)
            .eq('version', game.version)
            .select('id');
        if (updErr) return json(500, { error: 'INTERNAL' });
        if (!updated || updated.length === 0) continue; // version conflict -> retry once

        const { error: logErr } = await admin.from('game_actions').insert({
            game_id: game.id,
            seq: newVersion,
            seat,
            action,
            events: result.events,
        });
        if (logErr) console.error('[game-action] action log insert failed:', logErr.message);

        await handleVictorySideEffects(admin, roomId, result.events);
        await broadcast(admin, roomId, 'action', {
            seq: newVersion,
            action,
            events: result.events,
            stateVersion: newVersion,
        });

        return json(200, {
            ok: true,
            seq: newVersion,
            version: newVersion,
            action,
            events: result.events,
            state: result.state,
        });
    }
    return json(409, { error: 'VERSION_CONFLICT' });
}

// ---------------------------------------------------------------------------
// Entry point
// ---------------------------------------------------------------------------

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

    let body: { roomId?: unknown; type?: unknown; action?: unknown };
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
        if (body.type === 'START_GAME') return await handleStartGame(admin, roomId, userId);
        return await handleGameAction(admin, roomId, userId, body.action);
    } catch (e) {
        console.error('[game-action] unhandled error:', e);
        return json(500, { error: 'INTERNAL' });
    }
});
