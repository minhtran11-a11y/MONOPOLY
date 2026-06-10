// --- MENU MANAGER ---
function drawMenuLogo() {
    const canvas = document.getElementById('menu-logo-canvas');
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    
    // Background - Dark Slate with radial gradient
    const grad = ctx.createRadialGradient(512, 512, 0, 512, 512, 800);
    grad.addColorStop(0, '#1e293b');
    grad.addColorStop(1, '#0f172a');
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, 1024, 1024);

    // Rounded corners clip
    const r = 60;
    ctx.beginPath();
    ctx.moveTo(r, 0);
    ctx.lineTo(1024 - r, 0);
    ctx.quadraticCurveTo(1024, 0, 1024, r);
    ctx.lineTo(1024, 1024 - r);
    ctx.quadraticCurveTo(1024, 1024, 1024 - r, 1024);
    ctx.lineTo(r, 1024);
    ctx.quadraticCurveTo(0, 1024, 0, 1024 - r);
    ctx.lineTo(0, r);
    ctx.quadraticCurveTo(0, 0, r, 0);
    ctx.closePath();
    ctx.clip();
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, 1024, 1024);

    // Glossy Red Banner
    ctx.fillStyle = '#ef4444';
    ctx.shadowColor = 'rgba(0,0,0,0.5)';
    ctx.shadowBlur = 40;
    ctx.shadowOffsetY = 20;
    ctx.fillRect(100, 320, 824, 380);

    // Border Inner
    ctx.strokeStyle = 'rgba(255,255,255,0.2)';
    ctx.lineWidth = 10;
    ctx.strokeRect(120, 340, 784, 340);

    // Main Text
    ctx.shadowColor = 'rgba(0,0,0,0.8)';
    ctx.shadowBlur = 30;
    ctx.shadowOffsetY = 15;
    ctx.fillStyle = '#ffffff';
    ctx.font = '900 160px "Be Vietnam Pro", sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('MONOPOLY', 512, 450);

    // Subtext
    ctx.shadowBlur = 10;
    ctx.shadowOffsetY = 5;
    ctx.font = 'italic 800 90px "Be Vietnam Pro", sans-serif';
    ctx.fillStyle = '#fbbf24';
    ctx.fillText('VIỆT NAM', 512, 590);

    // Decorative Emoji
    ctx.shadowBlur = 0;
    ctx.font = '100px "Segoe UI Emoji", sans-serif';
    ctx.fillText('🎲', 180, 512);
    ctx.fillText('💰', 844, 512);
}

