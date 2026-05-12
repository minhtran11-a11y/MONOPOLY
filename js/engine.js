let scene, camera, renderer, controls;
let boardMeshes = [];
let maxAnisotropy = 1;

let isCameraAnimating = false;
let cameraAnimConfig = null;
let savedCameraPos = new THREE.Vector3();
let savedCameraTarget = new THREE.Vector3();

let dice1, dice2;
let chanceDeck, chestDeck;

// --- INITIALIZATION ---
function createCenterLogo() {
    const canvas = document.createElement('canvas');
    canvas.width = 1024; canvas.height = 1024;
    const ctx = canvas.getContext('2d');
    
    // Background
    ctx.fillStyle = '#1e293b';
    ctx.fillRect(0, 0, 1024, 1024);
    
    // Red Banner
    ctx.fillStyle = '#ef4444';
    ctx.fillRect(100, 350, 824, 320);
    
    // Border
    ctx.strokeStyle = '#ffffff';
    ctx.lineWidth = 20;
    ctx.strokeRect(115, 365, 794, 290);

    // Text
    ctx.fillStyle = '#ffffff';
    ctx.font = '900 140px "Outfit", sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.shadowColor = 'rgba(0,0,0,0.5)';
    ctx.shadowBlur = 20;
    ctx.fillText('CỜ TỶ PHÚ', 512, 470);
    
    ctx.font = '800 80px "Outfit", sans-serif';
    ctx.fillStyle = '#fbbf24';
    ctx.fillText('VIỆT NAM', 512, 590);

    const texture = new THREE.CanvasTexture(canvas);
    const centerMat = new THREE.MeshStandardMaterial({ 
        map: texture, 
        roughness: 0.8,
        metalness: 0.1 
    });
    const centerGeo = new THREE.PlaneGeometry(53, 53);
    const centerMesh = new THREE.Mesh(centerGeo, centerMat);
    centerMesh.rotation.x = -Math.PI / 2;
    centerMesh.position.y = 0.46;
    centerMesh.receiveShadow = true;
    scene.add(centerMesh);
}

function createBoard() {
    boardMeshes = [];
    for (let i = 0; i < 40; i++) {
        let x = 0, z = 0, sizeX = 6, sizeZ = 10, rotY = 0;
        
        // Positioning logic for 40 tiles in a square
        if (i === 0) { x = 32; z = 32; sizeX = 10; sizeZ = 10; rotY = 0; } 
        else if (i < 10) { x = 30 - i*6; z = 32; sizeX = 6; sizeZ = 10; rotY = 0; } 
        else if (i === 10) { x = -32; z = 32; sizeX = 10; sizeZ = 10; rotY = 0; } 
        else if (i < 20) { x = -32; z = 30 - (i-10)*6; sizeX = 6; sizeZ = 10; rotY = Math.PI/2; } 
        else if (i === 20) { x = -32; z = -32; sizeX = 10; sizeZ = 10; rotY = 0; } 
        else if (i < 30) { x = -30 + (i-20)*6; z = -32; sizeX = 6; sizeZ = 10; rotY = Math.PI; } 
        else if (i === 30) { x = 32; z = -32; sizeX = 10; sizeZ = 10; rotY = 0; } 
        else { x = 32; z = -30 + (i-30)*6; sizeX = 6; sizeZ = 10; rotY = -Math.PI/2; }

        const geo = new THREE.BoxGeometry(sizeX, 1, sizeZ);
        const materials = generateTileMaterials(boardData[i], i);
        const mesh = new THREE.Mesh(geo, materials);
        
        mesh.position.set(x, 0.5, z);
        mesh.rotation.y = rotY;
        mesh.castShadow = true; 
        mesh.receiveShadow = true;
        mesh.userData = { ...boardData[i], position: mesh.position.clone() };

        // Subtle edge highlight
        const edges = new THREE.EdgesGeometry(geo);
        const line = new THREE.LineSegments(edges, new THREE.LineBasicMaterial({ color: 0x444444, transparent: true, opacity: 0.3 }));
        mesh.add(line);

        scene.add(mesh);
        boardMeshes.push(mesh);
    }
}

