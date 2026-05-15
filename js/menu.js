// --- MENU MANAGER ---
function drawMenuLogo() {
    const canvas = document.getElementById('menu-logo-canvas');
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    
    // Background - Dark Slate with radial gradient
    const grad = ctx.createRadialGradient(512, 512, 0, 512, 512, 800);
    grad.addColorStop(0, '#1e293b');
    grad.addColorStop(1, '#0f172a');
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, 1024, 1024);

    // Rounded corners clip
    const r = 60;
    ctx.beginPath();
    ctx.moveTo(r, 0);
    ctx.lineTo(1024 - r, 0);
    ctx.quadraticCurveTo(1024, 0, 1024, r);
    ctx.lineTo(1024, 1024 - r);
    ctx.quadraticCurveTo(1024, 1024, 1024 - r, 1024);
    ctx.lineTo(r, 1024);
    ctx.quadraticCurveTo(0, 1024, 0, 1024 - r);
    ctx.lineTo(0, r);
    ctx.quadraticCurveTo(0, 0, r, 0);
    ctx.closePath();
    ctx.clip();
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
    ctx.font = 'italic 800 90px "Be Vietnam Pro", sans-serif';
    ctx.fillStyle = '#fbbf24';
    ctx.fillText('VIỆT NAM', 512, 590);

    // Decorative Emoji
    ctx.shadowBlur = 0;
    ctx.font = '100px "Segoe UI Emoji", sans-serif';
    ctx.fillText('🎲', 180, 512);
    ctx.fillText('💰', 844, 512);
}

const MenuManager = {
    screens: {},
    currentScreen: 'screen-intro',
    currentUser: null,

    init() {
        drawMenuLogo();
        // Cache screens
        ['screen-intro', 'screen-modes', 'screen-bot-detail', 'screen-auth', 'screen-online-detail', 'screen-online-lobby'].forEach(id => {
            this.screens[id] = document.getElementById(id);
        });

        // Event listeners
        document.getElementById('btn-start-game').onclick = () => {
            if(window.SoundFX) window.SoundFX.click();
            this.showScreen('screen-modes');
        };

        document.getElementById('mode-bot-trigger').onclick = () => {
            if(window.SoundFX) window.SoundFX.click();
            this.showScreen('screen-bot-detail');
        };

        document.getElementById('mode-online-trigger').onclick = () => {
            if(window.SoundFX) window.SoundFX.click();
            this.showScreen('screen-auth');
        };

        document.getElementById('btn-login-confirm').onclick = () => {
            if(window.SoundFX) window.SoundFX.click();
            const user = document.getElementById('login-username').value.trim();
            const pass = document.getElementById('login-password').value.trim();
            const errorEl = document.getElementById('login-error');

            if (!user || !pass) {
                errorEl.innerText = "Vui lòng nhập đầy đủ thông tin.";
                errorEl.classList.remove('hidden');
                return;
            }

            const accounts = JSON.parse(localStorage.getItem('monopoly_accounts') || '{}');
            if (accounts[user] && accounts[user] === pass) {
                errorEl.classList.add('hidden');
                const btn = document.getElementById('btn-login-confirm');
                const original = btn.innerText;
                btn.innerHTML = '<span class="animate-spin inline-block mr-2">⏳</span> ĐANG XỬ LÝ...';
                btn.classList.add('opacity-50', 'pointer-events-none');
                
                setTimeout(() => {
                    btn.innerHTML = original;
                    btn.classList.remove('opacity-50', 'pointer-events-none');
                    this.currentUser = { name: user };
                    this.showScreen('screen-online-detail');
                }, 1000);
            } else {
                errorEl.innerText = "Tên đăng nhập hoặc mật khẩu không đúng.";
                errorEl.classList.remove('hidden');
            }
        };

        document.getElementById('btn-register-confirm').onclick = () => {
            if(window.SoundFX) window.SoundFX.click();
            const user = document.getElementById('reg-username').value.trim();
            const pass = document.getElementById('reg-password').value.trim();
            const confirm = document.getElementById('reg-password-confirm').value.trim();
            const errorEl = document.getElementById('reg-error');
            const successEl = document.getElementById('reg-success');

            errorEl.classList.add('hidden');
            successEl.classList.add('hidden');

            if (user.length < 3) {
                errorEl.innerText = "Tên đăng nhập phải có ít nhất 3 ký tự.";
                errorEl.classList.remove('hidden');
                return;
            }
            if (pass.length < 4) {
                errorEl.innerText = "Mật khẩu phải có ít nhất 4 ký tự.";
                errorEl.classList.remove('hidden');
                return;
            }
            if (pass !== confirm) {
                errorEl.innerText = "Mật khẩu xác nhận không khớp.";
                errorEl.classList.remove('hidden');
                return;
            }

            const accounts = JSON.parse(localStorage.getItem('monopoly_accounts') || '{}');
            if (accounts[user]) {
                errorEl.innerText = "Tên đăng nhập đã tồn tại.";
                errorEl.classList.remove('hidden');
                return;
            }

            accounts[user] = pass;
            localStorage.setItem('monopoly_accounts', JSON.stringify(accounts));
            successEl.innerText = "Đăng ký thành công! Hãy chuyển sang Đăng nhập.";
            successEl.classList.remove('hidden');
            
            // Clear inputs
            document.getElementById('reg-username').value = "";
            document.getElementById('reg-password').value = "";
            document.getElementById('reg-password-confirm').value = "";
        };

        // Back buttons
        document.querySelectorAll('.back-to-intro').forEach(btn => {
            btn.onclick = () => {
                if(window.SoundFX) window.SoundFX.click();
                this.showScreen('screen-intro');
            };
        });

        document.querySelectorAll('.back-to-modes').forEach(btn => {
            btn.onclick = () => {
                if(window.SoundFX) window.SoundFX.click();
                this.showScreen('screen-modes');
            };
        });
    },

    showScreen(screenId) {
        // Hide all screens
        Object.values(this.screens).forEach(s => {
            if (s) s.classList.add('hidden');
        });
        
        // Show target screen
        const target = this.screens[screenId];
        if (target) {
            target.classList.remove('hidden');
            target.classList.add('animate-in', 'fade-in', 'zoom-in', 'duration-500');
            
            // Refresh public rooms list if opening online screen
            if (screenId === 'screen-online-detail' && typeof updatePublicRoomsUI === 'function') {
                updatePublicRoomsUI();
            }
        }
        this.currentScreen = screenId;
    },

    launchGame(totalPlayers, mode) {
        if(window.SoundFX) window.SoundFX.click();
        
        // Hide Menu Layer
        const mainMenu = document.getElementById('main-menu-layer');
        mainMenu.classList.add('opacity-0', 'scale-110');
        
        setTimeout(() => {
            mainMenu.classList.add('hidden');
            // Show HUD Layer
            document.getElementById('game-ui-layer').classList.remove('opacity-0', 'hidden');
            
            // Start the actual 3D game
            if(typeof Game !== 'undefined') {
                Game.init(totalPlayers, mode);
            }
        }, 700);
    }
};

