/**
 * src/ui/react/facade.ts
 *
 * The window <-> React bridge contract.
 *
 * 1) installFacade(): how surface modules override legacy window functions.
 * 2) `declare global` typings for every window function/object a surface
 *    reads or overrides, plus structural types (LegacyPlayer, LegacyTile,
 *    LegacyGame, ...) matching the untyped legacy modules.
 *
 * Override rules for surface agents:
 *   - Import order guarantees the win: src/main.js imports all legacy modules
 *     first; the orchestrator imports React surface modules afterwards, so a
 *     surface's installFacade() call replaces the legacy assignment.
 *   - Override the COMPLETE legacy API of a window key (e.g. window.Toast must
 *     keep show/info/success/warn/error/money, and show must keep returning a
 *     dismiss function) — other legacy modules call these shapes blindly.
 *   - Never remove window keys; only replace their implementations.
 */

import type { ToastOptions } from '../../store/uiStore.ts';

// ---------------------------------------------------------------------------
// Structural types for legacy (untyped) runtime objects
// ---------------------------------------------------------------------------

/** Player objects created in src/3d/engine.js createPlayers() (line ~625). */
export interface LegacyPlayer {
    id: number;
    name: string;
    money: number;
    position: number;
    colorHex: string;
    tokenKind: string;
    inJail: boolean;
    jailTurns: number;
    jailFreeCards: number;
    bankrupt: boolean;
    isBot: boolean;
    /** Set lazily by Game.doBotTurn while the bot "thinks". */
    isThinking?: boolean;
    /** THREE.Mesh — opaque to the UI layer. */
    mesh?: unknown;
    baseY?: number;
    hopT?: number;
    idleOffset?: number;
}

/** Tiles from src/core/data.js boardData (+ runtime fields added by game.js). */
export interface LegacyTile {
    id: number;
    name: string;
    type: string;
    color: number;
    price?: number;
    rent?: number;
    groupId?: number;
    houseCost?: number;
    /** Runtime — only present on ownable tiles. */
    owner?: number | null;
    houses?: number;
    isMortgaged?: boolean;
    /** THREE meshes — opaque to the UI layer. */
    houseMeshes?: unknown[];
    ownerMesh?: unknown;
}

/** The Game engine object from src/game/game.js (window.Game). */
export interface LegacyGame {
    players: LegacyPlayer[];
    currentPlayerIndex: number;
    isAnimating?: boolean;
    isProcessingTurn?: boolean;
    lastRoll: { d1: number; d2: number; total: number; player: string | null } | null;
    init: (total: number, mode: string) => void;
    startTurn: () => void;
    nextTurn: () => void;
    doBotTurn: (p: LegacyPlayer) => void;
    executeBuildInternal: (p: LegacyPlayer, tile: LegacyTile) => void;
    checkEndTurnPhase: (isDouble: boolean) => void;
    handleVictory: (p: LegacyPlayer) => void;
    getBuildableProperties?: (playerId: number) => LegacyTile[];
}

/** window.Toast from src/services/toast.js. show() returns a dismiss closure. */
export interface LegacyToastApi {
    show: (msg: string, opts?: ToastOptions) => () => void;
    info: (msg: string, opts?: ToastOptions) => () => void;
    success: (msg: string, opts?: ToastOptions) => () => void;
    warn: (msg: string, opts?: ToastOptions) => () => void;
    error: (msg: string, opts?: ToastOptions) => () => void;
    money: (msg: string, opts?: ToastOptions) => () => void;
}

/** Options bag of window.notify (src/ui/ui.js line ~179). */
export interface LegacyNotifyOptions {
    /** false suppresses the toast (log always happens). */
    toast?: boolean;
    type?: string;
    ttl?: number;
    /** Forwarded to window.Settings.haptic(pattern). */
    haptic?: number | number[];
}

/** window.MenuManager from src/ui/menu.js. */
export interface LegacyMenuManager {
    screens: Record<string, HTMLElement | null>;
    currentScreen: string;
    currentUser: { name: string } | null;
    init: () => void;
    showScreen: (screenId: string) => void;
    launchGame: (totalPlayers: number, mode: string, savedSnap?: unknown) => Promise<void>;
}

