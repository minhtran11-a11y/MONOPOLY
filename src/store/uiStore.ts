/**
 * src/store/uiStore.ts
 *
 * Zustand UI store — Phase D foundation of the React migration.
 *
 * Dual consumption contract (both MUST keep working):
 *   - React components:  `useUiStore(selector)` (or no-arg for the whole state)
 *   - Non-React callers: `uiStore.getState().pushToast(...)` / `uiStore.subscribe(...)`
 *     (this is what the window.* overrides installed by surface modules use)
 *
 * Migration strategy (per surface):
 *   The legacy engine (src/game/game.js, src/ui/ui.js, src/services/toast.js,
 *   src/ui/menu.js) talks to the UI exclusively through window.* functions
 *   (window.logMsg, window.Toast.show, window.showModal, ...). Each React
 *   surface, when implemented, OVERRIDES its window function(s) via
 *   installFacade() (src/ui/react/facade.ts) so they write into this store
 *   instead of touching the legacy DOM; React renders from the store. Until a
 *   surface is implemented, its legacy DOM implementation keeps working.
 *   Surface modules are imported AFTER the legacy modules, so their window
 *   assignments win.
 *
 * All state updates are immutable (new arrays/objects, never in-place edits).
 */

import { createStore } from 'zustand/vanilla';
import { useStore } from 'zustand';

// ---------------------------------------------------------------------------
// Toasts (mirrors src/services/toast.js)
// ---------------------------------------------------------------------------

/** Faithful copy of the ICONS map in src/services/toast.js (line ~20). */
export const TOAST_ICONS: Record<string, string> = {
    info: 'ℹ️',
    success: '✅',
    warn: '⚠️',
    error: '❌',
    money: '💰',
    dice: '🎲',
    build: '🔨',
    buy: '🏡',
    jail: '🚓',
    win: '🏆',
};

/** Known toast kinds (keys of TOAST_ICONS). Legacy callers may pass others. */
export type ToastKind =
    | 'info'
    | 'success'
    | 'warn'
    | 'error'
    | 'money'
    | 'dice'
    | 'build'
    | 'buy'
    | 'jail'
    | 'win';

/** Matches the legacy `Toast.show(message, opts)` options bag. */
export interface ToastOptions {
    /** CSS/type class; legacy renders `toast-${type}`. Defaults to 'info'. */
    type?: ToastKind | (string & {});
    /** Explicit emoji icon; defaults to TOAST_ICONS[type] ?? TOAST_ICONS.info. */
    icon?: string;
    /** Auto-dismiss in ms; defaults to TOAST_DEFAULT_TTL. */
    ttl?: number;
}

export interface ToastVM {
    id: number;
    msg: string;
    /** Resolved type string (never undefined; defaulted to 'info'). */
    type: string;
    /** Resolved emoji (never undefined). */
    icon: string;
    /** Resolved ttl in ms (never undefined). Auto-expiry is the COMPONENT's job. */
    ttl: number;
}

/** DEFAULT_TTL in src/services/toast.js. */
export const TOAST_DEFAULT_TTL = 3200;
/** MAX_VISIBLE in src/services/toast.js — store keeps at most this many. */
export const TOAST_MAX_VISIBLE = 4;

// ---------------------------------------------------------------------------
// Game log (mirrors logMsg in src/ui/ui.js)
// ---------------------------------------------------------------------------

/**
 * One game-log line.
 *
 * SECURITY / RENDERING NOTE for the GameLog surface agent:
 * `html` is the RAW string passed to window.logMsg. Most messages are plain
 * text with emoji, but game.js (line ~495, bot small-talk) intentionally
 * embeds markup of exactly this shape:
 *
 *   <span class="text-indigo-500 font-black">[NAME]:</span>
 *   <span class="italic text-slate-600">"MESSAGE"</span>
 *
 * The component decides safe rendering: parse that known-safe pattern with a
 * regex into styled React elements, and render EVERYTHING ELSE as plain text
 * (e.g. strip tags). Do NOT use dangerouslySetInnerHTML on `html`.
 */
export interface LogEntry {
    id: number;
    html: string;
    /** Date.now() at push time. */
    ts: number;
}

/** Cap on retained log entries (legacy DOM grew unbounded; we cap at ~80). */
export const LOG_LIMIT = 80;

// ---------------------------------------------------------------------------
// Action modal (mirrors showModal/hideModal in src/ui/ui.js)
// ---------------------------------------------------------------------------

