/**
 * ToastStack — React replacement for the toast DOM logic in
 * src/services/toast.js (ensureRoot/show + #toast-root element).
 *
 * READS:  uiStore.toasts (ToastVM[]; store already caps at TOAST_MAX_VISIBLE
 *         and resolves type/icon/ttl at push time using TOAST_ICONS /
 *         TOAST_DEFAULT_TTL exported from src/store/uiStore.ts).
 *
 * OVERRIDES (via installFacade from ../facade.ts) — the FULL window.Toast
 * object, keeping every legacy method and the dismiss-closure return:
 *   window.Toast = {
 *     show:    (m, o) => { const id = pushToast(m, o); return () => dismissToast(id); },
 *     info:    (m, o) => Toast.show(m, { ...o, type: 'info' }),
 *     success: (m, o) => Toast.show(m, { ...o, type: 'success' }),
 *     warn:    (m, o) => Toast.show(m, { ...o, type: 'warn' }),
 *     error:   (m, o) => Toast.show(m, { ...o, type: 'error' }),
 *     money:   (m, o) => Toast.show(m, { ...o, type: 'money', icon: TOAST_ICONS.money }),
 *   }
 *
 * BEHAVIOR to reproduce: aria-live="polite" stack region; slide-in on mount;
 * auto-dismiss per-toast after toast.ttl ms (component-owned setTimeout,
 * cleared on unmount); click-to-dismiss. Reuse the existing .toast / .toast-in
 * / .toast-out / .toast-root CSS classes.
 *
 * DEAD AFTER IMPLEMENTATION: all DOM code in src/services/toast.js (its
 * window.Toast assignment is overwritten at import time; the legacy
 * #toast-root element is never created again).
 */
export default function ToastStack() {
    return null;
}
