/**
 * SettingsPanel — React replacement for the settings dialog DOM in
 * src/ui/settings_ui.js (buildPanel/wirePanel/open/close).
 *
 * READS:  uiStore.settingsOpen (visibility) — setting VALUES come from the
 *         window.Settings service (src/services/settings.js, persisted
 *         localStorage config) and window.SoundFX (src/services/audio.js,
 *         volume mixer). Neither service is replaced: they stay the source
 *         of truth; local React state only mirrors them for instant feedback
 *         and is re-snapshotted every time the dialog opens.
 *
 * OVERRIDES (via installFacade, module level — wins over the legacy
 * assignment because src/main.js imports settings_ui.js before react/main.tsx):
 *   window.SettingsUI = {
 *     open:  () => uiStore.openSettings() + SoundFX.click(),
 *     close: () => uiStore.closeSettings() + SoundFX.click(),
 *   }
 *   (ui.js #btn-settings onclick calls window.SettingsUI.open() — unchanged.)
 *
 * BEHAVIOR parity with the legacy panel:
 *   - body.modal-open toggled while the dialog is mounted (canvas DOF blur)
 *   - Escape / overlay click / "Thoát ✕" / "Đóng" all close (with click sfx)
 *   - sliders call SoundFX.setMaster/setSfx/setBgm(v/100)
 *   - "Tắt toàn bộ âm thanh" -> SoundFX.setMuted only (not a Settings key)
 *   - "Bật nhạc nền" -> Settings.set('bgmEnabled') + startBGM()/stopBGM()
 *   - graphics tier whitelisted to 'low'|'med'|'high', anim speed to 0|1|2
 *   - "Mặc định" clears both localStorage keys and reloads the page
 *
 * DEAD AFTER IMPLEMENTATION: src/ui/settings_ui.js entirely (DOM panel
 * construction, wiring and its window.SettingsUI assignment).
 */

import { useEffect, useState } from 'react';
import { uiStore, useUiStore } from '../../../store/uiStore.ts';
import { installFacade } from '../facade.ts';
import type { LegacySoundFX } from '../facade.ts';

// ---------------------------------------------------------------------------
// Whitelisted setting values (exactly the sets the legacy panel allowed)
// ---------------------------------------------------------------------------

type GraphicsTier = 'low' | 'med' | 'high';
type AnimSpeed = 0 | 1 | 2;
type VolumeChannel = 'master' | 'sfx' | 'bgm';
/** Boolean keys forwarded to window.Settings.set (legacy data-toggle, minus 'muted'). */
type BoolSettingKey =
    | 'bgmEnabled'
    | 'reducedMotion'
    | 'haptics'
    | 'colorBlind'
    | 'highContrast'
    | 'autoSave';

interface SettingsConfig {
    graphics: GraphicsTier;
    animSpeed: AnimSpeed;
    reducedMotion: boolean;
    colorBlind: boolean;
    highContrast: boolean;
    haptics: boolean;
    bgmEnabled: boolean;
    autoSave: boolean;
}

interface AudioConfig {
    master: number;
    sfx: number;
    bgm: number;
    muted: boolean;
}

const GRAPHICS_OPTIONS: ReadonlyArray<{ value: GraphicsTier; label: string }> = [
    { value: 'low', label: 'Thấp' },
    { value: 'med', label: 'Vừa' },
    { value: 'high', label: 'Cao' },
];

const ANIM_SPEED_OPTIONS: ReadonlyArray<{ value: AnimSpeed; label: string }> = [
    { value: 0, label: 'Bỏ qua' },
    { value: 1, label: '1x' },
    { value: 2, label: '2x' },
];

/** SETTINGS_KEY in src/services/settings.js (cleared by "Mặc định"). */
const SETTINGS_STORAGE_KEY = 'monopoly3d_settings_v1';
/** AUDIO_SETTINGS_KEY in src/services/audio.js (cleared by "Mặc định"). */
const AUDIO_STORAGE_KEY = 'monopoly3d_audio_v1';

/** Mirrors SETTINGS_DEFAULTS in src/services/settings.js. */
const SETTINGS_FALLBACK: SettingsConfig = {
    graphics: 'high',
    animSpeed: 1,
    reducedMotion: false,
    colorBlind: false,
    highContrast: false,
    haptics: true,
    bgmEnabled: true,
    autoSave: true,
};

/** Mirrors _defaults in src/services/audio.js (legacy buildPanel fallback too). */
const AUDIO_FALLBACK: AudioConfig = { master: 0.8, sfx: 0.9, bgm: 0.35, muted: false };

// ---------------------------------------------------------------------------
// Service access (window.Settings / window.SoundFX stay authoritative)
// ---------------------------------------------------------------------------

