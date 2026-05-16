// --- VIETNAM-THEMED PLAYER TOKENS (procedural Three.js groups) ---
// Token order matches PLAYER_COLORS index:
//   0 → ô tô (car)        — red player
//   1 → tàu thủy (ship)   — yellow player
//   2 → nón lá (conical hat) — blue player
//   3 → con trâu (water buffalo) — green player

const TokenFactory = (function () {
    const SCALE = 1.0;

    function makeMat(color, opts = {}) {
        return new THREE.MeshStandardMaterial({
            color,
            metalness: opts.metalness !== undefined ? opts.metalness : 0.4,
            roughness: opts.roughness !== undefined ? opts.roughness : 0.45,
            emissive: opts.emissive || 0x000000,
            emissiveIntensity: opts.emissiveIntensity || 0
        });
    }

    function buildCar(colorHex) {
        const g = new THREE.Group();
        const bodyMat = makeMat(colorHex, { metalness: 0.7, roughness: 0.25, emissive: colorHex, emissiveIntensity: 0.15 });
        const trimMat = makeMat(0x1f2937, { metalness: 0.3, roughness: 0.6 });
        const glassMat = makeMat(0x93c5fd, { metalness: 0.9, roughness: 0.1, emissive: 0x60a5fa, emissiveIntensity: 0.2 });
        const wheelMat = makeMat(0x111827, { metalness: 0.5, roughness: 0.7 });

        // Chassis
        const chassis = new THREE.Mesh(new THREE.BoxGeometry(2.4, 0.5, 1.2), bodyMat);
        chassis.position.y = 0.55; chassis.castShadow = true; g.add(chassis);

        // Cabin (smaller top box)
        const cabin = new THREE.Mesh(new THREE.BoxGeometry(1.2, 0.5, 1.0), bodyMat);
        cabin.position.set(-0.1, 1.05, 0); cabin.castShadow = true; g.add(cabin);

        // Windshield
        const wind = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.42, 0.95), glassMat);
        wind.position.set(0.45, 1.07, 0); g.add(wind);

        // Wheels (4)
        const wheelGeo = new THREE.CylinderGeometry(0.32, 0.32, 0.22, 16);
        [[-0.8, 0.7], [0.8, 0.7], [-0.8, -0.7], [0.8, -0.7]].forEach(([x, z]) => {
            const w = new THREE.Mesh(wheelGeo, wheelMat);
            w.position.set(x, 0.32, z); w.rotation.x = Math.PI / 2; w.castShadow = true; g.add(w);
        });

        // Headlights
        const lightMat = makeMat(0xfff7ed, { emissive: 0xfff7ed, emissiveIntensity: 1.8 });
        [[1.22, -0.4], [1.22, 0.4]].forEach(([x, z]) => {
            const lg = new THREE.Mesh(new THREE.SphereGeometry(0.12, 12, 12), lightMat);
            lg.position.set(x, 0.6, z); g.add(lg);
        });

        // Trim accent
        const stripe = new THREE.Mesh(new THREE.BoxGeometry(2.42, 0.06, 0.06), trimMat);
        stripe.position.set(0, 0.32, 0.62); g.add(stripe);

        g.scale.setScalar(SCALE);
        return g;
    }

    function buildShip(colorHex) {
        const g = new THREE.Group();
        const hullMat = makeMat(colorHex, { metalness: 0.5, roughness: 0.35, emissive: colorHex, emissiveIntensity: 0.12 });
        const deckMat = makeMat(0xfde68a, { roughness: 0.7 });
        const cabinMat = makeMat(0xf8fafc, { roughness: 0.5 });
        const stackMat = makeMat(0xb91c1c, { metalness: 0.4, roughness: 0.4 });

        // Hull (trapezoid via scaled box)
        const hull = new THREE.Mesh(new THREE.BoxGeometry(2.6, 0.7, 1.1), hullMat);
        hull.position.y = 0.5; hull.castShadow = true; g.add(hull);
        // Bow tapering pieces
        const bowL = new THREE.Mesh(new THREE.ConeGeometry(0.55, 0.7, 4), hullMat);
        bowL.rotation.set(0, Math.PI / 4, Math.PI / 2);
        bowL.position.set(1.45, 0.5, 0); g.add(bowL);

        // Deck
        const deck = new THREE.Mesh(new THREE.BoxGeometry(2.5, 0.06, 1.05), deckMat);
        deck.position.y = 0.88; g.add(deck);

        // Cabin (white)
        const cabin = new THREE.Mesh(new THREE.BoxGeometry(1.2, 0.55, 0.85), cabinMat);
        cabin.position.set(-0.1, 1.2, 0); cabin.castShadow = true; g.add(cabin);

        // Wheelhouse
        const wheel = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.35, 0.5), cabinMat);
        wheel.position.set(-0.3, 1.65, 0); g.add(wheel);

        // Smokestack
        const stack = new THREE.Mesh(new THREE.CylinderGeometry(0.13, 0.18, 0.7, 12), stackMat);
        stack.position.set(0.15, 1.65, 0); g.add(stack);

        // Portholes (windows)
        const portMat = makeMat(0x60a5fa, { emissive: 0x60a5fa, emissiveIntensity: 0.8 });
        for (let i = -1; i <= 1; i++) {
            const p = new THREE.Mesh(new THREE.CircleGeometry(0.08, 12), portMat);
            p.position.set(i * 0.55, 0.55, 0.56); g.add(p);
            const pb = p.clone(); pb.position.z = -0.56; pb.rotation.y = Math.PI; g.add(pb);
        }

        g.scale.setScalar(SCALE);
        return g;
    }

    function buildConicalHat(colorHex) {
        const g = new THREE.Group();
        const strawMat = makeMat(0xfde68a, { roughness: 0.85, metalness: 0.05 });
        const ringMat = makeMat(colorHex, { roughness: 0.5, emissive: colorHex, emissiveIntensity: 0.18 });
        const strapMat = makeMat(0xb91c1c, { roughness: 0.7 });

        // Conical hat (open cone)
        const hat = new THREE.Mesh(new THREE.ConeGeometry(1.4, 1.6, 32, 1, true), strawMat);
        hat.position.y = 0.9; hat.castShadow = true; g.add(hat);

        // Decorative band rings (in player color)
        for (let i = 0; i < 3; i++) {
            const ring = new THREE.Mesh(
                new THREE.TorusGeometry(0.45 + i * 0.25, 0.025, 8, 32),
                ringMat
            );
            ring.position.y = 1.4 - i * 0.3;
            ring.rotation.x = Math.PI / 2;
            g.add(ring);
        }

        // Base disc to anchor hat to tile
        const base = new THREE.Mesh(
            new THREE.CylinderGeometry(1.38, 1.4, 0.06, 32),
            new THREE.MeshStandardMaterial({ color: 0xfde68a, transparent: true, opacity: 0.55 })
        );
        base.position.y = 0.12; g.add(base);

        // Chin strap (two arcs)
        const strap1 = new THREE.Mesh(new THREE.TorusGeometry(0.55, 0.025, 8, 16, Math.PI), strapMat);
        strap1.position.y = 0.55; strap1.rotation.x = Math.PI / 2; g.add(strap1);

        g.scale.setScalar(SCALE);
        return g;
    }

    function buildBuffalo(colorHex) {
        const g = new THREE.Group();
        const bodyMat = makeMat(0x4b5563, { roughness: 0.85, metalness: 0.1 });
        const accentMat = makeMat(colorHex, { emissive: colorHex, emissiveIntensity: 0.25 });
        const hornMat = makeMat(0xf3f4f6, { roughness: 0.4, metalness: 0.3 });
        const hoofMat = makeMat(0x1f2937);

        // Body
        const body = new THREE.Mesh(new THREE.BoxGeometry(2.0, 0.9, 1.0), bodyMat);
        body.position.y = 0.95; body.castShadow = true; g.add(body);

        // Head
        const head = new THREE.Mesh(new THREE.BoxGeometry(0.9, 0.75, 0.85), bodyMat);
        head.position.set(1.2, 1.05, 0); head.castShadow = true; g.add(head);

        // Snout
        const snout = new THREE.Mesh(new THREE.BoxGeometry(0.35, 0.45, 0.55), makeMat(0x9ca3af, { roughness: 0.7 }));
        snout.position.set(1.6, 0.9, 0); g.add(snout);

        // Horns (curved via torus segments)
        for (const side of [-1, 1]) {
            const horn = new THREE.Mesh(new THREE.TorusGeometry(0.32, 0.06, 8, 12, Math.PI * 0.6), hornMat);
            horn.position.set(1.2, 1.4, side * 0.45);
            horn.rotation.z = side * 0.4;
            horn.rotation.y = -Math.PI / 2;
            g.add(horn);
        }

        // Legs (4)
        const legGeo = new THREE.BoxGeometry(0.22, 0.7, 0.22);
        [[-0.65, 0.4], [0.55, 0.4], [-0.65, -0.4], [0.55, -0.4]].forEach(([x, z]) => {
            const leg = new THREE.Mesh(legGeo, bodyMat);
            leg.position.set(x, 0.35, z); leg.castShadow = true; g.add(leg);
            const hoof = new THREE.Mesh(new THREE.BoxGeometry(0.24, 0.1, 0.24), hoofMat);
            hoof.position.set(x, 0.05, z); g.add(hoof);
        });

        // Tail
        const tail = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.05, 0.7, 8), bodyMat);
        tail.position.set(-1.05, 0.95, 0); tail.rotation.z = Math.PI / 4; g.add(tail);

        // Saddle blanket (player color accent on back)
        const blanket = new THREE.Mesh(new THREE.BoxGeometry(1.4, 0.06, 1.05), accentMat);
        blanket.position.set(-0.1, 1.43, 0); g.add(blanket);

        g.scale.setScalar(SCALE * 0.85);
        return g;
    }

    const BUILDERS = [buildCar, buildShip, buildConicalHat, buildBuffalo];
    const NAMES = ['Ô tô', 'Tàu thủy', 'Nón lá', 'Trâu'];

    function create(index, colorHex) {
        const builder = BUILDERS[index % BUILDERS.length];
        const group = builder(colorHex);
        group.userData.tokenKind = NAMES[index % NAMES.length];
        group.userData.idlePhase = Math.random() * Math.PI * 2;
        return group;
    }

    return { create, NAMES };
})();

window.TokenFactory = TokenFactory;