/**
 * Exhaustive list of button ids game.js actually passes to showModal():
 *   - 'roll'        game.js:83 (jail turn), :93 (start turn), :542 (doubles)
 *   - 'build-menu'  game.js:74 (pushed when buildables exist), :555 (end phase)
 *   - 'buy'         game.js:252 (unowned-tile purchase offer)
 *   - 'skip'        game.js:252
 *   - 'end'         game.js:555, :560 (end-turn phase)
 * Victory (game.js:529) passes [] — modal with no buttons.
 * ui.js resets exactly the ids btn-roll, btn-build-menu, btn-buy, btn-skip,
 * btn-end, so this union is complete today; `(string & {})` keeps the door
 * open for future kinds without breaking the type.
 */
export type ModalButtonKind = 'roll' | 'buy' | 'skip' | 'end' | 'build-menu';

export interface ModalButton {
    kind: ModalButtonKind | (string & {});
}

/**
 * DOM id of the legacy button for a modal kind (`'roll'` -> `'btn-roll'`).
 *
 * INTEROP CONTRACT for the ActionModal surface agent: game.js binds click
 * behavior DIRECTLY onto these legacy DOM nodes (`btnRoll.onclick = ...` in
 * _bindRollButton, `btnBuy.onclick`/`btnSkip.onclick` in landOnTile, the
 * jail auto-roll calls `document.getElementById('btn-roll').click()`, and
 * ui.js keyboard shortcuts check `!btn.classList.contains('hidden')`).
 * React buttons must therefore PROXY-CLICK the hidden legacy buttons:
 * `document.getElementById(legacyButtonId(kind))?.click()` — and the
 * showModal/hideModal overrides must keep toggling the `hidden` class on the
 * legacy #btn-* nodes so keyboard shortcuts and the jail auto-roll keep
 * working (the legacy #action-modal container itself stays hidden).
 */
export const legacyButtonId = (kind: string): string => `btn-${kind}`;

export interface ModalState {
    visible: boolean;
    title: string;
    desc: string;
    buttons: ModalButton[];
}

// ---------------------------------------------------------------------------
// Build menu / mortgage panel (mirror renderBuildMenu/renderMortgagePanel)
// ---------------------------------------------------------------------------

/**
 * One row of the build submenu (ui.js renderBuildMenu, line ~366): every tile
 * owned by the current player, with a build button when the tile is in
 * getBuildableProperties(p.id) and not mortgaged.
 * Build action: window.Game.executeBuildInternal(player, window.boardData[tileId]).
 */
export interface BuildItem {
    tileId: number;
    name: string;
    /** 0..5 (5 = hotel, label "Khách sạn"). */
    houses: number;
    isMortgaged: boolean;
    /** null for tiles without houseCost (railroads/utilities). */
    houseCost: number | null;
    /** True when buildable now (full unmortgaged set + even-build rule). */
    canBuild: boolean;
}

/**
 * One row of the mortgage panel (ui.js renderMortgagePanel, line ~328): every
 * tile owned by the current player. Toggle action: window.toggleMortgage(tileId)
 * (legacy then re-renders; the React surface re-snapshots instead).
 * Money math is fixed in game.js: mortgage refund = floor(price * 0.5),
 * redeem cost = floor(price * 0.6); tiles with houses cannot be mortgaged.
 */
export interface MortgageItem {
    tileId: number;
    name: string;
    houses: number;
    isMortgaged: boolean;
    /** floor(price * 0.5) — cash received when mortgaging. */
    mortgageValue: number;
    /** floor(price * 0.6) — cash paid to redeem. */
    redeemCost: number;
    /** houses === 0 (must sell houses before mortgaging). */
    canToggle: boolean;
}

export interface BuildMenuState {
    visible: boolean;
    items: BuildItem[];
}

export interface MortgagePanelState {
    visible: boolean;
    /**
     * Legacy renderMortgagePanel shows "Không phải lượt của bạn" when the
     * current player is missing or a bot — surface renders that empty state.
     */
    notYourTurn: boolean;
    items: MortgageItem[];
}

// ---------------------------------------------------------------------------
// Store
// ---------------------------------------------------------------------------

export interface UiState {
    // -- state slices --
    toasts: ToastVM[];
    log: LogEntry[];
    modal: ModalState;
    buildMenu: BuildMenuState;
    mortgagePanel: MortgagePanelState;
    settingsOpen: boolean;
    tradeOpen: boolean;
    rulesOpen: boolean;

