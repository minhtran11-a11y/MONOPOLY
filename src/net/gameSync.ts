/**
 * src/net/gameSync.ts
 *
 * UI-framework-free online game driver.
 *
 * Wire contract (coded against supabase/functions/game-action/index.ts):
 *   Request  POST game-action  { roomId, type: 'START_GAME' }
 *            POST game-action  { roomId, action: <ClientAction> }
 *   200      { ok: true, seq, version, action?, events?, state }
 *   4xx/5xx  { error: <code>, code?, message? }   (RuleViolation -> 400 with
 *            error === code === RuleViolation.code)
 *   Broadcast: shared channel `room:{roomId}`, event 'action',
 *            payload { seq, action, events, stateVersion, forced? }
 *            (claim-timeout emits the same shape with forced: true).
 *
 * Ordering: `expectedSeq` tracks the next games.version we expect. In-order
 * broadcasts are applied OPTIMISTICALLY by replaying the echoed server action
 * through the same deterministic rules core the server used; any gap or
 * replay mismatch falls back to fetching games.state from the DB (the DB row
 * is committed before the broadcast is sent, so a post-broadcast select is
 * always >= the broadcast seq).
 *
 * Channel ownership: this module attaches a broadcast listener to the SHARED
 * `room:{roomId}` channel (src/net/supabaseClient.ts registry). It never
 * tears the channel down — lobbyStore.reset() is the single owner.
 */

import { FunctionsHttpError } from '@supabase/supabase-js';
import {
    supabase,
    hasSupabase,
    getRoomChannel,
    joinRoomChannel,
} from './supabaseClient.ts';
import { applyAction, RuleViolation } from '../core/rules_core.ts';
import { BOARD } from '../core/board.ts';
import type { Action, CardDeck, GameEvent, GameState, TradeOffer } from '../core/types.ts';

// ---------------------------------------------------------------------------
// Public types
// ---------------------------------------------------------------------------

/**
 * Client-side action shape: the rules-core Action WITHOUT server-generated
 * fields. game-action overwrites playerId/from with the caller's seat, rolls
 * dice for ROLL, and draws cardIndex for DRAW_CARD (deck optional — derived
 * from the tile under the player when omitted).
 */
export type ClientAction =
    | { type: 'ROLL' }
    | { type: 'BUY'; tileId: number }
    | { type: 'SKIP_BUY' }
    | { type: 'BUILD'; tileId: number }
    | { type: 'TOGGLE_MORTGAGE'; tileId: number }
    | { type: 'DRAW_CARD'; deck?: CardDeck }
    | { type: 'USE_JAIL_CARD' }
    | { type: 'END_TURN' }
    | { type: 'DECLARE_BANKRUPTCY' }
    | { type: 'TRADE_EXECUTE'; to: number; give: TradeOffer; get: TradeOffer };

export interface SendResult {
    ok: boolean;
    /** Error code on failure (RuleViolation.code, transport, or server code). */
    code?: string;
    /** Authoritative seq of the accepted action. */
    seq?: number;
    /** Events produced by the accepted action. */
    events?: GameEvent[];
    /** Authoritative post-action state. */
    state?: GameState;
}

/** 200 body of game-action (action/events absent on START_GAME). */
interface ServerOkBody {
    ok: true;
    seq: number;
    version: number;
    action?: Action;
    events?: GameEvent[];
    state: GameState;
}

/** Broadcast payload of event 'action' on `room:{roomId}`. */
interface ActionBroadcastPayload {
    seq: number;
    action: Action;
    events: GameEvent[];
    stateVersion: number;
    forced?: boolean;
}

// ---------------------------------------------------------------------------
// Module state
// ---------------------------------------------------------------------------

let currentRoomId: string | null = null;
let latestState: GameState | null = null;
/** Next games.version we expect to apply; 0 means "not synced yet". */
let expectedSeq = 0;

// ---------------------------------------------------------------------------
// Edge Function invocation
// ---------------------------------------------------------------------------

