// --- CHESS PAWN PLAYER TOKENS ---
// Simple chess pawn shape for all players, each in their player color.

const TokenFactory = (function () {

    function makeMat(color, opts = {}) {
        return new THREE.MeshStandardMaterial({
            color,
            metalness: opts.metalness !== undefined ? opts.metalness : 0.5,
            roughness: opts.roughness !== undefined ? opts.roughness : 0.35,
            emissive: opts.emissive || 0x000000,
            emissiveIntensity: opts.emissiveIntensity || 0
        });
    }

    function buildPawn(colorHex) {
        const g = new THREE.Group();
        const mat = makeMat(colorHex, {
            metalness: 0.6,
            roughness: 0.3,
            emissive: colorHex,
            emissiveIntensity: 0.12
        });

        // Base disc
        const base = new THREE.Mesh(
            new THREE.CylinderGeometry(0.9, 1.0, 0.25, 24),
            mat
        );
        base.position.y = 0.12;
        base.castShadow = true;
        g.add(base);

        // Lower body (slightly tapered cylinder)
        const body = new THREE.Mesh(
            new THREE.CylinderGeometry(0.5, 0.75, 0.9, 24),
            mat
        );
        body.position.y = 0.62;
        body.castShadow = true;
        g.add(body);

        // Neck (narrow)
        const neck = new THREE.Mesh(
            new THREE.CylinderGeometry(0.28, 0.38, 0.35, 20),
            mat
        );
        neck.position.y = 1.25;
        neck.castShadow = true;
        g.add(neck);

        // Head (sphere)
        const head = new THREE.Mesh(
            new THREE.SphereGeometry(0.48, 24, 24),
            mat
        );
        head.position.y = 1.75;
        head.castShadow = true;
        g.add(head);

        g.scale.setScalar(1.0);
        return g;
    }

    const NAMES = ['Quân 1', 'Quân 2', 'Quân 3', 'Quân 4'];

    function create(index, colorHex) {
        const group = buildPawn(colorHex);
        group.userData.tokenKind = NAMES[index % NAMES.length];
        group.userData.idlePhase = Math.random() * Math.PI * 2;
        group.userData.originalScale = { x: 1, y: 1, z: 1 };
        return group;
    }

    return { create, NAMES };
})();

window.TokenFactory = TokenFactory;
