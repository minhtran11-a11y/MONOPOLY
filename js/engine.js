// Shared 3D context — single mutable object visible to all scripts (classic + ESM).
// Initialized lazily inside init3D() — THREE is loaded on demand to keep LCP fast.
const ctx3d = {
    scene: null, camera: null, renderer: null, controls: null,
    boardMeshes: [],
    maxAnisotropy: 1,
    isCameraAnimating: false,
    cameraAnimConfig: null,
    savedCameraPos: null,
    savedCameraTarget: null,
    dice1: null, dice2: null,
    chanceDeck: null, chestDeck: null,
    composer: null, // For Bloom effect
    stars: null,    // For background atmosphere
};
window.ctx3d = ctx3d; // LEGACY-BRIDGE

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
    ctx.fillText('MONOPOLY', 512, 450);
    
    // Subtext
    ctx.shadowBlur = 10;
    ctx.shadowOffsetY = 5;
    ctx.font = 'italic 800 90px "Be Vietnam Pro", sans-serif';
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
    ctx3d.scene.add(centerMesh);
}

function createBoard() {
    ctx3d.boardMeshes = [];
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
        mesh.userData = { tileId: i, position: mesh.position.clone() };

        // Subtle edge highlight
        const edges = new THREE.EdgesGeometry(geo);
        const line = new THREE.LineSegments(edges, new THREE.LineBasicMaterial({ color: 0x444444, transparent: true, opacity: 0.3 }));
        mesh.add(line);

        ctx3d.scene.add(mesh);
        ctx3d.boardMeshes.push(mesh);
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

    // Bake a vignette-style ambient-occlusion overlay onto the tile texture
    // so edges/corners are darker, faking AO without a heavy SSAO pass.
    {
        const w = canvas.width, h = canvas.height;
        const aoCtx = canvas.getContext('2d');
        const grad = aoCtx.createRadialGradient(w/2, h/2, Math.min(w, h) * 0.25, w/2, h/2, Math.max(w, h) * 0.7);
        grad.addColorStop(0,   'rgba(0,0,0,0)');
        grad.addColorStop(0.7, 'rgba(0,0,0,0.0)');
        grad.addColorStop(1,   'rgba(0,0,0,0.32)');
        aoCtx.globalCompositeOperation = 'multiply';
        aoCtx.fillStyle = grad;
        aoCtx.fillRect(0, 0, w, h);
        aoCtx.globalCompositeOperation = 'source-over';
    }

    const texture = new THREE.CanvasTexture(canvas);
    texture.anisotropy = ctx3d.maxAnisotropy;
    // PBR-ish: aoMap requires UV2; we baked into base map for simplicity.
    const sideMat = new THREE.MeshStandardMaterial({
        color: baseColor, roughness: 0.85, metalness: 0.08
    });
    const topMat = new THREE.MeshStandardMaterial({
        map: texture, roughness: 0.55, metalness: 0.15,
        envMapIntensity: 0.6
    });
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
    texture.anisotropy = ctx3d.maxAnisotropy;
    return texture;
}

