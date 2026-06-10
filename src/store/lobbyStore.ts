/**
 * src/store/lobbyStore.ts
 *
 * Zustand lobby store for online mode — same dual-consumption pattern as
 * uiStore (vanilla createStore + overloaded React hook).
 *
 * Responsibilities:
 *   - create/join/leave rooms via the SECURITY DEFINER RPCs
 *     (supabase/migrations/0003_rpc.sql: create_room / join_room / leave_room)
 *   - own the realtime lobby subscription on the SHARED `room:{roomId}`
 *     channel (see src/net/supabaseClient.ts registry):
 *       * postgres_changes on room_players -> reload member list
 *       * presence (track { userId })      -> online flags
 *       * broadcast 'started'              -> phase 'in_game'
 *   - reset() is the SINGLE owner of channel teardown (gameSync.disconnect()
 *     intentionally does not removeChannel).
 *
 * Error contract: every failure lands in `error` as "CODE — thông điệp tiếng
 * Việt" so UI can show the message while orchestrators/tests can still match
 * on the stable code substring (the RPCs raise exceptions whose MESSAGE is
 * the code; toErrorCode() extracts it).
 */

import { createStore } from 'zustand/vanilla';
import { useStore } from 'zustand';
import type { RealtimeChannel } from '@supabase/supabase-js';
import {
    supabase,
    hasSupabase,
    ensureSignedIn,
    getRoomChannel,
    joinRoomChannel,
    leaveRoomChannel,
} from '../net/supabaseClient.ts';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface LobbyMember {
    /** room_players.seat_index — equals GameState player id once started. */
    seat: number;
    userId: string;
    name: string;
    colorHex: string;
    tokenKind: string;
    isReady: boolean;
    /** Realtime presence flag (true while the member's tab is connected). */
    online: boolean;
}

export type LobbyPhase = 'idle' | 'lobby' | 'starting' | 'in_game';

export interface LobbyState {
    phase: LobbyPhase;
    roomId: string | null;
    /** 6-char join code (A-Z2-9). */
    code: string | null;
    mySeat: number | null;
    myUserId: string | null;
    members: LobbyMember[];
    /** "CODE — thông điệp tiếng Việt" or null. */
    error: string | null;

    createRoom: (displayName: string, colorHex: string, tokenKind: string) => Promise<void>;
    joinRoom: (code: string, displayName: string, colorHex: string, tokenKind: string) => Promise<void>;
    leaveRoom: () => Promise<void>;
    setReady: (isReady: boolean) => Promise<void>;
    subscribeRoom: (roomId: string) => void;
    /** Host UI sets 'starting' before invoking gameSync.startOnlineGame(). */
    setPhase: (phase: LobbyPhase) => void;
    reset: () => void;
}

// ---------------------------------------------------------------------------
// Error mapping (codes raised by 0003_rpc.sql / supabaseClient.ts)
// ---------------------------------------------------------------------------

const ERROR_MESSAGES: Record<string, string> = {
    NOT_CONFIGURED: 'Chưa cấu hình Supabase — sao chép .env.example thành .env',
    NOT_AUTHENTICATED: 'Chưa đăng nhập được, vui lòng thử lại',
    AUTH_ERROR: 'Lỗi đăng nhập ẩn danh',
    BAD_DISPLAY_NAME: 'Tên hiển thị không hợp lệ (1–32 ký tự)',
    BAD_COLOR: 'Màu quân cờ không hợp lệ',
    CODE_GENERATION_FAILED: 'Không tạo được mã phòng, vui lòng thử lại',
    ROOM_NOT_FOUND: 'Không tìm thấy phòng với mã này',
    ALREADY_STARTED: 'Phòng đã bắt đầu chơi, không thể vào',
    ALREADY_JOINED: 'Bạn đã ở trong phòng này rồi',
    ROOM_FULL: 'Phòng đã đầy',
};

/** Extracts the stable machine code from an RPC/auth error message. */
function toErrorCode(message: string): string {
    for (const code of Object.keys(ERROR_MESSAGES)) {
        if (message.includes(code)) return code;
    }
    return 'UNKNOWN';
}

