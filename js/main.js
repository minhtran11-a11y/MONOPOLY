// --- THREE.JS INITIALIZATION ---
function init3D() {
    scene = new THREE.Scene();
    scene.background = new THREE.Color(0x0f172a);
    // Atmospheric fog: gives depth + softens distant skyline
    scene.fog = new THREE.Fog(0x0f172a, 95, 320);

    camera = new THREE.PerspectiveCamera(45, window.innerWidth / window.innerHeight, 1, 1000);
    camera.position.set(0, 75, 75);

    const tier = (window.Settings && window.Settings.graphicsTier()) || 'high';
    const isLow = tier === 'low';
    const isMed = tier === 'med';

    renderer = new THREE.WebGLRenderer({ antialias: !isLow, powerPreference: isLow ? 'low-power' : 'high-performance' });
    renderer.setSize(window.innerWidth, window.innerHeight);
    // Cap pixel ratio per tier to protect mobile GPUs
    const dpr = window.devicePixelRatio || 1;
    renderer.setPixelRatio(isLow ? Math.min(dpr, 1) : isMed ? Math.min(dpr, 1.5) : Math.min(dpr, 2));
    renderer.shadowMap.enabled = !isLow;
    renderer.shadowMap.type = isMed ? THREE.PCFShadowMap : THREE.PCFSoftShadowMap;
    document.getElementById('canvas-container').appendChild(renderer.domElement);
    
    maxAnisotropy = renderer.capabilities.getMaxAnisotropy();

    controls = new THREE.OrbitControls(camera, renderer.domElement);
    controls.enableDamping = true;
    controls.dampingFactor = 0.05;
    controls.maxPolarAngle = Math.PI / 2.1;
    controls.minDistance = 30;
    controls.maxDistance = 140;

    const ambientLight = new THREE.AmbientLight(0xffffff, 0.40);
    scene.add(ambientLight);

    const dirLight = new THREE.DirectionalLight(0xffffff, 0.62);
    dirLight.position.set(50, 100, 50);
    dirLight.castShadow = true;
    dirLight.shadow.mapSize.width = 2048;
    dirLight.shadow.mapSize.height = 2048;
    dirLight.shadow.camera.near = 0.5;
    dirLight.shadow.camera.far = 500;
    dirLight.shadow.camera.left = -100;
    dirLight.shadow.camera.right = 100;
    dirLight.shadow.camera.top = 100;
    dirLight.shadow.camera.bottom = -100;
    scene.add(dirLight);

    createCenterLogo();
    createBoard();
    createDecks();
    createDice();
    createCitySkyline(); // Premium background
    if (window.createCornerLandmarks) window.createCornerLandmarks(scene); // VN landmarks

    // Lazy-load postprocessing CDN to keep LCP fast; init when ready
    if (window._loadPostFX) {
        window._loadPostFX().then(() => {
            if (typeof initPostProcessing === 'function') initPostProcessing();
        }).catch(() => {
            // Fallback: continue with basic renderer.render() — animateLoop already handles this
        });
    } else if (typeof initPostProcessing === 'function') {
        initPostProcessing();
    }

    // Expose live globals for cinematics / persistence / physics / debugging
    window.scene = scene;
    window.camera = camera;
    window.controls = controls;
    window.renderer = renderer;
    window.tweenCamera = tweenCamera;
    window.boardMeshes = boardMeshes;
    window.dice1 = dice1;
    window.dice2 = dice2;

    // Pre-warm dice physics on idle so the first roll uses real cannon-es
    if (window.DicePhysics) {
        const idle = window.requestIdleCallback || ((fn) => setTimeout(fn, 1500));
        idle(() => { window.DicePhysics.ensureReady(); });
    }

    window.addEventListener('resize', () => {
        camera.aspect = window.innerWidth / window.innerHeight;
        camera.updateProjectionMatrix();
        renderer.setSize(window.innerWidth, window.innerHeight);
        if (composer) composer.setSize(window.innerWidth, window.innerHeight);
    });
    
    const raycaster = new THREE.Raycaster();
    const mouse = new THREE.Vector2();
    const tileInfo = document.getElementById('tile-info');
    
    // Click on tile → open property card popup
    renderer.domElement.addEventListener('click', (e) => {
        const r = renderer.domElement.getBoundingClientRect();
        mouse.x = ((e.clientX - r.left) / r.width) * 2 - 1;
        mouse.y = -((e.clientY - r.top) / r.height) * 2 + 1;
        raycaster.setFromCamera(mouse, camera);
        const intersects = raycaster.intersectObjects(boardMeshes);
        if (intersects.length > 0 && window.PropertyCard) {
            const tileId = intersects[0].object.userData.id;
            if (tileId !== undefined && boardData[tileId]) {
                window.PropertyCard.open(boardData[tileId]);
            }
        }
    });

    let _hoveredTile = null;
    function clearHoverLift() {
        if (_hoveredTile) {
            _hoveredTile.position.y = 0.5;
            if (_hoveredTile.userData._glowMesh) {
                _hoveredTile.remove(_hoveredTile.userData._glowMesh);
                _hoveredTile.userData._glowMesh = null;
            }
            _hoveredTile = null;
        }
    }

    window.addEventListener('mousemove', (e) => {
        mouse.x = (e.clientX / window.innerWidth) * 2 - 1;
        mouse.y = -(e.clientY / window.innerHeight) * 2 + 1;
        raycaster.setFromCamera(mouse, camera);
        const intersects = raycaster.intersectObjects(boardMeshes);

        if (intersects.length > 0) {
            const data = intersects[0].object.userData;
            const hit = intersects[0].object;

            // Tile hover lift + group color glow rim (skip while animating)
            if (!window.isAnimating && hit !== _hoveredTile) {
                clearHoverLift();
                _hoveredTile = hit;
                hit.position.y = 0.82; // slight lift
                // Glow rim using player-group color or tile color
                const colorVal = (typeof data.color === 'number' && data.color !== 0xFFFFFF) ? data.color : 0x60a5fa;
                const glowGeo = new THREE.BoxGeometry(6.2, 0.08, 10.2);
                const glowMat = new THREE.MeshBasicMaterial({
                    color: colorVal, transparent: true, opacity: 0.55
                });
                const glow = new THREE.Mesh(glowGeo, glowMat);
                glow.position.y = 0.56;
                hit.add(glow);
                hit.userData._glowMesh = glow;
            }

            tileInfo.classList.remove('translate-y-32', 'opacity-0');
            document.getElementById('tile-name').innerText = data.name;
            // First-hover hint per tile type
            if (window.HintHover) window.HintHover.maybeShow(data.type);
            document.getElementById('tile-color').style.backgroundColor = '#' + data.color.toString(16).padStart(6, '0');
            
            if (data.type === TILE_TYPES.PROPERTY || data.type === TILE_TYPES.RAILROAD || data.type === TILE_TYPES.UTILITY) {
                let rent = calculateRent(data);
                document.getElementById('tile-price').innerText = `Giá: ${Utils.formatMoney(data.price)} | Thuê: ${Utils.formatMoney(rent)}`;
                let ownerStr = data.owner !== null ? players[data.owner].name : "Ngân Hàng";
                if(data.houses > 0) ownerStr += ` (${data.houses === 5 ? 'Khách sạn' : data.houses + ' Nhà'})`;
                document.getElementById('tile-owner').innerText = `CHỦ SỞ HỮU: ${ownerStr}`;
            } else {
                document.getElementById('tile-price').innerText = "Ô Chức Năng";
                document.getElementById('tile-owner').innerText = "";
            }
        } else {
            tileInfo.classList.add('translate-y-32', 'opacity-0');
            clearHoverLift();
        }
    });
    animateLoop();
}