async function invokeGameAction(body: Record<string, unknown>): Promise<SendResult> {
    if (!hasSupabase || !supabase) return { ok: false, code: 'NOT_CONFIGURED' };

    const { data, error } = await supabase.functions.invoke('game-action', { body });
    if (error) {
        // Non-2xx: game-action returns { error: <code>, code?, message? }.
        if (error instanceof FunctionsHttpError) {
            try {
                const errBody = await error.context.json() as { error?: string; code?: string };
                return { ok: false, code: errBody.code ?? errBody.error ?? 'INTERNAL' };
            } catch {
                return { ok: false, code: 'INTERNAL' };
            }
        }
        return { ok: false, code: 'NETWORK_ERROR' };
    }

    const okBody = data as ServerOkBody;
    return {
        ok: true,
        seq: okBody.seq,
        events: okBody.events ?? [],
        state: okBody.state,
    };
}

// ---------------------------------------------------------------------------
// State sync
// ---------------------------------------------------------------------------

/** Authoritative resync: select games.state/version by room_id. */
async function fetchState(): Promise<GameState | null> {
    if (!supabase || !currentRoomId) return null;
    const { data, error } = await supabase
        .from('games')
        .select('state, version')
        .eq('room_id', currentRoomId)
        .maybeSingle();
    if (error || !data) {
        console.error('[gameSync] fetchState failed:', error?.message ?? 'no game row');
        return null;
    }
    const row = data as { state: GameState; version: number };
    latestState = row.state;
    expectedSeq = row.version + 1;
    return row.state;
}

/**
 * Idempotent ingest of an authoritative (seq, events, state) triple. The same
 * action arrives twice (invoke response + own broadcast); the seq guard makes
 * the second arrival a no-op.
 */
function ingest(seq: number, events: GameEvent[], state: GameState): void {
    if (seq < expectedSeq) return; // already applied
    expectedSeq = seq + 1;
    applyRemote(events, state);
}

async function onActionBroadcast(payload: ActionBroadcastPayload): Promise<void> {
    const { seq, action, events } = payload;
    if (seq < expectedSeq) return; // duplicate (e.g. our own echoed action)

    if (seq === expectedSeq && latestState) {
        // In-order: replay the echoed server action (dice/cardIndex included)
        // through the shared deterministic rules core — no DB round-trip.
        try {
            const result = applyAction(latestState, action);
            expectedSeq = seq + 1;
            applyRemote(events, result.state);
            return;
        } catch (e: unknown) {
            if (!(e instanceof RuleViolation)) throw e;
            console.error('[gameSync] local replay diverged, resyncing:', e.code);
        }
    }

    // Gap (missed broadcasts) or divergence: resync from the DB row. Events of
    // the skipped seqs are not re-logged — state correctness wins over log
    // completeness here.
    const state = await fetchState();
    if (state) applyRemote(events, state);
}

// ---------------------------------------------------------------------------
// applyRemote — seam between authoritative events and the legacy UI
// ---------------------------------------------------------------------------

const formatMoney = (n: number): string =>
    window.Utils?.formatMoney(n) ?? `$${n.toLocaleString('vi-VN')}`;

const playerName = (state: GameState, id: number): string =>
    state.players[id]?.name ?? `Người chơi ${id + 1}`;

const tileName = (tileId: number): string => BOARD[tileId]?.name ?? `Ô ${tileId}`;

/**
 * Emits Vietnamese log lines mirroring the solo-mode strings (game.js) for
 * the trivial events, then refreshes the legacy HUD.
 *
 * // TODO(ANIMATION-MAP): this is a SEAM, not the final presentation layer.
 * // Future mapping of events -> 3D visuals (replacing the plain log lines):
 * //   MOVED          -> Game.movePlayerAnim-equivalent token hop along
 * //                     event.path (the rules core already provides the full
 * //                     tile path + passedGo), preceded by rollDiceAnimation
 * //                     using the d1/d2 echoed in the broadcast ROLL action.
 * //   BOUGHT/BUILT   -> ownership strip + update3DHouses(tileId).
 * //   PAID           -> Anim3D.moneyFly between the two player meshes.
 * //   WENT_TO_JAIL   -> jail teleport + SoundFX.jail().
 * //   VICTORY        -> Cinematics.playWinning + confetti (see handleVictory).
 * // Events must be queued and played sequentially (animation lock), exactly
 * // like the solo engine's isAnimating gate, before updatePlayerUI() runs.
 */
