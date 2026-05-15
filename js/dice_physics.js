// --- CANNON-ES PHYSICS-BASED DICE (lazy-loaded) ---
// Provides DicePhysics.roll(d1, d2, callback). Falls back to pseudo-physics
// if cannon-es isn't available.
(function () {
    let world = null;
    let bodies = [];   // CANNON.Body[]
    let meshes = [];   // THREE.Mesh[]
    let ground = null;
    let initialized = false;
    let scriptLoaded = false;

    // Use legacy cannon.js (UMD-compatible classic script). cannon-es is ESM-only.
    const CANNON_CDN = 'https://cdn.jsdelivr.net/npm/cannon@0.6.2/build/cannon.min.js';

    function loadCannon() {
        if (scriptLoaded) return Promise.resolve(window.CANNON);
        return new Promise((resolve, reject) => {
            const s = document.createElement('script');
            s.src = CANNON_CDN;
            s.onload = () => {
                scriptLoaded = true;
                resolve(window.CANNON);
            };
            s.onerror = reject;
            document.head.appendChild(s);
        });
    }

    function initWorld() {
        if (initialized || !window.CANNON || !window.dice1) return;
        const CANNON = window.CANNON;
        // cannon.js v0.6.2: World() takes no options. Gravity must be set after.
        world = new CANNON.World();
        world.gravity.set(0, -22, 0);
        world.broadphase = new CANNON.NaiveBroadphase();
        world.allowSleep = true;
        if (world.defaultContactMaterial) {
            world.defaultContactMaterial.restitution = 0.35;
            world.defaultContactMaterial.friction = 0.18;
        }

        // Ground plane at y=0
        const groundBody = new CANNON.Body({ mass: 0 });
        groundBody.addShape(new CANNON.Plane());
        groundBody.quaternion.setFromAxisAngle(new CANNON.Vec3(1, 0, 0), -Math.PI / 2);
        world.addBody(groundBody);
        ground = groundBody;

        // Soft invisible walls so dice can't fly off-board
        const walls = [
            { pos: [ 30, 0, 0], axis: [0, 1, 0], ang:  Math.PI / 2 },
            { pos: [-30, 0, 0], axis: [0, 1, 0], ang: -Math.PI / 2 },
            { pos: [0, 0,  30], axis: [0, 1, 0], ang:  Math.PI },
            { pos: [0, 0, -30], axis: [0, 1, 0], ang:  0 }
        ];
        walls.forEach(w => {
            const b = new CANNON.Body({ mass: 0 });
            b.addShape(new CANNON.Plane());
            b.position.set(w.pos[0], w.pos[1], w.pos[2]);
            b.quaternion.setFromAxisAngle(new CANNON.Vec3(w.axis[0], w.axis[1], w.axis[2]), w.ang);
            world.addBody(b);
        });

        // Dice bodies (Three meshes are 2.8 wide → half-extent 1.4)
        meshes = [window.dice1, window.dice2];
        bodies = meshes.map((m, idx) => {
            const body = new CANNON.Body({ mass: 1.2 });
            body.addShape(new CANNON.Box(new CANNON.Vec3(1.4, 1.4, 1.4)));
            body.linearDamping = 0.18;
            body.angularDamping = 0.18;
            body.allowSleep = true;
            body.sleepSpeedLimit = 0.25;
            body.sleepTimeLimit = 0.4;
            body.position.set(idx === 0 ? -3 : 3, 14, 0);
            world.addBody(body);
            return body;
        });

        initialized = true;
    }

    // Face-up rotation map (matches engine.js dice texture ordering)
    function faceQuat(num) {
        const CANNON = window.CANNON;
        const e = new CANNON.Vec3();
        // angle/axis pairs matching original snap logic
        switch (num) {
            case 1: return new CANNON.Quaternion();
            case 6: { const q = new CANNON.Quaternion(); q.setFromEuler(Math.PI, 0, 0); return q; }
            case 2: { const q = new CANNON.Quaternion(); q.setFromEuler(0, 0, Math.PI / 2); return q; }
            case 5: { const q = new CANNON.Quaternion(); q.setFromEuler(0, 0, -Math.PI / 2); return q; }
            case 3: { const q = new CANNON.Quaternion(); q.setFromEuler(-Math.PI / 2, 0, 0); return q; }
            case 4: { const q = new CANNON.Quaternion(); q.setFromEuler(Math.PI / 2, 0, 0); return q; }
        }
        return new CANNON.Quaternion();
    }

    function isResting(body) {
        const v = body.velocity, w = body.angularVelocity;
        return v.length() < 0.25 && w.length() < 0.4;
    }

    // Synchronously simulate physics until both dice settle or maxSteps reached
    function roll(d1, d2, callback) {
        const reduced = window.Settings && window.Settings.isReducedMotion();
        if (reduced || !window.CANNON || !initialized) {
            if (callback) callback(false);
            return;
        }
        if (!meshes[0] || !meshes[1]) {
            if (callback) callback(false);
            return;
        }
        meshes.forEach(m => { m.visible = true; });

        // Reset & impulse
        bodies.forEach((b, i) => {
            b.wakeUp();
            b.position.set(i === 0 ? -6 : 6, 14 + Math.random() * 4, (Math.random() - 0.5) * 4);
            b.velocity.set((i === 0 ? 8 : -8) + (Math.random() - 0.5) * 2, -3, (Math.random() - 0.5) * 6);
            b.angularVelocity.set(
                (Math.random() - 0.5) * 14,
                (Math.random() - 0.5) * 14,
                (Math.random() - 0.5) * 14
            );
            b.quaternion.setFromEuler(Math.random() * Math.PI, Math.random() * Math.PI, Math.random() * Math.PI);
        });

        const startTime = performance.now();
        const FIXED_DT = 1 / 60;
        const MAX_MS = 3500;
        let lastT = startTime;

        function step(now) {
            const dt = Math.min(0.05, (now - lastT) / 1000);
            lastT = now;
            world.step(FIXED_DT, dt, 3);
            // Sync mesh from body
            bodies.forEach((b, i) => {
                meshes[i].position.set(b.position.x, b.position.y, b.position.z);
                meshes[i].quaternion.set(b.quaternion.x, b.quaternion.y, b.quaternion.z, b.quaternion.w);
            });
            const allRest = bodies.every(isResting);
            const elapsed = now - startTime;
            if (allRest || elapsed > MAX_MS) {
                // Snap final orientation to the desired face over 250ms
                const targetQ = [faceQuat(d1), faceQuat(d2)];
                const startQ = bodies.map(b => ({
                    x: b.quaternion.x, y: b.quaternion.y, z: b.quaternion.z, w: b.quaternion.w
                }));
                const tStart = performance.now();
                function snap(now2) {
                    const t = Math.min(1, (now2 - tStart) / 250);
                    bodies.forEach((b, i) => {
                        const sq = startQ[i], tq = targetQ[i];
                        // Slerp via THREE.Quaternion for convenience
                        const a = new THREE.Quaternion(sq.x, sq.y, sq.z, sq.w);
                        const c = new THREE.Quaternion(tq.x, tq.y, tq.z, tq.w);
                        a.slerp(c, t);
                        meshes[i].quaternion.copy(a);
                    });
                    if (t < 1) requestAnimationFrame(snap);
                    else if (callback) callback(true);
                }
                requestAnimationFrame(snap);
                return;
            }
            requestAnimationFrame(step);
        }
        requestAnimationFrame(step);
    }

    function ensureReady() {
        return loadCannon().then(() => {
            if (!initialized) initWorld();
            return initialized;
        }).catch(() => false);
    }

    // Synchronous check: are we ready to roll right now, no waiting?
    function isReady() {
        return initialized && !!window.CANNON;
    }

    window.DicePhysics = { ensureReady, roll, isReady };
})();
