/**
 * TradeModal — React replacement for the trade dialog in src/ui/trade.js
 * (window.TradeUI = { open, close }).
 *
 * READS:   uiStore.tradeOpen (visibility); gameViewStore.players /
 *          currentPlayerIndex (partner picker — bankrupt players and self are
 *          excluded, exactly like populatePartners() in trade.js);
 *          window.boardData snapshot for the tradeable-tile checklists
 *          (owned + house-free + unmortgaged, the populateProps() filter).
 *
 * OVERRIDES (installFacade, module level — import order beats trade.js):
 *   window.TradeUI.open  -> legacy guards (no Game/players => no-op; bot's
 *                           turn => warn toast), refresh gameViewStore,
 *                           uiStore.openTrade(), SoundFX click.
 *   window.TradeUI.close -> uiStore.closeTrade(), SoundFX click.
 *   (ui.js #btn-trade onclick calls window.TradeUI.open() — keeps working.)
 *
 * EXECUTION (executeTradeSubmit): verbatim port of trade.js submit() —
 * validation toasts, bot heuristic (evaluateTrade, ported — see below),
 * window.confirm for human partners, then the SAME live-state mutations the
 * legacy code performed: players' money swap + boardData[id].owner
 * reassignment, followed by the same window.* calls (logMsg, Toast.show,
 * updatePlayerUI). trade.js made no update3DHouses / ownerMesh calls (traded
 * tiles are house-free by filter) — replicated faithfully, no extra 3D calls.
 *
 * evaluateTrade is module-private in trade.js (never exposed on
 * window.TradeUI), so its math is PORTED verbatim here, not called.
 *
 * DEAD AFTER THIS MODULE: src/ui/trade.js entirely (its window.TradeUI
 * assignment is overwritten at React import time; its DOM is never built).
 */

import { useEffect, useMemo, useRef, useState } from 'react';
import { uiStore, useUiStore } from '../../../store/uiStore.ts';
import { gameViewStore, useGameViewStore } from '../../../store/gameViewStore.ts';
import { installFacade } from '../facade.ts';

// ---------------------------------------------------------------------------
// View model + pure helpers (ports of trade.js module functions)
// ---------------------------------------------------------------------------

/** One tradeable tile row (immutable snapshot of a window.boardData entry). */
interface TradeTileVM {
    id: number;
    name: string;
    price: number;
    owner: number;
}

/** Utils.formatMoney with a fallback matching src/core/utils.js. */
function formatMoney(amount: number): string {
    const legacyFormat = window.Utils?.formatMoney;
    return typeof legacyFormat === 'function' ? legacyFormat(amount) : `$${amount.toLocaleString()}`;
}

/**
 * trade.js submit(): Math.max(0, parseInt(value || '0', 10)).
 * NaN (unreachable via <input type="number">, but defensive) coerces to 0.
 */
function parseMoneyInput(raw: string): number {
    const parsed = Number.parseInt(raw === '' ? '0' : raw, 10);
    return Number.isFinite(parsed) ? Math.max(0, parsed) : 0;
}

/**
 * VERBATIM PORT of evaluateTrade() in src/ui/trade.js (line ~81) — it is
 * module-private there and not reachable through window, so the math is
 * duplicated, not called: the bot accepts if request <= offer * 1.15.
 */
function evaluateTrade(offerVal: number, requestVal: number): boolean {
    return offerVal * 1.15 >= requestVal;
}

/** Port of valueProps() in trade.js: sum of tile prices by id (live read). */
function sumTilePrices(tileIds: readonly number[]): number {
    const tiles = window.boardData ?? [];
    return tileIds.reduce((sum, id) => sum + (tiles[id]?.price ?? 0), 0);
}

/**
 * Snapshot of every tile that can appear in a trade column. Mirrors the
 * populateProps() filter in trade.js: owned (owner is a player id), zero
 * houses, not mortgaged.
 */