function createDecks() {
    const chanceColor = 0xef4444; // Red
    const chestColor = 0xeab308;  // Yellow

    const chanceSideMat = new THREE.MeshStandardMaterial({ color: chanceColor, metalness: 0.2, roughness: 0.5 });
    const chanceTopMat = new THREE.MeshStandardMaterial({ map: createDeckMaterial('#ef4444', 'CƠ HỘI'), roughness: 0.5 });
    ctx3d.chanceDeck = new THREE.Mesh(new THREE.BoxGeometry(8, 2, 5.5), [chanceSideMat, chanceSideMat, chanceTopMat, chanceSideMat, chanceSideMat, chanceSideMat]);
    ctx3d.chanceDeck.position.set(18, 1.2, -18); ctx3d.chanceDeck.rotation.y = Math.PI / 4;
    ctx3d.chanceDeck.castShadow = true; ctx3d.scene.add(ctx3d.chanceDeck);
    
    const chestSideMat = new THREE.MeshStandardMaterial({ color: chestColor, metalness: 0.2, roughness: 0.5 });
    const chestTopMat = new THREE.MeshStandardMaterial({ map: createDeckMaterial('#eab308', 'KHÍ VẬN'), roughness: 0.5 });
    ctx3d.chestDeck = new THREE.Mesh(new THREE.BoxGeometry(8, 2, 5.5), [chestSideMat, chestSideMat, chestTopMat, chestSideMat, chestSideMat, chestSideMat]);
    ctx3d.chestDeck.position.set(-18, 1.2, 18); ctx3d.chestDeck.rotation.y = Math.PI / 4 + Math.PI; // Rotate so text faces center
    ctx3d.chestDeck.castShadow = true; ctx3d.scene.add(ctx3d.chestDeck);
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
    
    ctx3d.dice1 = new THREE.Mesh(diceGeo, getDiceMats());
    ctx3d.dice1.position.set(-3, 10, 0); ctx3d.dice1.castShadow = true; ctx3d.dice1.visible = false; ctx3d.scene.add(ctx3d.dice1);

    ctx3d.dice2 = new THREE.Mesh(diceGeo, getDiceMats());
    ctx3d.dice2.position.set(3, 10, 0); ctx3d.dice2.castShadow = true; ctx3d.dice2.visible = false; ctx3d.scene.add(ctx3d.dice2);
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

        // Flag pole + flag on roof
        const pole = new THREE.Mesh(
            new THREE.CylinderGeometry(0.05, 0.05, 1.2),
            new THREE.MeshStandardMaterial({color: 0xcbd5e1, metalness: 0.85, roughness: 0.2})
        );
        pole.position.set(-0.7, 3.0, 0.5); group.add(pole);

        const flag = new THREE.Mesh(
            new THREE.PlaneGeometry(0.7, 0.45),
            new THREE.MeshStandardMaterial({
                color: 0xef4444, side: THREE.DoubleSide,
                emissive: 0xef4444, emissiveIntensity: 0.4
            })
        );
        flag.position.set(-0.35, 3.25, 0.5); group.add(flag);
        // Gold star center on flag
        const star = new THREE.Mesh(
            new THREE.CircleGeometry(0.09, 5),
            new THREE.MeshStandardMaterial({ color: 0xfde047, emissive: 0xfde047, emissiveIntensity: 1.4 })
        );
        star.position.set(-0.35, 3.25, 0.51); group.add(star);

        // Neon "HOTEL" sign on top
        const neonMat = new THREE.MeshStandardMaterial({
            color: 0xfde047, emissive: 0xfde047, emissiveIntensity: 2.5
        });
        const neonStrip = new THREE.Mesh(new THREE.BoxGeometry(1.6, 0.2, 0.06), neonMat);
        neonStrip.position.set(0, 2.55, 0.95); group.add(neonStrip);
        const neonStrip2 = neonStrip.clone();
        neonStrip2.position.z = -0.95; neonStrip2.rotation.y = Math.PI; group.add(neonStrip2);
        group.userData.neonStrips = [neonStrip, neonStrip2];

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
    const tileMesh = ctx3d.boardMeshes[tileIdx];

    const previousCount = (tile.houseMeshes && tile.houseMeshes.length) || 0;
    if (tile.houseMeshes) tile.houseMeshes.forEach(h => tileMesh.remove(h));
    tile.houseMeshes = [];
    if (tile.houses === 0) return;

    const localZ = -3.8;
    const localY = 0.5;
    const newestIdx = tile.houses - 1;

    if (tile.houses === 5) {
        const hotel = createBuilding(true);
        hotel.position.set(0, localY, localZ);
        tileMesh.add(hotel); tile.houseMeshes.push(hotel);
        if (tile.houses !== previousCount && window.Anim3D) {
            window.Anim3D.growIn(hotel, 700);
            window.Anim3D.dustBurst(tileMesh, 0, localY, localZ, 14);
        }
    } else {
        const spacing = 1.3;
        const startOffset = -((tile.houses - 1) * spacing) / 2;
        for (let k = 0; k < tile.houses; k++) {
            const house = createBuilding(false);
            const x = startOffset + k * spacing;
            house.position.set(x, localY, localZ);
            tileMesh.add(house); tile.houseMeshes.push(house);
            if (k === newestIdx && tile.houses > previousCount && window.Anim3D) {
                window.Anim3D.growIn(house, 600);
                window.Anim3D.dustBurst(tileMesh, x, localY, localZ, 8);
            }
        }
    }
    applyMortgageVisual(tileIdx);
}


