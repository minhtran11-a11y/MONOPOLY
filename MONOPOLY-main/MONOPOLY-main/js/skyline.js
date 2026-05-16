// --- BACKGROUND CITY SKYLINE + STAR FIELD ---
// Procedural ambient backdrop. Performance-tier aware via Settings.

function createCitySkyline() {
    const tier = (window.Settings && window.Settings.graphicsTier()) || 'high';
    const buildingCount = tier === 'low' ? 24 : (tier === 'med' ? 40 : 60);
    const starCount    = tier === 'low' ? 400 : (tier === 'med' ? 1000 : 2000);
    const windowsPerBuilding = tier === 'low' ? 5 : (tier === 'med' ? 10 : 15);

    const cityGroup = new THREE.Group();
    const colors = [0x1e293b, 0x0f172a, 0x1e1b4b, 0x312e81];

    for (let i = 0; i < buildingCount; i++) {
        const h = 20 + Math.random() * 60;
        const w = 8 + Math.random() * 12;
        const d = 8 + Math.random() * 12;
        const geo = new THREE.BoxGeometry(w, h, d);
        const mat = new THREE.MeshStandardMaterial({
            color: colors[Math.floor(Math.random() * colors.length)],
            roughness: 0.2,
            metalness: 0.5
        });
        const building = new THREE.Mesh(geo, mat);
        const angle = (i / buildingCount) * Math.PI * 2 + Math.random() * 0.5;
        const radius = 180 + Math.random() * 50;
        building.position.set(Math.cos(angle) * radius, h / 2 - 20, Math.sin(angle) * radius);
        building.lookAt(0, building.position.y, 0);

        const winGeo = new THREE.PlaneGeometry(0.8, 0.8);
        const winMat = new THREE.MeshStandardMaterial({
            color: 0xfde047, emissive: 0xfde047, emissiveIntensity: 2,
            transparent: true, opacity: 0.8
        });
        for (let j = 0; j < windowsPerBuilding; j++) {
            const win = new THREE.Mesh(winGeo, winMat);
            const face = Math.floor(Math.random() * 4);
            const py = (Math.random() * h) - (h / 2);
            const px = (Math.random() * w) - (w / 2);
            if (face === 0) win.position.set(px, py, d / 2 + 0.1);
            else if (face === 1) { win.position.set(px, py, -d / 2 - 0.1); win.rotation.y = Math.PI; }
            else if (face === 2) { win.position.set(w / 2 + 0.1, py, px); win.rotation.y = Math.PI / 2; }
            else { win.position.set(-w / 2 - 0.1, py, px); win.rotation.y = -Math.PI / 2; }
            building.add(win);
        }
        cityGroup.add(building);
    }
    scene.add(cityGroup);

    // Starfield
    const starGeo = new THREE.BufferGeometry();
    const starPositions = new Float32Array(starCount * 3);
    for (let i = 0; i < starCount * 3; i++) starPositions[i] = (Math.random() - 0.5) * 800;
    starGeo.setAttribute('position', new THREE.BufferAttribute(starPositions, 3));
    const starMat = new THREE.PointsMaterial({ color: 0xffffff, size: 0.8, transparent: true, opacity: 0.8 });
    stars = new THREE.Points(starGeo, starMat);
    scene.add(stars);
}