function snapshotTradeableTiles(): TradeTileVM[] {
    const tiles = window.boardData ?? [];
    const out: TradeTileVM[] = [];
    for (const tile of tiles) {
        if (typeof tile.owner !== 'number') continue;
        if ((tile.houses ?? 0) !== 0) continue;
        if (tile.isMortgaged === true) continue;
        out.push({ id: tile.id, name: tile.name, price: tile.price ?? 0, owner: tile.owner });
    }
    return out;
}

/** Immutable checkbox-set toggle. */
function toggleInSet(set: ReadonlySet<number>, id: number): ReadonlySet<number> {
    const next = new Set(set);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    return next;
}

// ---------------------------------------------------------------------------
// window.TradeUI overrides (legacy open()/close() behavior preserved)
// ---------------------------------------------------------------------------

function openTradeModal(): void {
    if (!window.Game || !window.players) return;
    const me = window.Game.currentPlayerIndex;
    const current = window.players[me];
    if (current && current.isBot) {
        window.Toast?.show('Bot không thể chủ động giao dịch', { type: 'warn' });
        return;
    }
    // Fresh PlayerVM snapshot so the partner picker shows current money/flags.
    gameViewStore.getState().refreshFromWindow();
    uiStore.getState().openTrade();
    window.SoundFX?.click();
}

function closeTradeModal(): void {
    uiStore.getState().closeTrade();
    window.SoundFX?.click();
}

installFacade(
    {
        TradeUI: { open: openTradeModal, close: closeTradeModal },
    },
    'TradeModal',
);

// ---------------------------------------------------------------------------
// Trade execution — port of trade.js submit() (lines ~90..126)
// ---------------------------------------------------------------------------

interface TradeSubmission {
    partnerId: number;
    offerMoneyRaw: string;
    requestMoneyRaw: string;
    offerTileIds: readonly number[];
    requestTileIds: readonly number[];
}

function executeTradeSubmit(input: TradeSubmission): void {
    const game = window.Game;
    const livePlayers = window.players;
    if (!game || !livePlayers) return;
    const me = game.currentPlayerIndex;
    const meP = livePlayers[me];
    const partner = livePlayers[input.partnerId];
    if (!meP || !partner) return;

    const offerMoney = parseMoneyInput(input.offerMoneyRaw);
    const requestMoney = parseMoneyInput(input.requestMoneyRaw);

    // Validation — identical messages/types to trade.js.
    if (meP.money < offerMoney) {
        window.Toast?.show('Bạn không đủ tiền để chào.', { type: 'error' });
        return;
    }
    if (partner.money < requestMoney) {
        window.Toast?.show('Đối tác không đủ tiền.', { type: 'error' });
        return;
    }

    const offerVal = offerMoney + sumTilePrices(input.offerTileIds);
    const requestVal = requestMoney + sumTilePrices(input.requestTileIds);
    if (offerVal === 0 && requestVal === 0) {
        window.Toast?.show('Đề nghị rỗng — không thay đổi gì.', { type: 'warn' });
        return;
    }

    const accepted = partner.isBot
        ? evaluateTrade(offerVal, requestVal)
        : window.confirm(`${partner.name} có chấp nhận?`);
    if (!accepted) {
        window.logMsg?.(`❌ ${partner.name} đã từ chối giao dịch.`);
        window.Toast?.show('Đề nghị bị từ chối', { type: 'warn' });
        closeTradeModal();
        return;
    }

    // Execute — intentionally the SAME live legacy-state mutations trade.js
    // performed (imperative engine state; traded tiles are house-free, and
    // trade.js made no update3DHouses/ownerMesh calls — kept identical).
    meP.money -= offerMoney;
    partner.money += offerMoney;
    partner.money -= requestMoney;
    meP.money += requestMoney;
    const tiles = window.boardData ?? [];
    for (const id of input.offerTileIds) {
        const tile = tiles[id];
        if (tile) tile.owner = input.partnerId;
    }
    for (const id of input.requestTileIds) {
        const tile = tiles[id];
        if (tile) tile.owner = me;
    }

    window.logMsg?.(`🤝 ${meP.name} và ${partner.name} đã hoàn tất giao dịch.`);
    window.Toast?.show('Giao dịch thành công!', { type: 'success', icon: '🤝' });
    window.updatePlayerUI?.();
    closeTradeModal();
}

