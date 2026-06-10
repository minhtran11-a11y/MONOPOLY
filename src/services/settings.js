// --- USER PREFERENCES / SETTINGS MANAGER ---
// Persists to localStorage, applies to engine/audio at runtime.
const SETTINGS_KEY = 'monopoly3d_settings_v1';

const SETTINGS_DEFAULTS = {
    graphics: 'high',        // 'low' | 'med' | 'high'
    animSpeed: 1,            // 0 (skip), 1, 2
    reducedMotion: false,
    colorBlind: false,
    highContrast: false,
    haptics: true,
    bgmEnabled: true,
    autoSave: true
};

const Settings = {
    _config: { ...SETTINGS_DEFAULTS },
    _listeners: [],

    load() {
        try {
            const raw = localStorage.getItem(SETTINGS_KEY);
            if (raw) this._config = { ...SETTINGS_DEFAULTS, ...JSON.parse(raw) };
        } catch (e) {
            this._config = { ...SETTINGS_DEFAULTS };
        }
        // Respect OS-level reduced-motion if user has not explicitly disabled animations
        try {
            const prm = window.matchMedia('(prefers-reduced-motion: reduce)');
            if (prm.matches && !this._config._userOverrodeReducedMotion) {
                this._config.reducedMotion = true;
            }
        } catch (e) {}
        this.applyBodyClasses();
        return this._config;
    },

    save() {
        try { localStorage.setItem(SETTINGS_KEY, JSON.stringify(this._config)); } catch (e) {}
    },

    get() { return { ...this._config }; },

    set(key, value) {
        if (!(key in SETTINGS_DEFAULTS)) return;
        this._config[key] = value;
        if (key === 'reducedMotion') this._config._userOverrodeReducedMotion = true;
        this.save();
        this.applyBodyClasses();
        this._notify(key, value);
    },

    onChange(fn) {
        this._listeners.push(fn);
        return () => { this._listeners = this._listeners.filter(f => f !== fn); };
    },

    _notify(key, value) {
        this._listeners.forEach(fn => { try { fn(key, value, this._config); } catch (e) {} });
    },

    applyBodyClasses() {
        const b = document.body;
        if (!b) return;
        b.classList.toggle('reduced-motion', !!this._config.reducedMotion);
        b.classList.toggle('color-blind', !!this._config.colorBlind);
        b.classList.toggle('high-contrast', !!this._config.highContrast);
        b.dataset.graphics = this._config.graphics;
        b.dataset.animSpeed = String(this._config.animSpeed);
    },

    // --- Helpers consumed by engine/game ---
    animDuration(ms) {
        if (this._config.animSpeed === 0) return 0;     // skip
        if (this._config.animSpeed === 2) return Math.round(ms * 0.5);
        return ms;
    },

    graphicsTier() { return this._config.graphics; },

    isReducedMotion() { return !!this._config.reducedMotion; },

    haptic(pattern) {
        if (!this._config.haptics) return;
        if (typeof navigator !== 'undefined' && navigator.vibrate) {
            try { navigator.vibrate(pattern); } catch (e) {}
        }
    }
};

window.Settings = Settings; // LEGACY-BRIDGE

// Load immediately (before DOM ready, since localStorage is sync)
Settings.load();

export { Settings };
