let players = [];
let currentPlayerIndex = 0;
let numPlayers = 4;
let isAnimating = false;

function startGame() {
    boardData.forEach(t => {
        if(t.type === TILE_TYPES.PROPERTY || t.type === TILE_TYPES.RAILROAD || t.type === TILE_TYPES.UTILITY) {
            t.owner = null; 
            if (t.houses !== undefined) t.houses = 0;
            if(t.houseMeshes) { const mesh = boardMeshes[t.id]; if (mesh) t.houseMeshes.forEach(h => mesh.remove(h)); t.houseMeshes = []; }
            if(t.ownerMesh) { const mesh = boardMeshes[t.id]; if (mesh) mesh.remove(t.ownerMesh); t.ownerMesh = null; }
        }
    });
    
    numPlayers = players.length;
    renderPlayerUI(); 
    logEl.innerHTML = ''; 
    logMsg(`Welcome to Monopoly! Each player receives ${Utils.formatMoney(GAME_CONFIG.START_MONEY)}.`);
    
    currentPlayerIndex = 0; 
    startTurn();
}

function startTurn() {
    let p = players[currentPlayerIndex];
    if (p.bankrupt) { nextTurn(); return; }
    updatePlayerUI();
    
    if (p.isBot) { hideModal(); setTimeout(() => doBotTurn(p), 1000); return; }

    let buttons = ['roll'];
    if (getBuildableProperties(p.id).length > 0 && !p.inJail) buttons.push('build');

    if (p.inJail) {
        p.jailTurns++;
        if (p.jailTurns > 3) { 
            p.inJail = false; p.jailTurns = 0; p.money -= GAME_CONFIG.JAIL_EXIT_FEE; 
            logMsg(`${p.name} paid ${Utils.formatMoney(GAME_CONFIG.JAIL_EXIT_FEE)} to exit jail.`); 
            showModal(`${p.name}'s Turn`, `You are free from jail.`, ['roll']); 
        } 
        else { showModal(`${p.name}'s Turn`, `In Jail (Turn ${p.jailTurns}/3). Roll doubles to escape.`, ['roll']); }
    } else { showModal(`${p.name}'s Turn`, `Roll the dice to move.`, buttons); }
}

function doBotTurn(p) {
    let d1 = Math.floor(Math.random() * 6) + 1, d2 = Math.floor(Math.random() * 6) + 1, total = d1 + d2, isDouble = d1 === d2;

    let buildables = getBuildableProperties(p.id); let didBuild = false;
    let difficulty = window.botDifficulty || 'medium';
    
    if (difficulty === 'medium' || difficulty === 'hard') {
        let moneyBuffer = difficulty === 'hard' ? 50 : 200;
        while (buildables.length > 0 && p.money > buildables[0].houseCost + moneyBuffer) {
            const target = buildables[0]; 
            p.money -= target.houseCost; target.houses++;
            if(window.SoundFX) window.SoundFX.build();
            logMsg(`🔨 BOT ${p.name} built a ${target.houses===5 ? 'Hotel' : 'House'} on ${target.name}.`);
            update3DHouses(target.id); updatePlayerUI(); buildables = getBuildableProperties(p.id); didBuild = true;
        }
    }

    setTimeout(() => {
        if(window.SoundFX) window.SoundFX.roll();
        rollDiceAnimation(d1, d2, () => {
            if (p.inJail) {
                p.jailTurns++;
                if (isDouble || p.jailTurns > 3) { 
                    p.inJail = false; p.jailTurns = 0; 
                    if(!isDouble) p.money -= GAME_CONFIG.JAIL_EXIT_FEE; 
                    logMsg(`${p.name} is now free!`); movePlayerAnim(p, total, isDouble); 
                } 
                else { logMsg(`${p.name} failed to roll doubles. Remains in jail.`); setTimeout(() => checkEndTurnPhase(false), 1000); }
            } else { logMsg(`🎲 ${p.name} rolled ${total} (${d1} & ${d2})`); movePlayerAnim(p, total, isDouble); }
        });
    }, didBuild ? 1500 : 0);
}