let _renderPaused = false;
let _lastRenderT = 0;
document.addEventListener('visibilitychange', () => {
    _renderPaused = document.hidden;
    if (window.SoundFX && document.hidden) {
        window.SoundFX.stopBGM();
    } else if (window.SoundFX && !document.hidden && window.Settings && window.Settings.get().bgmEnabled) {
        window.SoundFX.startBGM();
    }
});

function _isMenuVisible() {
    const m = document.getElementById('main-menu-layer');
    return m && !m.classList.contains('hidden');
}

function animateLoop() {
    requestAnimationFrame(animateLoop);
    if (_renderPaused) return;
    // Throttle render to ~10fps while still on the main menu — saves CPU/TBT
    // during initial load + Lighthouse audits. Full FPS once in-game.
    const now = performance.now();
    const minFrameMs = _isMenuVisible() ? 100 : 0;
    if (now - _lastRenderT < minFrameMs) return;
    _lastRenderT = now;
    if (isCameraAnimating && cameraAnimConfig) {
        let now = Date.now(), progress = (now - cameraAnimConfig.startTime) / cameraAnimConfig.duration;
        if (progress > 1) progress = 1;
        let ease = Utils.easeInOutCubic(progress);
        camera.position.lerpVectors(cameraAnimConfig.startPos, cameraAnimConfig.endPos, ease);
        controls.target.lerpVectors(cameraAnimConfig.startTarget, cameraAnimConfig.endTarget, ease);
        if (progress === 1) { 
            isCameraAnimating = false; 
            if(controls) controls.enabled = true; 
            if (cameraAnimConfig.onComplete) cameraAnimConfig.onComplete(); 
            cameraAnimConfig = null; 
        }
    }
    if(controls && !isCameraAnimating) controls.update();
    
    // Render with Bloom if available
    if (composer) {
        composer.render();
    } else if(renderer && scene && camera) {
        renderer.render(scene, camera);
    }
    
    // Animate stars
    if (stars) {
        stars.rotation.y += 0.0002;
        stars.rotation.x += 0.0001;
    }
    
    // Animate player meshes — idle bouncing + active glow
    if(window.players) {
        const time = Date.now() * 0.002;
        const reduced = window.Settings && window.Settings.isReducedMotion();
        window.players.forEach((p, idx) => {
            if (p.bankrupt || !p.mesh) return;
            const isCurrent = (window.Game && window.Game.currentPlayerIndex === idx);
            // Idle bob (skip during move animation to avoid double-control)
            if (!window.isAnimating && !reduced) {
                const amp = isCurrent ? 0.18 : 0.08;
                const speed = isCurrent ? 2.5 : 1.5;
                const phase = (p.idleOffset || 0);
                p.mesh.position.y = (p.baseY || 1.0) + Math.sin(time * speed + phase) * amp;
                p.mesh.rotation.y += isCurrent ? 0.004 : 0.001;
            } else if (reduced) {
                p.mesh.position.y = p.baseY || 1.0;
            }
        });
    }
}

