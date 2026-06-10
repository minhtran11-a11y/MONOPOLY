/**
 * SettingsPanel — React replacement for the settings dialog DOM in
 * src/ui/settings_ui.js (window.SettingsUI = { open, close }).
 *
 * READS:  uiStore.settingsOpen; setting VALUES come from the window.Settings
 *         SERVICE (src/services/settings.js — get()/set()/haptic()), which is
 *         NOT replaced: it stays the persisted source of truth
 *         (localStorage-backed config: sound, bgm, haptics, quality, ...).
 *
 * OVERRIDES (via installFacade):
 *   window.SettingsUI -> { open:  () => uiStore.getState().openSettings(),
 *                          close: () => uiStore.getState().closeSettings() }
 *   (ui.js #btn-settings onclick calls window.SettingsUI.open() — that HUD
 *    wiring keeps working unchanged through the override.)
 *
 * BEHAVIOR: render the panel from window.Settings.get(); on each control
 * change call window.Settings.set(key, value) so side effects (BGM
 * start/stop via window.SoundFX, quality toggles, haptics) keep firing
 * exactly as the legacy panel did. Local React state may mirror the config
 * for instant feedback, but window.Settings stays authoritative.
 *
 * DEAD AFTER IMPLEMENTATION: src/ui/settings_ui.js entirely (DOM panel
 * construction + its window.SettingsUI assignment).
 */
export default function SettingsPanel() {
    return null;
}
