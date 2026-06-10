/**
 * PlayerPanel — React replacement for renderPlayerUI()/updatePlayerUI()
 * (legacy: src/ui/ui.js line ~202, which rendered into #players-container).
 *
 * OVERRIDES (module level via installFacade — imported after legacy, so wins):
 *   window.updatePlayerUI -> gameViewStore.getState().refreshFromWindow()
 *   window.renderPlayerUI -> same (game.js calls both names)
 *   window.computePlayerStats is intentionally LEFT ALONE — the PlayerVM
 *   snapshot already carries computed stats; legacy callers keep their fn.
 *
 * RENDERING: portals the cards into the legacy #players-container so the
 * responsive shell CSS keeps working unchanged (.players-shell: desktop
 * top-right column / mobile bottom-sheet drawer, css/style.css line ~188).
 *
 * MOBILE DRAWER TOGGLE: ui.js (DOMContentLoaded) already binds a click
 * listener directly on #players-toggle. Binding a second plain listener would
 * toggle `is-open` twice per tap (net no-op), so this surface intercepts the
 * click with a document-level CAPTURE-phase listener (ancestor capture always
 * fires before at-target listeners) and stops propagation, then applies the
 * same legacy behavior: toggle .is-open on #players-shell, sync
 * aria-expanded, play SoundFX.click(). Cleaned up on unmount — the untouched
 * legacy listener then resumes control. The legacy elements are never removed.
 */

import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import {
    gameViewStore,
    useGameViewStore,
    type PlayerVM,
} from '../../../store/gameViewStore.ts';
import { installFacade } from '../facade.ts';

// ---------------------------------------------------------------------------
// window overrides — module level, runs at import time (after legacy modules)
// ---------------------------------------------------------------------------

const refreshGameView = (): void => {
    gameViewStore.getState().refreshFromWindow();
};

installFacade(
    { updatePlayerUI: refreshGameView, renderPlayerUI: refreshGameView },
    'PlayerPanel',
);

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const BOARD_SIZE = 40;

/** window.Utils.formatMoney with a faithful local fallback (core/utils.js). */
function formatMoney(amount: number): string {
    const legacyFormat = window.Utils?.formatMoney;
    return typeof legacyFormat === 'function'
        ? legacyFormat(amount)
        : `$${amount.toLocaleString()}`;
}

/** Tile name at a board position (boardData names are static after load). */
function tileNameAt(position: number): string {
    return window.boardData?.[position]?.name ?? '';
}

// ---------------------------------------------------------------------------
// Card (legacy template: ui.js renderPlayerUI, line ~205)
// ---------------------------------------------------------------------------

interface PlayerCardProps {
    player: PlayerVM;
    isCurrent: boolean;
}

