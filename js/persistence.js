// --- AUTO-SAVE & RESUME GAME STATE ---
(function () {
    const KEY = 'monopoly3d_save_v1';
    let saveTimer = null;

    function enabled() {
        return !!(window.Settings && window.Settings.get().autoSave);
    }

    function snapshot() {
        if (!window.Game || !window.players) return null;
        return {
            ts: Date.now(),
            mode: window._gameMode || 'bot',
            currentPlayerIndex: window.Game.currentPlayerIndex,
            players: window.players.map(p => ({
                id: p.id, name: p.name, money: p.money, position: p.position,
                inJail: p.inJail, jailTurns: p.jailTurns, jailFreeCards: p.jailFreeCards,
                bankrupt: p.bankrupt, isBot: p.isBot, colorHex: p.colorHex, tokenKind: p.tokenKind
            })),
            tiles: boardData.map(t => ({
                id: t.id,
                owner: (t.owner !== undefined) ? t.owner : null,
                houses: t.houses || 0,
                isMortgaged: !!t.isMortgaged
            }))
        };
    }

    function save() {
        if (!enabled()) return;
        const snap = snapshot();
        if (!snap || !snap.players || snap.players.length === 0) return;
        try { localStorage.setItem(KEY, JSON.stringify(snap)); } catch (e) {}
    }

    function saveDebounced() {
        if (!enabled()) return;
        clearTimeout(saveTimer);
        saveTimer = setTimeout(save, 400);
    }

    function clear() {
        try { localStorage.removeItem(KEY); } catch (e) {}
    }

    function load() {
        try {
            const raw = localStorage.getItem(KEY);
            if (!raw) return null;
            return JSON.parse(raw);
        } catch (e) { return null; }
    }

    function hasSavedGame() {
        const s = load();
        if (!s) return false;
        // Only honor recent saves (24 hours) and at least 2 living players
        const age = Date.now() - s.ts;
        if (age > 24 * 3600 * 1000) return false;
        const alive = (s.players || []).filter(p => !p.bankrupt).length;
        return alive >= 2;
    }

    // Apply a snapshot AFTER Game.init has rebuilt scene (sets up players + meshes)
    function restoreInto(snap) {
        if (!snap || !window.players) return;
        snap.players.forEach((sp, i) => {
            const p = window.players[i];
            if (!p) return;
            p.money = sp.money;
            p.position = sp.position;
            p.inJail = sp.inJail;
            p.jailTurns = sp.jailTurns;
            p.jailFreeCards = sp.jailFreeCards;
            p.bankrupt = sp.bankrupt;
            if (p.bankrupt && p.mesh && window.scene) window.scene.remove(p.mesh);
            // Reposition mesh on the saved tile
            if (p.mesh && window.boardMeshes && window.boardMeshes[sp.position]) {
                const t = window.boardMeshes[sp.position];
                p.mesh.position.x = t.position.x + (p.id % 2 === 0 ? 1.5 : -1.5);
                p.mesh.position.z = t.position.z + (p.id > 1 ? 1.5 : -1.5);
                p.mesh.position.y = 1.0;
            }
        });
        // Restore tile ownership / houses / mortgage
        snap.tiles.forEach(st => {
            const t = boardData[st.id];
            if (!t) return;
            t.owner = st.owner;
            t.houses = st.houses;
            t.isMortgaged = st.isMortgaged;
            // Re-render visual
            if (window.update3DHouses && (t.houses > 0 || st.owner !== null)) {
                window.update3DHouses(st.id);
            }
            if (window.applyMortgageVisual) window.applyMortgageVisual(st.id);
            // Repaint owner indicator strip
            if (st.owner !== null && window.boardMeshes && window.boardMeshes[st.id] && !t.ownerMesh) {
                const barGeo = new THREE.BoxGeometry(5.4, 0.25, 0.5);
                const barMat = new THREE.MeshStandardMaterial({
                    color: PLAYER_COLORS[st.owner], roughness: 0.5, metalness: 0.2
                });
                const ind = new THREE.Mesh(barGeo, barMat);
                ind.position.set(0, 0.58, 4.7);
                window.boardMeshes[st.id].add(ind);
                t.ownerMesh = ind;
            }
        });
        window.Game.currentPlayerIndex = snap.currentPlayerIndex;
        if (typeof updatePlayerUI === 'function') updatePlayerUI();
        if (typeof logMsg === 'function') logMsg('💾 Đã khôi phục ván chơi từ bản lưu.');
        if (window.Toast) window.Toast.show('Đã khôi phục ván chơi', { type: 'info', icon: '💾' });
    }

    // Hook into nextTurn so we save after every full turn
    function attachAutoSave() {
        if (!window.Game || !window.Game.nextTurn) return;
        if (window.Game._autoSaveAttached) return;
        const origNext = window.Game.nextTurn.bind(window.Game);
        window.Game.nextTurn = function () {
            origNext();
            saveDebounced();
        };
        const origVictory = window.Game.handleVictory.bind(window.Game);
        window.Game.handleVictory = function (winner) {
            clear();
            origVictory(winner);
        };
        window.Game._autoSaveAttached = true;
    }

    window.GameSave = { save, load, clear, hasSavedGame, restoreInto, attachAutoSave };
})();
