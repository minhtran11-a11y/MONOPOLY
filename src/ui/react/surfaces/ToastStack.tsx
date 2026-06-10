/**
 * ToastStack — React replacement for the toast DOM logic in
 * src/services/toast.js (ensureRoot/show + the #toast-root element).
 *
 * READS:  uiStore.toasts — ToastVM[] already capped at TOAST_MAX_VISIBLE and
 *         with type/icon/ttl resolved at push time by uiStore.pushToast.
 *
 * OVERRIDES (installFacade, module level — imported after the legacy modules
 * so this assignment wins): the FULL window.Toast object with every legacy
 * method, where show() keeps returning a dismiss closure (legacy parity):
 *   show / info / success / warn / error / money
 *
 * BEHAVIOR (mirrors src/services/toast.js):
 *   - root: fixed stack styled by the existing .toast-root CSS (bottom-right
 *     on desktop, stretched bottom-center above the drawer on mobile,
 *     z-index 1200 above the canvas, pointer-events: none on the wrapper and
 *     auto on each toast), aria-live="polite" / aria-atomic="false".
 *   - slide-in on mount: render with .toast (off-screen), then add .toast-in
 *     one animation frame later — same appendChild → rAF dance as legacy.
 *   - auto-dismiss after toast.ttl ms via a component-owned setTimeout
 *     (cleared on unmount / early dismiss); exit plays .toast-out for
 *     EXIT_ANIMATION_MS before the store entry is removed.
 *   - click-to-dismiss on the whole toast (cancels the ttl timer first).
 *   - messages render as React TEXT — the legacy innerHTML XSS hole is gone.
 *
 * DEAD AFTER THIS FILE: all DOM code in src/services/toast.js (its
 * window.Toast assignment is overwritten at import time, so ensureRoot/show
 * never run and the legacy #toast-root element is never created again).
 */

import { useEffect, useState } from 'react';
import { TOAST_ICONS, uiStore, useUiStore } from '../../../store/uiStore.ts';
import type { ToastOptions, ToastVM } from '../../../store/uiStore.ts';
import { installFacade } from '../facade.ts';
import type { LegacyToastApi } from '../facade.ts';

/** Legacy parity: toast.js removes the node 400ms after adding .toast-out. */
const EXIT_ANIMATION_MS = 400;

// ---------------------------------------------------------------------------
// window.Toast override (runs at module import time)
// ---------------------------------------------------------------------------

const showToast = (msg: string, opts?: ToastOptions): (() => void) => {
    const id = uiStore.getState().pushToast(msg, opts);
    return () => uiStore.getState().dismissToast(id);
};

const toastApi: LegacyToastApi = {
    show: showToast,
    info: (m, o) => showToast(m, { ...o, type: 'info' }),
    success: (m, o) => showToast(m, { ...o, type: 'success' }),
    warn: (m, o) => showToast(m, { ...o, type: 'warn' }),
    error: (m, o) => showToast(m, { ...o, type: 'error' }),
    // Legacy forces the money icon even when opts.icon was provided.
    money: (m, o) => showToast(m, { ...o, type: 'money', icon: TOAST_ICONS['money'] }),
};

installFacade({ Toast: toastApi }, 'ToastStack');

// ---------------------------------------------------------------------------
// Components
// ---------------------------------------------------------------------------

interface ToastItemProps {
    toast: ToastVM;
    onDismiss: (id: number) => void;
}

function ToastItem({ toast, onDismiss }: ToastItemProps) {
    const [hasEntered, setHasEntered] = useState(false);
    const [isLeaving, setIsLeaving] = useState(false);

    // Slide-in on mount (legacy: appendChild → requestAnimationFrame → .toast-in).
    useEffect(() => {
        const frame = requestAnimationFrame(() => setHasEntered(true));
        return () => cancelAnimationFrame(frame);
    }, []);

    // Auto-expiry after ttl; dropped as soon as an exit has started.
    useEffect(() => {
        if (isLeaving) return undefined;
        const handle = window.setTimeout(() => setIsLeaving(true), toast.ttl);
        return () => window.clearTimeout(handle);
    }, [toast.ttl, isLeaving]);

    // Once leaving, remove from the store after the exit transition finishes.
    useEffect(() => {
        if (!isLeaving) return undefined;
        const handle = window.setTimeout(() => onDismiss(toast.id), EXIT_ANIMATION_MS);
        return () => window.clearTimeout(handle);
    }, [isLeaving, toast.id, onDismiss]);

    const phaseClass = isLeaving ? 'toast-out' : hasEntered ? 'toast-in' : '';
    const className = ['toast', `toast-${toast.type}`, phaseClass]
        .filter(Boolean)
        .join(' ');

    // Like legacy, the toast itself is the click target (cursor comes from the
    // .toast CSS). It stays a non-focusable status element on purpose: these
    // auto-expire, and focusable nodes inside a transient live region would
    // drop keyboard focus when they vanish mid-tab.
    return (
        <div role="status" className={className} onClick={() => setIsLeaving(true)}>
            <span className="toast-icon" aria-hidden="true">
                {toast.icon}
            </span>
            <span className="toast-msg">{toast.msg}</span>
        </div>
    );
}

export default function ToastStack() {
    const toasts = useUiStore((s) => s.toasts);
    const dismissToast = useUiStore((s) => s.dismissToast);

    // Always mounted (even when empty) so the polite live region exists in the
    // DOM before announcements arrive — same id/class/ARIA as legacy ensureRoot.
    return (
        <div id="toast-root" className="toast-root" aria-live="polite" aria-atomic="false">
            {toasts.map((t) => (
                <ToastItem key={t.id} toast={t} onDismiss={dismissToast} />
            ))}
        </div>
    );
}