// ---------------------------------------------------------------------------
// Components
// ---------------------------------------------------------------------------

interface TradeColumnProps {
    title: string;
    emptyText: string;
    moneyValue: string;
    onMoneyChange: (raw: string) => void;
    items: readonly TradeTileVM[];
    selectedIds: ReadonlySet<number>;
    onToggle: (tileId: number) => void;
}

/** One offer/request column: money input + property checklist. */
function TradeColumn({
    title,
    emptyText,
    moneyValue,
    onMoneyChange,
    items,
    selectedIds,
    onToggle,
}: TradeColumnProps) {
    return (
        <div className="trade-col">
            <h3>{title}</h3>
            <label className="trade-money">
                Tiền: $
                <input
                    type="number"
                    min={0}
                    value={moneyValue}
                    onChange={(event) => onMoneyChange(event.target.value)}
                    className="focus-visible:outline focus-visible:outline-2 focus-visible:outline-gold-400"
                />
            </label>
            <div className="trade-props">
                {items.length === 0 ? (
                    <p className="trade-empty">{emptyText}</p>
                ) : (
                    items.map((tile) => (
                        <label
                            key={tile.id}
                            className="trade-prop transition-colors hover:border-gold-400"
                        >
                            <input
                                type="checkbox"
                                checked={selectedIds.has(tile.id)}
                                onChange={() => onToggle(tile.id)}
                            />
                            <span>{tile.name}</span>
                            <em>{formatMoney(tile.price)}</em>
                        </label>
                    ))
                )}
            </div>
        </div>
    );
}

/**
 * The open dialog. Mounted only while uiStore.tradeOpen is true, so every
 * open starts from a fresh form state (legacy rebuilt its DOM on open too).
 */