/**
 * The mixer half of src/services/audio.js that the facade's LegacySoundFX
 * subset does not declare (getConfig/setMaster/setSfx/setBgm/setMuted).
 * getConfig is typed as unknown-valued so reads are validated below.
 */
interface SoundFxMixerApi extends LegacySoundFX {
    getConfig: () => Record<string, unknown>;
    setMaster: (volume: number) => void;
    setSfx: (volume: number) => void;
    setBgm: (volume: number) => void;
    setMuted: (muted: boolean) => void;
}

function getAudioApi(): SoundFxMixerApi | null {
    const sfx = window.SoundFX as SoundFxMixerApi | undefined;
    if (!sfx || typeof sfx.getConfig !== 'function') return null;
    return sfx;
}

function boolOr(value: unknown, fallback: boolean): boolean {
    return typeof value === 'boolean' ? value : fallback;
}

function unitVolumeOr(value: unknown, fallback: number): number {
    if (typeof value !== 'number' || !Number.isFinite(value)) return fallback;
    return Math.min(1, Math.max(0, value));
}

/** Snapshot window.Settings.get() into a validated, immutable config. */
function readSettingsConfig(): SettingsConfig {
    const raw: Record<string, unknown> = window.Settings?.get() ?? {};
    const graphics = raw['graphics'];
    const animSpeed = raw['animSpeed'];
    return {
        graphics:
            graphics === 'low' || graphics === 'med' || graphics === 'high'
                ? graphics
                : SETTINGS_FALLBACK.graphics,
        animSpeed:
            animSpeed === 0 || animSpeed === 1 || animSpeed === 2
                ? animSpeed
                : SETTINGS_FALLBACK.animSpeed,
        reducedMotion: boolOr(raw['reducedMotion'], SETTINGS_FALLBACK.reducedMotion),
        colorBlind: boolOr(raw['colorBlind'], SETTINGS_FALLBACK.colorBlind),
        highContrast: boolOr(raw['highContrast'], SETTINGS_FALLBACK.highContrast),
        haptics: boolOr(raw['haptics'], SETTINGS_FALLBACK.haptics),
        bgmEnabled: boolOr(raw['bgmEnabled'], SETTINGS_FALLBACK.bgmEnabled),
        autoSave: boolOr(raw['autoSave'], SETTINGS_FALLBACK.autoSave),
    };
}

/** Snapshot window.SoundFX.getConfig() into a validated, immutable config. */
function readAudioConfig(): AudioConfig {
    const api = getAudioApi();
    if (!api) return { ...AUDIO_FALLBACK };
    const raw = api.getConfig();
    return {
        master: unitVolumeOr(raw['master'], AUDIO_FALLBACK.master),
        sfx: unitVolumeOr(raw['sfx'], AUDIO_FALLBACK.sfx),
        bgm: unitVolumeOr(raw['bgm'], AUDIO_FALLBACK.bgm),
        muted: boolOr(raw['muted'], AUDIO_FALLBACK.muted),
    };
}

/** Parse a 0–100 range input into a clamped 0..1 volume (legacy: parseInt/100). */
function toUnitVolume(rawValue: string): number {
    const pct = Number.parseInt(rawValue, 10);
    if (Number.isNaN(pct)) return 0;
    return Math.min(100, Math.max(0, pct)) / 100;
}

// ---------------------------------------------------------------------------
// window.SettingsUI override (module level — import order makes it win)
// ---------------------------------------------------------------------------

function openPanel(): void {
    uiStore.getState().openSettings();
    window.SoundFX?.click();
}

function closePanel(): void {
    uiStore.getState().closeSettings();
    window.SoundFX?.click();
}

installFacade({ SettingsUI: { open: openPanel, close: closePanel } }, 'SettingsPanel');

// ---------------------------------------------------------------------------
// Presentational sub-components (legacy markup/classes copied verbatim)
// ---------------------------------------------------------------------------

interface VolumeSliderProps {
    label: string;
    /** 0..1 — rendered and edited as 0–100%. */
    value: number;
    onChange: (volume: number) => void;
}

function VolumeSlider({ label, value, onChange }: VolumeSliderProps) {
    const pct = Math.round(value * 100);
    return (
        <label className="block mb-3">
            <span className="flex justify-between text-xs uppercase tracking-widest mb-1">
                <span>{label}</span>
                <span>{pct}%</span>
            </span>
            <input
                type="range"
                min={0}
                max={100}
                value={pct}
                onChange={(e) => onChange(toUnitVolume(e.target.value))}
                className="w-full"
            />
        </label>
    );
}

interface CheckRowProps {
    label: string;
    checked: boolean;
    onChange: (checked: boolean) => void;
}

function CheckRow({ label, checked, onChange }: CheckRowProps) {
    return (
        <label className="flex items-center gap-2 text-xs uppercase tracking-widest">
            <input
                type="checkbox"
                checked={checked}
                onChange={(e) => onChange(e.target.checked)}
            />
            {label}
        </label>
    );
}