function generateTileMaterials(tile, i) {
    const isCorner = i % 10 === 0;
    const canvas = document.createElement('canvas');
    const ctx = canvas.getContext('2d');
    
    let baseColor = '#f8fafc';
    if (isCorner) baseColor = '#f1f5f9';

    if (isCorner) {
        canvas.width = 512; canvas.height = 512;
        ctx.fillStyle = baseColor; ctx.fillRect(0, 0, 512, 512);
        ctx.translate(256, 256);
        
        if (i === 0) ctx.rotate(-Math.PI / 4);
        if (i === 10) ctx.rotate(Math.PI / 4);
        if (i === 20) ctx.rotate(Math.PI * 3/4);
        if (i === 30) ctx.rotate(-Math.PI * 3/4);

        ctx.fillStyle = '#1e293b'; 
        ctx.textAlign = 'center'; 
        ctx.textBaseline = 'middle';
        
        if (i === 0) {
            ctx.font = '900 100px "Outfit", sans-serif'; ctx.fillStyle = '#ef4444'; ctx.fillText('GO', 0, -30);
            ctx.font = 'bold 50px "Outfit", sans-serif'; ctx.fillStyle = '#1e293b'; ctx.fillText('Collect $200', 0, 60);
        } else if (i === 10) { 
            ctx.font = '900 80px "Outfit", sans-serif'; ctx.fillText('JAIL', 0, 0);
        } else if (i === 20) { 
            ctx.font = '900 80px "Outfit", sans-serif'; ctx.fillText('FREE', 0, -30);
            ctx.fillText('PARKING', 0, 40);
        } else if (i === 30) { 
            ctx.font = '900 80px "Outfit", sans-serif'; ctx.fillStyle = '#3b82f6'; ctx.fillText('GO TO', 0, -30);
            ctx.fillText('JAIL', 0, 40);
        }
    } else {
        canvas.width = 300; canvas.height = 500;
        ctx.fillStyle = baseColor; ctx.fillRect(0, 0, 300, 500);
        ctx.textAlign = 'center';
        
        if (tile.type === TILE_TYPES.PROPERTY) {
            ctx.fillStyle = '#' + tile.color.toString(16).padStart(6, '0');
            ctx.fillRect(0, 0, 300, 120); 
            ctx.fillStyle = 'rgba(0,0,0,0.1)';
            ctx.fillRect(0, 115, 300, 5); // Shadow under color bar
            
            ctx.fillStyle = '#1e293b'; 
            ctx.font = '800 36px "Outfit", sans-serif';
            Utils.wrapText(ctx, tile.name, 150, 180, 260, 44);
            ctx.font = '900 42px "Outfit", sans-serif'; 
            ctx.fillText('$' + tile.price, 150, 450);
        } else {
            ctx.fillStyle = '#1e293b'; 
            ctx.font = '800 40px "Outfit", sans-serif';
            Utils.wrapText(ctx, tile.name, 150, 100, 260, 48);
            
            let icon = '';
            if (tile.type === TILE_TYPES.RAILROAD) icon = '🚂';
            if (tile.type === TILE_TYPES.UTILITY && i===12) icon = '💡';
            if (tile.type === TILE_TYPES.UTILITY && i===28) icon = '🚰';
            if (tile.type === TILE_TYPES.CHANCE) icon = '❓';
            if (tile.type === TILE_TYPES.CHEST) icon = '🎁';
            if (tile.type === TILE_TYPES.TAX && i===4) icon = '💰';
            if (tile.type === TILE_TYPES.TAX && i===38) icon = '💍';
            
            if (icon) { 
                ctx.font = '120px "Segoe UI Emoji", sans-serif'; 
                ctx.fillText(icon, 150, 290); 
            }
            if (tile.price) { 
                ctx.font = '900 42px "Outfit", sans-serif'; 
                ctx.fillText('$' + tile.price, 150, 450); 
            }
        }
        // Border
        ctx.lineWidth = 10; ctx.strokeStyle = '#cbd5e1'; ctx.strokeRect(0, 0, 300, 500);
    }

    const texture = new THREE.CanvasTexture(canvas);
    texture.anisotropy = maxAnisotropy; 
    const sideMat = new THREE.MeshStandardMaterial({ color: baseColor, roughness: 0.9, metalness: 0.05 });
    const topMat = new THREE.MeshStandardMaterial({ map: texture, roughness: 0.7, metalness: 0.1 });
    return [sideMat, sideMat, topMat, sideMat, sideMat, sideMat];
}

