/**
 * src/store/gameViewStore.ts
 *
 * Read-only view-model store over the imperative legacy game state.
 *
 * The legacy engine mutates window.players / window.Game / window.boardData
 * in place and then calls window.updatePlayerUI(). The PlayerPanel surface
 * overrides updatePlayerUI (and renderPlayerUI) to call
 * `gameViewStore.getState().refreshFromWindow()`, which SNAPSHOTS the mutable
 * legacy objects into immutable PlayerVM records — React then renders purely
 * from this store and never sees the mutating originals.
 *
 * Field derivation sources:
 *   - identity/runtime fields: engine.js createPlayers() (line ~625)
 *   - propertiesCount / netWorth / colorGroups: ui.js computePlayerStats()
 *     (line ~296) — reimplemented here typed & pure (computeStats) so the
 *     store has no load-order dependency on ui.js.
 *
 * Also exports window-reading snapshot helpers shared by surfaces so item
 * shapes cannot drift between agents:
 *   - snapshotBuildItems()    (data of ui.js renderBuildMenu, line ~366)
 *   - snapshotMortgageItems() (data of ui.js renderMortgagePanel, line ~328)
 *   - getCurrentLegacyPlayer()
 */

import { createStore } from 'zustand/vanilla';
import { useStore } from 'zustand';
import type { BuildItem, MortgageItem } from './uiStore.ts';
import type { LegacyPlayer, LegacyTile } from '../ui/react/facade.ts';

// ---------------------------------------------------------------------------
// View models
// ---------------------------------------------------------------------------

export interface PlayerVM {
    id: number;
    name: string;
    money: number;
    /** 0..39 board index (rendered as "position / 40"). */
    position: number;
    /** CSS hex string, e.g. '#ef4444' (PLAYER_HEX). */
    colorHex: string;
    /** Token label, e.g. 'Nón Lá' — may be '' before TokenFactory loads. */
    tokenKind: string;
    inJail: boolean;
    jailTurns: number;
    bankrupt: boolean;
    isBot: boolean;
    /** Bot "thinking" indicator (animated dots on the player card). */
    isThinking: boolean;
    /** Owned tiles count — computePlayerStats().propsCount. */
    propertiesCount: number;
    /** money + property value (mortgage-discounted) + half house value. */
    netWorth: number;
    /** Complete color sets owned (groups with >1 tiles) — "Bộ màu hoàn chỉnh". */
    colorGroups: number;
}

export interface GameViewState {
    players: PlayerVM[];
    currentPlayerIndex: number;
    /** Date.now() of the last successful snapshot (0 = never refreshed). */
    lastSyncedAt: number;
    /**
     * Snapshot window.players / window.Game / window.boardData into the store.
     * This is what the window.updatePlayerUI override calls. Safe to call
     * before the game starts (results in an empty players list).
     */
    refreshFromWindow: () => void;
}

// ---------------------------------------------------------------------------
// Pure helpers (exported for unit tests)
// ---------------------------------------------------------------------------

/**
 * Typed, pure port of ui.js computePlayerStats() (line ~296). Keep the math
 * in lockstep with the legacy function:
 *   - mortgaged property counts at floor(price * 0.5), otherwise full price
 *   - houses count at houses * floor(houseCost / 2)
 *   - colorGroups = fully-owned groups with more than one tile
 */
export function computeStats(
    p: Pick<LegacyPlayer, 'id' | 'money'>,
    tiles: readonly LegacyTile[],
): { netWorth: number; propertiesCount: number; colorGroups: number } {
    const owned = tiles.filter((t) => t.owner === p.id);

    let propsValue = 0;
    let housesValue = 0;
    for (const t of owned) {
        const price = t.price ?? 0;
        propsValue += t.isMortgaged ? Math.floor(price * 0.5) : price;
        const houses = t.houses ?? 0;
        if (houses > 0 && t.houseCost) housesValue += houses * Math.floor(t.houseCost / 2);
    }

    const groupSets = new Map<number, { total: number; owned: number }>();
    for (const t of tiles) {
        if (!t.groupId) continue;
        const g = groupSets.get(t.groupId) ?? { total: 0, owned: 0 };
        groupSets.set(t.groupId, {
            total: g.total + 1,
            owned: g.owned + (t.owner === p.id ? 1 : 0),
        });
    }
    let colorGroups = 0;
    for (const g of groupSets.values()) {
        if (g.total > 1 && g.owned === g.total) colorGroups++;
    }

    return {
        netWorth: p.money + propsValue + housesValue,
        propertiesCount: owned.length,
        colorGroups,
    };
}