function handleSpaceLanded(player, tileIdx, isDouble) {
    updatePlayerUI(); const tile = boardData[tileIdx]; logMsg(`📍 ${player.name} landed on: ${tile.name}`);

    if (tile.type === TILE_TYPES.PROPERTY || tile.type === TILE_TYPES.RAILROAD || tile.type === TILE_TYPES.UTILITY) {
        if (tile.owner === null) {
            if (player.isBot) {
                let difficulty = window.botDifficulty || 'medium';
                let moneyBuffer = difficulty === 'hard' ? 0 : (difficulty === 'easy' ? 300 : 150);
                if (difficulty === 'easy' && Math.random() > 0.5) moneyBuffer = 9999;
                
                if (player.money >= tile.price + moneyBuffer) { executeBuyProperty(player, tile, tileIdx); } 
                else { logMsg(`${player.name} declined to buy.`); }
                setTimeout(() => checkEndTurnPhase(isDouble), 1500);
            } else {
                if (player.money >= tile.price) {
                    showModal(`Buy Property?`, `${tile.name}\nPrice: ${Utils.formatMoney(tile.price)}\nRent: ${Utils.formatMoney(calculateRent(tile))}`, ['buy', 'skip']);
                    btnBuy.onclick = () => { executeBuyProperty(player, tile, tileIdx); checkEndTurnPhase(isDouble); };
                    btnSkip.onclick = () => { logMsg(`${player.name} skipped the purchase.`); checkEndTurnPhase(isDouble); };
                } else { logMsg(`Insufficient funds to buy ${tile.name}.`); checkEndTurnPhase(isDouble); }
            }
        } else if (tile.owner !== player.id) {
            let rent = calculateRent(tile); 
            if (!players[tile.owner].inJail) { 
                if(window.SoundFX) window.SoundFX.pay();
                logMsg(`💸 ${player.name} paid ${Utils.formatMoney(rent)} rent to ${players[tile.owner].name}.`); 
                payMoney(player, tile.owner, rent); 
            } else {
                logMsg(`🏠 ${players[tile.owner].name} is in jail. No rent collected.`);
            }
            if(player.isBot) setTimeout(() => checkEndTurnPhase(isDouble), 1500); else checkEndTurnPhase(isDouble);
        } else {
            if(player.isBot) setTimeout(() => checkEndTurnPhase(isDouble), 1000); else checkEndTurnPhase(isDouble);
        }
    } 
    else if (tile.type === TILE_TYPES.TAX) {
        if(window.SoundFX) window.SoundFX.pay();
        logMsg(`💸 ${player.name} paid ${Utils.formatMoney(tile.price)} in taxes.`); 
        payMoney(player, 'bank', tile.price);
        if(player.isBot) setTimeout(() => checkEndTurnPhase(isDouble), 1500); else checkEndTurnPhase(isDouble);
    }
    else if (tile.type === TILE_TYPES.GOTOJAIL) {
        logMsg(`🚓 ${player.name} was ARRESTED!`);
        player.inJail = true; player.position = 10;
        player.mesh.position.copy(boardMeshes[10].position); player.mesh.position.y = 2.5;
        if(player.isBot) setTimeout(() => checkEndTurnPhase(false), 1500); else checkEndTurnPhase(false);
    }
    else if (tile.type === TILE_TYPES.CHANCE || tile.type === TILE_TYPES.CHEST) {
        let isChance = tile.type === TILE_TYPES.CHANCE;
        let rand = Math.random(); let msg = "", amount = 0;
        if (rand < 0.5) { msg = `Inheritance reward: $150!`; amount = 150; } else { msg = `Speeding fine: $50!`; amount = -50; }

        showCardAnimation(isChance ? 'CHANCE' : 'COMMUNITY CHEST', msg, isChance ? '#3b82f6' : '#eab308', isChance ? -12 : 12, () => {
            if (amount > 0) {
                if(window.SoundFX) window.SoundFX.buy();
                player.money += amount;
            } else {
                if(window.SoundFX) window.SoundFX.pay();
                payMoney(player, 'bank', -amount);
            }
            logMsg(`${isChance ? '🎁' : '💥'} ${msg}`); updatePlayerUI();
            if(player.isBot) setTimeout(() => checkEndTurnPhase(isDouble), 1000); else checkEndTurnPhase(isDouble);
        });
    }
    else {
        if(player.isBot) setTimeout(() => checkEndTurnPhase(isDouble), 1000); else checkEndTurnPhase(isDouble);
    }
}