function applyRemote(events: GameEvent[], state: GameState): void {
    latestState = state;

    for (const ev of events) {
        switch (ev.type) {
            case 'MOVED': // mirrors game.js:236
                window.logMsg?.(`📍 ${playerName(state, ev.playerId)} đã dừng tại: ${tileName(ev.to)}`);
                break;
            case 'PAID': // mirrors game.js:292 (rent) / :308 (bank)
                if (ev.to === 'bank') {
                    window.logMsg?.(`💸 ${playerName(state, ev.from)} đã nộp ${formatMoney(ev.amount)}.`);
                } else {
                    window.logMsg?.(
                        `💸 ${playerName(state, ev.from)} đã trả ${formatMoney(ev.amount)} tiền thuê cho ${playerName(state, ev.to)}.`,
                    );
                }
                break;
            case 'BOUGHT': { // mirrors game.js:430
                const ownerId = state.tiles[ev.tileId]?.owner;
                const owner = typeof ownerId === 'number' ? playerName(state, ownerId) : '???';
                window.logMsg?.(`🏡 ${owner} đã mua ${tileName(ev.tileId)}.`);
                break;
            }
            case 'TURN_ENDED':
                window.logMsg?.(`▶️ Đến lượt ${playerName(state, ev.nextPlayerId)}.`);
                break;
            case 'VICTORY': // mirrors game.js handleVictory toast
                window.logMsg?.(`🏆 ${playerName(state, ev.playerId)} chiến thắng!`);
                break;
            default:
                // Remaining events (SALARY, CARD, JAIL, BUILT, ...) are handled
                // by the future animation map — no log spam meanwhile.
                break;
        }
    }

    window.updatePlayerUI?.();
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Host-only: starts the game for a lobby room. On success the server
 * broadcasts 'started' (lobbyStore flips to in_game) and this client seeds
 * its local state from the response.
 */
async function startOnlineGame(roomId: string): Promise<SendResult> {
    const res = await invokeGameAction({ roomId, type: 'START_GAME' });
    if (res.ok && res.state && typeof res.seq === 'number') {
        currentRoomId = roomId;
        latestState = res.state;
        expectedSeq = res.seq + 1; // server returns seq 0 for START_GAME
    }
    return res;
}

/**
 * Attaches the 'action' broadcast listener to the shared room channel and
 * seeds local state from the DB. Call after (or alongside) the lobby
 * subscription; broadcast listeners may attach post-join (client-matched).
 */
function connect(roomId: string): void {
    if (!hasSupabase) return;
    currentRoomId = roomId;
    const channel = getRoomChannel(roomId);
    if (!channel) return;

    channel.on('broadcast', { event: 'action' }, (msg) => {
        void onActionBroadcast(msg.payload as ActionBroadcastPayload);
    });
    joinRoomChannel(roomId, () => { void fetchState(); });
}

/**
 * Sends a player action to the authoritative referee. RuleViolations come
 * back as { ok: false, code } (e.g. 'NOT_YOUR_TURN'); accepted actions are
 * applied immediately from the response (the echoed broadcast then no-ops).
 */
async function sendAction(action: ClientAction): Promise<SendResult> {
    if (!currentRoomId) return { ok: false, code: 'NOT_CONNECTED' };
    const res = await invokeGameAction({ roomId: currentRoomId, action });
    if (res.ok && res.state && typeof res.seq === 'number') {
        ingest(res.seq, res.events ?? [], res.state);
    }
    return res;
}

/**
 * Forgets local game state. Does NOT tear down the realtime channel —
 * lobbyStore.reset() owns that (shared-channel contract in supabaseClient.ts).
 */
function disconnect(): void {
    currentRoomId = null;
    latestState = null;
    expectedSeq = 0;
}

/** Latest authoritative state (null before connect/start completes). */
function getLatestState(): GameState | null {
    return latestState;
}

export const GameSync = {
    startOnlineGame,
    connect,
    sendAction,
    disconnect,
    getLatestState,
} as const;

export type GameSyncApi = typeof GameSync;
