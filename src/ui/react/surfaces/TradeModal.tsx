/**
 * TradeModal — React replacement for the trade dialog in src/ui/trade.js
 * (window.TradeUI = { open, close }).
 *
 * READS:  uiStore.tradeOpen; gameViewStore.players (partner picker — exclude
 *         bankrupt players and self); window.boardData for tradeable tiles
 *         (owned, unmortgaged, no houses — per trade.js rules and the
 *         TradeOffer contract in src/core/types.ts).
 *
 * OVERRIDES (via installFacade):
 *   window.TradeUI -> { open:  () => uiStore.getState().openTrade(),
 *                       close: () => uiStore.getState().closeTrade() }
 *   (ui.js #btn-trade onclick calls window.TradeUI.open() — keeps working.)
 *
 * EXECUTION: the money/tile transfer + bot accept/decline heuristic currently
 * live INSIDE src/ui/trade.js — port that execution logic (money swap, tile
 * owner reassignment, ownership visuals via window.applyOwnershipVisual /
 * updatePlayerUI, logMsg + Toast feedback) or, preferably, route through the
 * typed TRADE_EXECUTE action of src/core/rules_core.ts when the rules core is
 * wired. After executing: window.updatePlayerUI() (refreshes gameViewStore
 * via the PlayerPanel override) and notify via window.Toast/window.logMsg
 * overrides.
 *
 * DEAD AFTER IMPLEMENTATION: src/ui/trade.js entirely (DOM modal + its
 * window.TradeUI assignment + inline trade execution).
 */
export default function TradeModal() {
    return null;
}
