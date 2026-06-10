import { ctx3d } from './context.js';

// --- DICE ROLL ANIMATION (3D only — the 2D result overlay was removed) ---
// Primary path: real cannon-es physics throw (DicePhysics) — dice skip and
// tumble LOW across the board surface, settle, then slerp onto the rolled
// faces. Fallback: legacy scripted spin (reduced motion, physics not loaded
// yet, or a physics failure mid-roll).
function rollDiceAnimation(d1, d2, callback) {
    window.isAnimating = true;
    ctx3d.dice1.visible = true; ctx3d.dice2.visible = true;

    const isDouble = (d1 === d2);

    // Shared finale: let players READ the 3D faces, celebrate doubles,
    // then hide the dice and release the animation lock.
    function finale() {
        if (isDouble && window.Anim3D && window.scene) {
            window.Anim3D.confettiBurst(window.scene, 40, 1200);
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
                finale();
            }
        }

        spinLoop();
    }

    // PRIMARY: physics throw. DicePhysics.roll() invokes callback(false) when
    // it cannot run (reduced motion, not initialized) — we then fall back.
    const physics = window.DicePhysics;
    const reduced = window.Settings && window.Settings.isReducedMotion();
    if (physics && physics.isReady() && !reduced) {
        try {
            physics.roll(d1, d2, (ok) => { if (ok) finale(); else scriptedSpin(); });
            return;
        } catch (e) {
            console.error('[dice] physics roll failed, falling back to scripted spin:', e);
        }
    } else if (physics && !reduced && typeof physics.ensureReady === 'function') {
        physics.ensureReady(); // warm up so the NEXT roll gets real physics
    }

    scriptedSpin();
}

export { rollDiceAnimation };
window.rollDiceAnimation = rollDiceAnimation; // LEGACY-BRIDGE
