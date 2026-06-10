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
import { lobbyStore } from '../store/lobbyStore.ts';
import type { Action, CardDeck, GameEvent, GameState, TradeOffer } from '../core/types.ts';

declare global {
    interface Window {
        /** src/3d/dice_anim.js LEGACY-BRIDGE (not yet declared in facade.ts). */
        rollDiceAnimation?: (d1: number, d2: number, onDone: () => void) => void;
    }
}

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
    /** Echo of the applied action (server-injected dice/cardIndex included). */
    action?: Action;
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
        action: okBody.action,
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
 * Idempotent ingest of an authoritative (seq, action, events, state) tuple.
 * The same action arrives twice (invoke response + own broadcast); the seq
 * guard makes the second arrival a no-op.
 */
function ingest(seq: number, action: Action | undefined, events: GameEvent[], state: GameState): void {
    if (seq < expectedSeq) return; // already applied
    expectedSeq = seq + 1;
    present(action, events, state);
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
            present(action, events, result.state);
            return;
        } catch (e: unknown) {
            if (!(e instanceof RuleViolation)) throw e;
            console.error('[gameSync] local replay diverged, resyncing:', e.code);
        }
    }

    // Gap (missed broadcasts) or divergence: resync from the DB row. Events of
    // the skipped seqs are not re-logged — state correctness wins over log
    // completeness here. No dice animation either: the fetched state may be
    // several actions ahead of the broadcast that triggered the resync.
    const state = await fetchState();
    if (state) present(undefined, events, state);
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
 * // Implemented so far (see present()/syncVisuals()/driveTurnModal() below):
 * //   ROLL dice animation (d1/d2 echoed in response + broadcast), teleport
 * //   sync of tokens/ownership/houses via GameSave.restoreInto, and the
 * //   phase-driven turn modal.
 * // Future mapping of events -> 3D visuals (replacing the plain log lines):
 * //   MOVED          -> Game.movePlayerAnim-equivalent token hop along
 * //                     event.path (the rules core already provides the full
 * //                     tile path + passedGo) instead of the teleport.
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
            case 'CARD': // auto-drawn online (driveTurnModal) — surface the text
                window.logMsg?.(`🃏 ${ev.deck === 'chance' ? 'Cơ Hội' : 'Khí Vận'}: ${ev.text}`);
                break;
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
// Presentation — 3D/panel sync + turn modal (the online UX driver)
// ---------------------------------------------------------------------------

/** Delay before auto-sending DRAW_CARD so "Đang rút thẻ..." is visible. */
const AUTO_DRAW_DELAY_MS = 900;
/** Pending auto-DRAW_CARD timer (one at a time; re-armed per driveTurnModal). */
let autoDrawTimer: number | null = null;
/** expectedSeq at the moment DRAW_CARD was auto-sent (prevents double-send). */
let autoDrawSentForSeq = -1;

/**
 * Teleport-accurate materialization of an authoritative snapshot into the 3D
 * scene + legacy panels: token positions, ownership strips, houses, money,
 * currentPlayerIndex. Reuses GameSave.restoreInto (persistence.js) — GameState
 * is a strict superset of the persistence snapshot.
 *
 * restoreInto unconditionally emits a "Đã khôi phục ván chơi" toast + log line
 * (it was written for the save-file flow); those are suppressed here by
 * temporarily clearing window.Toast/window.logMsg for the synchronous call —
 * a live sync is not a save restore, and the spam would fire on EVERY action.
 */
function syncVisuals(state: GameState): void {
    if ((window.players?.length ?? 0) === 0) return; // game not booted yet
    const savedToast = window.Toast;
    const savedLogMsg = window.logMsg;
    // Cast: the ui.js expando assignment merges logMsg as a REQUIRED Window
    // property, so plain `= undefined` does not typecheck despite facade.ts
    // declaring it optional.
    const mutableWindow = window as { Toast?: unknown; logMsg?: unknown };
    try {
        mutableWindow.Toast = undefined;
        mutableWindow.logMsg = undefined;
        window.GameSave?.restoreInto({ ...state, mode: 'online' });
    } catch (e: unknown) {
        console.error('[gameSync] restoreInto failed:', e);
    } finally {
        mutableWindow.Toast = savedToast;
        mutableWindow.logMsg = savedLogMsg;
    }
    window.updatePlayerUI?.();
}

