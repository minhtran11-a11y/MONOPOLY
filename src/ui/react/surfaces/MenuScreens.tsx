/**
 * MenuScreens — ONLINE lobby flow (React overlay over the legacy menu).
 *
 * The legacy MenuManager (src/ui/menu.js) keeps owning screen navigation,
 * the bot flow and launchGame. This surface adds ONLY the online path:
 *
 *   1) On mount (and only when hasSupabase): un-inert the #mode-online-trigger
 *      card in #screen-modes (menu.js intentionally left it without a handler)
 *      and bind a click handler that opens the React lobby overlay.
 *   2) Overlay screens are driven by lobbyStore.phase:
 *        'idle'     -> name/color form + TẠO PHÒNG / VÀO PHÒNG (6-char code)
 *        'lobby'    -> room code + copy, 4-seat grid, SẴN SÀNG toggle,
 *                      BẮT ĐẦU (server enforces host-only), RỜI PHÒNG
 *        'starting' -> spinner while the host's START_GAME round-trips
 *        'in_game'  -> ONLINE BOOT (once): close overlay, GameSync.connect,
 *                      install window._onlineSend (game.js ONLINE-MODE guards
 *                      route button presses through it), MenuManager.launchGame
 *                      (n, 'online'), then after the launch layer-swap window
 *                      GameSync.initOnlineUi(authoritative state) to materialize
 *                      positions/money/ownership in the 3D scene + panels and
 *                      show the phase-driven turn modal.
 *
 * Error contract: lobbyStore.error and gameSync SendResult.code both surface
 * as "CODE — thông điệp" lines (codes stay machine-matchable).
 *
 * // TODO(ANIMATION-MAP): remote actions now drive dice + teleport sync + turn
 * // modals (gameSync present/syncVisuals/driveTurnModal); per-event 3D
 * // playback (token hop along MOVED.path, moneyFly, ...) is still future
 * // work — see the seam comment in src/net/gameSync.ts.
 */

import { useCallback, useEffect, useRef, useState } from 'react';
import { lobbyStore, useLobbyStore } from '../../../store/lobbyStore.ts';
import type { LobbyMember } from '../../../store/lobbyStore.ts';
import { uiStore } from '../../../store/uiStore.ts';
import { gameViewStore } from '../../../store/gameViewStore.ts';
import { GameSync } from '../../../net/gameSync.ts';
import type { ClientAction } from '../../../net/gameSync.ts';
import { hasSupabase } from '../../../net/supabaseClient.ts';
import type { GameState } from '../../../core/types.ts';

// ---------------------------------------------------------------------------
// window._onlineSend — the seam game.js ONLINE-MODE guards call into.
// game.js sends BUY without tileId (it cannot know the authoritative
// position); the hook fills it in from GameSync.getLatestState().
// ---------------------------------------------------------------------------

/** ClientAction, except BUY may omit tileId (resolved from server state). */
export type OnlineButtonAction = ClientAction | { type: 'BUY'; tileId?: number };

