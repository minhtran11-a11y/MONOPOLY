// --- WEB AUDIO API SOUND SYSTEM ---
const AudioContext = window.AudioContext || window.webkitAudioContext;
const audioCtx = new AudioContext();

const SoundFX = {
    playTone(frequency, type, duration, vol=0.1) {
        if (audioCtx.state === 'suspended') audioCtx.resume();
        const osc = audioCtx.createOscillator();
        const gain = audioCtx.createGain();
        osc.type = type;
        osc.frequency.setValueAtTime(frequency, audioCtx.currentTime);
        
        gain.gain.setValueAtTime(vol, audioCtx.currentTime);
        gain.gain.exponentialRampToValueAtTime(0.01, audioCtx.currentTime + duration);
        
        osc.connect(gain);
        gain.connect(audioCtx.destination);
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
    
    win() {
        [440, 554, 659, 880].forEach((freq, i) => {
            setTimeout(() => this.playTone(freq, 'sine', 0.5, 0.3), i * 150);
        });
    },

    alert() {
        this.playTone(800, 'square', 0.2, 0.1);
    }
};

window.SoundFX = SoundFX;
