/**
 * GameLog — React replacement for logMsg()'s DOM appends into #game-log
 * (src/ui/ui.js line ~191).
 *
 * READS:  uiStore.log (LogEntry[], capped at LOG_LIMIT=80).
 *
 * OVERRIDES (via installFacade):
 *   window.logMsg        -> (msg) => uiStore.getState().pushLog(msg)
 *   window.exportGameLog -> rebuild the .txt download from uiStore.log
 *                           (the legacy version in game.js scrapes
 *                           `#game-log span.text-slate-700` DOM nodes, which
 *                           will be empty once this surface owns the log).
 *   NOTE: do NOT override window.notify — ui.js notify() delegates to
 *   logMsg + Toast.show and keeps working through those overrides.
 *
 * SAFE RENDERING (required): LogEntry.html is a raw string. The ONLY
 * intentional markup producer is bot small-talk (game.js line ~495):
 *   <span class="text-indigo-500 font-black">[NAME]:</span> <span class="italic text-slate-600">"MSG"</span>
 * Parse that exact pattern with a regex into styled React spans; render every
 * other entry as plain text (strip any tags). Never dangerouslySetInnerHTML.
 *
 * NEW-GAME CLEAR caveat: Game.init (game.js line ~42) clears the log by
 * writing `#game-log.innerHTML = ''` DIRECTLY — there is no window function
 * to override. Until MenuScreens owns the launch flow (and calls
 * uiStore.getState().clearLog() there), stale entries persist across
 * restarts; coordinate with the MenuScreens agent.
 *
 * BEHAVIOR to reproduce: append + auto-scroll to bottom (scrollTop =
 * scrollHeight on new entries), entry fade/slide-in styling.
 *
 * DEAD AFTER IMPLEMENTATION: ui.js logMsg DOM body, game.js
 * window.exportGameLog DOM scraping.
 */
export default function GameLog() {
    return null;
}