// Initialize money-bill canvas background immediately (cheap, behind menu).
// Defer the heavy Three.js scene until user actually launches a game — menu
// is fully opaque so the 3D canvas is never visible until then. This keeps
// LCP/TBT low during menu, which dominates Lighthouse measurement window.
let _3dInited = false;
window.ensure3DInit = function () {
    if (_3dInited) return;
    _3dInited = true;
    init3D();
};

function _bootMenu() {
    initMoneyBackground();
    // 3D init is deferred until launchGame. Menu is fully opaque, so the user
    // never sees the 3D canvas before clicking start. This keeps Lighthouse
    // LCP/TBT measurements clean.
}
if (document.readyState === 'complete' || document.readyState === 'interactive') {
    _bootMenu();
} else {
    document.addEventListener('DOMContentLoaded', _bootMenu);
}

function initMoneyBackground() {
    const canvas = document.getElementById('money-bg');
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    let width, height;
    
    const bills = [];
    const billCount = 50;
    
    function resize() {
        width = canvas.width = window.innerWidth;
        height = canvas.height = window.innerHeight;
    }
    
    window.addEventListener('resize', resize);
    resize();
    
    for (let i = 0; i < billCount; i++) {
        bills.push({
            x: Math.random() * width,
            y: Math.random() * height,
            size: 15 + Math.random() * 20,
            speed: 1 + Math.random() * 2,
            rot: Math.random() * Math.PI * 2,
            rotSpeed: (Math.random() - 0.5) * 0.05,
            opacity: 0.1 + Math.random() * 0.5
        });
    }
    
    function drawBill(b) {
        ctx.save();
        ctx.translate(b.x, b.y);
        ctx.rotate(b.rot);
        ctx.globalAlpha = b.opacity;
        
        // Draw bill body
        ctx.fillStyle = '#22c55e'; // Emerald 500
        ctx.fillRect(-b.size, -b.size/2, b.size * 2, b.size);
        
        // Border
        ctx.strokeStyle = '#fff';
        ctx.lineWidth = 2;
        ctx.strokeRect(-b.size, -b.size/2, b.size * 2, b.size);
        
        // Detail / $
        ctx.fillStyle = '#fff';
        ctx.font = `bold ${b.size * 0.8}px "Be Vietnam Pro", sans-serif`;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText('$', 0, 0);
        
        ctx.restore();
    }
    
    function animate() {
        ctx.clearRect(0, 0, width, height);
        
        bills.forEach(b => {
            b.y += b.speed;
            b.rot += b.rotSpeed;
            b.x += Math.sin(b.y * 0.01) * 0.5; // Slight sway
            
            if (b.y > height + 50) {
                b.y = -50;
                b.x = Math.random() * width;
            }
            
            drawBill(b);
        });
        
        requestAnimationFrame(animate);
    }
    
    animate();
}