document.addEventListener('DOMContentLoaded', () => MenuManager.init());

window.switchAuthTab = (tab) => {
    if(window.SoundFX) window.SoundFX.click();
    const isLogin = tab === 'login';
    
    // Toggle Titles
    document.getElementById('auth-title').innerText = isLogin ? 'Đăng nhập' : 'Đăng ký';
    
    // Toggle Forms
    document.getElementById('form-login').classList.toggle('hidden', !isLogin);
    document.getElementById('form-register').classList.toggle('hidden', isLogin);
    
    // Toggle Tab Buttons UI
    const tabLogin = document.getElementById('tab-login');
    const tabRegister = document.getElementById('tab-register');
    
    if (isLogin) {
        tabLogin.classList.add('bg-rose-600', 'text-white');
        tabLogin.classList.remove('text-slate-400');
        tabRegister.classList.remove('bg-emerald-600', 'text-white');
        tabRegister.classList.add('text-slate-400');
    } else {
        tabRegister.classList.add('bg-emerald-600', 'text-white');
        tabRegister.classList.remove('text-slate-400');
        tabLogin.classList.remove('bg-rose-600', 'text-white');
        tabLogin.classList.add('text-slate-400');
    }
};

// --- ONLINE ROOM MANAGEMENT ---
let selectedPlayerLimit = 2;
let selectedRoomType = 'public'; // 'public' or 'private'
let allRooms = []; // Global list of all rooms (public & private)
let lobbyInterval = null;
let currentLobbyPlayers = [];