/** window.Settings from src/services/settings.js (persisted config service). */
export interface LegacySettings {
    get: () => Record<string, unknown>;
    set: (key: string, value: unknown) => void;
    haptic: (pattern: number | number[]) => void;
}

/** window.SoundFX from src/services/audio.js (subset surfaces use). */
export interface LegacySoundFX {
    click: () => void;
    roll: () => void;
    buy: () => void;
    build: () => void;
    jail: () => void;
    win: () => void;
    startBGM: () => void;
    stopBGM: () => void;
}

/** window.GameSave from src/game/persistence.js (subset MenuScreens uses). */
export interface LegacyGameSave {
    hasSavedGame: () => boolean;
    load: () => { players: unknown[]; mode?: string } | null;
    attachAutoSave: () => void;
    restoreInto: (snap: unknown) => void;
}

/** Result shape of window.computePlayerStats (src/ui/ui.js line ~296). */
export interface LegacyPlayerStats {
    netWorth: number;
    propsCount: number;
    colorGroups: number;
}

// ---------------------------------------------------------------------------
// Window augmentation
// ---------------------------------------------------------------------------
// Everything is optional: legacy modules assign these at runtime and load
// order varies — always guard reads (window.Game?.players ?? []).

declare global {
    interface Window {
        // --- functions the React surfaces OVERRIDE ---
        logMsg?: (msg: string) => void;
        notify?: (msg: string, opts?: LegacyNotifyOptions) => void;
        Toast?: LegacyToastApi;
        showModal?: (title: string, desc: string, buttons?: string[]) => void;
        hideModal?: () => void;
        updatePlayerUI?: () => void;
        renderPlayerUI?: () => void;
        renderBuildMenu?: () => void;
        renderMortgagePanel?: () => void;
        showRules?: () => void;
        closeRules?: () => void;
        exportGameLog?: () => void;
        SettingsUI?: { open: () => void; close: () => void };
        TradeUI?: { open: () => void; close: () => void };
        MenuManager?: LegacyMenuManager;

        // --- legacy state/services the surfaces READ or CALL (not replaced) ---
        Game?: LegacyGame;
        players?: LegacyPlayer[];
        boardData?: LegacyTile[];
        computePlayerStats?: (p: LegacyPlayer) => LegacyPlayerStats;
        getBuildableProperties?: (playerId: number) => LegacyTile[];
        calculateRent?: (tile: LegacyTile) => number;
        toggleMortgage?: (tileId: number) => void;
        executeBuild?: (tileId: number) => void;
        replayLastRoll?: () => void;
        initGameSession?: (total: number, mode: string) => void;
        Utils?: { formatMoney: (n: number) => string; [key: string]: unknown };
        Settings?: LegacySettings;
        SoundFX?: LegacySoundFX;
        GameSave?: LegacyGameSave;
        Tutorial?: { shouldShow: () => boolean; start: () => void };
        Cinematics?: { playIntro: () => void; playWinning: (p: LegacyPlayer) => void; [key: string]: unknown };
        isAnimating?: boolean;
        botDifficulty?: string;
        _gameMode?: string;
        _threeLoaded?: boolean;
        _loadThreeJS?: () => Promise<void>;
        ensure3DInit?: () => void;
    }
}

// ---------------------------------------------------------------------------
// installFacade
// ---------------------------------------------------------------------------

/**
 * Assigns each entry onto window, logging a console.debug line per key so the
 * takeover is traceable in DevTools. Call once at surface-module import time:
 *
 *   installFacade({
 *       logMsg: (msg: string) => uiStore.getState().pushLog(msg),
 *   }, 'GameLog');
 */
export function installFacade(overrides: Record<string, unknown>, tag = 'react-ui'): void {
    const target = window as unknown as Record<string, unknown>;
    for (const [key, value] of Object.entries(overrides)) {
        target[key] = value;
        console.debug(`[${tag}] window.${key} -> React override installed`);
    }
}