interface ChoiceButtonsProps<T extends string | number> {
    ariaLabel: string;
    options: ReadonlyArray<{ value: T; label: string }>;
    selected: T;
    onSelect: (value: T) => void;
}

function ChoiceButtons<T extends string | number>({
    ariaLabel,
    options,
    selected,
    onSelect,
}: ChoiceButtonsProps<T>) {
    return (
        <div className="flex gap-2" role="radiogroup" aria-label={ariaLabel}>
            {options.map((opt) => {
                const active = opt.value === selected;
                return (
                    <button
                        key={String(opt.value)}
                        type="button"
                        aria-pressed={active}
                        onClick={() => onSelect(opt.value)}
                        className={`flex-1 py-2 rounded-lg font-black text-xs uppercase tracking-widest transition-all border ${
                            active
                                ? 'bg-gradient-to-b from-gold-400 to-gold-600 text-lac-900 border-gold-300'
                                : 'bg-gold-400/10 text-gold-300/80 border-transparent hover:bg-gold-400/20'
                        }`}
                    >
                        {opt.label}
                    </button>
                );
            })}
        </div>
    );
}

// ---------------------------------------------------------------------------
// Dialog (mounted only while uiStore.settingsOpen — fresh snapshot per open)
// ---------------------------------------------------------------------------