const MenuManager = {
    screens: {},
    currentScreen: 'screen-intro',

    init() {
        drawMenuLogo();
        // Purge legacy plaintext credential store (security fix).
        try { localStorage.removeItem('monopoly_accounts'); } catch (e) {}
        // Cache screens
        ['screen-intro', 'screen-modes', 'screen-bot-detail'].forEach(id => {
            this.screens[id] = document.getElementById(id);
        });

        // Event listeners
        document.getElementById('btn-start-game').onclick = () => {
            if(window.SoundFX) window.SoundFX.click();
            this.showScreen('screen-modes');
        };

        // Show "Tiếp tục" button if a recent save exists
        if (window.GameSave && window.GameSave.hasSavedGame()) {
            const btn = document.getElementById('btn-resume-game');
            if (btn) {
                btn.classList.remove('hidden');
                btn.onclick = () => {
                    if(window.SoundFX) window.SoundFX.click();
                    const snap = window.GameSave.load();
                    if (!snap) return;
                    this.launchGame(snap.players.length, snap.mode || 'bot', snap);
                };
            }
        }

        document.getElementById('mode-bot-trigger').onclick = () => {
            if(window.SoundFX) window.SoundFX.click();
            this.showScreen('screen-bot-detail');
        };

        // ONLINE mode card (#mode-online-trigger) is intentionally inert.
        // The Supabase lobby (next phase) will bind its handler.

        // Back buttons
        document.querySelectorAll('.back-to-intro').forEach(btn => {
            btn.onclick = () => {
                if(window.SoundFX) window.SoundFX.click();
                this.showScreen('screen-intro');
            };
        });

        document.querySelectorAll('.back-to-modes').forEach(btn => {
            btn.onclick = () => {
                if(window.SoundFX) window.SoundFX.click();
                this.showScreen('screen-modes');
            };
        });
    },

    showScreen(screenId) {
        const oldScreen = this.screens[this.currentScreen];
        const newScreen = this.screens[screenId];

        if (oldScreen && oldScreen !== newScreen && !oldScreen.classList.contains('hidden')) {
            // Apply forward zoom-out effect (like moving past it)
            oldScreen.style.transition = 'all 0.6s cubic-bezier(0.4, 0, 0.2, 1)';
            oldScreen.style.transform = 'scale(1.5)';
            oldScreen.style.opacity = '0';
            oldScreen.style.pointerEvents = 'none';

            setTimeout(() => {
                oldScreen.classList.add('hidden');
                oldScreen.style.transform = '';
                oldScreen.style.opacity = '';
                oldScreen.style.pointerEvents = '';
                oldScreen.style.transition = '';
            }, 600);
        } else if (oldScreen === newScreen) {
            return; // Already on this screen
        } else {
            // Fallback: hide all if state is inconsistent
            Object.values(this.screens).forEach(s => {
                if (s && s !== newScreen) s.classList.add('hidden');
            });
        }

        if (newScreen) {
            const delay = (oldScreen && oldScreen !== newScreen && !oldScreen.classList.contains('hidden')) ? 150 : 0;
            
            setTimeout(() => {
                newScreen.classList.remove('hidden');
                
                // Pre-state: coming from the distance
                newScreen.style.transition = 'none';
                newScreen.style.transform = 'scale(0.8)';
                newScreen.style.opacity = '0';
                
                // Force reflow
                void newScreen.offsetWidth;

                // Animate to normal size
                newScreen.style.transition = 'all 0.6s cubic-bezier(0.4, 0, 0.2, 1)';
                newScreen.style.transform = 'scale(1)';
                newScreen.style.opacity = '1';

                // Cleanup styles after animation
                setTimeout(() => {
                    newScreen.style.transition = '';
                    newScreen.style.transform = '';
                    newScreen.style.opacity = '';
                }, 600);
            }, delay);
        }

        this.currentScreen = screenId;
    },

    async launchGame(totalPlayers, mode, savedSnap) {
        if(window.SoundFX) window.SoundFX.click();
        window._gameMode = mode;

        // Show a brief loading state while Three.js downloads on first launch
        const startBtn = document.getElementById('btn-start-game');
        if (startBtn && !window._threeLoaded) {
            startBtn.textContent = '⏳ Đang tải...';
        }

        // Lazy-load Three.js core if not already loaded
        if (typeof window._loadThreeJS === 'function') {
            try { await window._loadThreeJS(); } catch (e) { console.error('Failed to load Three.js', e); }
        }
        // Ensure 3D scene is initialized before showing it
        if (typeof window.ensure3DInit === 'function') window.ensure3DInit();

        // Hide Menu Layer
        const mainMenu = document.getElementById('main-menu-layer');
        mainMenu.classList.add('opacity-0', 'scale-110');

        setTimeout(() => {
            mainMenu.classList.add('hidden');
            // Show HUD Layer
            document.getElementById('game-ui-layer').classList.remove('opacity-0', 'hidden');
            
            // Start the actual 3D game
            if(typeof Game !== 'undefined') {
                Game.init(totalPlayers, mode);
                // Attach auto-save (wraps nextTurn)
                if (window.GameSave) window.GameSave.attachAutoSave();
                // Apply saved snapshot AFTER init has rebuilt scene
                if (savedSnap && window.GameSave) {
                    setTimeout(() => window.GameSave.restoreInto(savedSnap), 100);
                }
            }

            // Start BGM if user has it enabled
            if (window.SoundFX && window.Settings && window.Settings.get().bgmEnabled) {
                window.SoundFX.startBGM();
            }
            // Welcome toast
            if (window.Toast) {
                window.Toast.show('Chúc bạn chơi vui!', { type: 'info', icon: '🎮' });
            }
            // Cinematic intro fly-through
            if (window.Cinematics) {
                window.Cinematics.playIntro();
            }
            // First-run interactive tutorial (only once, and not on resumed games)
            if (!savedSnap && window.Tutorial && window.Tutorial.shouldShow()) {
                setTimeout(() => window.Tutorial.start(), 800);
            }
        }, 700);
    }
};

document.addEventListener('DOMContentLoaded', () => MenuManager.init());

window.MenuManager = MenuManager; // LEGACY-BRIDGE
window.drawMenuLogo = drawMenuLogo; // LEGACY-BRIDGE