/**
 * Shows the phase-appropriate action modal for the local seat.
 *
 * Matrix (me = state.currentPlayerIndex === lobbyStore.mySeat):
 *   game_over            -> '🏆 KẾT THÚC' / '<winner> chiến thắng!'    []
 *   !me (any phase)      -> 'Lượt của <name>' / 'Đang chờ đối thủ...'  []
 *   me & await_roll      -> 'Lượt của bạn'    / roll prompt            ['roll']
 *   me & await_buy_..    -> 'Mua đất?'        / '<tile> — giá <price>' ['buy','skip']
 *   me & await_card      -> 'Rút thẻ'         / 'Đang rút thẻ...'      []  + AUTO-SEND
 *   me & await_end       -> 'Lượt đã xong'    / end prompt             ['end']
 *
 * await_card AUTO-SEND: there is no legacy 'draw' button (ModalButtonKind is
 * roll|buy|skip|end|build-menu and ui.js resets exactly those ids), and the
 * server picks the cardIndex anyway — so DRAW_CARD is sent automatically
 * after AUTO_DRAW_DELAY_MS while a button-less waiting modal shows. The
 * (timer, sent-seq) pair makes re-presentations of the same state (boot +
 * broadcast + resync) fire the send exactly once.
 *
 * Goes through window.showModal (the ActionModal facade override), which also
 * syncs the legacy #btn-* hidden classes — keyboard shortcuts keep working.
 */
function driveTurnModal(state: GameState): void {
    if ((window.players?.length ?? 0) === 0) return; // game not booted yet

    if (autoDrawTimer !== null) {
        window.clearTimeout(autoDrawTimer);
        autoDrawTimer = null;
    }

    if (state.phase === 'game_over') {
        const winnerName =
            typeof state.winner === 'number' ? (state.players[state.winner]?.name ?? '') : '';
        window.showModal?.('🏆 KẾT THÚC', `${winnerName} chiến thắng!`.trim(), []);
        return;
    }

    const mySeat = lobbyStore.getState().mySeat;
    const me = mySeat !== null && state.currentPlayerIndex === mySeat;
    const current = state.players[state.currentPlayerIndex];

    if (!me) {
        window.showModal?.(`Lượt của ${current?.name ?? '?'}`, 'Đang chờ đối thủ...', []);
        return;
    }

    switch (state.phase) {
        case 'await_roll':
            window.showModal?.(
                'Lượt của bạn',
                current?.inJail
                    ? 'Bạn đang ở tù — đổ xúc xắc để thử thoát.'
                    : 'Mời bạn đổ xúc xắc để di chuyển.',
                ['roll'],
            );
            break;
        case 'await_buy_decision': {
            const pos = current?.position ?? 0;
            const def = BOARD[pos];
            window.showModal?.(
                'Mua đất?',
                `${def?.name ?? `Ô ${pos}`} — giá ${formatMoney(def?.price ?? 0)}`,
                ['buy', 'skip'],
            );
            break;
        }
        case 'await_card':
            window.showModal?.('Rút thẻ', 'Bạn dừng ở ô thẻ — đang rút thẻ...', []);
            if (autoDrawSentForSeq !== expectedSeq) {
                autoDrawTimer = window.setTimeout(() => {
                    autoDrawTimer = null;
                    autoDrawSentForSeq = expectedSeq;
                    window._onlineSend?.({ type: 'DRAW_CARD' });
                }, AUTO_DRAW_DELAY_MS);
            }
            break;
        case 'await_end':
            window.showModal?.('Lượt đã xong', 'Kết thúc lượt của bạn.', ['end']);
            break;
    }
}