function createDecks() {
    const chanceMat = new THREE.MeshStandardMaterial({ color: 0x3b82f6, metalness: 0.2, roughness: 0.5 });
    chanceDeck = new THREE.Mesh(new THREE.BoxGeometry(8, 2, 5.5), chanceMat);
    chanceDeck.position.set(10, 1.2, -10); chanceDeck.rotation.y = Math.PI / 4;
    chanceDeck.castShadow = true; scene.add(chanceDeck);
    
    const chestMat = new THREE.MeshStandardMaterial({ color: 0xeab308, metalness: 0.2, roughness: 0.5 });
    chestDeck = new THREE.Mesh(new THREE.BoxGeometry(8, 2, 5.5), chestMat);
    chestDeck.position.set(-10, 1.2, 10); chestDeck.rotation.y = Math.PI / 4;
    chestDeck.castShadow = true; scene.add(chestDeck);
}

function createDice() {
    const diceGeo = new THREE.BoxGeometry(2.8, 2.8, 2.8);
    const getDiceMats = (num) => {
        return [
            new THREE.MeshStandardMaterial({ map: createDiceTexture(2) }), new THREE.MeshStandardMaterial({ map: createDiceTexture(5) }),
            new THREE.MeshStandardMaterial({ map: createDiceTexture(1) }), new THREE.MeshStandardMaterial({ map: createDiceTexture(6) }),
            new THREE.MeshStandardMaterial({ map: createDiceTexture(3) }), new THREE.MeshStandardMaterial({ map: createDiceTexture(4) })
        ];
    };
    
    dice1 = new THREE.Mesh(diceGeo, getDiceMats());
    dice1.position.set(-3, 10, 0); dice1.castShadow = true; dice1.visible = false; scene.add(dice1);
    
    dice2 = new THREE.Mesh(diceGeo, getDiceMats());
    dice2.position.set(3, 10, 0); dice2.castShadow = true; dice2.visible = false; scene.add(dice2);
}

function createDiceTexture(number) {
    const canvas = document.createElement('canvas'); canvas.width = 256; canvas.height = 256;
    const ctx = canvas.getContext('2d');
    
    // Dice Body
    ctx.fillStyle = '#ffffff'; 
    ctx.roundRect ? ctx.roundRect(0, 0, 256, 256, 40) : ctx.fillRect(0, 0, 256, 256);
    ctx.fill();
    
    // Dots
    ctx.fillStyle = '#1e293b';
    const drawDot = (x, y) => { ctx.beginPath(); ctx.arc(x, y, 25, 0, Math.PI * 2); ctx.fill(); };
    
    const center = 128, low = 64, high = 192;
    if([1,3,5].includes(number)) drawDot(center, center);
    if([2,3,4,5,6].includes(number)) { drawDot(low, low); drawDot(high, high); }
    if([4,5,6].includes(number)) { drawDot(high, low); drawDot(low, high); }
    if(number === 6) { drawDot(low, center); drawDot(high, center); }

    return new THREE.CanvasTexture(canvas);
}

function createBuilding(isHotel) {
    const group = new THREE.Group();
    const baseColor = isHotel ? 0xef4444 : 0x22c55e;
    const roofColor = isHotel ? 0xb91c1c : 0x166534;

    if (isHotel) {
        const base = new THREE.Mesh(new THREE.BoxGeometry(1.8, 1.2, 1.4), new THREE.MeshStandardMaterial({color: baseColor, roughness: 0.5, metalness: 0.1}));
        base.position.y = 0.6; base.castShadow = true; group.add(base);
        const roof = new THREE.Mesh(new THREE.ConeGeometry(1.4, 1.0, 4), new THREE.MeshStandardMaterial({color: roofColor, roughness: 0.4}));
        roof.position.y = 1.6; roof.rotation.y = Math.PI / 4; roof.castShadow = true; group.add(roof);
    } else {
        const base = new THREE.Mesh(new THREE.BoxGeometry(1.0, 0.8, 1.0), new THREE.MeshStandardMaterial({color: baseColor, roughness: 0.5, metalness: 0.1}));
        base.position.y = 0.4; base.castShadow = true; group.add(base);
        const roof = new THREE.Mesh(new THREE.ConeGeometry(0.9, 0.7, 4), new THREE.MeshStandardMaterial({color: roofColor, roughness: 0.4}));
        roof.position.y = 1.1; roof.rotation.y = Math.PI / 4; roof.castShadow = true; group.add(roof);
    }
    return group;
}