    // -- toast actions --
    /** Returns the toast id (so window.Toast.show overrides can return a dismiss closure). */
    pushToast: (msg: string, opts?: ToastOptions) => number;
    dismissToast: (id: number) => void;

    // -- log actions --
    pushLog: (html: string) => void;
    clearLog: () => void;

    // -- modal actions --
    /**
     * Accepts the legacy string form (['roll','build-menu']) or ModalButton
     * objects; strings are normalized to { kind }.
     */
    showModal: (title: string, desc: string, buttons?: ReadonlyArray<string | ModalButton>) => void;
    hideModal: () => void;

    // -- build / mortgage panel actions --
    showBuildMenu: (items: BuildItem[]) => void;
    hideBuildMenu: () => void;
    showMortgagePanel: (items: MortgageItem[], notYourTurn?: boolean) => void;
    hideMortgagePanel: () => void;

    // -- simple panel toggles --
    openSettings: () => void;
    closeSettings: () => void;
    openTrade: () => void;
    closeTrade: () => void;
    openRules: () => void;
    closeRules: () => void;
}

/** Monotonic id source shared by toasts and log entries. */
let nextEntryId = 0;
const nextId = (): number => ++nextEntryId;

const INITIAL_MODAL: ModalState = { visible: false, title: '', desc: '', buttons: [] };

/** Vanilla store — safe to use from non-React modules (window overrides). */
export const uiStore = createStore<UiState>()((set) => ({
    toasts: [],
    log: [],
    modal: INITIAL_MODAL,
    buildMenu: { visible: false, items: [] },
    mortgagePanel: { visible: false, notYourTurn: false, items: [] },
    settingsOpen: false,
    tradeOpen: false,
    rulesOpen: false,

    pushToast: (msg, opts = {}) => {
        const id = nextId();
        const type = typeof opts.type === 'string' && opts.type.length > 0 ? opts.type : 'info';
        const toast: ToastVM = {
            id,
            msg,
            type,
            icon: opts.icon ?? TOAST_ICONS[type] ?? TOAST_ICONS['info'],
            ttl: typeof opts.ttl === 'number' ? opts.ttl : TOAST_DEFAULT_TTL,
        };
        // Same cap semantics as toast.js: drop oldest beyond MAX_VISIBLE.
        set((state) => ({ toasts: [...state.toasts, toast].slice(-TOAST_MAX_VISIBLE) }));
        return id;
    },

    dismissToast: (id) =>
        set((state) => ({ toasts: state.toasts.filter((t) => t.id !== id) })),

    pushLog: (html) =>
        set((state) => ({
            log: [...state.log, { id: nextId(), html, ts: Date.now() }].slice(-LOG_LIMIT),
        })),

    clearLog: () => set({ log: [] }),

    showModal: (title, desc, buttons = []) =>
        set({
            modal: {
                visible: true,
                title,
                desc,
                buttons: buttons.map((b) => (typeof b === 'string' ? { kind: b } : b)),
            },
        }),

    // Keep title/desc/buttons so the surface can animate the modal out.
    hideModal: () =>
        set((state) => ({ modal: { ...state.modal, visible: false } })),

    showBuildMenu: (items) => set({ buildMenu: { visible: true, items } }),
    hideBuildMenu: () =>
        set((state) => ({ buildMenu: { ...state.buildMenu, visible: false } })),

    showMortgagePanel: (items, notYourTurn = false) =>
        set({ mortgagePanel: { visible: true, notYourTurn, items } }),
    hideMortgagePanel: () =>
        set((state) => ({ mortgagePanel: { ...state.mortgagePanel, visible: false } })),

    openSettings: () => set({ settingsOpen: true }),
    closeSettings: () => set({ settingsOpen: false }),
    openTrade: () => set({ tradeOpen: true }),
    closeTrade: () => set({ tradeOpen: false }),
    openRules: () => set({ rulesOpen: true }),
    closeRules: () => set({ rulesOpen: false }),
}));

/** React hook binding. `useUiStore()` -> whole state, `useUiStore(s => s.toasts)` -> slice. */
export function useUiStore(): UiState;
export function useUiStore<T>(selector: (state: UiState) => T): T;
export function useUiStore<T>(selector?: (state: UiState) => T): T | UiState {
    const select: (state: UiState) => T | UiState = selector ?? ((s) => s);
    return useStore(uiStore, select);
}
