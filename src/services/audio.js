// --- WEB AUDIO API SOUND SYSTEM (with volume channels + BGM) ---
// AudioContext is created lazily on first sound to avoid blocking initial
// page render (~225ms saved on LCP/FCP).
let audioCtx;
function _ensureCtx() {
    if (audioCtx !== undefined) return audioCtx;
    try {
        const AudioContextClass = window.AudioContext || window.webkitAudioContext;
        audioCtx = AudioContextClass ? new AudioContextClass() : null;
    } catch (e) {
        audioCtx = null;
    }
    return audioCtx;
}

const AUDIO_SETTINGS_KEY = 'monopoly3d_audio_v1';

// Default config: all on, moderate levels
const _defaults = { master: 0.8, sfx: 0.9, bgm: 0.35, muted: false };

function _loadSettings() {
    try {
        const raw = localStorage.getItem(AUDIO_SETTINGS_KEY);
        if (!raw) return { ..._defaults };
        return { ..._defaults, ...JSON.parse(raw) };
    } catch (e) {
        return { ..._defaults };
    }
}

function _saveSettings(cfg) {
    try { localStorage.setItem(AUDIO_SETTINGS_KEY, JSON.stringify(cfg)); } catch (e) {}
}

const _config = _loadSettings();

// Master gain node (controls everything)
let _masterGain = null;
let _sfxGain = null;
let _bgmGain = null;

function _ensureGraph() {
    _ensureCtx();
    if (!audioCtx || _masterGain) return;
    _masterGain = audioCtx.createGain();
    _sfxGain = audioCtx.createGain();
    _bgmGain = audioCtx.createGain();
    _sfxGain.connect(_masterGain);
    _bgmGain.connect(_masterGain);
    _masterGain.connect(audioCtx.destination);
    _applyVolumes();
}

function _applyVolumes() {
    if (!_masterGain) return;
    const masterVol = _config.muted ? 0 : _config.master;
    _masterGain.gain.setTargetAtTime(masterVol, audioCtx.currentTime, 0.02);
    _sfxGain.gain.setTargetAtTime(_config.sfx, audioCtx.currentTime, 0.02);
    _bgmGain.gain.setTargetAtTime(_config.bgm, audioCtx.currentTime, 0.02);
}

function _resumeCtx() {
    if (audioCtx && audioCtx.state === 'suspended') audioCtx.resume();
}

// --- BGM: ambient pad loop generated procedurally ---
let _bgmNodes = null;
function _startBGM() {
    _ensureGraph();
    if (!audioCtx || _bgmNodes) return;
    _resumeCtx();

    // Simple 3-oscillator ambient pad (C-E-G minor-ish chord with subtle modulation)
    const freqs = [130.81, 196.00, 261.63]; // C3, G3, C4
    const oscs = [];
    const gains = [];
    const lfos = [];

    freqs.forEach((f, i) => {
        const osc = audioCtx.createOscillator();
        const g = audioCtx.createGain();
        const lfo = audioCtx.createOscillator();
        const lfoGain = audioCtx.createGain();

        osc.type = 'sine';
        osc.frequency.value = f;

        lfo.type = 'sine';
        lfo.frequency.value = 0.08 + i * 0.04;
        lfoGain.gain.value = 0.05;
        lfo.connect(lfoGain).connect(g.gain);
        g.gain.value = 0.12;

        osc.connect(g).connect(_bgmGain);
        osc.start();
        lfo.start();
        oscs.push(osc);
        gains.push(g);
        lfos.push(lfo);
    });

    _bgmNodes = { oscs, gains, lfos };
}

function _stopBGM() {
    if (!_bgmNodes) return;
    const now = audioCtx.currentTime;
    _bgmNodes.gains.forEach(g => g.gain.setTargetAtTime(0, now, 0.2));
    setTimeout(() => {
        _bgmNodes.oscs.forEach(o => { try { o.stop(); } catch (e) {} });
        _bgmNodes.lfos.forEach(o => { try { o.stop(); } catch (e) {} });
        _bgmNodes = null;
    }, 600);
}

// Shared 60ms white-noise buffer for the woody dice click (created lazily once)
let _noiseBuf = null;
function _getNoiseBuf() {
    if (!audioCtx) return null;
    if (!_noiseBuf) {
        const len = Math.floor(audioCtx.sampleRate * 0.06);
        _noiseBuf = audioCtx.createBuffer(1, len, audioCtx.sampleRate);
        const data = _noiseBuf.getChannelData(0);
        for (let i = 0; i < len; i++) data[i] = Math.random() * 2 - 1;
    }
    return _noiseBuf;
}

