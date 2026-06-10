/**
 * ActionModal — React replacement for showModal()/hideModal()
 * (src/ui/ui.js lines ~259-326) and the #action-modal panel.
 *
 * READS:  uiStore.modal ({ visible, title, desc, buttons: ModalButton[] }).
 *         Button kinds actually used by game.js: 'roll', 'buy', 'skip',
 *         'end', 'build-menu' (see ModalButtonKind in src/store/uiStore.ts);
 *         victory shows a modal with zero buttons.
 *
 * OVERRIDES (via installFacade):
 *   window.showModal -> (title, desc, buttons = []) => uiStore.getState().showModal(title, desc, buttons)
 *   window.hideModal -> () => uiStore.getState().hideModal()
 *
 * CRITICAL LEGACY INTEROP (do not skip):
 * game.js binds behavior DIRECTLY onto the legacy DOM buttons and clicks them
 * programmatically:
 *   - _bindRollButton: #btn-roll.onclick (game.js line ~612)
 *   - landOnTile:      #btn-buy.onclick / #btn-skip.onclick (game.js ~253)
 *   - checkEndTurnPhase: #btn-end.onclick (game.js end-phase block)
 *   - jail auto-roll:  document.getElementById('btn-roll').click() (game.js ~88)
 *   - ui.js keyboard shortcuts (Space/E/B) click #btn-roll/#btn-end/#btn-buy
 *     only when the button does NOT have the 'hidden' class.
 * Therefore:
 *   1. The legacy #btn-* elements must STAY in the DOM (legacy #action-modal
 *      container remains permanently display-hidden).
 *   2. React buttons proxy: document.getElementById(legacyButtonId(kind))?.click().
 *   3. The showModal/hideModal overrides must ALSO mirror legacy visibility
 *      onto the legacy buttons: remove 'hidden' from each listed btn-<kind>,
 *      add 'hidden' to the rest (the exact 5 ids ui.js resets) — this keeps
 *      keyboard shortcuts and the jail auto-roll functional.
 *   4. 'build-menu' / surrender / mortgage HUD buttons interact with
 *      BuildPanels — only toggle visibility here.
 * Tutorial suggest-pulse: highlight the FIRST button when
 * window.Tutorial?.shouldShow() is true (ui.js ~285).
 *
 * DEAD AFTER IMPLEMENTATION: ui.js showModal/hideModal DOM bodies and the
 * visual part of #action-modal (its hidden buttons remain as event proxies
 * until game.js itself is migrated).
 */
export default function ActionModal() {
    return null;
}
