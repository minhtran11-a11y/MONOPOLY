// --- DICE ROLL ANIMATION (simple: place dice on board, spin briefly, show result) ---
function rollDiceAnimation(d1, d2, callback) {
    window.isAnimating = true;
    ctx3d.dice1.visible = true; ctx3d.dice2.visible = true;

    const overlay = document.getElementById('dice-overlay');
    const d1ui = document.getElementById('dice-1-ui');
    const d2ui = document.getElementById('dice-2-ui');
    overlay.classList.remove('opacity-0', 'scale-50');
    overlay.classList.add('opacity-100', 'scale-100');

    const isDouble = (d1 === d2);

    // Place dice directly on the board center (center logo area)
    const BOARD_Y = 2.4; // board surface(1.0) + half-dice(1.4)
    ctx3d.dice1.position.set(-3.5, BOARD_Y, 2);
    ctx3d.dice2.position.set( 3.5, BOARD_Y, 2);
    ctx3d.dice1.rotation.set(Math.random() * Math.PI, Math.random() * Math.PI, Math.random() * Math.PI);
    ctx3d.dice2.rotation.set(Math.random() * Math.PI, Math.random() * Math.PI, Math.random() * Math.PI);

    // Spin animation for 600ms then snap to correct face
    const SPIN_DURATION = 600;
    const startTime = Date.now();

    function spinLoop() {
        const elapsed = Date.now() - startTime;
        if (elapsed < SPIN_DURATION) {
            ctx3d.dice1.rotation.x += 0.25;
            ctx3d.dice1.rotation.y += 0.18;
            ctx3d.dice2.rotation.x += 0.18;
            ctx3d.dice2.rotation.y += 0.25;
            // Randomize UI numbers while spinning
            if (Math.floor(elapsed / 80) % 2 === 0) {
                d1ui.innerText = Math.floor(Math.random() * 6) + 1;
                d2ui.innerText = Math.floor(Math.random() * 6) + 1;
            }
            requestAnimationFrame(spinLoop);
        } else {
            // Snap to correct face rotation
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

            d1ui.innerText = d1;
            d2ui.innerText = d2;

            if (isDouble && window.Anim3D && window.scene) {
                window.Anim3D.confettiBurst(window.scene, 40, 1200);
                if (window.Toast) window.Toast.show(`✨ Đôi ${d1}!`, { type: 'success', icon: '✨' });
            }

            // Hide overlay and finish
            setTimeout(() => {
                overlay.classList.add('opacity-0', 'scale-50');
                overlay.classList.remove('opacity-100', 'scale-100');
                setTimeout(() => {
                    ctx3d.dice1.visible = false;
                    ctx3d.dice2.visible = false;
                    window.isAnimating = false;
                    callback();
                }, 400);
            }, isDouble ? 1500 : 1000);
        }
    }

    spinLoop();
}
