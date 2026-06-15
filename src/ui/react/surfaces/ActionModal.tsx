/**
 * ActionModal — React replacement for the legacy showModal()/hideModal()
 * (src/ui/ui.js ~259-326) and the VISUAL part of #action-modal (index.html).
 *
 * Renders from uiStore.modal; the window.showModal/hideModal overrides below
 * write into the store AND mirror the legacy DOM bookkeeping that game.js
 * still depends on:
 *
 *   - The legacy #action-modal container and its #btn-* children STAY in the
 *     DOM: game.js assigns .onclick straight onto those nodes (_bindRollButton,
 *     landOnTile buy/skip, checkEndTurnPhase end) and the jail flow
 *     programmatically calls document.getElementById('btn-roll').click().
 *     Programmatic .click() / .onclick dispatch keep working on display:none
 *     elements, so the container is kept permanently display-hidden
 *     ('hidden' + 'scale-0') and the React buttons proxy-click into it.
 *   - showModal mirrors the ui.js reset (line ~270): add 'hidden' (and strip
 *     'suggest-pulse') on the exact five ids ui.js resets, collapse the legacy
 *     #build-submenu, then un-hide the requested kinds. The ui.js keyboard
 *     shortcuts (Space/E/B) only click a button when it does NOT have the
 *     'hidden' class, so this keeps shortcuts + jail auto-roll fully working.
 *   - hideModal intentionally does NOT touch the button classes — legacy
 *     hideModal didn't either (shortcut availability persists until the next
 *     showModal, e.g. during the dice/move animation; game.js guards rolls
 *     with window.isAnimating).
 *
 * No Escape-to-close on purpose: the legacy action modal was driven entirely
 * by game flow (only the rules modal had Escape handling).
 */

import { useEffect, useId, useMemo, useState } from 'react';
import { installFacade } from '../facade.ts';
import { legacyButtonId, uiStore, useUiStore } from '../../../store/uiStore.ts';
import type { ModalButton } from '../../../store/uiStore.ts';

// ---------------------------------------------------------------------------
// Legacy parity constants
// ---------------------------------------------------------------------------

/** The exact button ids ui.js showModal() resets (ui.js line ~270). */
const LEGACY_RESET_BUTTON_IDS: readonly string[] = [
    'btn-roll',
    'btn-build-menu',
    'btn-buy',
    'btn-skip',
    'btn-end',
];

/** Visual order of the legacy #modal-buttons row (index.html ~287-291). */
const LEGACY_BUTTON_ORDER: readonly string[] = ['roll', 'build-menu', 'buy', 'skip', 'end'];

/** Legacy hide animation: 'duration-500' transition + 500 ms hide timeout. */
const HIDE_ANIMATION_MS = 500;

interface ButtonAppearance {
    /** Vietnamese label — verbatim from the index.html #action-modal markup. */
    label: string;
    /** Background utility — verbatim from the index.html #action-modal markup. */
    bgClass: string;
}

/**
 * Per-kind semantic lacquer mapping. The bgClass tokens below are kept ONLY
 * because css/style.css `.btn-action.bg-*` selectors re-skin them into sơn-mài
 * tints — they never render as raw Tailwind blue/green. Semantics:
 *   roll / buy  -> primary sơn-mài red + gold border (the headline action)
 *   build       -> terracotta lacquer (a spend action, distinct from buy)
 *   skip        -> warm taupe lacquer (secondary / dismiss)
 *   end         -> gold-on-lacquer (turn close — the "next" rhythm beat)
 */
const BUTTON_APPEARANCE: Record<string, ButtonAppearance> = {
    roll: { label: 'TUNG XÚC XẮC', bgClass: 'btn-son' },
    'build-menu': { label: 'XÂY NHÀ', bgClass: 'btn-terracotta' },
    buy: { label: 'MUA ĐẤT', bgClass: 'btn-son' },
    skip: { label: 'BỎ QUA', bgClass: 'btn-taupe' },
    end: { label: 'KẾT THÚC LƯỢT', bgClass: 'btn-gold' },
};

/** ModalButtonKind is open-ended ((string & {})) — degrade gracefully. */
function appearanceFor(kind: string): ButtonAppearance {
    return BUTTON_APPEARANCE[kind] ?? { label: kind.toUpperCase(), bgClass: 'btn-taupe' };
}

// ---------------------------------------------------------------------------
// Legacy DOM interop helpers
// ---------------------------------------------------------------------------

/**
 * The legacy #action-modal panel must never become visible again, but it must
 * stay in the DOM as the event-proxy host for game.js. Idempotent: called at
 * module load and from both overrides (covers any stray re-show attempt).
 */
function keepLegacyContainerHidden(): void {
    document.getElementById('action-modal')?.classList.add('hidden', 'scale-0');
}

/**
 * Mirror of the classList bookkeeping in ui.js showModal() (lines ~269-282),
 * minus everything visual: reset the five known buttons, collapse the legacy
 * build submenu, then un-hide exactly the requested kinds. game.js .onclick
 * assignment timing, ui.js keyboard shortcuts, and the jail auto-roll all key
 * off these classes.
 */