function TradeDialog() {
    const players = useGameViewStore((s) => s.players);
    const meIndex = useGameViewStore((s) => s.currentPlayerIndex);

    // Snapshot once per open — the trade modal only opens on a human turn,
    // while the engine is idle (same lifetime as legacy populateProps()).
    const [tradeables] = useState<readonly TradeTileVM[]>(snapshotTradeableTiles);
    const [partnerChoice, setPartnerChoice] = useState<number | null>(null);
    const [offerMoney, setOfferMoney] = useState('0');
    const [requestMoney, setRequestMoney] = useState('0');
    const [offerIds, setOfferIds] = useState<ReadonlySet<number>>(() => new Set());
    const [requestIds, setRequestIds] = useState<ReadonlySet<number>>(() => new Set());
    const dialogRef = useRef<HTMLDivElement>(null);

    // populatePartners() filter: everyone except me and bankrupt players.
    const partners = useMemo(
        () => players.filter((p) => p.id !== meIndex && !p.bankrupt),
        [players, meIndex],
    );
    const partnerId =
        partnerChoice !== null && partners.some((p) => p.id === partnerChoice)
            ? partnerChoice
            : partners[0]?.id ?? null;

    const myProps = useMemo(
        () => tradeables.filter((t) => t.owner === meIndex),
        [tradeables, meIndex],
    );
    const partnerProps = useMemo(
        () => (partnerId === null ? [] : tradeables.filter((t) => t.owner === partnerId)),
        [tradeables, partnerId],
    );

    // Legacy open()/close() toggled body.modal-open (drives the canvas blur).
    useEffect(() => {
        document.body.classList.add('modal-open');
        return () => document.body.classList.remove('modal-open');
    }, []);

    // Escape closes (per migration a11y contract, mirrors the rules modal).
    useEffect(() => {
        const onKeyDown = (event: KeyboardEvent): void => {
            if (event.key === 'Escape') closeTradeModal();
        };
        document.addEventListener('keydown', onKeyDown);
        return () => document.removeEventListener('keydown', onKeyDown);
    }, []);

    // Move focus into the dialog when it opens.
    useEffect(() => {
        dialogRef.current?.focus();
    }, []);

    const handleSubmit = (): void => {
        if (partnerId === null) return;
        executeTradeSubmit({
            partnerId,
            offerMoneyRaw: offerMoney,
            requestMoneyRaw: requestMoney,
            offerTileIds: [...offerIds],
            requestTileIds: [...requestIds],
        });
    };

    return (
        <div
            className="trade-overlay"
            onClick={(event) => {
                if (event.target === event.currentTarget) closeTradeModal();
            }}
        >
            <div
                ref={dialogRef}
                tabIndex={-1}
                role="dialog"
                aria-modal="true"
                aria-labelledby="trade-title"
                className="trade-modal outline-none"
            >
                <header className="trade-header">
                    <h2 id="trade-title">🤝 Đề nghị giao dịch</h2>
                    <button
                        type="button"
                        aria-label="Đóng"
                        className="trade-close focus-visible:ring-2 focus-visible:ring-white/80"
                        onClick={closeTradeModal}
                    >
                        ✕
                    </button>
                </header>
                <div className="trade-body">
                    <label className="trade-partner block">
                        <span className="trade-label">Đối tác</span>
                        <select
                            className="trade-input focus-visible:outline focus-visible:outline-2 focus-visible:outline-gold-400"
                            value={partnerId ?? ''}
                            disabled={partners.length === 0}
                            onChange={(event) => {
                                setPartnerChoice(Number(event.target.value));
                                // Legacy re-rendered both checklists on partner
                                // change — selections reset on both sides.
                                setOfferIds(new Set());
                                setRequestIds(new Set());
                            }}
                        >
                            {partners.map((p) => (
                                <option key={p.id} value={p.id}>
                                    {p.name} ({formatMoney(p.money)})
                                </option>
                            ))}
                        </select>
                    </label>
                    <div className="trade-cols">
                        <TradeColumn
                            title="Bạn đề nghị"
                            emptyText="Không có đất khả dụng."
                            moneyValue={offerMoney}
                            onMoneyChange={setOfferMoney}
                            items={myProps}
                            selectedIds={offerIds}
                            onToggle={(id) => setOfferIds((prev) => toggleInSet(prev, id))}
                        />
                        <TradeColumn
                            title="Bạn yêu cầu"
                            emptyText="Đối tác không có đất khả dụng."
                            moneyValue={requestMoney}
                            onMoneyChange={setRequestMoney}
                            items={partnerProps}
                            selectedIds={requestIds}
                            onToggle={(id) => setRequestIds((prev) => toggleInSet(prev, id))}
                        />
                    </div>
                </div>
                <footer className="trade-footer">
                    <button
                        type="button"
                        className="trade-btn trade-btn-secondary focus-visible:ring-2 focus-visible:ring-gold-400"
                        onClick={closeTradeModal}
                    >
                        Huỷ
                    </button>
                    <button
                        type="button"
                        className="trade-btn trade-btn-primary focus-visible:ring-2 focus-visible:ring-gold-300 disabled:cursor-not-allowed disabled:opacity-50"
                        disabled={partnerId === null}
                        onClick={handleSubmit}
                    >
                        Gửi đề nghị →
                    </button>
                </footer>
            </div>
        </div>
    );
}

export default function TradeModal() {
    const isOpen = useUiStore((s) => s.tradeOpen);
    if (!isOpen) return null;
    return <TradeDialog />;
}