declare global {
    interface Window {
        /** Installed by the MenuScreens online boot; see game.js // ONLINE-MODE guards. */
        _onlineSend?: (action: OnlineButtonAction) => void;
    }
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

/** Mirrors PLAYER_HEX in src/core/constants.js (engine token palette). */
const PLAYER_SWATCHES: readonly string[] = ['#ef4444', '#facc15', '#3b82f6', '#22c55e'];

const DEFAULT_NAME = 'Người chơi';
const MAX_NAME_LENGTH = 32;
const ROOM_CODE_LENGTH = 6;
const SEAT_COUNT = 4;
/** room_players.token_kind — server defaults to 'pawn'; 3D pawns are uniform. */
const TOKEN_KIND = 'pawn';

/** menu.js launchGame swaps layers + runs Game.init inside a 700 ms timeout. */
const LAUNCH_LAYER_SWAP_MS = 700;
/** Polling for the authoritative state after launch (guests fetch async). */
const STATE_POLL_TRIES = 15;
const STATE_POLL_INTERVAL_MS = 400;

const INERT_TRIGGER_CLASSES = ['opacity-60', 'cursor-not-allowed', 'grayscale'] as const;

/** Vietnamese messages for START_GAME failure codes (game-action contract). */
const START_ERROR_MESSAGES: Record<string, string> = {
    NOT_HOST: 'Chỉ chủ phòng mới có thể bắt đầu',
    NOT_ENOUGH_PLAYERS: 'Cần ít nhất 2 người chơi',
    PLAYERS_NOT_READY: 'Tất cả người chơi phải sẵn sàng',
    ALREADY_STARTED: 'Phòng đã bắt đầu rồi',
    ROOM_NOT_FOUND: 'Không tìm thấy phòng',
    GAME_EXISTS: 'Ván chơi đã được tạo',
    NOT_CONFIGURED: 'Chưa cấu hình Supabase',
    NETWORK_ERROR: 'Lỗi kết nối mạng',
};

function startErrorText(code: string): string {
    return `${code} — ${START_ERROR_MESSAGES[code] ?? 'Không thể bắt đầu ván chơi'}`;
}

// ---------------------------------------------------------------------------
// Online boot (runs ONCE per page life when lobby phase reaches 'in_game')
// ---------------------------------------------------------------------------

function installOnlineSendHook(): void {
    window._onlineSend = (action: OnlineButtonAction): void => {
        let resolved: ClientAction;
        if (action.type === 'BUY' && typeof action.tileId !== 'number') {
            const state = GameSync.getLatestState();
            const current = state?.players[state.currentPlayerIndex];
            resolved = { type: 'BUY', tileId: current?.position ?? 0 };
        } else {
            resolved = action as ClientAction;
        }
        void GameSync.sendAction(resolved).then((res) => {
            if (!res.ok) {
                // RuleViolation codes (NOT_YOUR_TURN, ...) or transport codes.
                window.Toast?.show(res.code ?? 'INTERNAL', { type: 'error' });
            }
        });
    };
}

async function waitForAuthoritativeState(): Promise<GameState | null> {
    for (let i = 0; i < STATE_POLL_TRIES; i++) {
        const state = GameSync.getLatestState();
        if (state && (window.players?.length ?? 0) > 0) return state;
        await new Promise((resolve) => { window.setTimeout(resolve, STATE_POLL_INTERVAL_MS); });
    }
    return GameSync.getLatestState();
}

/**
 * Overwrites the locally generated player identities (engine.js createPlayers
 * defaults: "Bạn (P1)", PLAYER_HEX order) with the authoritative lobby seats.
 * Engine objects are mutable by design (legacy interop — same approach as
 * GameSave.restoreInto).
 */
function syncOnlineIdentities(state: GameState): void {
    const players = window.players ?? [];
    for (const sp of state.players) {
        const p = players[sp.id];
        if (!p) continue;
        p.name = sp.name;
        p.isBot = sp.isBot; // always false for online seats
        p.colorHex = sp.colorHex;
    }
    // TODO(ANIMATION-MAP): re-tint the 3D token meshes + owner strips to the
    // lobby colors — createPlayers built them from the default PLAYER_HEX
    // palette and restoreInto does not touch materials.
    window.updatePlayerUI?.();
}

/**
 * THE online boot sequence (see file header). `closeOverlay` is the only
 * React-side effect; everything else talks to the legacy window facade.
 */
async function runOnlineBoot(closeOverlay: () => void): Promise<void> {
    const { roomId, members } = lobbyStore.getState();
    if (!roomId) return;

    closeOverlay();

    // 1) Attach the 'action' broadcast listener + seed state from games row.
    GameSync.connect(roomId);
    installOnlineSendHook();

    // 2) Launch the legacy 3D game shell in online mode. Game.init clears the
    //    legacy DOM log directly — mirror that into the React log store.
    uiStore.getState().clearLog();
    const seatCount = Math.max(2, members.length);
    try {
        await window.MenuManager?.launchGame(seatCount, 'online');
    } catch (e: unknown) {
        console.error('[MenuScreens] launchGame failed:', e);
        window.Toast?.show('LAUNCH_FAILED — Không thể khởi động ván chơi', { type: 'error' });
        return;
    }

    // 3) launchGame swaps layers + runs Game.init inside its own 700 ms
    //    timeout; wait it out, then materialize the authoritative snapshot.
    window.setTimeout(() => {
        void (async () => {
            const state = await waitForAuthoritativeState();
            if (!state) {
                window.Toast?.show('SYNC_TIMEOUT — Chưa nhận được dữ liệu ván chơi', { type: 'error' });
                return;
            }
            // Unified online-UI bootstrap (gameSync owns it — same code path
            // broadcasts use): binds online onclicks on the legacy modal
            // buttons, materializes the snapshot (3D tokens/ownership/money
            // via GameSave.restoreInto) and shows the first turn modal.
            GameSync.initOnlineUi(state);
            syncOnlineIdentities(state);
            gameViewStore.getState().refreshFromWindow();
            window.logMsg?.(`🌐 Ván chơi online đã bắt đầu — đến lượt ${state.players[state.currentPlayerIndex]?.name ?? '???'}.`);
            // TODO(ANIMATION-MAP): remote MOVED events still teleport (no
            // token hop along event.path yet) — see gameSync.applyRemote.
        })();
    }, LAUNCH_LAYER_SWAP_MS + 200);
}

// ---------------------------------------------------------------------------
// Small presentational pieces
// ---------------------------------------------------------------------------

interface SeatCellProps {
    seat: number;
    member: LobbyMember | undefined;
    isMe: boolean;
}

function SeatCell({ seat, member, isMe }: SeatCellProps) {
    if (!member) {
        return (
            <div className="glass-panel !rounded-2xl p-4 flex flex-col items-center justify-center gap-2 min-h-[7rem] border-dashed !border-gold-600/25 opacity-60">
                <div className="w-3 h-3 rounded-full bg-gold-600/40" />
                <span className="text-gold-300/55 text-xs font-bold uppercase tracking-widest">Đang chờ...</span>
            </div>
        );
    }
    return (
        <div className={`glass-panel !rounded-2xl p-4 flex flex-col items-center justify-center gap-2 min-h-[7rem] ${isMe ? '!border-gold-400/70' : ''}`}>
            <div className="flex items-center gap-2">
                <span
                    className="w-4 h-4 rounded-full border border-gold-300/40 shadow"
                    style={{ backgroundColor: member.colorHex }}
                />
                <span className="text-ivory font-black text-sm truncate max-w-[8rem]">
                    {member.name}{isMe ? ' (bạn)' : ''}
                </span>
                <span
                    title={member.online ? 'Đang trực tuyến' : 'Mất kết nối'}
                    className={`w-2 h-2 rounded-full ${member.online ? 'bg-jade-400' : 'bg-gold-600/40'}`}
                />
            </div>
            <span className={`text-[10px] font-black uppercase tracking-widest ${member.isReady ? 'text-jade-400' : 'text-gold-400'}`}>
                {member.isReady ? '✓ Sẵn sàng' : 'Chưa sẵn sàng'}
            </span>
            <span className="text-gold-300/45 text-[9px] font-bold uppercase tracking-widest">Ghế {seat + 1}</span>
        </div>
    );
}

function ErrorLine({ text }: { text: string | null }) {
    if (!text) return null;
    return (
        <p className="text-terracotta text-xs font-bold text-center break-words" role="alert">
            ⚠️ {text}
        </p>
    );
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export default function MenuScreens() {
    const phase = useLobbyStore((s) => s.phase);
    const code = useLobbyStore((s) => s.code);
    const members = useLobbyStore((s) => s.members);
    const myUserId = useLobbyStore((s) => s.myUserId);
    const lobbyError = useLobbyStore((s) => s.error);

    const [overlayOpen, setOverlayOpen] = useState(false);
    const [name, setName] = useState(DEFAULT_NAME);
    const [colorHex, setColorHex] = useState<string>(PLAYER_SWATCHES[0]);
    const [joinCode, setJoinCode] = useState('');
    const [busy, setBusy] = useState(false);
    const [startError, setStartError] = useState<string | null>(null);
    const [copied, setCopied] = useState(false);

    const bootedRef = useRef(false);

    // --- 1) Un-inert + bind the legacy #mode-online-trigger card ------------
    useEffect(() => {
        const card = document.getElementById('mode-online-trigger');
        if (!card) return;
        if (!hasSupabase) return; // leave the card inert ("SẮP RA MẮT")

        card.classList.remove(...INERT_TRIGGER_CLASSES);
        card.classList.add('cursor-pointer', 'hover:border-gold-400');
        const badge = card.querySelector('div.bg-son-600');
        if (badge) badge.textContent = 'MỚI';
        const subtitle = card.querySelector('p');
        if (subtitle) subtitle.textContent = 'Chơi cùng bạn bè qua mạng';

        const onClick = (): void => {
            window.SoundFX?.click();
            setOverlayOpen(true);
        };
        card.addEventListener('click', onClick);
        return () => { card.removeEventListener('click', onClick); };
    }, []);

    // --- 4) ONLINE BOOT once when the 'started' broadcast lands -------------
    useEffect(() => {
        if (phase !== 'in_game' || bootedRef.current) return;
        bootedRef.current = true;
        void runOnlineBoot(() => setOverlayOpen(false));
    }, [phase]);

    // --- Escape closes the overlay (room membership is kept; reopening the
    //     online card returns straight to the lobby screen) ------------------
    const closable = overlayOpen && phase !== 'starting' && phase !== 'in_game';
    useEffect(() => {
        if (!closable) return;
        const onKey = (e: KeyboardEvent): void => {
            if (e.key === 'Escape') setOverlayOpen(false);
        };
        window.addEventListener('keydown', onKey);
        return () => { window.removeEventListener('keydown', onKey); };
    }, [closable]);

    // --- Handlers ------------------------------------------------------------
    const handleCreate = useCallback(async () => {
        if (busy) return;
        window.SoundFX?.click();
        setBusy(true);
        await lobbyStore.getState().createRoom(name.trim() || DEFAULT_NAME, colorHex, TOKEN_KIND);
        setBusy(false);
    }, [busy, name, colorHex]);

    const handleJoin = useCallback(async () => {
        if (busy || joinCode.trim().length !== ROOM_CODE_LENGTH) return;
        window.SoundFX?.click();
        setBusy(true);
        await lobbyStore.getState().joinRoom(joinCode, name.trim() || DEFAULT_NAME, colorHex, TOKEN_KIND);
        setBusy(false);
    }, [busy, joinCode, name, colorHex]);

    const handleLeave = useCallback(async () => {
        if (busy) return;
        window.SoundFX?.click();
        setBusy(true);
        await lobbyStore.getState().leaveRoom();
        setBusy(false);
        setStartError(null);
    }, [busy]);

    const myMember = members.find((m) => m.userId === myUserId);

    const handleReadyToggle = useCallback(async () => {
        if (busy || !myMember) return;
        window.SoundFX?.click();
        await lobbyStore.getState().setReady(!myMember.isReady);
    }, [busy, myMember]);

    const allReady = members.length >= 2 && members.every((m) => m.isReady);

    const handleStart = useCallback(async () => {
        const { roomId, setPhase } = lobbyStore.getState();
        if (busy || !roomId) return;
        window.SoundFX?.click();
        setStartError(null);
        setBusy(true);
        setPhase('starting');
        const res = await GameSync.startOnlineGame(roomId);
        setBusy(false);
        if (!res.ok) {
            // Roll back so the lobby UI returns (the server rejected START).
            lobbyStore.getState().setPhase('lobby');
            setStartError(startErrorText(res.code ?? 'INTERNAL'));
            return;
        }
        // Host fast-path: the 'started' broadcast also flips this (idempotent).
        lobbyStore.getState().setPhase('in_game');
    }, [busy]);

    const handleCopyCode = useCallback(async () => {
        if (!code) return;
        try {
            await navigator.clipboard.writeText(code);
            setCopied(true);
            window.setTimeout(() => setCopied(false), 1500);
        } catch {
            window.Toast?.show('Không thể sao chép mã phòng', { type: 'warn' });
        }
    }, [code]);

    if (!overlayOpen || phase === 'in_game') return null;

    return (
        <div className="fixed inset-0 z-[60] flex items-center justify-center bg-lac-900/80 backdrop-blur-sm p-4">
            <div
                role="dialog"
                aria-modal="true"
                aria-label="Chơi Online"
                className="glass-panel deco-frame relative w-full max-w-xl p-8 md:p-10 flex flex-col gap-6 text-ivory max-h-[90vh] overflow-y-auto"
            >
                {closable && (
                    <button
                        type="button"
                        onClick={() => { window.SoundFX?.click(); setOverlayOpen(false); }}
                        aria-label="Đóng"
                        className="absolute top-4 right-5 text-gold-300/60 hover:text-gold-300 text-xl font-black transition-colors"
                    >
                        ✕
                    </button>
                )}

                {phase === 'idle' && (
                    <IdleScreen
                        name={name}
                        setName={setName}
                        colorHex={colorHex}
                        setColorHex={setColorHex}
                        joinCode={joinCode}
                        setJoinCode={setJoinCode}
                        busy={busy}
                        error={lobbyError}
                        onCreate={() => { void handleCreate(); }}
                        onJoin={() => { void handleJoin(); }}
                    />
                )}

                {phase === 'lobby' && (
                    <LobbyScreen
                        code={code}
                        copied={copied}
                        members={members}
                        myMember={myMember}
                        allReady={allReady}
                        busy={busy}
                        lobbyError={lobbyError}
                        startError={startError}
                        onCopy={() => { void handleCopyCode(); }}
                        onReadyToggle={() => { void handleReadyToggle(); }}
                        onStart={() => { void handleStart(); }}
                        onLeave={() => { void handleLeave(); }}
                    />
                )}

                {phase === 'starting' && <StartingScreen />}
            </div>
        </div>
    );
}

// ---------------------------------------------------------------------------
// Screens
// ---------------------------------------------------------------------------

interface IdleScreenProps {
    name: string;
    setName: (v: string) => void;
    colorHex: string;
    setColorHex: (v: string) => void;
    joinCode: string;
    setJoinCode: (v: string) => void;
    busy: boolean;
    error: string | null;
    onCreate: () => void;
    onJoin: () => void;
}

function IdleScreen({
    name, setName, colorHex, setColorHex, joinCode, setJoinCode, busy, error, onCreate, onJoin,
}: IdleScreenProps) {
    return (
        <>
            <h2 className="font-display text-4xl font-black tracking-[0.01em] text-gold-300 text-center">🌐 Chơi Online</h2>

            <label className="flex flex-col gap-2">
                <span className="text-gold-300/65 text-xs font-black uppercase tracking-widest">Tên hiển thị</span>
                <input
                    type="text"
                    value={name}
                    maxLength={MAX_NAME_LENGTH}
                    onChange={(e) => setName(e.target.value)}
                    className="auth-input"
                    placeholder={DEFAULT_NAME}
                />
            </label>

            <div className="flex flex-col gap-2">
                <span className="text-gold-300/65 text-xs font-black uppercase tracking-widest">Màu quân cờ</span>
                <div className="flex gap-4 justify-center">
                    {PLAYER_SWATCHES.map((hex) => (
                        <button
                            key={hex}
                            type="button"
                            aria-label={`Chọn màu ${hex}`}
                            aria-pressed={colorHex === hex}
                            onClick={() => { window.SoundFX?.click(); setColorHex(hex); }}
                            className={`w-12 h-12 rounded-full border-4 transition-all ${
                                colorHex === hex
                                    ? 'border-gold-300 scale-110 shadow-[0_0_20px_rgba(232,193,107,0.5)]'
                                    : 'border-gold-600/30 hover:scale-105'
                            }`}
                            style={{ backgroundColor: hex }}
                        />
                    ))}
                </div>
            </div>

            <button
                type="button"
                onClick={onCreate}
                disabled={busy}
                className="btn-action btn-son disabled:opacity-50 disabled:cursor-not-allowed"
            >
                {busy ? '⏳ Đang xử lý...' : 'TẠO PHÒNG'}
            </button>

            <div className="deco-divider text-xs font-black uppercase tracking-widest">
                hoặc
            </div>

            <div className="flex gap-3">
                <input
                    type="text"
                    value={joinCode}
                    maxLength={ROOM_CODE_LENGTH}
                    onChange={(e) => setJoinCode(e.target.value.toUpperCase())}
                    className="auth-input flex-1 text-center text-xl tracking-[0.4em] uppercase font-black"
                    placeholder="MÃ PHÒNG"
                    aria-label="Mã phòng 6 ký tự"
                />
                <button
                    type="button"
                    onClick={onJoin}
                    disabled={busy || joinCode.trim().length !== ROOM_CODE_LENGTH}
                    className="btn-action bg-emerald-600 disabled:opacity-50 disabled:cursor-not-allowed whitespace-nowrap"
                >
                    VÀO PHÒNG
                </button>
            </div>

            <ErrorLine text={error} />
        </>
    );
}

interface LobbyScreenProps {
    code: string | null;
    copied: boolean;
    members: LobbyMember[];
    myMember: LobbyMember | undefined;
    allReady: boolean;
    busy: boolean;
    lobbyError: string | null;
    startError: string | null;
    onCopy: () => void;
    onReadyToggle: () => void;
    onStart: () => void;
    onLeave: () => void;
}

function LobbyScreen({
    code, copied, members, myMember, allReady, busy,
    lobbyError, startError, onCopy, onReadyToggle, onStart, onLeave,
}: LobbyScreenProps) {
    return (
        <>
            <h2 className="font-display text-3xl font-black tracking-[0.01em] text-gold-300 text-center">Phòng chờ</h2>

            <div className="flex items-center justify-center gap-3">
                <span className="font-display text-5xl font-black tracking-[0.3em] text-gold-300 select-all">
                    {code ?? '------'}
                </span>
                <button
                    type="button"
                    onClick={onCopy}
                    aria-label="Sao chép mã phòng"
                    className="glass-panel !rounded-xl px-3 py-2 text-lg hover:!border-gold-400/70 transition-colors"
                >
                    {copied ? '✓' : '📋'}
                </button>
            </div>
            <p className="text-gold-300/55 text-xs font-bold text-center uppercase tracking-widest -mt-3">
                Gửi mã này cho bạn bè để vào phòng
            </p>

            <div className="grid grid-cols-2 gap-3">
                {Array.from({ length: SEAT_COUNT }, (_, seat) => {
                    const member = members.find((m) => m.seat === seat);
                    return (
                        <SeatCell
                            key={seat}
                            seat={seat}
                            member={member}
                            isMe={member !== undefined && member.userId === myMember?.userId}
                        />
                    );
                })}
            </div>

            <div className="flex flex-col gap-3">
                <button
                    type="button"
                    onClick={onReadyToggle}
                    disabled={busy || !myMember}
                    className={`btn-action ${myMember?.isReady ? 'btn-taupe' : 'bg-emerald-600'} disabled:opacity-50`}
                >
                    {myMember?.isReady ? 'HỦY SẴN SÀNG' : 'SẴN SÀNG'}
                </button>

                <button
                    type="button"
                    onClick={onStart}
                    disabled={busy || !allReady}
                    className="btn-action btn-son disabled:opacity-40 disabled:cursor-not-allowed"
                >
                    BẮT ĐẦU
                </button>
                <p className="text-gold-300/50 text-[10px] font-bold text-center uppercase tracking-widest -mt-1">
                    Cần ≥ 2 người và tất cả sẵn sàng · chỉ chủ phòng bắt đầu được
                </p>

                <button
                    type="button"
                    onClick={onLeave}
                    disabled={busy}
                    className="text-terracotta hover:text-gold-400 font-black uppercase text-xs tracking-widest transition-colors disabled:opacity-50"
                >
                    ← Rời phòng
                </button>
            </div>

            <ErrorLine text={startError} />
            <ErrorLine text={lobbyError} />
        </>
    );
}

function StartingScreen() {
    return (
        <div className="flex flex-col items-center gap-4 py-8">
            <div className="w-10 h-10 border-4 border-gold-400 border-t-transparent rounded-full animate-spin" />
            <p className="text-ivory font-black uppercase tracking-widest text-sm">Đang bắt đầu ván chơi...</p>
        </div>
    );
}
