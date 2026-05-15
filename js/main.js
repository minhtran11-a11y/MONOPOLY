// --- THREE.JS INITIALIZATION ---
function init3D() {
    scene = new THREE.Scene();
    scene.background = new THREE.Color(0x0f172a);
    
    camera = new THREE.PerspectiveCamera(45, window.innerWidth / window.innerHeight, 1, 1000);
    camera.position.set(0, 75, 75);

    renderer = new THREE.WebGLRenderer({ antialias: true });
    renderer.setSize(window.innerWidth, window.innerHeight);
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;
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
    initPostProcessing(); // Premium Glow

    window.addEventListener('resize', () => {
        camera.aspect = window.innerWidth / window.innerHeight;
        camera.updateProjectionMatrix();
        renderer.setSize(window.innerWidth, window.innerHeight);
        if (composer) composer.setSize(window.innerWidth, window.innerHeight);
    });
    
    const raycaster = new THREE.Raycaster();
    const mouse = new THREE.Vector2();
    const tileInfo = document.getElementById('tile-info');
    
    window.addEventListener('mousemove', (e) => {
        mouse.x = (e.clientX / window.innerWidth) * 2 - 1;
        mouse.y = -(e.clientY / window.innerHeight) * 2 + 1;
        raycaster.setFromCamera(mouse, camera);
        const intersects = raycaster.intersectObjects(boardMeshes);
        
        if (intersects.length > 0) {
            const data = intersects[0].object.userData;
            tileInfo.classList.remove('translate-y-32', 'opacity-0');
            document.getElementById('tile-name').innerText = data.name;
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
        }
    });
    animateLoop();
}

function animateLoop() {
    requestAnimationFrame(animateLoop);
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
    
    // Animate player meshes
    if(!isAnimating && players) { 
        const time = Date.now() * 0.002; 
        players.forEach(p => { 
            if(!p.bankrupt && p.mesh) {
                // Keep them static on the board
                p.mesh.position.y = 1.0; 
            } 
        }); 
    }
}

// Initialize when DOM is ready
if (document.readyState === 'complete' || document.readyState === 'interactive') {
    init3D();
    initMoneyBackground();
} else {
    document.addEventListener('DOMContentLoaded', () => {
        init3D();
        initMoneyBackground();
    });
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
        ctx.font = `bold ${b.size * 0.8}px Arial`;
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
