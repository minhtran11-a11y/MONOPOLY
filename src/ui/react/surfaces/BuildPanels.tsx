/**
 * BuildPanels — React replacement for renderBuildMenu() (#build-submenu) and
 * renderMortgagePanel() (#mortgage-panel) in src/ui/ui.js (~328-399), plus
 * the HUD toggle handlers ui.js attaches to #btn-build-menu /
 * #btn-mortgage-menu at DOMContentLoaded.
 *
 * READS:  uiStore.buildMenu / uiStore.mortgagePanel (+ uiStore.modal, only to
 *         mirror the legacy "showModal hides the build submenu" behavior).
 *
 * OVERRIDES (module level, via installFacade — import order wins):
 *   window.renderBuildMenu     -> showBuildMenu(snapshotBuildItems())
 *   window.renderMortgagePanel -> showMortgagePanel(snapshotMortgageItems(),
 *                                 !p || p.isBot)  [p = getCurrentLegacyPlayer()]
 *
 * LEGACY INTEROP:
 *   - ui.js assigns #btn-build-menu.onclick / #btn-mortgage-menu.onclick at
 *     DOMContentLoaded (toggling the legacy panels' 'hidden' class). An effect
 *     re-assigns those .onclick slots to store-backed toggles — both
 *     immediately AND on DOMContentLoaded, so the last writer is us in either
 *     scheduling order.
 *   - Legacy showModal() hid #build-submenu on every call, and hideModal()
 *     hid it implicitly (the submenu lived inside #action-modal). Mirrored
 *     here: any uiStore.modal change closes the build menu.
 *
 * ROW ACTIONS (re-snapshot open panels afterwards so rows refresh):
 *   build    -> window.Game.executeBuildInternal(player, window.boardData[id])
 *               (revalidated against a fresh snapshot at click time, since
 *               executeBuildInternal itself performs no checks)
 *   mortgage -> window.toggleMortgage(tileId)
 * This removes the legacy inline-onclick innerHTML XSS pattern: tile names
 * render as React text, never as markup.
 *
 * DEAD AFTER IMPLEMENTATION: ui.js renderBuildMenu/renderMortgagePanel DOM
 * bodies (incl. their onclick-string HTML) and the legacy #build-submenu /
 * #mortgage-panel toggle wiring in ui.js DOMContentLoaded.
 */

import { useEffect } from 'react';
import {
    uiStore,
    useUiStore,
    type BuildItem,
    type MortgageItem,
} from '../../../store/uiStore.ts';
import {
    getCurrentLegacyPlayer,
    snapshotBuildItems,
    snapshotMortgageItems,
} from '../../../store/gameViewStore.ts';
import { installFacade } from '../facade.ts';

// ---------------------------------------------------------------------------
// Store-backed actions (module level — shared by facade overrides, HUD
// toggles and row buttons; no React state involved)
// ---------------------------------------------------------------------------

const playClick = (): void => {
    window.SoundFX?.click();
};

/** window.renderBuildMenu override — fresh snapshot + show. */
function openBuildMenu(): void {
    uiStore.getState().showBuildMenu(snapshotBuildItems());
}

/** window.renderMortgagePanel override — fresh snapshot + show. */
function openMortgagePanel(): void {
    const p = getCurrentLegacyPlayer();
    uiStore.getState().showMortgagePanel(snapshotMortgageItems(), !p || p.isBot);
}

/** Re-snapshot whichever panels are currently open (after a row action). */
function refreshOpenPanels(): void {
    const state = uiStore.getState();
    if (state.buildMenu.visible) openBuildMenu();
    if (state.mortgagePanel.visible) openMortgagePanel();
}

/** Mirrors ui.js #btn-build-menu.onclick (click sound + toggle). */
function toggleBuildMenu(): void {
    playClick();
    const state = uiStore.getState();
    if (state.buildMenu.visible) state.hideBuildMenu();
    else openBuildMenu();
}

/** Mirrors ui.js #btn-mortgage-menu.onclick (click sound + toggle). */
function toggleMortgagePanel(): void {
    playClick();
    const state = uiStore.getState();
    if (state.mortgagePanel.visible) state.hideMortgagePanel();
    else openMortgagePanel();
}

/**
 * Build one house on `tileId`. executeBuildInternal deducts money and bumps
 * houses with NO validation, so revalidate against a fresh snapshot first
 * (guards stale rows / double clicks — the legacy menu never refreshed at all).
 */
function handleBuild(tileId: number): void {
    const game = window.Game;
    const player = getCurrentLegacyPlayer();
    const tile = window.boardData?.[tileId];
    const fresh = snapshotBuildItems().find((item) => item.tileId === tileId);
    if (game && player && tile && fresh?.canBuild) {
        game.executeBuildInternal(player, tile);
    }
    refreshOpenPanels();
}

