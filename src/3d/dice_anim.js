import { ctx3d } from './context.js';

// --- DICE ROLL ANIMATION (3D only — the 2D result overlay was removed) ---
// Primary path: real cannon-es physics throw (DicePhysics) — dice skip and
// tumble LOW across the board surface, settle, then snap SEQUENTIALLY onto
// the rolled faces (staged reveal lives in dice_physics.beginSnap).
// Fallback: legacy scripted spin (reduced motion, physics not loaded yet,
// or a physics failure mid-roll).

// --- ANNOUNCEMENT STRIP (plain DOM, one reusable element) ---
let _stripEl = null;
let _stripTimer = null;

function getDiceStrip() {
    if (_stripEl) return _stripEl;
    _stripEl = document.createElement('div');
    _stripEl.className = 'dice-strip';
    _stripEl.setAttribute('aria-live', 'polite');
    document.body.appendChild(_stripEl);
    return _stripEl;
}

// Slim lacquer strip at bottom-center: «NAME» — d1 • d2 (auto-dismiss 2s)
function showDiceStrip(d1, d2) {
    const el = getDiceStrip();
    const name = window.players?.[window.Game?.currentPlayerIndex]?.name ?? 'Xúc xắc';
    el.textContent = `«${name}» — ${d1} • ${d2}`;
    if (_stripTimer) clearTimeout(_stripTimer);
    el.classList.remove('dice-strip-in');
    void el.offsetWidth; // reflow so a back-to-back reveal restarts the slide
    el.classList.add('dice-strip-in');
    _stripTimer = setTimeout(() => {
        el.classList.remove('dice-strip-in');
        _stripTimer = null;
    }, 2000);
}

// --- DOUBLES CELEBRATION: two expanding gold rings, one per die ---
// Replaces the old confetti burst. Scale 1→6 / opacity 0.85→0 over ~800ms,
// then geometry + material are disposed (no leaks per roll).
function goldRingBurst() {
    const scene = ctx3d.scene || window.scene;
    if (!scene || typeof THREE === 'undefined') return;
    const dice = [ctx3d.dice1, ctx3d.dice2].filter(Boolean);
    if (!dice.length) return;

    const RING_MS = 800;
    const rings = dice.map(die => {
        const geo = new THREE.RingGeometry(1.2, 1.5, 48);
        const mat = new THREE.MeshBasicMaterial({
            color: 0xE8C16B, transparent: true, opacity: 0.85,
            side: THREE.DoubleSide, depthWrite: false
        });
        const mesh = new THREE.Mesh(geo, mat);
        mesh.rotation.x = -Math.PI / 2; // flat on the felt
        mesh.position.set(die.position.x, 1.05, die.position.z);
        scene.add(mesh);
        return { mesh, geo, mat };
    });

    const t0 = performance.now();
    function tick(now) {
        const t = Math.min(1, (now - t0) / RING_MS);
        const ease = 1 - Math.pow(1 - t, 3); // easeOutCubic
        const s = 1 + ease * 5;              // 1 → 6
        rings.forEach(r => {
            r.mesh.scale.set(s, s, 1);
            r.mat.opacity = 0.85 * (1 - t);
        });
        if (t < 1) { requestAnimationFrame(tick); return; }
        rings.forEach(r => {
            scene.remove(r.mesh);
            r.geo.dispose();
            r.mat.dispose();
        });
    }
    requestAnimationFrame(tick);
}

function rollDiceAnimation(d1, d2, callback) {
    window.isAnimating = true;
    ctx3d.dice1.visible = true; ctx3d.dice2.visible = true;

    const isDouble = (d1 === d2);
    const reduced = window.Settings && window.Settings.isReducedMotion();
    const pulseVignette = (on) => {
        if (window.PostFX && window.PostFX.pulseVignette) window.PostFX.pulseVignette(on);
    };

    // Shared finale: let players READ the 3D faces, celebrate doubles,
    // then hide the dice and release the animation lock.
    function finale() {
        pulseVignette(false); // restore focus (no-op if it never pulsed)
        showDiceStrip(d1, d2);
        if (isDouble) {
            if (!reduced) goldRingBurst();
            if (window.Toast) window.Toast.show(`✨ Đôi ${d1}!`, { type: 'success', icon: '✨' });
        }

        setTimeout(() => {
            ctx3d.dice1.visible = false;
            ctx3d.dice2.visible = false;
            window.isAnimating = false;
            callback();
        }, isDouble ? 1800 : 1300);
    }

    // FALLBACK: place on the board center, spin briefly, snap to the result face
    function scriptedSpin() {
        const BOARD_Y = 2.4; // board surface(1.0) + half-dice(1.4)
        ctx3d.dice1.position.set(-3.5, BOARD_Y, 2);
        ctx3d.dice2.position.set( 3.5, BOARD_Y, 2);
        ctx3d.dice1.rotation.set(Math.random() * Math.PI, Math.random() * Math.PI, Math.random() * Math.PI);
        ctx3d.dice2.rotation.set(Math.random() * Math.PI, Math.random() * Math.PI, Math.random() * Math.PI);

        const SPIN_DURATION = 600;
        const startTime = Date.now();

        function spinLoop() {
            const elapsed = Date.now() - startTime;
            if (elapsed < SPIN_DURATION) {
                ctx3d.dice1.rotation.x += 0.25;
                ctx3d.dice1.rotation.y += 0.18;
                ctx3d.dice2.rotation.x += 0.18;
                ctx3d.dice2.rotation.y += 0.25;
                requestAnimationFrame(spinLoop);
            } else {
                const faceRot = (num) => {
                    switch (num) {
                        case 1: return { x: 0,           y: 0, z: 0 };
                        case 6: return { x: Math.PI,     y: 0, z: 0 };
                        case 2: return { x: 0,           y: 0, z:  Math.PI / 2 };
                        case 5: return { x: 0,           y: 0, z: -Math.PI / 2 };
                        case 3: return { x: -Math.PI / 2, y: 0, z: 0 };
                        case 4: return { x:  Math.PI / 2, y: 0, z: 0 };
                    }
                };
                const r1 = faceRot(d1), r2 = faceRot(d2);
                ctx3d.dice1.rotation.set(r1.x, r1.y, r1.z);
                ctx3d.dice2.rotation.set(r2.x, r2.y, r2.z);
                // Scripted path has no physics snap — settle chime fires here.
                if (window.SoundFX && window.SoundFX.diceSettle) window.SoundFX.diceSettle();
                finale();
            }
        }

        spinLoop();
    }

    // PRIMARY: physics throw. DicePhysics.roll() invokes callback(false) when
    // it cannot run (reduced motion, not initialized) — we then fall back.
    const physics = window.DicePhysics;
    if (physics && physics.isReady() && !reduced) {
        try {
            pulseVignette(true); // focus on the felt while dice are in flight
            physics.roll(d1, d2, (ok) => {
                if (ok) { finale(); return; }
                pulseVignette(false);
                scriptedSpin();
            });
            return;
        } catch (e) {
            pulseVignette(false);
            console.error('[dice] physics roll failed, falling back to scripted spin:', e);
        }
    } else if (physics && !reduced && typeof physics.ensureReady === 'function') {
        physics.ensureReady(); // warm up so the NEXT roll gets real physics
    }

    scriptedSpin();
}

export { rollDiceAnimation };
window.rollDiceAnimation = rollDiceAnimation; // LEGACY-BRIDGE
