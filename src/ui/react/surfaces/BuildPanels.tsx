/**
 * BuildPanels — React replacement for renderBuildMenu() (#build-submenu) and
 * renderMortgagePanel() (#mortgage-panel) in src/ui/ui.js (~328-399), plus
 * the HUD toggle handlers ui.js attaches to #btn-build-menu /
 * #btn-mortgage-menu at DOMContentLoaded.
 *
 * READS:  uiStore.buildMenu ({ visible, items: BuildItem[] }),
 *         uiStore.mortgagePanel ({ visible, notYourTurn, items: MortgageItem[] }).
 *
 * OVERRIDES (via installFacade):
 *   window.renderBuildMenu     -> () => uiStore.getState().showBuildMenu(snapshotBuildItems())
 *   window.renderMortgagePanel -> () => { const p = getCurrentLegacyPlayer();
 *                                   uiStore.getState().showMortgagePanel(
 *                                     snapshotMortgageItems(), !p || p.isBot); }
 *   (snapshot helpers + getCurrentLegacyPlayer come from src/store/gameViewStore.ts
 *    so item shapes can't drift.)
 *
 * ALSO REQUIRED: re-bind the HUD toggles — ui.js sets
 * #btn-build-menu.onclick / #btn-mortgage-menu.onclick to toggle the LEGACY
 * panels' 'hidden' class. Re-assign those .onclick handlers (assignment, so
 * the last writer wins) to toggle the store slices instead (re-snapshot items
 * on every open so the data is fresh).
 *
 * ROW ACTIONS (then re-snapshot into the store so the panel refreshes):
 *   build:    window.Game.executeBuildInternal(legacyPlayer, window.boardData[tileId])
 *             — label "XÂY NÀY ($houseCost)", only when item.canBuild.
 *   mortgage: window.toggleMortgage(tileId) — label "Cầm $mortgageValue" /
 *             "Chuộc $redeemCost", only when item.canToggle; tiles with
 *             houses show "cần bán nhà trước".
 * Status text: 5 houses = "Khách sạn", >0 = "<n> Nhà", mortgaged =
 * "ĐANG CẦM CỐ", else "Đất trống" / "Có thể cầm cố".
 *
 * DEAD AFTER IMPLEMENTATION: ui.js renderBuildMenu/renderMortgagePanel DOM
 * bodies (including their inline-onclick HTML strings) and the legacy
 * #build-submenu/#mortgage-panel toggle wiring.
 */
export default function BuildPanels() {
    return null;
}