/**
 * SINGLE presentation entry for every applied action: own sendAction
 * responses, in-order broadcasts, and resyncs all land here.
 *
 * ROLL actions (own response AND others' broadcasts both echo d1/d2) play the
 * shared dice animation first so every client SEES the dice, then sync; an
 * animation failure must never block state sync (try/catch -> direct sync).
 */
function present(action: Action | undefined, events: GameEvent[], state: GameState): void {
    applyRemote(events, state);
    const finish = (): void => {
        // Re-read latestState: another action may have been applied while the
        // dice animation played — never re-sync to a stale closure snapshot.
        const newest = latestState ?? state;
        syncVisuals(newest);
        driveTurnModal(newest);
    };
    if (
        action?.type === 'ROLL' &&
        typeof window.rollDiceAnimation === 'function' &&
        !window.isAnimating &&
        (window.players?.length ?? 0) > 0
    ) {
        try {
            window.SoundFX?.roll();
            window.rollDiceAnimation(action.d1, action.d2, finish);
            return;
        } catch (e: unknown) {
            console.error('[gameSync] dice animation failed, syncing directly:', e);
            window.isAnimating = false; // dice_anim sets it before it can throw
        }
    }
    finish();
}

/**
 * Online mode never runs landOnTile/checkEndTurnPhase, so the legacy
 * #btn-buy/#btn-skip/#btn-end nodes (which the React ActionModal proxy-clicks)
 * have NO onclick on a fresh page. Bind them straight to the _onlineSend hook
 * (BUY's tileId is resolved by the hook). #btn-roll is NOT touched: game.js
 * _bindRollButton already routes it online and owns the solo behavior.
 * Solo games rebind these onclicks in landOnTile/checkEndTurnPhase, and the
 * _gameMode guard makes these handlers inert outside online mode.
 */
function bindOnlineModalButtons(): void {
    const bindings: ReadonlyArray<[string, () => void]> = [
        ['btn-buy', () => window._onlineSend?.({ type: 'BUY' })],
        ['btn-skip', () => window._onlineSend?.({ type: 'SKIP_BUY' })],
        ['btn-end', () => window._onlineSend?.({ type: 'END_TURN' })],
    ];
    for (const [id, send] of bindings) {
        const btn = document.getElementById(id);
        if (!btn) continue;
        btn.onclick = () => {
            if (window._gameMode !== 'online') return;
            send();
        };
    }
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
    joinRoomChannel(roomId, () => {
        // (Re)joined: seed/refresh from the DB row. Pre-boot this only stores
        // state (syncVisuals/driveTurnModal no-op until window.players exists;
        // initOnlineUi covers the boot); post-reconnect it heals the UI.
        void fetchState().then((state) => {
            if (state) {
                syncVisuals(state);
                driveTurnModal(state);
            }
        });
    });
}

/**
 * Unified online-UI bootstrap, called by the MenuScreens online boot AFTER
 * Game.init has built players/meshes and the authoritative state arrived:
 * binds the online onclick handlers of the legacy modal buttons, materializes
 * the snapshot into the 3D scene/panels, and shows the first turn modal.
 */
function initOnlineUi(state: GameState): void {
    bindOnlineModalButtons();
    syncVisuals(state);
    driveTurnModal(state);
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
        ingest(res.seq, res.action, res.events ?? [], res.state);
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
    autoDrawSentForSeq = -1;
    if (autoDrawTimer !== null) {
        window.clearTimeout(autoDrawTimer);
        autoDrawTimer = null;
    }
}

/** Latest authoritative state (null before connect/start completes). */
function getLatestState(): GameState | null {
    return latestState;
}

export const GameSync = {
    startOnlineGame,
    connect,
    initOnlineUi,
    sendAction,
    disconnect,
    getLatestState,
} as const;

export type GameSyncApi = typeof GameSync;
