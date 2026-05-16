// --- OBJECT POOL FOR PARTICLE MESHES ---
// Reduces GC churn during heavy confetti / dust / money bursts.
// Pools by (geometryFactory + materialFactory) keyed name.
(function () {
    const pools = new Map();

    function getPool(name) {
        if (!pools.has(name)) pools.set(name, []);
        return pools.get(name);
    }

    // Acquire a Mesh from the named pool (or create via factory if empty).
    // factory: () => THREE.Mesh
    // resetFn(mesh) called every time the mesh is acquired so callers can re-init state.
    function acquire(name, factory, resetFn) {
        const pool = getPool(name);
        let m = pool.pop();
        if (!m) m = factory();
        if (resetFn) resetFn(m);
        // Reset common transforms
        if (m.position) m.position.set(0, 0, 0);
        if (m.rotation) m.rotation.set(0, 0, 0);
        if (m.scale)    m.scale.set(1, 1, 1);
        if (m.material) m.material.opacity = m.material.opacity ?? 1;
        m.visible = true;
        return m;
    }

    // Return a Mesh to its pool. Caller is responsible for removing from scene first.
    function release(name, mesh, capacity = 64) {
        if (!mesh) return;
        mesh.visible = false;
        const pool = getPool(name);
        if (pool.length < capacity) {
            pool.push(mesh);
        } else {
            // Pool full — actually dispose
            if (mesh.geometry) mesh.geometry.dispose();
            if (mesh.material && mesh.material.dispose) mesh.material.dispose();
        }
    }

    function size(name) { return getPool(name).length; }
    function clear(name) {
        const p = getPool(name);
        p.forEach(m => {
            if (m.geometry) m.geometry.dispose();
            if (m.material && m.material.dispose) m.material.dispose();
        });
        pools.set(name, []);
    }
    function clearAll() { pools.forEach((_, k) => clear(k)); }

    window.MeshPool = { acquire, release, size, clear, clearAll };
})();
