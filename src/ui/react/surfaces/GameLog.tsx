/**
 * GameLog — React replacement for logMsg()'s DOM appends into #game-log
 * (src/ui/ui.js line ~191) and game.js window.exportGameLog DOM scraping.
 *
 * READS:  uiStore.log (LogEntry[], capped at LOG_LIMIT=80).
 *
 * OVERRIDES (installFacade, module level — imported after the legacy modules
 * so these assignments win):
 *   window.logMsg        -> uiStore.pushLog (plus legacy-parity clear-on-new-game,
 *                           see NEW_GAME_LOG_PREFIX below)
 *   window.exportGameLog -> rebuilds the .txt download from uiStore.log instead
 *                           of scraping `#game-log span.text-slate-700`.
 *   window.notify is NOT overridden (it keeps delegating to logMsg/Toast).
 *
 * PLACEMENT: the legacy log panel is the `.glass-panel.w-96.h-80` block inside
 * the fixed HUD column (`#game-ui-layer > .absolute.top-8.left-8`, below the
 * HUD buttons and #mortgage-panel). To occupy EXACTLY that slot — including
 * the mobile rule `#game-ui-layer .glass-panel.w-96.h-80 { width:100%; ... }`
 * and the downward push while the legacy mortgage panel is open — the React
 * panel portals into that flex column and the (now chrome-only, entry-less)
 * legacy wrapper is display:none'd at mount (restored on unmount; #game-log
 * itself STAYS in the DOM so Game.init's `innerHTML = ''` keeps working).
 * If the legacy column is missing, falls back to a position:fixed panel at
 * the legacy coordinates.
 *
 * INTEROP SHIM: inside ui.js, notify() and the surrender handler call logMsg
 * via the MODULE-SCOPE binding — window.logMsg overrides can't intercept
 * those. A MutationObserver drains any node the legacy logMsg still appends
 * to #game-log into uiStore.pushLog (as plain text) and removes it, so e.g.
 * "🏳️ ... đã đầu hàng!" is not lost.
 *
 * SAFE RENDERING: LogEntry.html is the raw logMsg string. The only known
 * markup producer is bot small-talk (game.js line ~502); that exact span
 * pattern is regex-parsed into styled React spans, everything else renders
 * as plain text with tags stripped. Never dangerouslySetInnerHTML.
 *
 * DEAD AFTER THIS FILE: ui.js logMsg DOM body (only reachable through the
 * drain shim), game.js window.exportGameLog DOM scraping.
 */

