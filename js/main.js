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

    const ambientLight = new THREE.AmbientLight(0xffffff, 0.6);
    scene.add(ambientLight);

    const dirLight = new THREE.DirectionalLight(0xffffff, 0.8);
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

    window.addEventListener('resize', () => {
        camera.aspect = window.innerWidth / window.innerHeight;
        camera.updateProjectionMatrix();
        renderer.setSize(window.innerWidth, window.innerHeight);
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
                document.getElementById('tile-price').innerText = `Price: ${Utils.formatMoney(data.price)} | Rent: ${Utils.formatMoney(rent)}`;
                let ownerStr = data.owner !== null ? players[data.owner].name : "Bank";
                if(data.houses > 0) ownerStr += ` (${data.houses === 5 ? 'Hotel' : data.houses + ' Houses'})`;
                document.getElementById('tile-owner').innerText = `OWNER: ${ownerStr}`;
            } else {
                document.getElementById('tile-price').innerText = "Special Tile";
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
    if(renderer && scene && camera) renderer.render(scene, camera);
    
    // Animate player meshes
    if(!isAnimating && players) { 
        const time = Date.now() * 0.002; 
        players.forEach(p => { 
            if(!p.bankrupt && p.mesh) {
                p.mesh.rotation.y = time; 
                p.mesh.position.y = 2.5 + Math.sin(time * 2 + p.id) * 0.2;
            } 
        }); 
    }
}

window.onload = init3D;