function tweenCamera(endPos, endTarget, duration, callback) {
    if(ctx3d.controls) ctx3d.controls.enabled = false;
    ctx3d.cameraAnimConfig = {
        startPos: ctx3d.camera.position.clone(), endPos: endPos.clone(),
        startTarget: ctx3d.controls.target.clone(), endTarget: endTarget.clone(),
        startTime: Date.now(), duration: duration, onComplete: callback
    };
    ctx3d.isCameraAnimating = true;
}

// rollDiceAnimation lives in js/dice_anim.js to keep engine.js < 800 LOC.

function showCardAnimation(type, desc, colorHex, sourceZ, callback) {
    window.isAnimating = true;
    const canvas = document.createElement('canvas'); canvas.width = 500; canvas.height = 300;
    const ctx = canvas.getContext('2d');
    ctx.fillStyle = colorHex; ctx.fillRect(0,0,500,300);
    ctx.lineWidth = 15; ctx.strokeStyle = '#fff'; ctx.strokeRect(10,10,480,280);
    ctx.fillStyle = '#fff'; ctx.font = '900 60px "Be Vietnam Pro", sans-serif'; ctx.textAlign = 'center';
    ctx.fillText(type, 250, 90);
    ctx.font = '800 40px "Be Vietnam Pro", sans-serif'; Utils.wrapText(ctx, desc, 250, 170, 440, 50);

    const tex = new THREE.CanvasTexture(canvas); tex.anisotropy = ctx3d.maxAnisotropy;
    const sideMat = new THREE.MeshStandardMaterial({ color: colorHex, roughness: 0.8 });
    const faceMat = new THREE.MeshStandardMaterial({ map: tex, roughness: 0.8 });
    const cardMesh = new THREE.Mesh(new THREE.BoxGeometry(10, 0.2, 6), [sideMat, sideMat, faceMat, sideMat, sideMat, sideMat]);
    
    // Elevate card so it's visible from the current camera angle
    cardMesh.position.set(0, 8, 0); 
    cardMesh.rotation.set(0, 0, 0);
    ctx3d.scene.add(cardMesh);

    // No camera movement — keep whatever angle the player chose
    setTimeout(() => {
        ctx3d.scene.remove(cardMesh);
        window.isAnimating = false;
        callback();
    }, 3500); 
}

function createPlayers(total, mode) {
    // Clear existing players
    if (window.players) window.players.forEach(p => { if(p.mesh) ctx3d.scene.remove(p.mesh); });
    window.players = [];

    for (let i = 0; i < total; i++) {
        const colorHex = PLAYER_COLORS[i];
        // Use Vietnam-themed token if factory is loaded; otherwise fall back to a basic mesh.
        let mesh;
        if (window.TokenFactory) {
            mesh = window.TokenFactory.create(i, colorHex);
        } else {
            const fallbackGeo = new THREE.ConeGeometry(0.8, 2.4, 16);
            mesh = new THREE.Mesh(fallbackGeo, new THREE.MeshStandardMaterial({ color: colorHex }));
        }

        // Safety check for board initialization
        if (ctx3d.boardMeshes && ctx3d.boardMeshes[0]) {
            mesh.position.copy(ctx3d.boardMeshes[0].position);
        } else {
            mesh.position.set(32, 1.0, 32);
        }
        mesh.position.y = 1.0;
        mesh.position.x += (i % 2 === 0 ? 1.5 : -1.5);
        mesh.position.z += (i > 1 ? 1.5 : -1.5);
        mesh.castShadow = true;
        // Tokens are oriented; rotate so they face inward toward center for variety
        mesh.rotation.y = Math.PI * (i / total);
        ctx3d.scene.add(mesh);

        const pName = mode === 'bot'
            ? (i === 0 ? "Bạn" : `NPC ${i}`)
            : (i === 0 ? "Bạn (P1)" : `Người chơi ${i+1}`);
        const isBot = (mode === 'bot' && i > 0);
        const tokenKind = (window.TokenFactory && window.TokenFactory.NAMES) ? window.TokenFactory.NAMES[i % 4] : '';

        window.players.push({
            id: i, name: pName, colorHex: PLAYER_HEX[i], tokenKind,
            mesh: mesh, position: 0, money: GAME_CONFIG.START_MONEY,
            inJail: false, jailTurns: 0, jailFreeCards: 0, bankrupt: false, isBot: isBot,
            // Animation state (squash/stretch, idle bobbing)
            baseY: 1.0, hopT: 0, idleOffset: i * 0.4
        });
    }
}
