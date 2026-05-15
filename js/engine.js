let scene, camera, renderer, controls;
let boardMeshes = [];
let maxAnisotropy = 1;

let isCameraAnimating = false;
let cameraAnimConfig = null;
let savedCameraPos = new THREE.Vector3();
let savedCameraTarget = new THREE.Vector3();

let dice1, dice2;
let chanceDeck, chestDeck;
let composer; // For Bloom effect
let stars;    // For background atmosphere

// --- INITIALIZATION ---
function createCenterLogo() {
    const canvas = document.createElement('canvas');
    canvas.width = 1024; canvas.height = 1024;
    const ctx = canvas.getContext('2d');
    
    // Background - Dark Slate with a slight gradient
    const grad = ctx.createRadialGradient(512, 512, 0, 512, 512, 800);
    grad.addColorStop(0, '#1e293b');
    grad.addColorStop(1, '#0f172a');
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, 1024, 1024);
    
    // Glossy Red Banner
    ctx.fillStyle = '#ef4444';
    ctx.shadowColor = 'rgba(0,0,0,0.5)';
    ctx.shadowBlur = 40;
    ctx.shadowOffsetY = 20;
    ctx.fillRect(100, 320, 824, 380);
    
    // Border Inner
    ctx.strokeStyle = 'rgba(255,255,255,0.2)';
    ctx.lineWidth = 10;
    ctx.strokeRect(120, 340, 784, 340);

    // Main Text
    ctx.shadowColor = 'rgba(0,0,0,0.8)';
    ctx.shadowBlur = 30;
    ctx.shadowOffsetY = 15;
    ctx.fillStyle = '#ffffff';
    ctx.font = '900 160px "Be Vietnam Pro", sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('CỜ TỶ PHÚ', 512, 450);
    
    // Subtext
    ctx.shadowBlur = 10;
    ctx.shadowOffsetY = 5;
    ctx.font = 'italic 800 90px Montserrat, sans-serif';
    ctx.fillStyle = '#fbbf24';
    ctx.fillText('VIỆT NAM', 512, 590);

    // Decorative Dice
    ctx.shadowBlur = 0;
    ctx.font = '100px "Segoe UI Emoji", sans-serif';
    ctx.fillText('🎲', 180, 512);
    ctx.fillText('💰', 844, 512);

    const texture = new THREE.CanvasTexture(canvas);
    const centerMat = new THREE.MeshStandardMaterial({ 
        map: texture, 
        roughness: 0.4,
        metalness: 0.3 
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
    
    let baseColor = '#f1f5f9';
    if (isCorner) baseColor = '#f8fafc';

    if (isCorner) {
        canvas.width = 512; canvas.height = 512;

        if (i === 10) {
            // ===== THĂM TÙ - Clean Diamond Prison Style =====

            // --- Background: solid red ---
            ctx.fillStyle = '#e53e3e';
            ctx.fillRect(0, 0, 512, 512);

            // Thin dark border
            ctx.strokeStyle = 'rgba(0,0,0,0.4)';
            ctx.lineWidth = 10;
            ctx.strokeRect(5, 5, 502, 502);

            // --- Diamond shape using 4 corner points ---
            const cx = 256, cy = 220;
            const halfD = 168; // half-diagonal length

            const dTop    = { x: cx,          y: cy - halfD };
            const dRight  = { x: cx + halfD,  y: cy };
            const dBottom = { x: cx,          y: cy + halfD };
            const dLeft   = { x: cx - halfD,  y: cy };

            // Draw dark filled diamond
            ctx.save();
            ctx.beginPath();
            ctx.moveTo(dTop.x,    dTop.y);
            ctx.lineTo(dRight.x,  dRight.y);
            ctx.lineTo(dBottom.x, dBottom.y);
            ctx.lineTo(dLeft.x,   dLeft.y);
            ctx.closePath();

            ctx.fillStyle = '#1a202c';
            ctx.shadowColor = 'rgba(0,0,0,0.7)';
            ctx.shadowBlur = 24;
            ctx.fill();
            ctx.shadowBlur = 0;

            // Clip to diamond for everything drawn inside
            ctx.clip();

            // --- Inner lighter dark rectangle (prison window area) ---
            const rW = 210, rH = 195;
            const rX = cx - rW / 2, rY = cy - rH / 2;
            ctx.fillStyle = '#2d3748';
            ctx.fillRect(rX, rY, rW, rH);

            // --- Prison bars: VERTICAL ---
            const barColor = '#e2e8f0';
            ctx.strokeStyle = barColor;
            ctx.lineCap = 'butt';
            ctx.lineWidth = 14;

            const numV = 6;
            const vStep = rW / (numV - 1);
            for (let v = 0; v < numV; v++) {
                const bx = rX + v * vStep;
                ctx.beginPath();
                ctx.moveTo(bx, rY - 20);
                ctx.lineTo(bx, rY + rH + 20);
                ctx.stroke();
            }

            // --- Prison bars: HORIZONTAL (2 cross bars) ---
            ctx.lineWidth = 10;
            ctx.strokeStyle = '#a0aec0';
            const hPositions = [rY + rH * 0.33, rY + rH * 0.66];
            for (const hy of hPositions) {
                ctx.beginPath();
                ctx.moveTo(rX - 20, hy);
                ctx.lineTo(rX + rW + 20, hy);
                ctx.stroke();
            }

            // --- Rectangle border (prison window frame) ---
            ctx.strokeStyle = '#718096';
            ctx.lineWidth = 8;
            ctx.strokeRect(rX, rY, rW, rH);

            ctx.restore(); // end clip

            // --- Diamond border (drawn on top of clip) ---
            ctx.beginPath();
            ctx.moveTo(dTop.x,    dTop.y);
            ctx.lineTo(dRight.x,  dRight.y);
            ctx.lineTo(dBottom.x, dBottom.y);
            ctx.lineTo(dLeft.x,   dLeft.y);
            ctx.closePath();
            ctx.strokeStyle = 'rgba(255,255,255,0.55)';
            ctx.lineWidth = 7;
            ctx.stroke();

            // ============================================
            // === WHITE L-SHAPED BORDER STRIPS ("THĂM TÙ") ===
            // ============================================
            const stripW = 62; // thickness of L strips
            const margin = 5;  // gap from tile edge

            // --- BOTTOM horizontal white strip ---
            ctx.fillStyle = '#ffffff';
            ctx.fillRect(margin, 512 - margin - stripW, 512 - margin * 2, stripW);

            // Bright white outline for bottom strip
            ctx.strokeStyle = '#ffffff';
            ctx.lineWidth = 5;
            // top line of bottom strip
            ctx.beginPath();
            ctx.moveTo(margin, 512 - margin - stripW);
            ctx.lineTo(512 - margin, 512 - margin - stripW);
            ctx.stroke();
            // bottom line
            ctx.beginPath();
            ctx.moveTo(margin, 512 - margin);
            ctx.lineTo(512 - margin, 512 - margin);
            ctx.stroke();

            // "Thăm tù" text in bottom strip (horizontal)
            ctx.save();
            ctx.textAlign = 'center';
            ctx.textBaseline = 'middle';
            ctx.font = '900 36px "Be Vietnam Pro", sans-serif';
            ctx.fillStyle = '#000000';
            ctx.fillText('Thăm tù', 256, 512 - margin - stripW / 2);
            ctx.restore();

            // --- LEFT vertical white strip ---
            ctx.fillStyle = '#ffffff';
            ctx.fillRect(margin, margin, stripW, 512 - margin * 2 - stripW); // stop before bottom strip corner

            // Bright white outline for left strip
            ctx.strokeStyle = '#ffffff';
            ctx.lineWidth = 5;
            // right line of left strip
            ctx.beginPath();
            ctx.moveTo(margin + stripW, margin);
            ctx.lineTo(margin + stripW, 512 - margin - stripW);
            ctx.stroke();
            // left line
            ctx.beginPath();
            ctx.moveTo(margin, margin);
            ctx.lineTo(margin, 512 - margin);
            ctx.stroke();

            // Bottom connector line joining L-corner
            ctx.beginPath();
            ctx.moveTo(margin, 512 - margin - stripW);
            ctx.lineTo(margin + stripW, 512 - margin - stripW);
            ctx.stroke();

            // "Thăm tù" text in left strip (rotated 90° upward)
            ctx.save();
            ctx.translate(margin + stripW / 2, (512 - margin * 2 - stripW) / 2 + margin);
            ctx.rotate(-Math.PI / 2);
            ctx.textAlign = 'center';
            ctx.textBaseline = 'middle';
            ctx.font = '900 36px "Be Vietnam Pro", sans-serif';
            ctx.fillStyle = '#000000';
            ctx.fillText('Thăm tù', 0, 0);
            ctx.restore();


        } else {
            // === Other corner tiles ===
            ctx.fillStyle = baseColor; ctx.fillRect(0, 0, 512, 512);
            ctx.translate(256, 256);
            if (i === 0) ctx.rotate(-Math.PI / 4);
            if (i === 20) ctx.rotate(Math.PI * 3 / 4);
            if (i === 30) ctx.rotate(-Math.PI * 3 / 4);

            ctx.fillStyle = '#1e293b';
            ctx.textAlign = 'center';
            ctx.textBaseline = 'middle';

            if (i === 0) {
                ctx.font = '900 85px "Be Vietnam Pro", sans-serif'; ctx.fillStyle = '#ef4444'; ctx.fillText('BẮT ĐẦU', 0, -50);
                ctx.font = 'bold 50px "Be Vietnam Pro", sans-serif'; ctx.fillStyle = '#1e293b'; ctx.fillText('Nhận $200', 0, 30);
            } else if (i === 20) {
                ctx.font = '900 70px "Be Vietnam Pro", sans-serif'; ctx.fillText('BÃI ĐỖ XE', 0, -30);
                ctx.font = '900 60px "Be Vietnam Pro", sans-serif'; ctx.fillText('MIỄN PHÍ', 0, 40);
            } else if (i === 30) {
                ctx.font = '900 80px "Be Vietnam Pro", sans-serif'; ctx.fillStyle = '#3b82f6'; ctx.fillText('VÀO TÙ', 0, 0);
            }
        }

    } else {
        canvas.width = 300; canvas.height = 500;
        ctx.fillStyle = baseColor; ctx.fillRect(0, 0, 300, 500);
        ctx.textAlign = 'center';
        
        if (tile.type === TILE_TYPES.PROPERTY) {
            ctx.fillStyle = '#' + tile.color.toString(16).padStart(6, '0');
            ctx.fillRect(0, 0, 300, 120); 
            ctx.fillStyle = 'rgba(0,0,0,0.1)';
            ctx.fillRect(0, 115, 300, 5);
            
            ctx.fillStyle = '#1e293b'; 
            ctx.font = '800 36px "Be Vietnam Pro", sans-serif';
            Utils.wrapText(ctx, tile.name, 150, 180, 260, 44);
            ctx.font = '900 42px "Be Vietnam Pro", sans-serif'; 
            ctx.fillText('$' + tile.price, 150, 450);
        } else {
            ctx.fillStyle = '#1e293b'; 
            ctx.font = '800 40px "Be Vietnam Pro", sans-serif';
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
                ctx.font = '900 42px "Be Vietnam Pro", sans-serif'; 
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


function createDeckMaterial(colorHex, text) {
    const canvas = document.createElement('canvas'); canvas.width = 400; canvas.height = 250;
    const ctx = canvas.getContext('2d');
    ctx.fillStyle = colorHex; ctx.fillRect(0,0,400,250);
    
    // Border
    ctx.strokeStyle = 'rgba(255,255,255,0.3)'; ctx.lineWidth = 15; ctx.strokeRect(15, 15, 370, 220);
    
    // Text
    ctx.fillStyle = '#ffffff'; 
    ctx.font = '900 70px "Be Vietnam Pro", sans-serif'; 
    ctx.textAlign = 'center'; 
    ctx.textBaseline = 'middle';
    ctx.shadowColor = 'rgba(0,0,0,0.5)';
    ctx.shadowBlur = 10;
    ctx.fillText(text, 200, 125);
    
    const texture = new THREE.CanvasTexture(canvas);
    texture.anisotropy = maxAnisotropy;
    return texture;
}

function createDecks() {
    const chanceColor = 0xef4444; // Red
    const chestColor = 0xeab308;  // Yellow

    const chanceSideMat = new THREE.MeshStandardMaterial({ color: chanceColor, metalness: 0.2, roughness: 0.5 });
    const chanceTopMat = new THREE.MeshStandardMaterial({ map: createDeckMaterial('#ef4444', 'CƠ HỘI'), roughness: 0.5 });
    chanceDeck = new THREE.Mesh(new THREE.BoxGeometry(8, 2, 5.5), [chanceSideMat, chanceSideMat, chanceTopMat, chanceSideMat, chanceSideMat, chanceSideMat]);
    chanceDeck.position.set(18, 1.2, -18); chanceDeck.rotation.y = Math.PI / 4;
    chanceDeck.castShadow = true; scene.add(chanceDeck);
    
    const chestSideMat = new THREE.MeshStandardMaterial({ color: chestColor, metalness: 0.2, roughness: 0.5 });
    const chestTopMat = new THREE.MeshStandardMaterial({ map: createDeckMaterial('#eab308', 'KHÍ VẬN'), roughness: 0.5 });
    chestDeck = new THREE.Mesh(new THREE.BoxGeometry(8, 2, 5.5), [chestSideMat, chestSideMat, chestTopMat, chestSideMat, chestSideMat, chestSideMat]);
    chestDeck.position.set(-18, 1.2, 18); chestDeck.rotation.y = Math.PI / 4 + Math.PI; // Rotate so text faces center
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

function createCitySkyline() {
    const cityGroup = new THREE.Group();
    const buildingCount = 60;
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
        
        // Position in a large circle far away
        const angle = (i / buildingCount) * Math.PI * 2 + Math.random() * 0.5;
        const radius = 180 + Math.random() * 50;
        
        building.position.set(
            Math.cos(angle) * radius,
            h / 2 - 20, // Slightly sunken
            Math.sin(angle) * radius
        );
        
        building.lookAt(0, building.position.y, 0);
        
        // Add random windows (emissive points)
        const windowCount = 15;
        const winGeo = new THREE.PlaneGeometry(0.8, 0.8);
        const winMat = new THREE.MeshStandardMaterial({
            color: 0xfde047,
            emissive: 0xfde047,
            emissiveIntensity: 2,
            transparent: true,
            opacity: 0.8
        });

        for (let j = 0; j < windowCount; j++) {
            const win = new THREE.Mesh(winGeo, winMat);
            // Random side
            const face = Math.floor(Math.random() * 4);
            const py = (Math.random() * h) - (h/2);
            const px = (Math.random() * w) - (w/2);
            
            if (face === 0) win.position.set(px, py, d/2 + 0.1);
            else if (face === 1) { win.position.set(px, py, -d/2 - 0.1); win.rotation.y = Math.PI; }
            else if (face === 2) { win.position.set(w/2 + 0.1, py, px); win.rotation.y = Math.PI/2; }
            else { win.position.set(-w/2 - 0.1, py, px); win.rotation.y = -Math.PI/2; }
            
            building.add(win);
        }

        cityGroup.add(building);
    }
    scene.add(cityGroup);

    // Add Stars
    const starGeo = new THREE.BufferGeometry();
    const starCount = 2000;
    const starPositions = new Float32Array(starCount * 3);
    for (let i = 0; i < starCount * 3; i++) {
        starPositions[i] = (Math.random() - 0.5) * 800;
    }
    starGeo.setAttribute('position', new THREE.BufferAttribute(starPositions, 3));
    const starMat = new THREE.PointsMaterial({ color: 0xffffff, size: 0.8, transparent: true, opacity: 0.8 });
    stars = new THREE.Points(starGeo, starMat);
    scene.add(stars);
}

function initPostProcessing() {
    const renderScene = new THREE.RenderPass(scene, camera);

    const bloomPass = new THREE.UnrealBloomPass(
        new THREE.Vector2(window.innerWidth, window.innerHeight),
        1.5,  // Strength
        0.4,  // Radius
        0.85  // Threshold
    );
    bloomPass.threshold = 0.85; // Very high threshold
    bloomPass.strength = 0.4;  // Soft, subtle glow
    bloomPass.radius = 0.3;

    composer = new THREE.EffectComposer(renderer);
    composer.addPass(renderScene);
    composer.addPass(bloomPass);
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
    const roofColor = isHotel ? 0xb91c1c : 0x15803d;
    const windowColor = 0xfff7ed;

    if (isHotel) {
        // --- PREMIUM HOTEL MODEL ---
        // Main building body (Tall and wide)
        const body = new THREE.Mesh(
            new THREE.BoxGeometry(2.2, 2.0, 1.8), 
            new THREE.MeshStandardMaterial({color: baseColor, roughness: 0.3, metalness: 0.2})
        );
        body.position.y = 1.0; body.castShadow = true; group.add(body);

        // Tiered roof / Top part
        const top = new THREE.Mesh(
            new THREE.BoxGeometry(2.4, 0.4, 2.0), 
            new THREE.MeshStandardMaterial({color: roofColor, roughness: 0.4})
        );
        top.position.y = 2.2; top.castShadow = true; group.add(top);

        // Decorative antenna/sign pole
        const pole = new THREE.Mesh(
            new THREE.CylinderGeometry(0.05, 0.05, 0.8),
            new THREE.MeshStandardMaterial({color: 0xcbd5e1, metalness: 0.8})
        );
        pole.position.set(0.6, 2.6, 0.5); group.add(pole);

        // Windows (many rows)
        const winMat = new THREE.MeshStandardMaterial({color: windowColor, emissive: windowColor, emissiveIntensity: 2.0});
        const winGeo = new THREE.BoxGeometry(0.3, 0.3, 0.05);
        for (let row = 0; row < 3; row++) {
            for (let col = 0; col < 3; col++) {
                const win = new THREE.Mesh(winGeo, winMat);
                win.position.set(-0.7 + col * 0.7, 0.5 + row * 0.6, 0.91);
                group.add(win);
                const winBack = win.clone();
                winBack.position.z = -0.91;
                group.add(winBack);
            }
        }
    } else {
        // --- DETAILED HOUSE MODEL ---
        // Main house body
        const body = new THREE.Mesh(
            new THREE.BoxGeometry(1.2, 1.0, 1.1), 
            new THREE.MeshStandardMaterial({color: baseColor, roughness: 0.4, metalness: 0.1})
        );
        body.position.y = 0.5; body.castShadow = true; group.add(body);

        // Peaked Roof
        const roof = new THREE.Mesh(
            new THREE.ConeGeometry(1.1, 0.9, 4), 
            new THREE.MeshStandardMaterial({color: roofColor, roughness: 0.5})
        );
        roof.position.y = 1.45; roof.rotation.y = Math.PI / 4; roof.castShadow = true; group.add(roof);

        // Chimney
        const chimney = new THREE.Mesh(
            new THREE.BoxGeometry(0.3, 0.6, 0.3),
            new THREE.MeshStandardMaterial({color: roofColor})
        );
        chimney.position.set(0.35, 1.2, 0.35); group.add(chimney);

        // Windows (emissive)
        const winMat = new THREE.MeshStandardMaterial({color: windowColor, emissive: windowColor, emissiveIntensity: 2.0});
        const winGeo = new THREE.BoxGeometry(0.25, 0.25, 0.05);
        // Front windows
        const win1 = new THREE.Mesh(winGeo, winMat); win1.position.set(-0.3, 0.6, 0.56); group.add(win1);
        const win2 = new THREE.Mesh(winGeo, winMat); win2.position.set(0.3, 0.6, 0.56); group.add(win2);
        // Back windows
        const win3 = new THREE.Mesh(winGeo, winMat); win3.position.set(-0.3, 0.6, -0.56); group.add(win3);
        const win4 = new THREE.Mesh(winGeo, winMat); win4.position.set(0.3, 0.6, -0.56); group.add(win4);
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
    window.isAnimating = true;
    dice1.visible = true; dice2.visible = true;
    
    // UI Feedback
    const overlay = document.getElementById('dice-overlay');
    const d1ui = document.getElementById('dice-1-ui');
    const d2ui = document.getElementById('dice-2-ui');
    
    overlay.classList.remove('opacity-0', 'scale-50');
    overlay.classList.add('opacity-100', 'scale-100');

    // Random initial rotations
    dice1.rotation.set(Math.random()*Math.PI, Math.random()*Math.PI, Math.random()*Math.PI);
    dice2.rotation.set(Math.random()*Math.PI, Math.random()*Math.PI, Math.random()*Math.PI);

    let startY = 22;
    dice1.position.set(-5, startY, 0); dice2.position.set(5, startY, 0);

    // Removed camera tweening during roll as requested
    
    let frame = 0; const maxFrames = 70;
    function animateRoll() {
        frame++;
        if (frame < maxFrames - 5) {
            let progress = frame / maxFrames;
            dice1.position.y = Math.max(1.5, startY * (1 - progress) + Math.abs(Math.sin(frame*0.5)*8 * (1-progress)));
            dice2.position.y = Math.max(1.5, startY * (1 - progress) + Math.abs(Math.sin(frame*0.5 + 1.2)*8 * (1-progress)));
            
            dice1.rotation.x += 0.6; dice1.rotation.y += 0.4; 
            dice2.rotation.x += 0.4; dice2.rotation.z += 0.6;
            
            // Randomize UI during roll
            if (frame % 5 === 0) {
                d1ui.innerText = Math.floor(Math.random()*6)+1;
                d2ui.innerText = Math.floor(Math.random()*6)+1;
            }

            requestAnimationFrame(animateRoll);
        } else {
            dice1.position.y = 1.5; dice2.position.y = 1.5;
            d1ui.innerText = d1;
            d2ui.innerText = d2;

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
                overlay.classList.add('opacity-0', 'scale-50');
                overlay.classList.remove('opacity-100', 'scale-100');
                
                setTimeout(() => {
                    dice1.visible = false; dice2.visible = false;
                    window.isAnimating = false; 
                    callback(); 
                }, 500);
            }, 1500); 
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
    ctx.fillStyle = '#fff'; ctx.font = '900 60px "Be Vietnam Pro", sans-serif'; ctx.textAlign = 'center';
    ctx.fillText(type, 250, 90);
    ctx.font = '800 40px "Be Vietnam Pro", sans-serif'; Utils.wrapText(ctx, desc, 250, 170, 440, 50);

    const tex = new THREE.CanvasTexture(canvas); tex.anisotropy = maxAnisotropy;
    const sideMat = new THREE.MeshStandardMaterial({ color: colorHex, roughness: 0.8 });
    const faceMat = new THREE.MeshStandardMaterial({ map: tex, roughness: 0.8 });
    const cardMesh = new THREE.Mesh(new THREE.BoxGeometry(10, 0.2, 6), [sideMat, sideMat, faceMat, sideMat, sideMat, sideMat]);
    
    // Position card flush and face-up on board center (Top face is already index 2)
    const targetCardY = 1.05;
    cardMesh.position.set(0, targetCardY, 0); 
    cardMesh.rotation.set(0, 0, 0); // Face-up by default
    scene.add(cardMesh);

    savedCameraPos.copy(camera.position); savedCameraTarget.copy(controls.target);

    // Instant camera switch to top-down view
    let targetCameraPos = new THREE.Vector3(0, 25, 0);
    let lookAtTarget = new THREE.Vector3(0, 0, 0);
    tweenCamera(targetCameraPos, lookAtTarget, 300); // 300ms for a quick snap instead of jumpy 0

    setTimeout(() => {
        scene.remove(cardMesh);
        tweenCamera(savedCameraPos, savedCameraTarget, 600, () => { isAnimating = false; callback(); });
    }, 3500); 
}

function createPlayers(total, mode) {
    // Clear existing players
    if (window.players) window.players.forEach(p => { if(p.mesh) scene.remove(p.mesh); });
    window.players = [];

    const pawnPoints = [];
    for (let i = 0; i < 10; i++) {
        pawnPoints.push(new THREE.Vector2(Math.sin(i * 0.2) * 1.5 + 0.5, (i * 0.4)));
    }
    // Better pawn profile
    const points = [];
    points.push(new THREE.Vector2(0, 0));
    points.push(new THREE.Vector2(1.5, 0));
    points.push(new THREE.Vector2(1.4, 0.4));
    points.push(new THREE.Vector2(1.0, 0.6));
    points.push(new THREE.Vector2(0.6, 2.2));
    points.push(new THREE.Vector2(1.0, 2.4));
    points.push(new THREE.Vector2(0.8, 2.6));
    points.push(new THREE.Vector2(1.2, 3.2));
    points.push(new THREE.Vector2(0, 4.0));
    const pawnGeo = new THREE.LatheGeometry(points, 32);
    
    for (let i = 0; i < total; i++) {
        const mat = new THREE.MeshStandardMaterial({ 
            color: PLAYER_COLORS[i], 
            metalness: 0.6, 
            roughness: 0.2,
            emissive: PLAYER_COLORS[i],
            emissiveIntensity: 0.2
        });
        const mesh = new THREE.Mesh(pawnGeo, mat);
        
        // Safety check for board initialization
        if (boardMeshes && boardMeshes[0]) {
            mesh.position.copy(boardMeshes[0].position);
        } else {
            mesh.position.set(32, 1.0, 32); 
        }
        
        mesh.position.y = 1.0;
        mesh.position.x += (i % 2 === 0 ? 1.5 : -1.5); 
        mesh.position.z += (i > 1 ? 1.5 : -1.5);
        mesh.castShadow = true; 
        scene.add(mesh);

        let pName = mode === 'bot' ? (i === 0 ? "Bạn" : `NPC ${i}`) : (i === 0 ? "Bạn (P1)" : `Người chơi ${i+1}`);
        let isBot = (mode === 'bot' && i > 0);

        window.players.push({
            id: i, name: pName, colorHex: PLAYER_HEX[i],
            mesh: mesh, position: 0, money: GAME_CONFIG.START_MONEY, 
            inJail: false, jailTurns: 0, jailFreeCards: 0, bankrupt: false, isBot: isBot
        });
    }
}
