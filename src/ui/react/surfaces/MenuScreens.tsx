/**
 * MenuScreens — React replacement for the menu screen flow in src/ui/menu.js
 * (MenuManager screens: screen-intro, screen-modes, screen-bot-detail,
 * screen-auth, screen-online-detail, screen-online-lobby) and the rules
 * modal open/close in ui.js (window.showRules/closeRules + #rules-modal).
 *
 * READS:  uiStore.rulesOpen (+ local React state or a future menu slice for
 *         the current screen, auth form, lobby roster).
 *
 * OVERRIDES (via installFacade):
 *   window.showRules  -> () => uiStore.getState().openRules()
 *   window.closeRules -> () => uiStore.getState().closeRules()
 *   window.MenuManager -> keep the legacy object but replace showScreen()
 *     with a store/state-driven implementation (other legacy code calls
 *     MenuManager.showScreen / .launchGame / .currentUser — preserve the
 *     full object shape from LegacyMenuManager in ../facade.ts).
 *
 * LAUNCH CONTRACT (port faithfully from menu.js launchGame, line ~265):
 *   window._gameMode = mode; await window._loadThreeJS(); window.ensure3DInit();
 *   hide #main-menu-layer; show #game-ui-layer; Game.init(total, mode);
 *   window.GameSave.attachAutoSave(); optional GameSave.restoreInto(snap);
 *   BGM via Settings.get().bgmEnabled; welcome Toast; Cinematics.playIntro();
 *   Tutorial.start() on first run. ALSO call uiStore.getState().clearLog()
 *   and gameViewStore.getState().refreshFromWindow() here — Game.init clears
 *   the legacy DOM log directly and the GameLog override cannot see that
 *   (see GameLog.tsx header).
 * Resume flow: window.GameSave.hasSavedGame() / .load() drive the
 * "Tiếp tục" button (menu.js ~86).
 *
 * SCOPE NOTE: the fake online lobby (room list, lobby polling) may stay
 * legacy initially — override screen navigation + bot flow + rules modal
 * first; the canvas logo (drawMenuLogo) can be reused via window.drawMenuLogo.
 *
 * DEAD AFTER IMPLEMENTATION: menu.js MenuManager.init DOM wiring +
 * showScreen animations; ui.js rules-modal listeners (X buttons, backdrop,
 * ESC — reimplement all three in React for parity).
 */
export default function MenuScreens() {
    return null;
}