function PlayerCard({ player, isCurrent }: PlayerCardProps) {
    const tileName = tileNameAt(player.position);
    const cardClass = [
        'glass-panel p-5 w-72 border-l-[12px] transition-all duration-500 flex flex-col gap-1',
        player.bankrupt ? 'opacity-40 grayscale scale-95' : 'shadow-xl',
        isCurrent ? 'ring-4 ring-white/50 scale-105 z-20 bg-white/60' : '',
    ]
        .filter(Boolean)
        .join(' ');

    return (
        <div className={cardClass} style={{ borderLeftColor: player.colorHex }}>
            <div className="flex justify-between items-center gap-2">
                <span className="font-black text-ivory text-lg truncate flex items-center min-w-0">
                    <span
                        className="w-2 h-2 rounded-full flex-shrink-0 mr-2"
                        style={{ backgroundColor: player.colorHex }}
                        aria-hidden="true"
                    />
                    <span className={`truncate ${player.bankrupt ? 'line-through' : ''}`}>
                        {player.name} {player.isBot ? '🤖' : '👤'}
                    </span>
                    {player.tokenKind !== '' && (
                        <span className="text-[9px] font-black uppercase tracking-widest text-gold-300/55 ml-2 flex-shrink-0">
                            {player.tokenKind}
                        </span>
                    )}
                </span>
                <span
                    className="text-[10px] font-black px-2 py-1 bg-gold-400/10 text-gold-300/80 rounded-lg uppercase tracking-widest whitespace-nowrap flex-shrink-0"
                    title={tileName}
                >
                    {player.position} / {BOARD_SIZE}
                </span>
            </div>
            {/* Money — the headline figure. Gold leaf, serif, tabular for alignment. */}
            <div className="font-display text-3xl font-black text-gold-300 my-1 tabular-nums tracking-tight">
                {formatMoney(player.money)}
            </div>
            {tileName !== '' && (
                <div className="text-[9px] font-bold text-gold-300/55 uppercase tracking-widest truncate">
                    📍 {tileName}
                </div>
            )}
            <div className="flex justify-between items-center">
                <div className="flex items-center gap-2">
                    <div
                        className={`w-2 h-2 rounded-full ${player.inJail ? 'bg-terracotta animate-pulse' : 'bg-jade-400'}`}
                    />
                    <span
                        className={`text-[10px] font-black uppercase tracking-widest ${player.inJail ? 'text-terracotta' : 'text-jade-400'}`}
                    >
                        {player.inJail ? 'Đang trong tù' : 'Đang hoạt động'}
                    </span>
                </div>
                {player.isThinking && (
                    <div
                        className="flex gap-1"
                        role="status"
                        aria-label={`${player.name} đang suy nghĩ`}
                    >
                        <span className="w-1.5 h-1.5 bg-gold-400 rounded-full animate-bounce" />
                        <span
                            className="w-1.5 h-1.5 bg-gold-400 rounded-full animate-bounce"
                            style={{ animationDelay: '-0.15s' }}
                        />
                        <span
                            className="w-1.5 h-1.5 bg-gold-400 rounded-full animate-bounce"
                            style={{ animationDelay: '-0.3s' }}
                        />
                    </div>
                )}
            </div>
            {(!player.isBot || isCurrent) && (
                <div className="stats-panel" aria-label="Thống kê người chơi">
                    <div className="stat">
                        <span>Giá trị tài sản</span>
                        <strong>{formatMoney(player.netWorth)}</strong>
                    </div>
                    <div className="stat">
                        <span>Đất sở hữu</span>
                        <strong>{player.propertiesCount}</strong>
                    </div>
                    <div className="stat">
                        <span>Bộ màu hoàn chỉnh</span>
                        <strong>{player.colorGroups}</strong>
                    </div>
                </div>
            )}
        </div>
    );
}

// ---------------------------------------------------------------------------
// Surface
// ---------------------------------------------------------------------------

export default function PlayerPanel() {
    const players = useGameViewStore((s) => s.players);
    const currentPlayerIndex = useGameViewStore((s) => s.currentPlayerIndex);
    const [portalTarget, setPortalTarget] = useState<HTMLElement | null>(null);

    // Seed the store once in case a game is already running when React mounts
    // (harmless no-op before game start: snapshots an empty players list).
    useEffect(() => {
        refreshGameView();
    }, []);

    // Adopt the legacy container: clear any pre-override legacy cards once,
    // then portal into it (the shell keeps its CSS positioning + drawer).
    useEffect(() => {
        const container = document.getElementById('players-container');
        if (!container) return;
        container.replaceChildren();
        setPortalTarget(container);
    }, []);

    // Take over the mobile drawer toggle (see header for why capture-phase).
    useEffect(() => {
        const toggle = document.getElementById('players-toggle');
        const shell = document.getElementById('players-shell');
        if (!toggle || !shell) return;

        const onToggleClick = (event: MouseEvent): void => {
            if (!(event.target instanceof Node) || !toggle.contains(event.target)) return;
            // Block the legacy ui.js listener bound on #players-toggle —
            // running both would toggle the class twice (net no-op).
            event.stopPropagation();
            const opened = shell.classList.toggle('is-open');
            toggle.setAttribute('aria-expanded', String(opened));
            window.SoundFX?.click();
        };

        document.addEventListener('click', onToggleClick, true);
        return () => document.removeEventListener('click', onToggleClick, true);
    }, []);

    if (!portalTarget || players.length === 0) return null;

    return createPortal(
        <>
            {players.map((player, idx) => (
                <PlayerCard
                    key={player.id}
                    player={player}
                    isCurrent={currentPlayerIndex === idx && !player.bankrupt}
                />
            ))}
        </>,
        portalTarget,
    );
}