import { memo, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import type { ReactElement } from 'react';
import { uiStore, useUiStore } from '../../../store/uiStore.ts';
import type { LogEntry } from '../../../store/uiStore.ts';
import { installFacade } from '../facade.ts';

// ---------------------------------------------------------------------------
// window overrides (run at module import time)
// ---------------------------------------------------------------------------

/**
 * Game.init (game.js line ~45) wipes #game-log right before logging this
 * welcome line — there is no window hook for the wipe itself, so seeing the
 * welcome line again IS the legacy "new game started, clear the log" signal.
 */
const NEW_GAME_LOG_PREFIX = 'Chào mừng bạn đến với Cờ Tỷ Phú!';

/** Same tag-stripping the legacy code used for toast copies of log lines. */
const stripTags = (html: string): string => html.replace(/<[^>]*>/g, '');

const handleLegacyLogMsg = (msg: string): void => {
    const text = typeof msg === 'string' ? msg : String(msg);
    const { log, clearLog } = uiStore.getState();
    if (log.length > 0 && text.startsWith(NEW_GAME_LOG_PREFIX)) clearLog();
    uiStore.getState().pushLog(text);
};

/** Legacy parity: object URL revoked 1s after the download click. */
const URL_REVOKE_DELAY_MS = 1000;

const exportGameLogFromStore = (): void => {
    const lines = uiStore.getState().log.map((entry) => stripTags(entry.html));
    const blob = new Blob([lines.join('\n')], { type: 'text/plain;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement('a');
    const stamp = new Date().toISOString().replace(/[:.]/g, '-');
    anchor.href = url;
    anchor.download = `monopoly-log-${stamp}.txt`;
    document.body.appendChild(anchor);
    anchor.click();
    anchor.remove();
    window.setTimeout(() => URL.revokeObjectURL(url), URL_REVOKE_DELAY_MS);
    window.Toast?.show('Đã xuất nhật ký trận đấu', { type: 'success' });
};

installFacade(
    {
        logMsg: handleLegacyLogMsg,
        exportGameLog: exportGameLogFromStore,
    },
    'GameLog',
);

// ---------------------------------------------------------------------------
// Safe rendering of LogEntry.html
// ---------------------------------------------------------------------------

/** Exact bot small-talk markup emitted by game.js botChat() (line ~502). */
const BOT_CHAT_RE =
    /^<span class="text-indigo-500 font-black">\[([\s\S]*?)\]:<\/span> <span class="italic text-slate-600">"([\s\S]*?)"<\/span>$/;

function renderEntryContent(html: string): ReactElement {
    const match = BOT_CHAT_RE.exec(html);
    if (match) {
        const [, botName = '', quote = ''] = match;
        return (
            <span className="text-ivory/80">
                <span className="text-gold-300 font-black">[{botName}]:</span>{' '}
                <span className="italic text-gold-300/70">"{quote}"</span>
            </span>
        );
    }
    return <span className="text-ivory/80">{stripTags(html)}</span>;
}

const LogLine = memo(function LogLine({ entry }: { entry: LogEntry }) {
    // Same row markup/animation as the legacy logMsg() div (ui.js line ~195).
    return (
        <div className="flex items-start gap-2 animate-in fade-in slide-in-from-left-2 duration-300">
            <span
                aria-hidden="true"
                className="w-1.5 h-1.5 mt-2 bg-gold-400 rounded-full flex-shrink-0 shadow-[0_0_8px_rgba(232,193,107,0.8)]"
            />
            {renderEntryContent(entry.html)}
        </div>
    );
});

// ---------------------------------------------------------------------------
// Surface
// ---------------------------------------------------------------------------

const HEADER_BUTTON_CLASS = 'log-icon-btn focus-visible:outline-none';

export default function GameLog() {
    const log = useUiStore((s) => s.log);
    const scrollRef = useRef<HTMLDivElement | null>(null);
    const [host, setHost] = useState<HTMLElement | null>(null);

    // Claim the legacy panel's slot: hide the chrome-only legacy wrapper and
    // portal into its parent flex column (buttons row / mortgage panel stay).
    useLayoutEffect(() => {
        const legacyLog = document.getElementById('game-log');
        const legacyPanel = legacyLog?.closest<HTMLElement>('.glass-panel') ?? null;
        const previousDisplay = legacyPanel?.style.display ?? '';
        if (legacyPanel) legacyPanel.style.display = 'none';
        setHost(legacyPanel?.parentElement ?? null);
        return () => {
            if (legacyPanel) legacyPanel.style.display = previousDisplay;
        };
    }, []);

    // Drain shim: ui.js-internal logMsg calls (notify(), surrender handler)
    // bypass the window override and still append to #game-log — harvest those
    // nodes into the store as plain text and keep the legacy element empty.
    useEffect(() => {
        const legacyLog = document.getElementById('game-log');
        if (!legacyLog) return undefined;

        const drainNode = (node: Node): void => {
            if (node instanceof Element) {
                const span = node.querySelector('span.text-slate-700');
                const text = (span?.textContent ?? node.textContent ?? '').trim();
                if (text.length > 0) uiStore.getState().pushLog(text);
                node.remove();
                return;
            }
            node.parentNode?.removeChild(node);
        };

        for (const child of Array.from(legacyLog.childNodes)) drainNode(child);

        const observer = new MutationObserver((mutations) => {
            for (const mutation of mutations) {
                for (const node of Array.from(mutation.addedNodes)) drainNode(node);
            }
        });
        observer.observe(legacyLog, { childList: true });
        return () => observer.disconnect();
    }, []);

    // Legacy order: append at the bottom + always auto-scroll to the newest.
    useEffect(() => {
        const el = scrollRef.current;
        if (el) el.scrollTop = el.scrollHeight;
    }, [log]);

    const panel = (
        <section
            aria-label="Lịch sử trận đấu"
            className="glass-panel w-96 h-80 p-6 flex flex-col border-white/10 pointer-events-auto"
        >
            <div className="flex items-center justify-between mb-4 border-b border-white/10 pb-2">
                <h4 className="text-sm font-black uppercase tracking-widest text-gold-300/70">
                    Lịch sử trận đấu
                </h4>
                <div className="flex gap-1">
                    <button
                        type="button"
                        onClick={() => window.replayLastRoll?.()}
                        aria-label="Xem lại lần tung xúc xắc"
                        title="Xem lại lần tung xúc xắc"
                        className={HEADER_BUTTON_CLASS}
                    >
                        🎲
                    </button>
                    <button
                        type="button"
                        onClick={exportGameLogFromStore}
                        aria-label="Xuất nhật ký"
                        title="Xuất nhật ký"
                        className={HEADER_BUTTON_CLASS}
                    >
                        📋
                    </button>
                </div>
            </div>
            <div
                ref={scrollRef}
                role="log"
                className="flex-1 overflow-y-auto text-sm space-y-3 font-bold text-ivory/80 custom-scrollbar"
            >
                {log.map((entry) => (
                    <LogLine key={entry.id} entry={entry} />
                ))}
            </div>
        </section>
    );

    if (host) return createPortal(panel, host);

    // Fallback (legacy HUD column not found): fixed panel at the legacy spot —
    // 32px (top-8) + ~42px HUD button row + 16px (gap-4). Hidden while the log
    // is empty so nothing floats over the menu before a game starts.
    if (log.length === 0) return null;
    return <div className="fixed top-[90px] left-8 z-10 pointer-events-none">{panel}</div>;
}