function executeBuyProperty(player, tile, tileIdx) {
    if(window.SoundFX) window.SoundFX.buy();
    player.money -= tile.price; tile.owner = player.id; 
    logMsg(`🏡 ${player.name} purchased ${tile.name}.`);
    
    // Create Owner Indicator
    const barGeo = new THREE.BoxGeometry(sizeForTile(tileIdx).x - 0.2, 0.4, 0.3);
    const barMat = new THREE.MeshStandardMaterial({ 
        color: PLAYER_COLORS[player.id], 
        emissive: PLAYER_COLORS[player.id], 
        emissiveIntensity: 0.4, 
        roughness: 0.2 
    });
    const ownerIndicator = new THREE.Mesh(barGeo, barMat);
    ownerIndicator.position.set(0, 0.75, 4.8); ownerIndicator.castShadow = true;
    boardMeshes[tileIdx].add(ownerIndicator); tile.ownerMesh = ownerIndicator;
}

function sizeForTile(idx) {
    if (idx % 10 === 0) return {x:10, z:10};
    return {x:6, z:10};
}

function payMoney(fromPlayer, toTarget, amount) {
    fromPlayer.money -= amount;
    if (toTarget !== 'bank') players[toTarget].money += amount;
    updatePlayerUI();

    if (fromPlayer.money < 0) {
        logMsg(`💀 ${fromPlayer.name} has gone BANKRUPT!`);
        fromPlayer.bankrupt = true; scene.remove(fromPlayer.mesh);
        boardData.forEach(t => { 
            if (t.owner === fromPlayer.id) {
                t.owner = null; if (t.ownerMesh) { boardMeshes[t.id].remove(t.ownerMesh); t.ownerMesh = null; }
                if (t.houseMeshes) { t.houseMeshes.forEach(h => boardMeshes[t.id].remove(h)); t.houseMeshes = []; t.houses = 0; }
            } 
        });
        renderPlayerUI();
        let activePlayers = players.filter(p => !p.bankrupt);
        if(activePlayers.length === 1) {
            if(window.SoundFX) window.SoundFX.win();
            if(window.confetti) {
                let duration = 5 * 1000;
                let animationEnd = Date.now() + duration;
                let defaults = { startVelocity: 30, spread: 360, ticks: 60, zIndex: 100 };
                function randomInRange(min, max) { return Math.random() * (max - min) + min; }
                let interval = setInterval(function() {
                    let timeLeft = animationEnd - Date.now();
                    if (timeLeft <= 0) return clearInterval(interval);
                    let particleCount = 50 * (timeLeft / duration);
                    window.confetti(Object.assign({}, defaults, { particleCount, origin: { x: randomInRange(0.1, 0.3), y: Math.random() - 0.2 } }));
                    window.confetti(Object.assign({}, defaults, { particleCount, origin: { x: randomInRange(0.7, 0.9), y: Math.random() - 0.2 } }));
                }, 250);
            }
            showModal("🏆 VICTORY!", `${activePlayers[0].name} HAS WON THE GAME!`, []);
        }
    }
}

function checkEndTurnPhase(isDouble) {
    updatePlayerUI(); if (players.filter(p => !p.bankrupt).length <= 1) return;
    if (players[currentPlayerIndex].bankrupt) { nextTurn(); return; }

    if (isDouble && !players[currentPlayerIndex].inJail) {
        if(players[currentPlayerIndex].isBot) { 
            logMsg(`Doubles! ${players[currentPlayerIndex].name} takes another turn.`); 
            setTimeout(() => doBotTurn(players[currentPlayerIndex]), 1000); 
        } 
        else { 
            let buttons = ['roll']; 
            if (getBuildableProperties(players[currentPlayerIndex].id).length > 0) buttons.push('build'); 
            showModal(`${players[currentPlayerIndex].name}'s Turn`, `DOUBLES! Roll again.`, buttons); 
        }
    } else {
        if(players[currentPlayerIndex].isBot) { nextTurn(); } 
        else { 
            let buttons = ['end']; 
            if (getBuildableProperties(players[currentPlayerIndex].id).length > 0) buttons.push('build'); 
            showModal(`${players[currentPlayerIndex].name}'s Turn`, `Action complete.`, buttons); 
            btnEnd.onclick = () => { hideModal(); nextTurn(); }; 
        }
    }
}