/** "CODE — thông điệp tiếng Việt" (code kept for programmatic matching). */
function toErrorText(rawMessage: string): string {
    const code = toErrorCode(rawMessage);
    if (code === 'UNKNOWN') return `UNKNOWN — Lỗi không xác định (${rawMessage})`;
    return `${code} — ${ERROR_MESSAGES[code]}`;
}

const NOT_CONFIGURED_ERROR = toErrorText('NOT_CONFIGURED');

// ---------------------------------------------------------------------------
// Module-level realtime bookkeeping (not React state)
// ---------------------------------------------------------------------------

/** Presence-derived set of online user ids (replaced, never mutated). */
let onlineUserIds: ReadonlySet<string> = new Set<string>();

/** Guards against double-attaching listeners on the shared channel. */
let subscribedRoomId: string | null = null;

interface RoomPlayerRow {
    user_id: string;
    seat_index: number;
    display_name: string;
    color_hex: string;
    token_kind: string;
    is_ready: boolean;
}

const rowToMember = (row: RoomPlayerRow): LobbyMember => ({
    seat: row.seat_index,
    userId: row.user_id,
    name: row.display_name,
    colorHex: row.color_hex,
    tokenKind: row.token_kind,
    isReady: row.is_ready,
    online: onlineUserIds.has(row.user_id),
});

/** Reloads the member list from room_players (RLS: members + lobby preview). */
async function reloadMembers(roomId: string): Promise<void> {
    if (!supabase) return;
    const { data, error } = await supabase
        .from('room_players')
        .select('user_id, seat_index, display_name, color_hex, token_kind, is_ready')
        .eq('room_id', roomId)
        .order('seat_index', { ascending: true });
    if (error) {
        console.error('[lobbyStore] reload members failed:', error.message);
        return;
    }
    // Ignore stale responses after leave/reset or room switch.
    if (lobbyStore.getState().roomId !== roomId) return;

    const members = ((data ?? []) as RoomPlayerRow[]).map(rowToMember);
    const myUserId = lobbyStore.getState().myUserId;
    const mySeat = members.find((m) => m.userId === myUserId)?.seat ?? null;
    lobbyStore.setState({ members, mySeat });
}

/** Recomputes online flags from the channel's presence state. */
function applyPresence(channel: RealtimeChannel): void {
    const presence = channel.presenceState<{ userId: string }>();
    const ids = new Set<string>();
    for (const metas of Object.values(presence)) {
        for (const meta of metas) {
            if (typeof meta.userId === 'string') ids.add(meta.userId);
        }
    }
    onlineUserIds = ids;
    lobbyStore.setState((s) => ({
        members: s.members.map((m) => ({ ...m, online: ids.has(m.userId) })),
    }));
}

// ---------------------------------------------------------------------------
// Store
// ---------------------------------------------------------------------------

const INITIAL = {
    phase: 'idle' as LobbyPhase,
    roomId: null as string | null,
    code: null as string | null,
    mySeat: null as number | null,
    myUserId: null as string | null,
    members: [] as LobbyMember[],
    error: null as string | null,
};