function SettingsDialog() {
    const [cfg, setCfg] = useState<SettingsConfig>(readSettingsConfig);
    const [audio, setAudio] = useState<AudioConfig>(readAudioConfig);

    // Esc closes (legacy: document-level keydown while the panel was visible).
    useEffect(() => {
        const onKeyDown = (e: KeyboardEvent): void => {
            if (e.key === 'Escape') closePanel();
        };
        document.addEventListener('keydown', onKeyDown);
        return () => document.removeEventListener('keydown', onKeyDown);
    }, []);

    // Canvas DOF blur via css "body.modal-open #canvas-container".
    useEffect(() => {
        document.body.classList.add('modal-open');
        return () => document.body.classList.remove('modal-open');
    }, []);

    const handleVolume = (channel: VolumeChannel, volume: number): void => {
        setAudio((prev) => ({ ...prev, [channel]: volume }));
        const api = getAudioApi();
        if (!api) return;
        if (channel === 'master') api.setMaster(volume);
        else if (channel === 'sfx') api.setSfx(volume);
        else api.setBgm(volume);
    };

    // Legacy: 'muted' only hits SoundFX.setMuted — never Settings.set.
    const handleMuted = (checked: boolean): void => {
        setAudio((prev) => ({ ...prev, muted: checked }));
        getAudioApi()?.setMuted(checked);
    };

    const handleToggle = (key: BoolSettingKey, checked: boolean): void => {
        setCfg((prev) => ({ ...prev, [key]: checked }));
        window.Settings?.set(key, checked);
        if (key === 'bgmEnabled') {
            if (checked) window.SoundFX?.startBGM();
            else window.SoundFX?.stopBGM();
        }
    };

    const handleGraphics = (tier: GraphicsTier): void => {
        setCfg((prev) => ({ ...prev, graphics: tier }));
        window.Settings?.set('graphics', tier);
    };

    const handleAnimSpeed = (speed: AnimSpeed): void => {
        setCfg((prev) => ({ ...prev, animSpeed: speed }));
        window.Settings?.set('animSpeed', speed);
    };

    const handleReset = (): void => {
        try {
            localStorage.removeItem(SETTINGS_STORAGE_KEY);
        } catch {
            /* storage unavailable — reload still restores in-memory defaults */
        }
        try {
            localStorage.removeItem(AUDIO_STORAGE_KEY);
        } catch {
            /* storage unavailable */
        }
        window.location.reload();
    };

    return (
        <div
            className="fixed inset-0 z-[1100] flex items-center justify-center bg-lac-900/85 backdrop-blur-md"
            role="dialog"
            aria-modal="true"
            aria-labelledby="settings-title"
            onClick={(e) => {
                if (e.target === e.currentTarget) closePanel();
            }}
        >
            <div className="glass-panel deco-frame p-8 max-w-xl w-[92%] max-h-[88vh] overflow-y-auto custom-scrollbar relative pointer-events-auto">
                <div className="flex items-start justify-between mb-6">
                    <h2
                        id="settings-title"
                        className="font-display text-4xl font-black text-gold-300 leading-tight tracking-[0.01em]"
                    >
                        ⚙️ Cài đặt
                    </h2>
                    <button
                        type="button"
                        onClick={closePanel}
                        aria-label="Đóng cài đặt"
                        className="px-5 py-2 rounded-xl bg-gold-400/10 hover:bg-son-600 hover:text-gold-300 text-gold-300/80 font-black text-xs uppercase tracking-widest transition-all border border-gold-600/40"
                    >
                        Thoát ✕
                    </button>
                </div>

                <section className="space-y-5 text-ivory/85 font-bold">
                    <div>
                        <h3 className="text-gold-300 text-sm font-black mb-3 uppercase tracking-widest">
                            🔊 Âm thanh
                        </h3>
                        <VolumeSlider
                            label="Âm lượng chung"
                            value={audio.master}
                            onChange={(v) => handleVolume('master', v)}
                        />
                        <VolumeSlider
                            label="Hiệu ứng (SFX)"
                            value={audio.sfx}
                            onChange={(v) => handleVolume('sfx', v)}
                        />
                        <VolumeSlider
                            label="Nhạc nền (BGM)"
                            value={audio.bgm}
                            onChange={(v) => handleVolume('bgm', v)}
                        />
                        <div className="flex flex-wrap gap-3 mt-2">
                            <CheckRow
                                label="Tắt toàn bộ âm thanh"
                                checked={audio.muted}
                                onChange={handleMuted}
                            />
                            <CheckRow
                                label="Bật nhạc nền"
                                checked={cfg.bgmEnabled}
                                onChange={(c) => handleToggle('bgmEnabled', c)}
                            />
                        </div>
                    </div>

                    <div className="border-t border-gold-600/25 pt-5">
                        <h3 className="text-gold-300 text-sm font-black mb-3 uppercase tracking-widest">
                            🎮 Đồ hoạ & Hiệu ứng
                        </h3>
                        <div className="mb-3">
                            <span className="block text-xs uppercase tracking-widest mb-2">
                                Mức đồ hoạ
                            </span>
                            <ChoiceButtons
                                ariaLabel="Mức đồ hoạ"
                                options={GRAPHICS_OPTIONS}
                                selected={cfg.graphics}
                                onSelect={handleGraphics}
                            />
                        </div>
                        <div className="mb-3">
                            <span className="block text-xs uppercase tracking-widest mb-2">
                                Tốc độ animation
                            </span>
                            <ChoiceButtons
                                ariaLabel="Tốc độ animation"
                                options={ANIM_SPEED_OPTIONS}
                                selected={cfg.animSpeed}
                                onSelect={handleAnimSpeed}
                            />
                        </div>
                        <div className="flex flex-wrap gap-3">
                            <CheckRow
                                label="Giảm chuyển động"
                                checked={cfg.reducedMotion}
                                onChange={(c) => handleToggle('reducedMotion', c)}
                            />
                            <CheckRow
                                label="Rung (mobile)"
                                checked={cfg.haptics}
                                onChange={(c) => handleToggle('haptics', c)}
                            />
                        </div>
                    </div>

                    <div className="border-t border-gold-600/25 pt-5">
                        <h3 className="text-gold-300 text-sm font-black mb-3 uppercase tracking-widest">
                            ♿ Trợ năng
                        </h3>
                        <div className="flex flex-wrap gap-3">
                            <CheckRow
                                label="Chế độ mù màu (pattern)"
                                checked={cfg.colorBlind}
                                onChange={(c) => handleToggle('colorBlind', c)}
                            />
                            <CheckRow
                                label="Tương phản cao"
                                checked={cfg.highContrast}
                                onChange={(c) => handleToggle('highContrast', c)}
                            />
                        </div>
                    </div>

                    <div className="border-t border-gold-600/25 pt-5">
                        <h3 className="text-gold-300 text-sm font-black mb-3 uppercase tracking-widest">
                            💾 Lưu trữ
                        </h3>
                        <CheckRow
                            label="Tự lưu ván chơi"
                            checked={cfg.autoSave}
                            onChange={(c) => handleToggle('autoSave', c)}
                        />
                    </div>
                </section>

                <div className="mt-8 flex gap-3">
                    <button
                        type="button"
                        onClick={closePanel}
                        className="flex-1 py-4 bg-gold-400/10 hover:bg-gold-400/20 text-gold-300 font-black uppercase tracking-widest rounded-2xl transition-all border border-gold-600/40"
                    >
                        Đóng
                    </button>
                    <button
                        type="button"
                        onClick={handleReset}
                        className="py-4 px-6 bg-gradient-to-b from-terracotta to-[#8A2A06] hover:brightness-110 text-gold-300 border border-gold-600/50 font-black uppercase tracking-widest rounded-2xl transition-all"
                    >
                        Mặc định
                    </button>
                </div>
            </div>
        </div>
    );
}

export default function SettingsPanel() {
    const isOpen = useUiStore((s) => s.settingsOpen);
    if (!isOpen) return null;
    return <SettingsDialog />;
}
