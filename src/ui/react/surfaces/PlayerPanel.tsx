/**
 * PlayerPanel — React replacement for renderPlayerUI()/updatePlayerUI()
 * (src/ui/ui.js line ~202) rendering into #players-container.
 *
 * READS:  gameViewStore.players (PlayerVM[]), gameViewStore.currentPlayerIndex.
 *         PlayerVM already includes computed propertiesCount / netWorth /
 *         colorGroups (ported from ui.js computePlayerStats).
 *
 * OVERRIDES (via installFacade):
 *   window.updatePlayerUI -> () => gameViewStore.getState().refreshFromWindow()
 *   window.renderPlayerUI -> same (game.js calls BOTH names; ui.js's
 *                            updatePlayerUI just forwards to renderPlayerUI)
 *   NOTE: leave window.computePlayerStats alone — the snapshot already
 *   computes stats; other legacy code may still call it.
 *
 * CARD CONTENT to reproduce (per player): name + 🤖/👤 + tokenKind tag,
 * "position / 40" badge, formatted money (use window.Utils?.formatMoney or a
 * local formatter), jail/active status dot ("Đang trong tù" / "Đang hoạt
 * động"), bot thinking dots when isThinking, and for humans or the current
 * player a stats block: "Giá trị tài sản" netWorth, "Đất sở hữu"
 * propertiesCount, "Bộ màu hoàn chỉnh" colorGroups. Current player gets
 * ring/scale highlight; bankrupt gets grayscale/opacity.
 *
 * KEEP WORKING: the mobile drawer toggle (#players-shell / #players-toggle
 * is-open class, wired in ui.js DOMContentLoaded) — either render inside the
 * existing shell or take over the toggle behavior.
 *
 * DEAD AFTER IMPLEMENTATION: ui.js renderPlayerUI DOM body (computePlayerStats
 * stays alive as a window fn for any remaining legacy callers).
 */
export default function PlayerPanel() {
    return null;
}
