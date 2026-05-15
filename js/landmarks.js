// --- 4 VIETNAMESE LANDMARK DECORATIONS AT BOARD CORNERS ---
// Stylized procedural 3D silhouettes; placed just outside the four corner tiles.

(function () {
    function makeMat(color, opts = {}) {
        return new THREE.MeshStandardMaterial({
            color,
            roughness: opts.roughness !== undefined ? opts.roughness : 0.5,
            metalness: opts.metalness !== undefined ? opts.metalness : 0.15,
            emissive: opts.emissive || 0x000000,
            emissiveIntensity: opts.emissiveIntensity || 0
        });
    }

    // Khuê Văn Các — two-tier wooden pavilion on stone base
    function buildKhueVanCac() {
        const g = new THREE.Group();
        const wood = makeMat(0xb45309, { roughness: 0.7 });
        const stone = makeMat(0x9ca3af, { roughness: 0.85 });
        const roof = makeMat(0x7c2d12, { roughness: 0.6 });
        const gold = makeMat(0xfbbf24, { emissive: 0xfbbf24, emissiveIntensity: 0.6 });

        // Stone base
        const base = new THREE.Mesh(new THREE.BoxGeometry(4, 1.5, 4), stone);
        base.position.y = 0.75; base.castShadow = true; g.add(base);
        // First-tier pillars (4 cylinders)
        for (const [x, z] of [[-1.4,-1.4],[1.4,-1.4],[-1.4,1.4],[1.4,1.4]]) {
            const p = new THREE.Mesh(new THREE.CylinderGeometry(0.18, 0.18, 3, 12), wood);
            p.position.set(x, 3.0, z); p.castShadow = true; g.add(p);
        }
        // Mid platform
        const mid = new THREE.Mesh(new THREE.BoxGeometry(4.2, 0.4, 4.2), wood);
        mid.position.y = 4.7; g.add(mid);
        // Sun/moon circular emblem on front
        const sun = new THREE.Mesh(new THREE.TorusGeometry(0.8, 0.18, 12, 32), gold);
        sun.position.set(0, 5.6, 2.0); sun.rotation.x = Math.PI / 2; g.add(sun);
        const sunDisc = new THREE.Mesh(new THREE.CircleGeometry(0.7, 24), gold);
        sunDisc.position.set(0, 5.6, 2.01); g.add(sunDisc);
        // Curved roof (cone)
        const top = new THREE.Mesh(new THREE.ConeGeometry(3.4, 1.8, 4), roof);
        top.position.y = 6.4; top.rotation.y = Math.PI / 4; top.castShadow = true; g.add(top);
        const finial = new THREE.Mesh(new THREE.ConeGeometry(0.2, 0.6, 6), gold);
        finial.position.y = 7.6; g.add(finial);
        return g;
    }

    // Chùa Một Cột — One Pillar Pagoda (single column rising from water)
    function buildOnePillarPagoda() {
        const g = new THREE.Group();
        const stone = makeMat(0x6b7280, { roughness: 0.85 });
        const wood = makeMat(0xa16207, { roughness: 0.6 });
        const water = makeMat(0x0ea5e9, { roughness: 0.3, metalness: 0.4, emissive: 0x0369a1, emissiveIntensity: 0.25 });
        const tile = makeMat(0x7c2d12, { roughness: 0.55 });
        const lotus = makeMat(0xfb7185, { emissive: 0xfb7185, emissiveIntensity: 0.5 });

        // Pond
        const pond = new THREE.Mesh(new THREE.CylinderGeometry(3.5, 3.5, 0.4, 24), water);
        pond.position.y = 0.2; g.add(pond);
        // Pillar
        const pillar = new THREE.Mesh(new THREE.CylinderGeometry(0.5, 0.6, 4, 12), stone);
        pillar.position.y = 2.4; pillar.castShadow = true; g.add(pillar);
        // Lotus pedestal (sphere flattened)
        const ped = new THREE.Mesh(new THREE.SphereGeometry(1, 16, 8, 0, Math.PI * 2, 0, Math.PI / 2), lotus);
        ped.position.y = 4.4; g.add(ped);
        // Pavilion body
        const body = new THREE.Mesh(new THREE.BoxGeometry(2.4, 1.4, 2.4), wood);
        body.position.y = 5.4; body.castShadow = true; g.add(body);
        // Curved roof
        const roof = new THREE.Mesh(new THREE.ConeGeometry(2.2, 1.4, 4), tile);
        roof.position.y = 6.8; roof.rotation.y = Math.PI / 4; roof.castShadow = true; g.add(roof);
        // Roof finial
        const fn = new THREE.Mesh(new THREE.ConeGeometry(0.15, 0.5, 6), makeMat(0xfbbf24, { emissive: 0xfbbf24, emissiveIntensity: 0.8 }));
        fn.position.y = 7.7; g.add(fn);
        return g;
    }

    // Lăng Bác — Ho Chi Minh Mausoleum (rectangular gray block with columns)
    function buildMausoleum() {
        const g = new THREE.Group();
        const stone = makeMat(0xd1d5db, { roughness: 0.8 });
        const dark = makeMat(0x4b5563, { roughness: 0.7 });
        const red = makeMat(0xb91c1c, { emissive: 0xb91c1c, emissiveIntensity: 0.4 });

        // Tiered base
        const b1 = new THREE.Mesh(new THREE.BoxGeometry(7, 0.8, 4.5), dark);
        b1.position.y = 0.4; g.add(b1);
        const b2 = new THREE.Mesh(new THREE.BoxGeometry(6, 0.6, 4), dark);
        b2.position.y = 1.1; g.add(b2);
        // Main body
        const body = new THREE.Mesh(new THREE.BoxGeometry(5.6, 2.2, 3.6), stone);
        body.position.y = 2.5; body.castShadow = true; g.add(body);
        // Columns (front)
        for (let i = -2; i <= 2; i++) {
            const col = new THREE.Mesh(new THREE.CylinderGeometry(0.18, 0.18, 2.0, 12), stone);
            col.position.set(i * 1.0, 2.6, 1.81); g.add(col);
        }
        // Roof slab
        const roof = new THREE.Mesh(new THREE.BoxGeometry(6.2, 0.5, 4.0), dark);
        roof.position.y = 3.85; g.add(roof);
        // Red marble "HỒ CHÍ MINH" plaque
        const plaque = new THREE.Mesh(new THREE.BoxGeometry(3.5, 0.5, 0.08), red);
        plaque.position.set(0, 3.0, 1.82); g.add(plaque);
        return g;
    }

    // Bến Nhà Rồng — Dragon House (yellow walls + ornate dual-curve roof)
    function buildDragonHouse() {
        const g = new THREE.Group();
        const wall = makeMat(0xfbbf24, { roughness: 0.65 });
        const trim = makeMat(0xb45309, { roughness: 0.5 });
        const roof = makeMat(0xb91c1c, { roughness: 0.55 });
        const gold = makeMat(0xfde047, { emissive: 0xfde047, emissiveIntensity: 0.8 });

        // Building body
        const body = new THREE.Mesh(new THREE.BoxGeometry(5.5, 2.4, 3.5), wall);
        body.position.y = 1.2; body.castShadow = true; g.add(body);
        // Lower roof (flat)
        const lower = new THREE.Mesh(new THREE.BoxGeometry(6, 0.4, 4), trim);
        lower.position.y = 2.6; g.add(lower);
        // Upper floor
        const upper = new THREE.Mesh(new THREE.BoxGeometry(4.5, 1.4, 2.6), wall);
        upper.position.y = 3.5; upper.castShadow = true; g.add(upper);
        // Dragon-curved roof: two stacked tori segments
        const dragon1 = new THREE.Mesh(new THREE.TorusGeometry(2.4, 0.35, 8, 16, Math.PI), roof);
        dragon1.position.y = 4.3; dragon1.rotation.x = Math.PI / 2; g.add(dragon1);
        const dragon2 = new THREE.Mesh(new THREE.TorusGeometry(2.0, 0.3, 8, 16, Math.PI), roof);
        dragon2.position.y = 4.5; dragon2.rotation.x = Math.PI / 2; g.add(dragon2);
        // Center spire
        const spire = new THREE.Mesh(new THREE.ConeGeometry(0.25, 1.2, 8), gold);
        spire.position.y = 5.4; g.add(spire);
        return g;
    }

    function placeAt(group, x, z, rotY) {
        group.position.set(x, 0, z);
        group.rotation.y = rotY;
        return group;
    }

    function createCornerLandmarks(scene) {
        if (!scene) return;
        const items = [
            { build: buildKhueVanCac,       x:  44, z:  44, rotY: -Math.PI * 0.75 },
            { build: buildOnePillarPagoda,  x: -44, z:  44, rotY:  Math.PI * 0.75 },
            { build: buildMausoleum,        x: -44, z: -44, rotY:  Math.PI * 0.25 },
            { build: buildDragonHouse,      x:  44, z: -44, rotY: -Math.PI * 0.25 }
        ];
        const root = new THREE.Group();
        root.userData.kind = 'vn-landmarks';
        items.forEach(it => {
            const m = it.build();
            placeAt(m, it.x, it.z, it.rotY);
            root.add(m);
        });
        scene.add(root);
        return root;
    }

    window.createCornerLandmarks = createCornerLandmarks;
})();