/** Mortgage/redeem `tileId` (game.js validates + toasts), then refresh rows. */
function handleToggleMortgage(tileId: number): void {
    window.toggleMortgage?.(tileId);
    refreshOpenPanels();
}

installFacade(
    {
        renderBuildMenu: openBuildMenu,
        renderMortgagePanel: openMortgagePanel,
    },
    'BuildPanels',
);

// ---------------------------------------------------------------------------
// Rows
// ---------------------------------------------------------------------------

function BuildRow({ item }: { item: BuildItem }) {
    return (
        <div className="bg-white/5 rounded-xl p-3 border border-white/5 flex flex-col gap-2">
            <div className="flex justify-between items-start">
                <div className="text-left">
                    <div className="text-[10px] font-black uppercase text-slate-900 line-clamp-1">
                        {item.name}
                    </div>
                    <div className="text-[9px] font-bold text-slate-500 italic">
                        {item.isMortgaged ? (
                            <span className="text-red-500">ĐANG CẦM CỐ</span>
                        ) : item.houses === 5 ? (
                            'Khách sạn'
                        ) : item.houses > 0 ? (
                            `${item.houses} Nhà`
                        ) : (
                            'Đất trống'
                        )}
                    </div>
                </div>
            </div>
            <div className="flex gap-2">
                {item.canBuild && (
                    <button
                        type="button"
                        onClick={() => handleBuild(item.tileId)}
                        className="flex-1 bg-slate-900 hover:bg-indigo-600 text-white text-[9px] font-black py-2 rounded-lg transition-all"
                    >
                        {`XÂY NÀY ($${item.houseCost ?? 0})`}
                    </button>
                )}
            </div>
        </div>
    );
}

function MortgageRow({ item }: { item: MortgageItem }) {
    return (
        <div className="bg-white/5 rounded-xl p-3 border border-white/5 flex justify-between items-center gap-3">
            <div className="text-left flex-1">
                <div className="text-[10px] font-black uppercase text-slate-900 line-clamp-1">
                    {item.name}
                </div>
                <div
                    className={`text-[9px] font-bold ${item.isMortgaged ? 'text-red-500' : 'text-emerald-500'} italic`}
                >
                    {item.isMortgaged
                        ? 'ĐANG CẦM CỐ'
                        : item.houses > 0
                          ? `${item.houses} nhà - cần bán nhà trước`
                          : 'Có thể cầm cố'}
                </div>
            </div>
            {item.canToggle && (
                <button
                    type="button"
                    onClick={() => handleToggleMortgage(item.tileId)}
                    className={`${item.isMortgaged ? 'bg-emerald-600' : 'bg-amber-600'} text-white text-[9px] font-black py-2 px-3 rounded-lg transition-all uppercase whitespace-nowrap`}
                >
                    {item.isMortgaged ? `Chuộc $${item.redeemCost}` : `Cầm $${item.mortgageValue}`}
                </button>
            )}
        </div>
    );
}

// ---------------------------------------------------------------------------
// Panels
// ---------------------------------------------------------------------------

/**
 * Legacy #build-submenu lived inside the centered #action-modal, under its
 * buttons — rendered standalone here as a fixed, horizontally-centered panel
 * just below the action modal area. z-40: above HUD (z-10) and dice overlay
 * (z-30), below menu screens (z-50).
 */
function BuildMenuPanel({ items }: { items: BuildItem[] }) {
    return (
        <section
            role="dialog"
            aria-labelledby="react-build-submenu-title"
            className="fixed left-1/2 top-[56%] -translate-x-1/2 z-40 w-[30rem] max-w-[92vw] glass-panel border-white/10 overflow-hidden flex flex-col pointer-events-auto animate-in fade-in slide-in-from-bottom-2 duration-200"
        >
            <header className="p-4 border-b border-white/10 flex justify-between items-center bg-slate-900/20">
                <h5
                    id="react-build-submenu-title"
                    className="text-[10px] font-black uppercase tracking-[0.2em] text-indigo-500"
                >
                    Quản lý bất động sản
                </h5>
                <button
                    type="button"
                    aria-label="Đóng quản lý bất động sản"
                    onClick={() => uiStore.getState().hideBuildMenu()}
                    className="text-slate-400 hover:text-white"
                >
                    ✕
                </button>
            </header>
            <div className="max-h-64 overflow-y-auto custom-scrollbar p-2 space-y-2">
                {items.length === 0 && (
                    <div className="text-[10px] text-center py-4 text-slate-500 font-bold uppercase italic">
                        Chưa sở hữu đất
                    </div>
                )}
                {items.map((item) => (
                    <BuildRow key={item.tileId} item={item} />
                ))}
            </div>
        </section>
    );
}