export const SoundFX = {
    playTone(frequency, type, duration, vol = 0.1) {
        _ensureGraph();
        if (!audioCtx) return;
        _resumeCtx();
        const osc = audioCtx.createOscillator();
        const gain = audioCtx.createGain();
        osc.type = type;
        osc.frequency.setValueAtTime(frequency, audioCtx.currentTime);
        gain.gain.setValueAtTime(vol, audioCtx.currentTime);
        gain.gain.exponentialRampToValueAtTime(0.0001, audioCtx.currentTime + duration);
        osc.connect(gain).connect(_sfxGain);
        osc.start();
        osc.stop(audioCtx.currentTime + duration);
    },

    roll() {
        this.playTone(300, 'triangle', 0.1, 0.2);
        setTimeout(() => this.playTone(400, 'triangle', 0.15, 0.2), 100);
        setTimeout(() => this.playTone(500, 'triangle', 0.2, 0.2), 250);
    },

    buy() {
        this.playTone(440, 'sine', 0.1, 0.2);
        setTimeout(() => this.playTone(554, 'sine', 0.1, 0.2), 100);
        setTimeout(() => this.playTone(659, 'sine', 0.3, 0.2), 200);
    },

    pay() {
        this.playTone(200, 'sawtooth', 0.2, 0.2);
        setTimeout(() => this.playTone(150, 'sawtooth', 0.3, 0.2), 150);
    },

    build() {
        this.playTone(600, 'square', 0.05, 0.1);
        setTimeout(() => this.playTone(600, 'square', 0.05, 0.1), 80);
    },

    // Money counter ticks (call repeatedly while animating money change)
    moneyTick() {
        this.playTone(880, 'triangle', 0.04, 0.08);
    },

    bankrupt() {
        [600, 500, 380, 260, 180].forEach((f, i) => {
            setTimeout(() => this.playTone(f, 'sawtooth', 0.3, 0.2), i * 120);
        });
    },

    jail() {
        this.playTone(220, 'square', 0.15, 0.15);
        setTimeout(() => this.playTone(180, 'square', 0.25, 0.15), 150);
    },

    win() {
        [440, 554, 659, 880].forEach((freq, i) => {
            setTimeout(() => this.playTone(freq, 'sine', 0.5, 0.3), i * 150);
        });
    },

    alert() { this.playTone(800, 'square', 0.2, 0.1); },
    click() { this.playTone(700, 'sine', 0.05, 0.1); },

    // Short woody click for dice impacts. force01 in [0,1] scales pitch + volume.
    // Bandpass-filtered noise burst (the "knock") + low triangle thump (the body).
    diceClick(force01 = 0.5) {
        _ensureGraph();
        if (!audioCtx) return;
        _resumeCtx();
        const f = Math.max(0, Math.min(1, force01));
        const now = audioCtx.currentTime;

        const buf = _getNoiseBuf();
        if (buf) {
            const src = audioCtx.createBufferSource();
            src.buffer = buf;
            const bp = audioCtx.createBiquadFilter();
            bp.type = 'bandpass';
            bp.frequency.value = 1400 + f * 1400; // harder hit → brighter knock
            bp.Q.value = 7;                        // woody resonance
            const g = audioCtx.createGain();
            const peak = 0.05 + f * 0.22;
            g.gain.setValueAtTime(peak, now);
            g.gain.exponentialRampToValueAtTime(0.0001, now + 0.03 + f * 0.03);
            src.connect(bp).connect(g).connect(_sfxGain);
            src.start(now);
            src.stop(now + 0.07);
        }

        const osc = audioCtx.createOscillator();
        const og = audioCtx.createGain();
        osc.type = 'triangle';
        osc.frequency.setValueAtTime(180 + f * 140, now);
        og.gain.setValueAtTime((0.05 + f * 0.22) * 0.5, now);
        og.gain.exponentialRampToValueAtTime(0.0001, now + 0.045);
        osc.connect(og).connect(_sfxGain);
        osc.start(now);
        osc.stop(now + 0.05);
    },

    // Warm two-partial wooden chime when the dice settle (~350ms decay).
    // Deliberately soft — a lacquer-box close, NOT a casino ding.
    diceSettle() {
        _ensureGraph();
        if (!audioCtx) return;
        _resumeCtx();
        const now = audioCtx.currentTime;
        const partials = [
            { type: 'sine',     freq: 329.63, vol: 0.16,  delay: 0    }, // E4 — warm fundamental
            { type: 'triangle', freq: 493.88, vol: 0.085, delay: 0.02 }  // B4 — soft fifth shimmer
        ];
        partials.forEach(p => {
            const osc = audioCtx.createOscillator();
            const g = audioCtx.createGain();
            osc.type = p.type;
            osc.frequency.setValueAtTime(p.freq, now + p.delay);
            g.gain.setValueAtTime(0.0001, now + p.delay);
            g.gain.exponentialRampToValueAtTime(p.vol, now + p.delay + 0.015);
            g.gain.exponentialRampToValueAtTime(0.0001, now + p.delay + 0.35);
            osc.connect(g).connect(_sfxGain);
            osc.start(now + p.delay);
            osc.stop(now + p.delay + 0.4);
        });
    },

    // --- BGM control ---
    startBGM() { _startBGM(); },
    stopBGM() { _stopBGM(); },
    isBGMPlaying() { return !!_bgmNodes; },

    // --- Settings API ---
    getConfig() { return { ..._config }; },
    setMaster(v) { _config.master = Math.max(0, Math.min(1, v)); _saveSettings(_config); _applyVolumes(); },
    setSfx(v)    { _config.sfx    = Math.max(0, Math.min(1, v)); _saveSettings(_config); _applyVolumes(); },
    setBgm(v)    { _config.bgm    = Math.max(0, Math.min(1, v)); _saveSettings(_config); _applyVolumes(); },
    setMuted(b)  { _config.muted  = !!b; _saveSettings(_config); _applyVolumes(); }
};

window.SoundFX = SoundFX; // LEGACY-BRIDGE

// Unlock audio on first user interaction (browser autoplay policy)
const _unlock = () => {
    _ensureGraph();
    _resumeCtx();
    window.removeEventListener('pointerdown', _unlock);
    window.removeEventListener('keydown', _unlock);
    window.removeEventListener('touchstart', _unlock);
};
window.addEventListener('pointerdown', _unlock, { once: false });
window.addEventListener('keydown', _unlock, { once: false });
window.addEventListener('touchstart', _unlock, { once: false });