/** Immutable PlayerVM snapshot of one mutable legacy player object. */
export function toPlayerVM(p: LegacyPlayer, tiles: readonly LegacyTile[]): PlayerVM {
    const stats = computeStats(p, tiles);
    return {
        id: p.id,
        name: p.name,
        money: p.money,
        position: p.position,
        colorHex: p.colorHex,
        tokenKind: p.tokenKind ?? '',
        inJail: p.inJail,
        jailTurns: p.jailTurns,
        bankrupt: p.bankrupt,
        isBot: p.isBot,
        isThinking: p.isThinking === true,
        propertiesCount: stats.propertiesCount,
        netWorth: stats.netWorth,
        colorGroups: stats.colorGroups,
    };
}

// ---------------------------------------------------------------------------
// Window-reading snapshot helpers (shared by surface agents)
// ---------------------------------------------------------------------------

/** Current (non-snapshot) legacy player, or undefined before game start. */
export function getCurrentLegacyPlayer(): LegacyPlayer | undefined {
    const game = window.Game;
    if (!game || !Array.isArray(game.players)) return undefined;
    return game.players[game.currentPlayerIndex];
}

/**
 * Data the BuildPanels surface feeds into uiStore.showBuildMenu().
 * Mirrors renderBuildMenu: ALL tiles owned by the current player; canBuild
 * only when in getBuildableProperties(p.id) and not mortgaged.
 */
export function snapshotBuildItems(): BuildItem[] {
    const p = getCurrentLegacyPlayer();
    const tiles = window.boardData ?? [];
    if (!p) return [];
    const buildableIds = new Set(
        (window.getBuildableProperties?.(p.id) ?? []).map((t) => t.id),
    );
    return tiles
        .filter((t) => t.owner === p.id)
        .map((t) => ({
            tileId: t.id,
            name: t.name,
            houses: t.houses ?? 0,
            isMortgaged: t.isMortgaged === true,
            houseCost: t.houseCost ?? null,
            canBuild: buildableIds.has(t.id) && t.isMortgaged !== true,
        }));
}

/**
 * Data the BuildPanels surface feeds into uiStore.showMortgagePanel().
 * Mirrors renderMortgagePanel: ALL tiles owned by the current player.
 * Pass `notYourTurn = !p || p.isBot` (the legacy "Không phải lượt của bạn"
 * empty state) alongside these items.
 */
export function snapshotMortgageItems(): MortgageItem[] {
    const p = getCurrentLegacyPlayer();
    const tiles = window.boardData ?? [];
    if (!p || p.isBot) return [];
    return tiles
        .filter((t) => t.owner === p.id)
        .map((t) => {
            const price = t.price ?? 0;
            const houses = t.houses ?? 0;
            return {
                tileId: t.id,
                name: t.name,
                houses,
                isMortgaged: t.isMortgaged === true,
                mortgageValue: Math.floor(price * 0.5),
                redeemCost: Math.floor(price * 0.6),
                canToggle: houses === 0,
            };
        });
}

// ---------------------------------------------------------------------------
// Store
// ---------------------------------------------------------------------------

/** Vanilla store — safe to use from non-React modules (window overrides). */
export const gameViewStore = createStore<GameViewState>()((set) => ({
    players: [],
    currentPlayerIndex: 0,
    lastSyncedAt: 0,

    refreshFromWindow: () => {
        const legacyPlayers = window.players ?? window.Game?.players ?? [];
        const tiles = window.boardData ?? [];
        set({
            players: legacyPlayers.map((p) => toPlayerVM(p, tiles)),
            currentPlayerIndex: window.Game?.currentPlayerIndex ?? 0,
            lastSyncedAt: Date.now(),
        });
    },
}));

/** React hook binding. `useGameViewStore()` -> whole state, or pass a selector. */
export function useGameViewStore(): GameViewState;
export function useGameViewStore<T>(selector: (state: GameViewState) => T): T;
export function useGameViewStore<T>(selector?: (state: GameViewState) => T): T | GameViewState {
    const select: (state: GameViewState) => T | GameViewState = selector ?? ((s) => s);
    return useStore(gameViewStore, select);
}
