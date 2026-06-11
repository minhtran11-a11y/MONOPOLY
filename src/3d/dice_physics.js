// --- CANNON-ES PHYSICS-BASED DICE (lazy-loaded) ---
// Provides DicePhysics.roll(d1, d2, callback). Falls back to pseudo-physics
// if cannon-es isn't available.
    let world = null;
    let bodies = [];   // CANNON.Body[]
    let meshes = [];   // THREE.Mesh[]
    let ground = null;
    let initialized = false;
    let scriptLoaded = false;

    // Collision-audio state (listeners added ONCE in initWorld, active only
    // while a roll is in flight)
    let rollInFlight = false;
    let collideHooked = false;
    let hadTableContact = false;
    const lastClickAt = [0, 0]; // per-die click throttle (>=70ms apart)
    const CLICK_THROTTLE_MS = 70;
    const IMPACT_NORM = 12;     // |impact velocity| that maps to force01 = 1

    // cannon-es npm package (ESM) — loaded on demand via dynamic import().
    let CANNON = null;

    async function loadCannon() {
        if (scriptLoaded) return window.CANNON;
        const mod = await import('cannon-es');
        CANNON = mod;
        window.CANNON = mod; // LEGACY-BRIDGE
        scriptLoaded = true;
        return window.CANNON;
    }

    function initWorld() {
        if (initialized || !window.CANNON || !window.dice1) return;
        const CANNON = window.CANNON;
        world = new CANNON.World({ gravity: new CANNON.Vec3(0, -22, 0) });
        world.allowSleep = true;
        world.defaultContactMaterial.restitution = 0.28; // felt-like, low bounce
        world.defaultContactMaterial.friction = 0.18;

        // Ground plane at the BOARD SURFACE (y=1.0) — matches dice_anim's
        // BOARD_Y = 2.4 (surface 1.0 + half-dice 1.4) so settled dice rest ON
        // the board instead of sinking half a die into it.
        const groundShape = new CANNON.Plane();
        ground = new CANNON.Body({ mass: 0, shape: groundShape });
        ground.quaternion.setFromAxisAngle(new CANNON.Vec3(1, 0, 0), -Math.PI / 2);
        ground.position.set(0, 1.0, 0);
        world.addBody(ground);

        // Soft invisible walls keep dice in the CENTER area of the board
        // (inside the tile ring) where the camera reads them best.
        const wallShape = new CANNON.Plane();
        const walls = [
            { pos: [ 12, 0, 0], axis: [0, 1, 0], ang:  Math.PI / 2 },
            { pos: [-12, 0, 0], axis: [0, 1, 0], ang: -Math.PI / 2 },
            { pos: [0, 0,  12], axis: [0, 1, 0], ang:  Math.PI },
            { pos: [0, 0, -12], axis: [0, 1, 0], ang:  0 }
        ];
        walls.forEach(w => {
            const b = new CANNON.Body({ mass: 0, shape: wallShape });
            b.position.set(w.pos[0], w.pos[1], w.pos[2]);
            b.quaternion.setFromAxisAngle(new CANNON.Vec3(w.axis[0], w.axis[1], w.axis[2]), w.ang);
            world.addBody(b);
        });

        // Invisible ceiling: a freak dice-on-dice impact can convert spin into
        // a vertical launch — physically cap every bounce below hand height.
        const ceiling = new CANNON.Body({ mass: 0, shape: new CANNON.Plane() });
        ceiling.quaternion.setFromAxisAngle(new CANNON.Vec3(1, 0, 0), Math.PI / 2);
        ceiling.position.set(0, 9, 0);
        world.addBody(ceiling);

        // Dice bodies (Three meshes are 2.8 wide → half-extent 1.4)
        meshes = [window.dice1, window.dice2];
        bodies = meshes.map((m, idx) => {
            const body = new CANNON.Body({
                mass: 1.2,
                shape: new CANNON.Box(new CANNON.Vec3(1.4, 1.4, 1.4)),
                linearDamping: 0.18,
                angularDamping: 0.18,
                allowSleep: true,
                sleepSpeedLimit: 0.25,
                sleepTimeLimit: 0.4
            });
            body.position.set(idx === 0 ? -3 : 3, 14, 0);
            world.addBody(body);
            return body;
        });

        hookCollisionAudio();
        initialized = true;
    }

    // Woody clicks scaled by impact force, throttled per die. First table
    // contact of each roll fires a light haptic. Guarded against double-add.
    function hookCollisionAudio() {
        if (collideHooked) return;
        collideHooked = true;
        bodies.forEach((b, i) => {
            b.addEventListener('collide', (e) => {
                if (!rollInFlight) return;
                let impact = 0;
                try {
                    impact = Math.abs(e.contact.getImpactVelocityAlongNormal());
                } catch (err) {
                    impact = b.velocity.length(); // older cannon builds: approximate
                }
                const force = Math.min(1, impact / IMPACT_NORM);
                if (e.body === ground && !hadTableContact) {
                    hadTableContact = true;
                    if (window.Settings && window.Settings.haptic) window.Settings.haptic(15);
                }
                if (force < 0.04) return; // ignore resting micro-contacts
                const now = performance.now();
                if (now - lastClickAt[i] < CLICK_THROTTLE_MS) return;
                lastClickAt[i] = now;
                if (window.SoundFX && window.SoundFX.diceClick) window.SoundFX.diceClick(force);
            });
        });
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

        // Reset & impulse — HAND-DROP throw: dice start at hand height just
        // above the table, tossed gently down-and-forward with strong spin.
        // They hit the felt within ~0.5s, bounce once or twice, then ROLL on
        // the surface until they stop — like tipping dice out of a cupped hand.
        bodies.forEach((b, i) => {
            b.wakeUp();
            // Separate z-lanes so the dice never meet head-on mid-air (a spin-
            // loaded box collision can launch one die way above the table).
            b.position.set(
                (i === 0 ? -5 : 5) + (Math.random() - 0.5) * 2,  // above the center area
                6.5 + Math.random() * 1.5,                        // hand height (~4 units above the felt)
                (i === 0 ? -2.5 : 2.5) + (Math.random() - 0.5) * 1.5
            );
            b.velocity.set(
                (i === 0 ? 1 : -1) * (4.5 + Math.random() * 2.5), // gentle forward toss
                -2.5,                                              // tipped downward out of the hand
                (Math.random() - 0.5) * 3
            );
            b.angularVelocity.set(
                (Math.random() - 0.5) * 14,
                (Math.random() - 0.5) * 14,
                (Math.random() - 0.5) * 14
            );
            b.quaternion.setFromEuler(Math.random() * Math.PI, Math.random() * Math.PI, Math.random() * Math.PI);
        });

        rollInFlight = true;
        hadTableContact = false;
        lastClickAt[0] = 0; lastClickAt[1] = 0;

        const FIXED_DT = 1 / 60;
        const MAX_SIM_MS = 3500;     // SIMULATED time budget — a hidden tab pauses
        let simElapsed = 0;          // rAF, so the clock must pause with it (no
        let lastT = performance.now(); // more mid-air timeouts after tab switches)

        const REST_Y = 2.4;          // ground (1.0) + half-die (1.4)
        const CLAMP_XZ = 10;         // keep landed dice visually inside the walls

        // Held-breath slow-mo: one-shot per roll, armed until both dice are
        // ALMOST settled, then 0.45x sim speed for up to 400ms of SIM time.
        // (This path never runs under reduced motion — roll() bails earlier.)
        let slowMoArmed = true;
        let slowMoRemainingMs = 0;

        function step(now) {
            let dt = Math.min(0.05, (now - lastT) / 1000);
            lastT = now;
            if (slowMoArmed && bodies.every(b =>
                b.velocity.length() < 1.2 && b.angularVelocity.length() < 2.0)) {
                slowMoArmed = false;
                slowMoRemainingMs = 400;
            }
            if (slowMoRemainingMs > 0) {
                dt *= 0.45;
                slowMoRemainingMs -= dt * 1000;
            }
            simElapsed += dt * 1000;
            world.step(FIXED_DT, dt, 3);
            // Sync mesh from body
            bodies.forEach((b, i) => {
                meshes[i].position.set(b.position.x, b.position.y, b.position.z);
                meshes[i].quaternion.set(b.quaternion.x, b.quaternion.y, b.quaternion.z, b.quaternion.w);
            });
            const allRest = bodies.every(isResting);
            if (allRest || simElapsed > MAX_SIM_MS) {
                beginSnap();
                return;
            }
            requestAnimationFrame(step);
        }

        // STAGED REVEAL — final slerp onto the rolled faces AND lerp the
        // POSITION onto the felt. Even a forced timeout (die still airborne)
        // lands it on the table — a hovering die is impossible by construction.
        // The dice snap SEQUENTIALLY: die 1 (250ms ease) → +120ms → die 2.
        // Each landing pulses its material emissive gold; the second landing
        // carries the settle chime + haptic, then callback(true) fires.
        //
        //   t=0    die 1 slerp starts
        //   t=120  die 2 slerp starts
        //   t=250  die 1 lands → gold pulse A (280ms)
        //   t=370  die 2 lands → gold pulse B + diceSettle + haptic(30) + callback
        //   t=650  pulse B done, emissive restored exactly
        function beginSnap() {
            rollInFlight = false; // physics over — stop collision clicks
            const targetQ = [faceQuat(d1), faceQuat(d2)];
            const startQ = bodies.map(b => ({
                x: b.quaternion.x, y: b.quaternion.y, z: b.quaternion.z, w: b.quaternion.w
            }));
            const startP = bodies.map(b => ({ x: b.position.x, y: b.position.y, z: b.position.z }));

            // Landing spots: current x/z clamped inside the walls...
            const targetP = startP.map(p => ({
                x: Math.max(-CLAMP_XZ, Math.min(CLAMP_XZ, p.x)),
                y: REST_Y,
                z: Math.max(-CLAMP_XZ, Math.min(CLAMP_XZ, p.z)),
            }));
            // ...and pushed apart if the two dice would interpenetrate (size 2.8).
            const dx = targetP[1].x - targetP[0].x, dz = targetP[1].z - targetP[0].z;
            const dist = Math.hypot(dx, dz);
            if (dist < 3.2) {
                const nx = dist > 0.01 ? dx / dist : 1, nz = dist > 0.01 ? dz / dist : 0;
                const push = (3.2 - dist) / 2;
                targetP[0].x -= nx * push; targetP[0].z -= nz * push;
                targetP[1].x += nx * push; targetP[1].z += nz * push;
            }

            const SNAP_MS = 250, STAGGER_MS = 120, PULSE_MS = 280;
            const reducedNow = window.Settings && window.Settings.isReducedMotion();

            // Pulse a die's emissive gold up and back down, then restore the
            // material's EXACT prior emissive color + intensity (array-safe).
            function pulseGold(mesh) {
                if (reducedNow || !mesh) return;
                const mats = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
                const saved = mats.filter(m => m && m.emissive).map(m => ({
                    m, hex: m.emissive.getHex(), intensity: m.emissiveIntensity
                }));
                if (!saved.length) return;
                const t0 = performance.now();
                function tick(nowP) {
                    const t = Math.min(1, (nowP - t0) / PULSE_MS);
                    const amp = Math.sin(t * Math.PI); // 0 → 1 → 0
                    saved.forEach(s => {
                        s.m.emissive.setHex(0xE8C16B);
                        s.m.emissiveIntensity = s.intensity + amp * 0.85;
                    });
                    if (t < 1) requestAnimationFrame(tick);
                    else saved.forEach(s => {
                        s.m.emissive.setHex(s.hex);
                        s.m.emissiveIntensity = s.intensity;
                    });
                }
                requestAnimationFrame(tick);
            }

            // Snap ONE die over SNAP_MS with easeOutQuad, then onLand().
            function snapDie(i, onLand) {
                const tStart = performance.now();
                function frame(now2) {
                    const t = Math.min(1, (now2 - tStart) / SNAP_MS);
                    const ease = t * (2 - t); // easeOutQuad — settles, not slams
                    const sq = startQ[i], tq = targetQ[i];
                    // Slerp via THREE.Quaternion for convenience
                    const a = new THREE.Quaternion(sq.x, sq.y, sq.z, sq.w);
                    const c = new THREE.Quaternion(tq.x, tq.y, tq.z, tq.w);
                    a.slerp(c, ease);
                    meshes[i].quaternion.copy(a);
                    const sp = startP[i], tp = targetP[i];
                    meshes[i].position.set(
                        sp.x + (tp.x - sp.x) * ease,
                        sp.y + (tp.y - sp.y) * ease,
                        sp.z + (tp.z - sp.z) * ease
                    );
                    if (t < 1) requestAnimationFrame(frame);
                    else onLand();
                }
                requestAnimationFrame(frame);
            }

            snapDie(0, () => { pulseGold(meshes[0]); }); // first die: silent reveal
            setTimeout(() => {
                snapDie(1, () => {
                    pulseGold(meshes[1]);
                    if (window.SoundFX && window.SoundFX.diceSettle) window.SoundFX.diceSettle();
                    if (window.Settings && window.Settings.haptic) window.Settings.haptic(30);
                    if (callback) callback(true);
                });
            }, STAGGER_MS);
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

    window.DicePhysics = { ensureReady, roll, isReady }; // LEGACY-BRIDGE

// ESM export — same object as the legacy window bridge above.
export const DicePhysics = window.DicePhysics;
