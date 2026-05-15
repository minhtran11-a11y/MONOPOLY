// --- CAMERA CINEMATICS ---
// Reuses tweenCamera() from engine.js. Honors reduced-motion + animSpeed.

(function () {
    function reduced() { return window.Settings && window.Settings.isReducedMotion(); }
    function speedMul() {
        if (!window.Settings) return 1;
        const s = window.Settings.get().animSpeed;
        if (s === 0) return 0.001;
        if (s === 2) return 0.5;
        return 1;
    }

    function defaultGameView() {
        return {
            pos: new THREE.Vector3(0, 75, 75),
            target: new THREE.Vector3(0, 0, 0)
        };
    }

    function playIntro(onDone) {
        if (!window.tweenCamera || !window.camera) { if (onDone) onDone(); return; }
        if (reduced()) {
            const v = defaultGameView();
            window.tweenCamera(v.pos, v.target, 400, onDone);
            return;
        }
        const mul = speedMul();

        // Start: very high + far away
        const start = new THREE.Vector3(60, 130, 110);
        window.camera.position.copy(start);
        if (window.controls) {
            window.controls.target.set(0, 0, 0);
            window.controls.enabled = false;
        }

        // 3-stage flight: arc around → swoop close → settle to default view
        const stage1Pos = new THREE.Vector3(-90, 70, 0);
        const stage1Tgt = new THREE.Vector3(0, 5, 0);
        const stage2Pos = new THREE.Vector3(0, 30, -55);
        const stage2Tgt = new THREE.Vector3(0, 0, 0);
        const finalView = defaultGameView();

        window.tweenCamera(stage1Pos, stage1Tgt, 1400 * mul, () => {
            window.tweenCamera(stage2Pos, stage2Tgt, 1200 * mul, () => {
                window.tweenCamera(finalView.pos, finalView.target, 1100 * mul, () => {
                    if (window.controls) window.controls.enabled = true;
                    if (onDone) onDone();
                });
            });
        });
    }

    function focusOnPlayer(player, onDone) {
        if (!window.tweenCamera || !window.camera || !player || !player.mesh) {
            if (onDone) onDone();
            return;
        }
        if (reduced()) { if (onDone) onDone(); return; }
        // Only do a subtle pan, not a full close-up, so players don't lose context.
        const pp = player.mesh.position;
        // Offset behind the token, looking down at board center bias
        const offset = new THREE.Vector3(
            pp.x * 1.05,
            55,
            pp.z * 1.05 + (pp.z >= 0 ? 35 : -35)
        );
        const target = new THREE.Vector3(pp.x * 0.5, 2, pp.z * 0.5);
        window.tweenCamera(offset, target, 900 * speedMul(), onDone);
    }

    function returnToOverview(onDone) {
        if (!window.tweenCamera) { if (onDone) onDone(); return; }
        const v = defaultGameView();
        window.tweenCamera(v.pos, v.target, 800 * speedMul(), onDone);
    }

    function playWinning(winner) {
        if (!window.tweenCamera || !window.camera) return;
        // Zoom way out for hero shot
        const heroPos = new THREE.Vector3(0, 120, 0.1);
        const heroTgt = new THREE.Vector3(0, 0, 0);
        const mul = speedMul();
        window.tweenCamera(heroPos, heroTgt, 1400 * mul, () => {
            if (window.Anim3D && window.scene) {
                window.Anim3D.confettiBurst(window.scene, 150, 3000);
            }
        });
    }

    window.Cinematics = { playIntro, focusOnPlayer, returnToOverview, playWinning };
})();