function update3DHouses(tileIdx) {
    const tile = boardData[tileIdx];
    const tileMesh = boardMeshes[tileIdx];

    if (tile.houseMeshes) tile.houseMeshes.forEach(h => tileMesh.remove(h));
    tile.houseMeshes = [];
    if (tile.houses === 0) return;

    const localZ = -3.8; 
    const localY = 0.5;

    if (tile.houses === 5) {
        const hotel = createBuilding(true); hotel.position.set(0, localY, localZ);
        tileMesh.add(hotel); tile.houseMeshes.push(hotel);
    } else {
        const spacing = 1.3; const startOffset = -((tile.houses - 1) * spacing) / 2;
        for (let k = 0; k < tile.houses; k++) {
            const house = createBuilding(false); house.position.set(startOffset + k * spacing, localY, localZ);
            tileMesh.add(house); tile.houseMeshes.push(house);
        }
    }
}

function tweenCamera(endPos, endTarget, duration, callback) {
    if(controls) controls.enabled = false;
    cameraAnimConfig = {
        startPos: camera.position.clone(), endPos: endPos.clone(),
        startTarget: controls.target.clone(), endTarget: endTarget.clone(),
        startTime: Date.now(), duration: duration, onComplete: callback
    };
    isCameraAnimating = true;
}

function rollDiceAnimation(d1, d2, callback) {
    isAnimating = true;
    dice1.visible = true; dice2.visible = true;
    
    // Random initial rotations
    dice1.rotation.set(Math.random()*Math.PI, Math.random()*Math.PI, Math.random()*Math.PI);
    dice2.rotation.set(Math.random()*Math.PI, Math.random()*Math.PI, Math.random()*Math.PI);

    let startY = 18;
    dice1.position.set(-3, startY, 0); dice2.position.set(3, startY, 0);

    savedCameraPos.copy(camera.position); savedCameraTarget.copy(controls.target);
    tweenCamera(new THREE.Vector3(0, 25, 25), new THREE.Vector3(0, 0, 0), 1000);

    let frame = 0; const maxFrames = 60;
    function animateRoll() {
        frame++;
        if (frame < maxFrames - 5) {
            let progress = frame / maxFrames;
            dice1.position.y = Math.max(1.5, startY * (1 - progress) + Math.abs(Math.sin(frame*0.4)*5 * (1-progress)));
            dice2.position.y = Math.max(1.5, startY * (1 - progress) + Math.abs(Math.sin(frame*0.4 + 1)*5 * (1-progress)));
            
            dice1.rotation.x += 0.5; dice1.rotation.y += 0.3; 
            dice2.rotation.x += 0.3; dice2.rotation.z += 0.5;
            
            requestAnimationFrame(animateRoll);
        } else {
            dice1.position.y = 1.5; dice2.position.y = 1.5;
            const getRotationForFace = (num) => {
                switch(num) {
                    case 1: return {x:0, y:0, z:0}; case 6: return {x:Math.PI, y:0, z:0};
                    case 2: return {x:0, y:0, z:Math.PI/2}; case 5: return {x:0, y:0, z:-Math.PI/2};
                    case 3: return {x:-Math.PI/2, y:0, z:0}; case 4: return {x:Math.PI/2, y:0, z:0};
                }
            };
            const r1 = getRotationForFace(d1); const r2 = getRotationForFace(d2);
            dice1.rotation.set(r1.x, r1.y, r1.z); dice2.rotation.set(r2.x, r2.y, r2.z);

            setTimeout(() => {
                dice1.visible = false; dice2.visible = false;
                tweenCamera(savedCameraPos, savedCameraTarget, 1000, () => { isAnimating = false; callback(); });
            }, 2000); 
        }
    }
    animateRoll();
}