window.selectRoomType = (type) => {
    if(window.SoundFX) window.SoundFX.click();
    selectedRoomType = type;
    const btnPublic = document.getElementById('room-type-public');
    const btnPrivate = document.getElementById('room-type-private');
    
    if (type === 'public') {
        btnPublic.classList.add('bg-emerald-600', 'text-white');
        btnPublic.classList.remove('text-slate-400');
        btnPrivate.classList.remove('bg-emerald-600', 'text-white');
        btnPrivate.classList.add('text-slate-400');
    } else {
        btnPrivate.classList.add('bg-emerald-600', 'text-white');
        btnPrivate.classList.remove('text-slate-400');
        btnPublic.classList.remove('bg-emerald-600', 'text-white');
        btnPublic.classList.add('text-slate-400');
    }
};

window.selectPlayerLimit = (limit) => {
    if(window.SoundFX) window.SoundFX.click();
    selectedPlayerLimit = limit;
    
    document.querySelectorAll('.player-limit-btn').forEach(btn => {
        const btnLimit = parseInt(btn.getAttribute('data-limit'));
        if (btnLimit === limit) {
            btn.classList.add('bg-indigo-600', 'text-white');
            btn.classList.remove('text-slate-400');
        } else {
            btn.classList.remove('bg-indigo-600', 'text-white');
            btn.classList.add('text-slate-400');
        }
    });
};

window.handleCreateRoom = () => {
    if(window.SoundFX) window.SoundFX.click();
    const roomName = document.getElementById('room-name-input').value.trim();
    
    if (!roomName) {
        alert("Vui lòng nhập Tên phòng!");
        return;
    }
    
    // Update list immediately for feedback
    const userName = MenuManager.currentUser ? MenuManager.currentUser.name : "Người chơi";
    const pass = document.getElementById('room-pass-input').value.trim();
    
    if (!allRooms.some(r => r.name === roomName)) {
        allRooms.push({
            name: roomName,
            owner: userName,
            limit: selectedPlayerLimit,
            current: 1,
            type: selectedRoomType,
            password: pass
        });
        updatePublicRoomsUI();
    }

    // Show loading state and transition
    const btn = document.querySelector('button[onclick="handleCreateRoom()"]');
    const originalText = btn.innerText;
    btn.innerHTML = '<span class="animate-spin inline-block mr-2">⏳</span> ĐANG TẠO PHÒNG...';
    btn.classList.add('opacity-50', 'pointer-events-none');

    setTimeout(() => {
        btn.innerHTML = originalText;
        btn.classList.remove('opacity-50', 'pointer-events-none');
        openLobby(roomName, selectedPlayerLimit);
    }, 1200);
};

function updatePublicRoomsUI() {
    const list = document.getElementById('public-rooms-list');
    if (!list) return;
    
    const publicRooms = allRooms.filter(r => r.type === 'public');
    
    if (publicRooms.length === 0) {
        list.innerHTML = '<label class="text-[10px] font-black text-slate-500 uppercase tracking-widest block mb-4 italic">Hiện không có phòng công khai nào...</label>';
        return;
    }
    
    let html = '';
    publicRooms.forEach((room, idx) => {
        html += `
            <div class="bg-white/5 p-4 rounded-xl flex justify-between items-center border border-white/5 hover:border-indigo-500/50 transition-all cursor-pointer" onclick="handleJoinWithData('${room.name}')">
                <div class="flex flex-col">
                    <span class="text-white font-bold text-sm">${room.name}</span>
                    <span class="text-[10px] text-slate-500 font-black uppercase">Chủ: ${room.owner}</span>
                </div>
                <div class="flex items-center gap-4">
                    <span class="text-indigo-400 font-black text-xs">${room.current}/${room.limit} đang chờ</span>
                    <span class="text-xs">▶</span>
                </div>
            </div>
        `;
    });
    list.innerHTML = html;
}

window.handleRefreshRooms = () => {
    if(window.SoundFX) window.SoundFX.click();
    const icon = document.getElementById('refresh-icon');
    icon.classList.add('animate-spin');
    
    setTimeout(() => {
        updatePublicRoomsUI();
        icon.classList.remove('animate-spin');
    }, 800);
};

window.handleJoinWithData = (roomName) => {
    if(window.SoundFX) window.SoundFX.click();
    const room = allRooms.find(r => r.name === roomName);
    if (room) {
        if (room.password) {
            const userPass = prompt(`Phòng ${room.name} yêu cầu mật khẩu:`);
            if (userPass !== room.password) {
                alert("Mật khẩu không chính xác!");
                return;
            }
        }
        openLobby(room.name, room.limit);
    }
};

window.handleJoinRoom = () => {
    if(window.SoundFX) window.SoundFX.click();
    const roomName = document.getElementById('join-room-input').value.trim();
    if (!roomName) {
        alert("Vui lòng nhập tên phòng!");
        return;
    }
    handleJoinWithData(roomName);
};