/**
 * Legacy #mortgage-panel sat in the top-left HUD column (top-8 left-8, below
 * the button row) — fixed at the equivalent spot.
 */
function MortgagePanelCard({
    notYourTurn,
    items,
}: {
    notYourTurn: boolean;
    items: MortgageItem[];
}) {
    return (
        <section
            role="dialog"
            aria-label="Cầm cố / Chuộc đất"
            className="fixed left-8 top-[5.5rem] z-40 w-96 max-w-[calc(100vw-4rem)] max-h-80 glass-panel border-white/10 overflow-hidden flex flex-col pointer-events-auto animate-in fade-in slide-in-from-left-2 duration-200"
        >
            {notYourTurn ? (
                <div className="p-6 text-center text-slate-500 text-[10px] font-black uppercase">
                    Không phải lượt của bạn
                </div>
            ) : (
                <>
                    <header className="p-4 border-b border-white/10 flex justify-between items-center bg-slate-900/20">
                        <h5 className="text-[10px] font-black uppercase tracking-[0.2em] text-amber-500">
                            🏦 Cầm cố / Chuộc đất
                        </h5>
                        <button
                            type="button"
                            aria-label="Đóng bảng cầm cố"
                            onClick={() => uiStore.getState().hideMortgagePanel()}
                            className="text-slate-400 hover:text-white"
                        >
                            ✕
                        </button>
                    </header>
                    <div className="max-h-56 overflow-y-auto custom-scrollbar p-2 space-y-2">
                        {items.length === 0 && (
                            <div className="text-[10px] text-center py-4 text-slate-500 font-bold uppercase italic">
                                Chưa sở hữu đất nào
                            </div>
                        )}
                        {items.map((item) => (
                            <MortgageRow key={item.tileId} item={item} />
                        ))}
                    </div>
                </>
            )}
        </section>
    );
}

// ---------------------------------------------------------------------------
// Surface
// ---------------------------------------------------------------------------

export default function BuildPanels() {
    const buildMenu = useUiStore((s) => s.buildMenu);
    const mortgagePanel = useUiStore((s) => s.mortgagePanel);
    const modal = useUiStore((s) => s.modal);

    // Re-bind the HUD toggles. ui.js assigns these .onclick slots in its
    // DOMContentLoaded handler; assigning here AND on DOMContentLoaded makes
    // us the last writer regardless of whether this effect runs before or
    // after that event (ui.js registered its listener first, so ours fires
    // after it).
    useEffect(() => {
        const bind = (): void => {
            const btnBuild = document.getElementById('btn-build-menu');
            if (btnBuild) btnBuild.onclick = toggleBuildMenu;
            const btnMortgage = document.getElementById('btn-mortgage-menu');
            if (btnMortgage) btnMortgage.onclick = toggleMortgagePanel;
        };
        bind();
        document.addEventListener('DOMContentLoaded', bind);
        return () => {
            document.removeEventListener('DOMContentLoaded', bind);
            const btnBuild = document.getElementById('btn-build-menu');
            if (btnBuild && btnBuild.onclick === toggleBuildMenu) btnBuild.onclick = null;
            const btnMortgage = document.getElementById('btn-mortgage-menu');
            if (btnMortgage && btnMortgage.onclick === toggleMortgagePanel) {
                btnMortgage.onclick = null;
            }
        };
    }, []);

    // Mirror legacy modal coupling: showModal() always reset #build-submenu to
    // hidden, and hideModal() hid it with its parent #action-modal. The store
    // creates a new modal object per show/hide call, so closing on every
    // `modal` identity change reproduces both. (Mortgage panel was independent
    // of the modal in legacy — left untouched.)
    useEffect(() => {
        const state = uiStore.getState();
        if (state.buildMenu.visible) state.hideBuildMenu();
    }, [modal]);

    // Escape closes whichever panels are open (closeable-popover a11y).
    const anyOpen = buildMenu.visible || mortgagePanel.visible;
    useEffect(() => {
        if (!anyOpen) return;
        const onKeyDown = (e: KeyboardEvent): void => {
            if (e.key !== 'Escape') return;
            const state = uiStore.getState();
            if (state.buildMenu.visible) state.hideBuildMenu();
            if (state.mortgagePanel.visible) state.hideMortgagePanel();
        };
        document.addEventListener('keydown', onKeyDown);
        return () => document.removeEventListener('keydown', onKeyDown);
    }, [anyOpen]);

    return (
        <>
            {buildMenu.visible && <BuildMenuPanel items={buildMenu.items} />}
            {mortgagePanel.visible && (
                <MortgagePanelCard
                    notYourTurn={mortgagePanel.notYourTurn}
                    items={mortgagePanel.items}
                />
            )}
        </>
    );
}