export const lobbyStore = createStore<LobbyState>()((set, get) => ({
    ...INITIAL,

    createRoom: async (displayName, colorHex, tokenKind) => {
        if (!hasSupabase || !supabase) {
            set({ error: NOT_CONFIGURED_ERROR });
            return;
        }
        set({ error: null });
        try {
            const userId = await ensureSignedIn(displayName);
            const { data, error } = await supabase.rpc('create_room', {
                p_display_name: displayName.trim(),
                p_color: colorHex,
                p_token: tokenKind,
            });
            if (error) {
                set({ error: toErrorText(error.message) });
                return;
            }
            const result = data as { room_id: string; code: string };
            set({
                phase: 'lobby',
                roomId: result.room_id,
                code: result.code,
                myUserId: userId,
                mySeat: 0, // create_room seats the host at seat 0
            });
            get().subscribeRoom(result.room_id);
        } catch (e: unknown) {
            set({ error: toErrorText(e instanceof Error ? e.message : String(e)) });
        }
    },

    joinRoom: async (code, displayName, colorHex, tokenKind) => {
        if (!hasSupabase || !supabase) {
            set({ error: NOT_CONFIGURED_ERROR });
            return;
        }
        set({ error: null });
        const normalizedCode = code.trim().toUpperCase();
        try {
            const userId = await ensureSignedIn(displayName);
            const { data, error } = await supabase.rpc('join_room', {
                p_code: normalizedCode,
                p_display_name: displayName.trim(),
                p_color: colorHex,
                p_token: tokenKind,
            });
            if (error) {
                set({ error: toErrorText(error.message) });
                return;
            }
            const roomId = data as string;
            set({
                phase: 'lobby',
                roomId,
                code: normalizedCode,
                myUserId: userId,
                mySeat: null, // derived from members once they load
            });
            get().subscribeRoom(roomId);
        } catch (e: unknown) {
            set({ error: toErrorText(e instanceof Error ? e.message : String(e)) });
        }
    },

    leaveRoom: async () => {
        const { roomId } = get();
        if (!hasSupabase || !supabase) {
            set({ error: NOT_CONFIGURED_ERROR });
            return;
        }
        if (roomId) {
            const { error } = await supabase.rpc('leave_room', { p_room_id: roomId });
            // leave_room is idempotent; a failure should not trap the player in
            // the lobby UI — log it and reset locally anyway.
            if (error) console.error('[lobbyStore] leave_room failed:', error.message);
        }
        get().reset();
    },

    setReady: async (isReady) => {
        if (!hasSupabase || !supabase) {
            set({ error: NOT_CONFIGURED_ERROR });
            return;
        }
        const { roomId, myUserId } = get();
        if (!roomId || !myUserId) return;
        // RLS room_players_update_self_in_lobby + column grant permit exactly
        // this own-row is_ready update.
        const { error } = await supabase
            .from('room_players')
            .update({ is_ready: isReady })
            .eq('room_id', roomId)
            .eq('user_id', myUserId);
        if (error) {
            set({ error: toErrorText(error.message) });
            return;
        }
        // Optimistic local flip; the postgres_changes UPDATE event re-confirms.
        set((s) => ({
            members: s.members.map((m) => (m.userId === myUserId ? { ...m, isReady } : m)),
        }));
    },

    subscribeRoom: (roomId) => {
        if (!hasSupabase) {
            set({ error: NOT_CONFIGURED_ERROR });
            return;
        }
        if (subscribedRoomId === roomId) return; // listeners already attached
        const channel = getRoomChannel(roomId);
        if (!channel) return;
        subscribedRoomId = roomId;

        // postgres_changes bindings MUST be attached before subscribe()
        // (they are sent to the server at join time — see supabaseClient.ts).
        channel
            .on(
                'postgres_changes',
                {
                    event: '*', // INSERT | UPDATE | DELETE
                    schema: 'public',
                    table: 'room_players',
                    filter: `room_id=eq.${roomId}`,
                },
                () => { void reloadMembers(roomId); },
            )
            .on('presence', { event: 'sync' }, () => { applyPresence(channel); })
            .on('broadcast', { event: 'started' }, () => {
                set({ phase: 'in_game' });
            });

        joinRoomChannel(roomId, () => {
            const userId = get().myUserId;
            if (userId) void channel.track({ userId });
            void reloadMembers(roomId);
        });
    },

    setPhase: (phase) => set({ phase }),

    reset: () => {
        const { roomId } = get();
        if (roomId) leaveRoomChannel(roomId);
        subscribedRoomId = null;
        onlineUserIds = new Set<string>();
        set({ ...INITIAL });
    },
}));

// ---------------------------------------------------------------------------
// React hook binding (same overload pattern as useUiStore)
// ---------------------------------------------------------------------------

/** `useLobbyStore()` -> whole state, `useLobbyStore(s => s.members)` -> slice. */
export function useLobbyStore(): LobbyState;
export function useLobbyStore<T>(selector: (state: LobbyState) => T): T;
export function useLobbyStore<T>(selector?: (state: LobbyState) => T): T | LobbyState {
    const select: (state: LobbyState) => T | LobbyState = selector ?? ((s) => s);
    return useStore(lobbyStore, select);
}