function nextTurn() {
    do { currentPlayerIndex = (currentPlayerIndex + 1) % numPlayers; } while (players[currentPlayerIndex].bankrupt);
    startTurn();
}

function hasMonopoly(playerId, groupId) {
    if (!groupId) return false;
    const groupTiles = boardData.filter(t => t.groupId === groupId);
    return groupTiles.every(t => t.owner === playerId);
}

function getBuildableProperties(playerId) {
    return boardData.filter(t => {
        if (t.owner !== playerId || !t.groupId || t.houses >= 5) return false;
        if (!hasMonopoly(playerId, t.groupId)) return false;
        if (players[playerId].money < t.houseCost) return false;
        const groupTiles = boardData.filter(gt => gt.groupId === t.groupId);
        const minHouses = Math.min(...groupTiles.map(gt => gt.houses));
        if (t.houses > minHouses) return false;
        return true;
    });
}

function calculateRent(tile) {
    if (tile.type !== TILE_TYPES.PROPERTY) return tile.rent || 0;
    if (tile.houses === 0) return hasMonopoly(tile.owner, tile.groupId) ? tile.rent * 2 : tile.rent;
    const multipliers = [1, 5, 15, 45, 60, 75];
    return tile.rent * multipliers[tile.houses];
}

function movePlayerAnim(player, steps, isDouble = false) {
    isAnimating = true; let current = player.position; let target = (current + steps) % 40;
    if (target < current) { 
        player.money += GAME_CONFIG.PASS_GO_MONEY; 
        logMsg(`💰 ${player.name} passed GO, collected ${Utils.formatMoney(GAME_CONFIG.PASS_GO_MONEY)}.`); 
        updatePlayerUI(); 
    }

    player.position = target; let path = [];
    for(let i=1; i<=steps; i++) path.push((current + i) % 40);

    path.forEach((tileIdx, i) => {
        setTimeout(() => {
            let tilePos = boardMeshes[tileIdx].position;
            player.mesh.position.x = tilePos.x + (player.id % 2 === 0 ? 1.5 : -1.5);
            player.mesh.position.z = tilePos.z + (player.id > 1 ? 1.5 : -1.5);
            
            // Hop animation
            player.mesh.position.y = 5; 
            setTimeout(() => player.mesh.position.y = 2.5, 150);

            if (i === path.length - 1) { 
                setTimeout(() => { isAnimating = false; handleSpaceLanded(player, tileIdx, isDouble); }, 400); 
            }
        }, i * 250);
    });
}

window.executeBuild = function(tileId) {
    const p = players[currentPlayerIndex]; const tile = boardData[tileId];
    if (p.money >= tile.houseCost && tile.houses < 5) {
        p.money -= tile.houseCost; tile.houses++;
        if(window.SoundFX) window.SoundFX.build();
        logMsg(`🔨 ${p.name} built a ${tile.houses === 5 ? 'Hotel' : 'House'} on ${tile.name}.`);
        updatePlayerUI(); update3DHouses(tileId); renderBuildMenu(); 
    }
};

btnRoll.onclick = () => {
    hideModal(); let p = players[currentPlayerIndex];
    let d1 = Math.floor(Math.random() * 6) + 1, d2 = Math.floor(Math.random() * 6) + 1, total = d1 + d2, isDouble = d1 === d2;

    if(window.SoundFX) window.SoundFX.roll();
    rollDiceAnimation(d1, d2, () => {
        logMsg(`🎲 ${p.name} rolled ${total} (${d1} & ${d2})`);
        if (p.inJail) {
            if (isDouble) { logMsg(`${p.name} rolled doubles! Exiting jail.`); p.inJail = false; p.jailTurns = 0; movePlayerAnim(p, total); } 
            else { logMsg(`${p.name} failed to escape. Turn ends.`); showModal(`${p.name}'s Turn`, `No doubles. Wait for next turn.`, ['end']); }
        } else { movePlayerAnim(p, total, isDouble); }
    });
};
