// --- LIGHTWEIGHT 3D ANIMATION HELPERS ---
// All helpers honor Settings.reducedMotion and animSpeed.

(function () {
    function isReduced() { return window.Settings && window.Settings.isReducedMotion(); }
    function speedMul() {
        if (!window.Settings) return 1;
        const s = window.Settings.get().animSpeed;
        if (s === 0) return 0.001;
        if (s === 2) return 0.5;
        return 1;
    }

    // Elastic ease-out
    function easeOutBack(t) {
        const c1 = 1.70158, c3 = c1 + 1;
        return 1 + c3 * Math.pow(t - 1, 3) + c1 * Math.pow(t - 1, 2);
    }

    // Grow a mesh group from scale 0 → its current scale with bouncy easing
    function growIn(group, durationMs = 600) {
        if (!group) return;
        if (isReduced()) return;
        const dur = Math.max(50, durationMs * speedMul());
        
        const base = group.userData.originalScale || { x: group.scale.x, y: group.scale.y, z: group.scale.z };
        const target = { x: base.x, y: base.y, z: base.z };
        
        group.scale.set(0.001, 0.001, 0.001);
        const start = performance.now();
        function step(now) {
            const p = Math.min(1, (now - start) / dur);
            const e = easeOutBack(p);
            group.scale.set(target.x * e, target.y * e, target.z * e);
            if (p < 1) requestAnimationFrame(step);
            else group.scale.set(target.x, target.y, target.z);
        }
        requestAnimationFrame(step);
    }

    // Spawn small dust particles around a local point in parentMesh; auto-clean via pool.
    function dustBurst(parentMesh, x, y, z, count = 8) {
        if (!parentMesh || isReduced()) return;
        const particles = [];
        for (let i = 0; i < count; i++) {
            const m = window.MeshPool ? window.MeshPool.acquire('dust',
                () => new THREE.Mesh(
                    new THREE.SphereGeometry(0.1, 6, 6),
                    new THREE.MeshBasicMaterial({ color: 0xfde68a, transparent: true, opacity: 0.85, depthWrite: false })
                ),
                (mesh) => { mesh.material.opacity = 0.85; }
            ) : new THREE.Mesh(
                new THREE.SphereGeometry(0.08 + Math.random() * 0.06, 6, 6),
                new THREE.MeshBasicMaterial({ color: 0xfde68a, transparent: true, opacity: 0.85, depthWrite: false })
            );
            m.position.set(x + (Math.random() - 0.5) * 0.6, y, z + (Math.random() - 0.5) * 0.6);
            m.userData = {
                vx: (Math.random() - 0.5) * 0.04,
                vy: 0.04 + Math.random() * 0.05,
                vz: (Math.random() - 0.5) * 0.04
            };
            parentMesh.add(m);
            particles.push(m);
        }
        const start = performance.now();
        const ttl = 700 * speedMul();
        function step(now) {
            const t = (now - start) / ttl;
            particles.forEach(p => {
                p.position.x += p.userData.vx;
                p.position.y += p.userData.vy;
                p.position.z += p.userData.vz;
                p.userData.vy *= 0.92;
                p.material.opacity = Math.max(0, 0.85 * (1 - t));
                p.scale.setScalar(1 + t * 0.8);
            });
            if (t < 1) requestAnimationFrame(step);
            else particles.forEach(p => {
                parentMesh.remove(p);
                if (window.MeshPool) window.MeshPool.release('dust', p);
                else { p.geometry.dispose(); p.material.dispose(); }
            });
        }
        requestAnimationFrame(step);
    }

    // Confetti particles in 3D, sourced near scene center, falling outward
    function confettiBurst(scene, count = 80, durationMs = 2400) {
        if (!scene || isReduced()) return;
        const colors = [0xef4444, 0xfbbf24, 0x22c55e, 0x3b82f6, 0xa855f7];
        const pieces = [];
        for (let i = 0; i < count; i++) {
            const c = colors[i % colors.length];
            const m = window.MeshPool ? window.MeshPool.acquire('confetti',
                () => new THREE.Mesh(
                    new THREE.PlaneGeometry(0.5, 0.8),
                    new THREE.MeshBasicMaterial({ side: THREE.DoubleSide, transparent: true, opacity: 0.95 })
                ),
                (mesh) => { mesh.material.opacity = 0.95; mesh.material.color.setHex(c); }
            ) : new THREE.Mesh(
                new THREE.PlaneGeometry(0.5, 0.8),
                new THREE.MeshBasicMaterial({ color: c, side: THREE.DoubleSide, transparent: true, opacity: 0.95 })
            );
            if (window.MeshPool) m.material.color.setHex(c);
            m.position.set(0, 18 + Math.random() * 6, 0);
            m.userData = {
                vx: (Math.random() - 0.5) * 0.6,
                vy: -0.05 + Math.random() * 0.1,
                vz: (Math.random() - 0.5) * 0.6,
                rx: Math.random() * 0.1,
                ry: Math.random() * 0.1
            };
            scene.add(m);
            pieces.push(m);
        }
        const start = performance.now();
        const ttl = durationMs * speedMul();
        function step(now) {
            const t = (now - start) / ttl;
            pieces.forEach(p => {
                p.position.x += p.userData.vx;
                p.position.y += p.userData.vy;
                p.position.z += p.userData.vz;
                p.userData.vy -= 0.012;
                p.rotation.x += p.userData.rx;
                p.rotation.y += p.userData.ry;
                p.material.opacity = Math.max(0, 0.95 - t * 0.9);
            });
            if (t < 1) requestAnimationFrame(step);
            else pieces.forEach(p => {
                scene.remove(p);
                if (window.MeshPool) window.MeshPool.release('confetti', p);
                else { p.geometry.dispose(); p.material.dispose(); }
            });
        }
        requestAnimationFrame(step);
    }

    // Money particles flying from a point to a target — for big transactions
    function moneyFly(scene, fromPos, toPos, count = 14, durationMs = 1200) {
        if (!scene || isReduced()) return;
        const pieces = [];
        for (let i = 0; i < count; i++) {
            const m = window.MeshPool ? window.MeshPool.acquire('money',
                () => new THREE.Mesh(
                    new THREE.PlaneGeometry(0.9, 0.45),
                    new THREE.MeshBasicMaterial({ color: 0x22c55e, side: THREE.DoubleSide, transparent: true, opacity: 0.95 })
                ),
                (mesh) => { mesh.material.opacity = 0.95; }
            ) : new THREE.Mesh(
                new THREE.PlaneGeometry(0.9, 0.45),
                new THREE.MeshBasicMaterial({ color: 0x22c55e, side: THREE.DoubleSide, transparent: true, opacity: 0.95 })
            );
            m.position.copy(fromPos);
            m.position.x += (Math.random() - 0.5) * 1.5;
            m.position.z += (Math.random() - 0.5) * 1.5;
            m.userData = {
                start: m.position.clone(),
                end: toPos.clone(),
                peakY: 12 + Math.random() * 4,
                spin: Math.random() * 0.3,
                offset: i * 40
            };
            scene.add(m);
            pieces.push(m);
        }
        const startT = performance.now();
        const ttl = durationMs * speedMul();
        function step(now) {
            let allDone = true;
            pieces.forEach(p => {
                const t = Math.min(1, Math.max(0, (now - startT - p.userData.offset) / ttl));
                if (t < 1) allDone = false;
                const a = p.userData.start, b = p.userData.end;
                p.position.x = a.x + (b.x - a.x) * t;
                p.position.z = a.z + (b.z - a.z) * t;
                p.position.y = a.y + (b.y - a.y) * t + Math.sin(t * Math.PI) * p.userData.peakY;
                p.rotation.y += p.userData.spin;
                p.material.opacity = (1 - Math.pow(t, 2)) * 0.95;
            });
            if (!allDone) requestAnimationFrame(step);
            else pieces.forEach(p => {
                scene.remove(p);
                if (window.MeshPool) window.MeshPool.release('money', p);
                else { p.material.dispose(); }
            });
        }
        requestAnimationFrame(step);
    }

    // Squash & stretch hop for player tokens
    function tokenHop(mesh, peakY = 2.0, baseY = 1.0, durationMs = 250) {
        if (!mesh) return;
        if (isReduced()) { mesh.position.y = baseY; return; }
        
        const base = mesh.userData.originalScale || { x: 1, y: 1, z: 1 };
        const sx = base.x, sy = base.y, sz = base.z;

        mesh.scale.set(sx * 1.15, sy * 0.85, sz * 1.15);
        setTimeout(() => {
            mesh.position.y = peakY;
            mesh.scale.set(sx * 0.92, sy * 1.18, sz * 0.92);
        }, 40);
        setTimeout(() => {
            mesh.position.y = baseY;
            mesh.scale.set(sx * 1.12, sy * 0.88, sz * 1.12);
        }, Math.max(80, durationMs - 50));
        setTimeout(() => {
            mesh.scale.set(sx, sy, sz);
        }, durationMs + 80);
    }

    // Mortgaged-property overlay: dim houses + 3D red "X"
    function applyMortgage(tileIdx) {
        if (typeof boardData === 'undefined' || typeof ctx3d === 'undefined') return;
        const tile = boardData[tileIdx];
        const tileMesh = ctx3d.boardMeshes[tileIdx];
        if (!tile || !tileMesh) return;

        if (tile.mortgageMesh) {
            tileMesh.remove(tile.mortgageMesh);
            tile.mortgageMesh = null;
        }
        if (!tile.isMortgaged) {
            if (tile.houseMeshes) {
                tile.houseMeshes.forEach(h => h.traverse(c => {
                    if (c.material && c.userData.origEmissive !== undefined) {
                        c.material.emissiveIntensity = c.userData.origEmissive;
                    }
                }));
            }
            return;
        }
        if (tile.houseMeshes) {
            tile.houseMeshes.forEach(h => h.traverse(c => {
                if (c.material && c.material.emissiveIntensity !== undefined) {
                    if (c.userData.origEmissive === undefined) c.userData.origEmissive = c.material.emissiveIntensity;
                    c.material.emissiveIntensity *= 0.2;
                }
            }));
        }
        const xGroup = new THREE.Group();
        const armMat = new THREE.MeshStandardMaterial({
            color: 0xef4444, emissive: 0xef4444, emissiveIntensity: 1.2,
            roughness: 0.4, metalness: 0.3
        });
        const armGeo = new THREE.BoxGeometry(5, 0.25, 0.5);
        const arm1 = new THREE.Mesh(armGeo, armMat); arm1.rotation.y = Math.PI / 4;
        const arm2 = new THREE.Mesh(armGeo, armMat); arm2.rotation.y = -Math.PI / 4;
        xGroup.add(arm1); xGroup.add(arm2);
        xGroup.position.set(0, 0.7, 0);
        tileMesh.add(xGroup);
        tile.mortgageMesh = xGroup;
    }

    // Pulse a tile mesh briefly (player just landed)
    function tilePulse(tileMesh, durationMs = 900) {
        if (!tileMesh || isReduced()) return;
        const baseY = tileMesh.position.y;
        const start = performance.now();
        const dur = durationMs * speedMul();
        function step(now) {
            const t = (now - start) / dur;
            if (t >= 1) {
                tileMesh.position.y = baseY;
                return;
            }
            const wave = Math.sin(t * Math.PI * 2) * 0.4 * (1 - t);
            tileMesh.position.y = baseY + wave;
            requestAnimationFrame(step);
        }
        requestAnimationFrame(step);
    }

    // Trail particle that follows a moving token: emits tiny sparkles per frame.
    function trailEmit(parentScene, fromPos, color = 0xfde047) {
        if (!parentScene || isReduced()) return;
        const m = window.MeshPool ? window.MeshPool.acquire('trail',
            () => new THREE.Mesh(
                new THREE.SphereGeometry(0.18, 6, 6),
                new THREE.MeshBasicMaterial({ transparent: true, opacity: 0.8, depthWrite: false })
            ),
            (mesh) => { mesh.material.opacity = 0.8; }
        ) : new THREE.Mesh(
            new THREE.SphereGeometry(0.18, 6, 6),
            new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.8, depthWrite: false })
        );
        if (window.MeshPool) m.material.color.setHex(color);
        m.position.copy(fromPos);
        m.userData = { life: 1 };
        parentScene.add(m);
        const start = performance.now();
        const ttl = 450;
        function step(now) {
            const t = (now - start) / ttl;
            m.material.opacity = Math.max(0, 0.8 * (1 - t));
            m.scale.setScalar(1 + t * 1.2);
            if (t < 1) requestAnimationFrame(step);
            else {
                parentScene.remove(m);
                if (window.MeshPool) window.MeshPool.release('trail', m);
                else { m.geometry.dispose(); m.material.dispose(); }
            }
        }
        requestAnimationFrame(step);
    }

    // Backwards-compat global aliases
    window.animateTokenHop = tokenHop;
    window.applyMortgageVisual = applyMortgage;
    window.Anim3D = { growIn, dustBurst, confettiBurst, moneyFly, tokenHop, applyMortgage, tilePulse, trailEmit };
})();