function syncLegacyButtonVisibility(kinds: ReadonlyArray<string>): void {
    for (const id of LEGACY_RESET_BUTTON_IDS) {
        const btn = document.getElementById(id);
        if (!btn) continue;
        btn.classList.add('hidden');
        btn.classList.remove('suggest-pulse');
    }
    document.getElementById('build-submenu')?.classList.add('hidden');
    for (const kind of kinds) {
        document.getElementById(legacyButtonId(kind))?.classList.remove('hidden');
    }
}

/** React buttons are pure proxies onto the hidden legacy buttons. */
function proxyClickLegacyButton(kind: string): void {
    document.getElementById(legacyButtonId(kind))?.click();
}

// ---------------------------------------------------------------------------
// window overrides (module level — imported after legacy ui.js, so these win)
// ---------------------------------------------------------------------------

installFacade(
    {
        showModal: (title: string, desc: string, buttons: ReadonlyArray<string> = []): void => {
            keepLegacyContainerHidden();
            syncLegacyButtonVisibility(buttons);
            const ui = uiStore.getState();
            // Legacy showModal collapsed the build submenu on every (re)open;
            // mirror that onto the React store slice as well.
            ui.hideBuildMenu();
            ui.showModal(title, desc, buttons);
        },
        hideModal: (): void => {
            keepLegacyContainerHidden();
            uiStore.getState().hideModal();
        },
    },
    'ActionModal',
);

// Module scripts evaluate after the document is parsed, so the legacy panel
// already exists here; the calls inside the overrides keep this idempotent.
keepLegacyContainerHidden();

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

/** Render order: legacy DOM order first, unknown kinds appended once each. */
function orderedKinds(buttons: ReadonlyArray<ModalButton>): string[] {
    const requested = buttons.map((b) => b.kind);
    const known = LEGACY_BUTTON_ORDER.filter((kind) => requested.includes(kind));
    const unknown: string[] = [];
    for (const kind of requested) {
        if (!LEGACY_BUTTON_ORDER.includes(kind) && !unknown.includes(kind)) {
            unknown.push(kind);
        }
    }
    return [...known, ...unknown];
}

export default function ActionModal() {
    const modal = useUiStore((s) => s.modal);
    const titleId = useId();
    const descId = useId();

    /** Stays true through the 500 ms scale-out so the exit animation plays. */
    const [rendered, setRendered] = useState<boolean>(modal.visible);
    /** False on the first visible frame so scale-0 -> scale-100 transitions. */
    const [expanded, setExpanded] = useState<boolean>(false);

    useEffect(() => {
        if (modal.visible) {
            setRendered(true);
            // Double rAF replaces the legacy forced-reflow trick
            // (actionModal.offsetHeight): paint one frame at scale-0 first.
            let secondFrame = 0;
            const firstFrame = window.requestAnimationFrame(() => {
                secondFrame = window.requestAnimationFrame(() => setExpanded(true));
            });
            return () => {
                window.cancelAnimationFrame(firstFrame);
                window.cancelAnimationFrame(secondFrame);
            };
        }
        setExpanded(false);
        const hideTimer = window.setTimeout(() => setRendered(false), HIDE_ANIMATION_MS);
        return () => window.clearTimeout(hideTimer);
    }, [modal.visible]);

    /**
     * Tutorial pulse on the FIRST requested button (ui.js ~285). Keyed on
     * modal.buttons: fresh identity per showModal (re-checks shouldShow),
     * same identity on hideModal (pulse persists through the scale-out).
     */
    const suggestFirst = useMemo(
        () => modal.buttons.length > 0 && window.Tutorial?.shouldShow() === true,
        [modal.buttons],
    );

    if (!rendered && !modal.visible) return null;

    const kinds = orderedKinds(modal.buttons);
    const firstKind = modal.buttons[0]?.kind;
    const isOpen = modal.visible && expanded;

    return (
        <div className="fixed inset-0 z-20 flex items-center justify-center pointer-events-none">
            <div
                role="dialog"
                aria-modal="true"
                aria-labelledby={titleId}
                aria-describedby={descId}
                className={`glass-panel paper pointer-events-auto p-10 text-center shadow-[0_40px_110px_rgba(0,0,0,0.6)] transition-all duration-500 max-md:w-[92vw] max-md:max-w-[480px] max-md:p-6 ${
                    isOpen ? 'scale-100' : 'scale-0'
                }`}
            >
                <h2
                    id={titleId}
                    className="font-display text-[2.6rem] leading-[1.05] font-black text-son-700 mb-3 tracking-[0.01em] max-md:text-3xl"
                >
                    {modal.title}
                </h2>
                {/* whitespace-pre-line: legacy set desc via innerText and game.js
                    sends multi-line descs (buy offer: name\nGiá\nTiền thuê). */}
                <p
                    id={descId}
                    className="text-lac-800/75 mb-8 font-bold text-lg whitespace-pre-line max-md:text-[0.9rem]"
                >
                    {modal.desc}
                </p>
                <div className="flex justify-center gap-4 flex-wrap">
                    {kinds.map((kind) => {
                        const look = appearanceFor(kind);
                        const pulse = suggestFirst && kind === firstKind;
                        return (
                            <button
                                key={kind}
                                type="button"
                                onClick={() => proxyClickLegacyButton(kind)}
                                className={`btn-action ${look.bgClass}${pulse ? ' suggest-pulse' : ''}`}
                            >
                                {look.label}
                            </button>
                        );
                    })}
                </div>
            </div>
        </div>
    );
}