function openLobby(roomName, limit) {
    selectedPlayerLimit = limit;
    document.getElementById('lobby-room-name').innerText = roomName.toUpperCase();
    MenuManager.showScreen('screen-online-lobby');
    
    const userName = MenuManager.currentUser ? MenuManager.currentUser.name : "Người chơi";
    currentLobbyPlayers = [{ name: userName + " (Chủ phòng)", icon: "👤", ready: true, slot: 0 }];
    updateLobbyUI();
    
    if (lobbyInterval) clearInterval(lobbyInterval);
}

function updateLobbyUI() {
    const list = document.getElementById('lobby-players-list');
    const countEl = document.getElementById('lobby-count');
    const startBtn = document.getElementById('btn-start-lobby');
    
    countEl.innerText = `${currentLobbyPlayers.length}/${selectedPlayerLimit}`;
    
    let html = '';
    const slotNames = ["ĐỘI ĐỎ", "ĐỘI VÀNG", "ĐỘI LAM", "ĐỘI LỤC"];
    
    for (let i = 0; i < selectedPlayerLimit; i++) {
        const player = currentLobbyPlayers.find(p => p.slot === i);
        if (player) {
            html += `
                <div class="bg-white/5 border-l-4 p-6 rounded-2xl flex items-center justify-between group animate-in slide-in-from-right duration-500" style="border-color: ${PLAYER_HEX[i]}">
                    <div class="flex items-center gap-4">
                        <div class="w-12 h-12 rounded-full flex items-center justify-center text-xl shadow-lg" style="background-color: ${PLAYER_HEX[i]}">${player.icon}</div>
                        <div>
                            <div class="text-white font-black uppercase text-sm">${player.name}</div>
                            <div class="text-[10px] font-black uppercase tracking-widest" style="color: ${PLAYER_HEX[i]}">${slotNames[i]}</div>
                        </div>
                    </div>
                    <div class="flex flex-col items-end">
                        <div class="text-[10px] ${player.ready ? 'text-emerald-400' : 'text-amber-400'} font-black uppercase">${player.ready ? 'ĐÃ SẴN SÀNG' : 'CHỜ...'}</div>
                        ${player.slot === 0 ? '<div class="text-[8px] text-white/30 font-black uppercase mt-1">HOST</div>' : ''}
                    </div>
                </div>
            `;
        } else {
            html += `
                <div class="bg-black/40 border border-white/5 border-dashed p-6 rounded-2xl flex items-center gap-4 opacity-50 relative overflow-hidden">
                    <div class="w-12 h-12 bg-white/5 rounded-full flex items-center justify-center text-xl animate-pulse">⏳</div>
                    <div class="flex flex-col">
                        <div class="text-slate-500 font-black uppercase text-sm italic">Đang chờ đối thủ...</div>
                        <div class="text-[10px] text-slate-600 font-black uppercase tracking-widest">TRỐNG (${slotNames[i]})</div>
                    </div>
                    <div class="absolute inset-0 bg-gradient-to-r from-transparent via-white/5 to-transparent -translate-x-full animate-shimmer"></div>
                </div>
            `;
        }
    }
    
    list.innerHTML = html;
    
    if (currentLobbyPlayers.length === selectedPlayerLimit) {
        startBtn.classList.remove('opacity-50', 'pointer-events-none', 'bg-slate-600');
        startBtn.classList.add('bg-indigo-600', 'animate-pulse-slow');
        startBtn.innerText = `BẮT ĐẦU TRẬN ĐẤU (FULL)`;
    } else {
        startBtn.classList.add('opacity-50', 'pointer-events-none', 'bg-slate-600');
        startBtn.classList.remove('bg-indigo-600', 'animate-pulse-slow');
        startBtn.innerText = `ĐANG ĐỢI NGƯỜI CHƠI (${currentLobbyPlayers.length}/${selectedPlayerLimit})`;
    }
}

window.leaveLobby = () => {
    if(window.SoundFX) window.SoundFX.click();
    if (lobbyInterval) clearInterval(lobbyInterval);
    MenuManager.showScreen('screen-online-detail');
};

window.startOnlineFromLobby = () => {
    if(window.SoundFX) window.SoundFX.click();
    if (lobbyInterval) clearInterval(lobbyInterval);
    MenuManager.launchGame(selectedPlayerLimit, 'online');
};
