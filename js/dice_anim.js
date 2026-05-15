// --- DICE ROLL ANIMATION (prefers cannon-es, falls back to pseudo-physics) ---
function rollDiceAnimation(d1, d2, callback) {
    window.isAnimating = true;
    dice1.visible = true; dice2.visible = true;

    const overlay = document.getElementById('dice-overlay');
    const d1ui = document.getElementById('dice-1-ui');
    const d2ui = document.getElementById('dice-2-ui');
    overlay.classList.remove('opacity-0', 'scale-50');
    overlay.classList.add('opacity-100', 'scale-100');

    const isDouble = (d1 === d2);
    const reduced = window.Settings && window.Settings.isReducedMotion();

    // Camera zoom-in during roll (auto-restore via tweenCamera completion)
    let savedCamPos, savedCamTarget;
    if (!reduced && camera && controls) {
        savedCamPos = camera.position.clone();
        savedCamTarget = controls.target.clone();
        if (typeof tweenCamera === 'function') {
            tweenCamera(new THREE.Vector3(0, 22, 18), new THREE.Vector3(0, 2, 0), 500);
        }
    }

    function onSettled() {
        d1ui.innerText = d1; d2ui.innerText = d2;
        if (isDouble && window.Anim3D && window.scene) {
            window.Anim3D.confettiBurst(window.scene, 40, 1200);
            if (window.Toast) window.Toast.show(`✨ Đôi ${d1}!`, { type: 'success', icon: '✨' });
        }
        setTimeout(() => {
            overlay.classList.add('opacity-0', 'scale-50');
            overlay.classList.remove('opacity-100', 'scale-100');
            if (savedCamPos && typeof tweenCamera === 'function') {
                tweenCamera(savedCamPos, savedCamTarget, 600);
            }
            setTimeout(() => {
                dice1.visible = false; dice2.visible = false;
                window.isAnimating = false;
                callback();
            }, 500);
        }, isDouble ? 1500 : 1000);
    }

    // ---- Try real cannon-es physics ----
    if (!reduced && window.DicePhysics) {
        let usedPseudo = false;
        const fallback = () => { if (!usedPseudo) { usedPseudo = true; pseudoSim(); } };
        window.DicePhysics.ensureReady().then((ok) => {
            if (!ok) return fallback();
            const ticker = setInterval(() => {
                d1ui.innerText = Math.floor(Math.random() * 6) + 1;
                d2ui.innerText = Math.floor(Math.random() * 6) + 1;
            }, 100);
            window.DicePhysics.roll(d1, d2, (success) => {
                clearInterval(ticker);
                if (success) onSettled();
                else fallback();
            });
        }).catch(fallback);
        return;
    }

    pseudoSim();

    // ---- Inline pseudo-physics ----
    function pseudoSim() {
        const state = [
            { mesh: dice1, vx: -0.18, vy: 0, vz: 0.05,  ax: 0.4, ay: 0.3, az: 0.5 },
            { mesh: dice2, vx:  0.18, vy: 0, vz: -0.05, ax: 0.5, ay: 0.4, az: 0.3 }
        ];
        state.forEach(s => {
            s.mesh.position.set((s === state[0] ? -3 : 3), 18 + Math.random() * 4, (Math.random() - 0.5) * 3);
            s.mesh.rotation.set(Math.random() * Math.PI, Math.random() * Math.PI, Math.random() * Math.PI);
        });

        const GRAVITY = -0.06;
        const FLOOR_Y = 1.5;
        const BOUNCE_DAMP = 0.55;
        const ANG_DAMP = 0.85;
        const MAX_FRAMES = 110;
        let frame = 0;

        function simulateFrame() {
            const slowMo = isDouble && frame > 50 ? 0.45 : 1.0;
            state.forEach(s => {
                s.vy += GRAVITY * slowMo;
                s.mesh.position.x += s.vx * slowMo;
                s.mesh.position.y += s.vy * slowMo;
                s.mesh.position.z += s.vz * slowMo;
                if (s.mesh.position.y <= FLOOR_Y) {
                    s.mesh.position.y = FLOOR_Y;
                    s.vy = -s.vy * BOUNCE_DAMP;
                    s.vx *= 0.85; s.vz *= 0.85;
                    s.ax *= ANG_DAMP; s.ay *= ANG_DAMP; s.az *= ANG_DAMP;
                }
                s.mesh.rotation.x += s.ax * slowMo;
                s.mesh.rotation.y += s.ay * slowMo;
                s.mesh.rotation.z += s.az * slowMo;
            });
            if (frame % 5 === 0 && frame < MAX_FRAMES - 25) {
                d1ui.innerText = Math.floor(Math.random() * 6) + 1;
                d2ui.innerText = Math.floor(Math.random() * 6) + 1;
            }
        }

        function finalize() {
            const faceRot = (num) => {
                switch (num) {
                    case 1: return { x: 0, y: 0, z: 0 };
                    case 6: return { x: Math.PI, y: 0, z: 0 };
                    case 2: return { x: 0, y: 0, z: Math.PI / 2 };
                    case 5: return { x: 0, y: 0, z: -Math.PI / 2 };
                    case 3: return { x: -Math.PI / 2, y: 0, z: 0 };
                    case 4: return { x: Math.PI / 2, y: 0, z: 0 };
                }
            };
            const r1 = faceRot(d1), r2 = faceRot(d2);
            dice1.position.y = FLOOR_Y; dice2.position.y = FLOOR_Y;
            dice1.rotation.set(r1.x, r1.y, r1.z);
            dice2.rotation.set(r2.x, r2.y, r2.z);
            onSettled();
        }

        function loop() {
            frame++;
            if (reduced) { finalize(); return; }
            if (frame < MAX_FRAMES) {
                simulateFrame();
                requestAnimationFrame(loop);
            } else {
                finalize();
            }
        }
        loop();
    }
}
