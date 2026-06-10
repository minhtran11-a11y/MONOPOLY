/**
 * src/net/supabaseClient.ts
 *
 * Singleton Supabase client for online mode, configured from Vite env vars.
 * When VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY are missing the app keeps
 * working in solo mode: `supabase` is null and `hasSupabase` is false —
 * callers (lobbyStore, gameSync) surface a 'NOT_CONFIGURED' error instead of
 * crashing.
 *
 * Also owns the per-room realtime channel registry. lobbyStore (presence +
 * postgres_changes + broadcast 'started') and gameSync (broadcast 'action')
 * MUST share one RealtimeChannel per `room:{roomId}` topic — joining the same
 * topic twice from one socket makes Phoenix close the first subscription.
 * getRoomChannel() hands both modules the same instance; joinRoomChannel()
 * makes subscribe() idempotent and queues "on joined" callbacks.
 */

import { createClient, REALTIME_SUBSCRIBE_STATES } from '@supabase/supabase-js';
import type { RealtimeChannel, SupabaseClient } from '@supabase/supabase-js';

// ---------------------------------------------------------------------------
// Client bootstrap
// ---------------------------------------------------------------------------

const url = import.meta.env.VITE_SUPABASE_URL as string | undefined;
const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined;

if (!url || !anonKey) {
    console.error(
        '[supabase] Thiếu cấu hình VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY — '
        + 'chế độ chơi online bị tắt. Sao chép .env.example thành .env và điền '
        + '2 giá trị từ Supabase Dashboard (Project Settings -> API).',
    );
}

/** Null when env is missing — guard every use with hasSupabase. */
export const supabase: SupabaseClient | null =
    url && anonKey ? createClient(url, anonKey) : null;

export const hasSupabase: boolean = supabase !== null;

// ---------------------------------------------------------------------------
// Auth: anonymous session + profile upsert
// ---------------------------------------------------------------------------

const DEFAULT_DISPLAY_NAME = 'Người chơi';
const MAX_DISPLAY_NAME = 32;

function sanitizeDisplayName(name: string): string {
    const trimmed = (name ?? '').trim().slice(0, MAX_DISPLAY_NAME);
    return trimmed.length > 0 ? trimmed : DEFAULT_DISPLAY_NAME;
}

/**
 * Ensures a signed-in (anonymous) session and upserts the caller's profile
 * row with `displayName`. Returns the user id. Throws Error('NOT_CONFIGURED')
 * when Supabase env is missing, Error('AUTH_ERROR: ...') on auth failures.
 * A failed profile upsert is logged but NOT fatal (lobby flow continues).
 */
export async function ensureSignedIn(displayName: string): Promise<string> {
    if (!supabase) throw new Error('NOT_CONFIGURED');

    const { data: sessionData, error: sessionErr } = await supabase.auth.getSession();
    if (sessionErr) throw new Error(`AUTH_ERROR: ${sessionErr.message}`);

    let userId = sessionData.session?.user.id ?? null;
    if (!userId) {
        const { data, error } = await supabase.auth.signInAnonymously();
        if (error || !data.user) {
            throw new Error(`AUTH_ERROR: ${error?.message ?? 'anonymous sign-in failed'}`);
        }
        userId = data.user.id;
    }

    const { error: profileErr } = await supabase
        .from('profiles')
        .upsert({ id: userId, display_name: sanitizeDisplayName(displayName) }, { onConflict: 'id' });
    if (profileErr) {
        console.error('[supabase] profile upsert failed:', profileErr.message);
    }

    return userId;
}

// ---------------------------------------------------------------------------
// Shared per-room realtime channel registry
// ---------------------------------------------------------------------------

interface RoomChannelEntry {
    channel: RealtimeChannel;
    joined: boolean;
    joining: boolean;
    onJoined: Array<() => void>;
}

const roomChannels = new Map<string, RoomChannelEntry>();

/**
 * Returns the shared channel for `room:{roomId}` (creating it unsubscribed if
 * needed). Attach listeners BEFORE calling joinRoomChannel(); postgres_changes
 * bindings are sent to the server at join time. Broadcast listeners may be
 * added after joining (they are matched client-side).
 */
export function getRoomChannel(roomId: string): RealtimeChannel | null {
    if (!supabase) return null;
    const existing = roomChannels.get(roomId);
    if (existing) return existing.channel;
    const channel = supabase.channel(`room:${roomId}`);
    roomChannels.set(roomId, { channel, joined: false, joining: false, onJoined: [] });
    return channel;
}

/**
 * Idempotent subscribe. `onJoined` fires once the channel reaches SUBSCRIBED
 * (immediately when it already has).
 */
export function joinRoomChannel(roomId: string, onJoined?: () => void): void {
    const entry = roomChannels.get(roomId);
    if (!entry) return;
    if (entry.joined) {
        onJoined?.();
        return;
    }
    if (onJoined) entry.onJoined = [...entry.onJoined, onJoined];
    if (entry.joining) return;
    entry.joining = true;

    entry.channel.subscribe((status) => {
        if (status === REALTIME_SUBSCRIBE_STATES.SUBSCRIBED) {
            entry.joined = true;
            const pending = entry.onJoined;
            entry.onJoined = [];
            for (const cb of pending) cb();
        } else if (
            status === REALTIME_SUBSCRIBE_STATES.CLOSED
            || status === REALTIME_SUBSCRIBE_STATES.CHANNEL_ERROR
            || status === REALTIME_SUBSCRIBE_STATES.TIMED_OUT
        ) {
            entry.joined = false;
        }
    });
}

/** Tears the shared channel down (lobbyStore.reset() is the single owner). */
export function leaveRoomChannel(roomId: string): void {
    const entry = roomChannels.get(roomId);
    if (!entry || !supabase) return;
    roomChannels.delete(roomId);
    void supabase.removeChannel(entry.channel);
}