function showCardAnimation(type, desc, colorHex, sourceZ, callback) {
    isAnimating = true;
    const canvas = document.createElement('canvas'); canvas.width = 500; canvas.height = 300;
    const ctx = canvas.getContext('2d');
    ctx.fillStyle = colorHex; ctx.fillRect(0,0,500,300);
    ctx.lineWidth = 15; ctx.strokeStyle = '#fff'; ctx.strokeRect(10,10,480,280);
    ctx.fillStyle = '#fff'; ctx.font = '900 60px "Outfit", sans-serif'; ctx.textAlign = 'center';
    ctx.fillText(type, 250, 90);
    ctx.font = '800 40px "Outfit", sans-serif'; Utils.wrapText(ctx, desc, 250, 170, 440, 50);

    const tex = new THREE.CanvasTexture(canvas); tex.anisotropy = maxAnisotropy;
    const sideMat = new THREE.MeshStandardMaterial({ color: colorHex, roughness: 0.8 });
    const faceMat = new THREE.MeshStandardMaterial({ map: tex, roughness: 0.8 });
    const cardMesh = new THREE.Mesh(new THREE.BoxGeometry(10, 0.2, 6), [sideMat, sideMat, faceMat, sideMat, sideMat, sideMat]);
    cardMesh.position.set(0, 1.5, sourceZ); scene.add(cardMesh);

    savedCameraPos.copy(camera.position); savedCameraTarget.copy(controls.target);

    let targetCardY = 12; let targetCardZ = 0; 
    let targetRotX = -Math.PI / 2; 
    
    let targetCameraPos = new THREE.Vector3(0, targetCardY + 4, 12);
    let lookAtTarget = new THREE.Vector3(0, targetCardY, 0);
    tweenCamera(targetCameraPos, lookAtTarget, 1000);

    let frame = 0;
    function animateCard() {
        frame++;
        if (frame <= 40) {
            let progress = frame / 40;
            let ease = Utils.easeInOutCubic(progress);
            cardMesh.position.y = 1.5 + (targetCardY - 1.5) * ease;
            cardMesh.position.z = sourceZ + (targetCardZ - sourceZ) * ease;
            cardMesh.rotation.x = targetRotX * ease;
            requestAnimationFrame(animateCard);
        } else {
            cardMesh.position.set(0, targetCardY, targetCardZ);
            cardMesh.rotation.set(targetRotX, 0, 0);
            
            setTimeout(() => {
                scene.remove(cardMesh);
                tweenCamera(savedCameraPos, savedCameraTarget, 1000, () => { isAnimating = false; callback(); });
            }, 3000); 
        }
    }
    animateCard();
}

function createPlayers(total, mode) {
    players.forEach(p => { if(p.mesh) scene.remove(p.mesh); });
    players.length = 0;

    const geometries = [
        new THREE.ConeGeometry(1.5, 4, 16), new THREE.CylinderGeometry(1.2, 1.2, 3, 16),
        new THREE.SphereGeometry(1.5, 24, 24), new THREE.TorusGeometry(1, 0.5, 16, 32)
    ];
    
    for (let i = 0; i < total; i++) {
        const mat = new THREE.MeshStandardMaterial({ 
            color: PLAYER_COLORS[i], 
            metalness: 0.6, 
            roughness: 0.2,
            emissive: PLAYER_COLORS[i],
            emissiveIntensity: 0.1
        });
        const mesh = new THREE.Mesh(geometries[i], mat);
        mesh.position.copy(boardMeshes[0].position); mesh.position.y = 2.5;
        mesh.position.x += (i % 2 === 0 ? 1.5 : -1.5); mesh.position.z += (i > 1 ? 1.5 : -1.5);
        mesh.castShadow = true; 
        scene.add(mesh);

        let pName = mode === 'bot' ? (i === 0 ? "You" : `Bot ${i}`) : (i === 0 ? "You (P1)" : `Player ${i+1}`);
        let isBot = mode === 'bot' && i > 0;

        players.push({
            id: i, name: pName, colorHex: PLAYER_HEX[i],
            mesh: mesh, position: 0, money: GAME_CONFIG.START_MONEY, inJail: false, jailTurns: 0, bankrupt: false, isBot: isBot
        });
    }
}
