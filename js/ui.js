// --- UI MANAGER ---
document.addEventListener('DOMContentLoaded', () => {
    const logEl = document.getElementById('game-log');
    const playersContainer = document.getElementById('players-container');
    const actionModal = document.getElementById('action-modal');
    const modalTitle = document.getElementById('modal-title');
    const modalDesc = document.getElementById('modal-desc');
    const btnRoll = document.getElementById('btn-roll');
    const btnBuildMenu = document.getElementById('btn-build-menu');
    const btnBuy = document.getElementById('btn-buy');
    const btnSkip = document.getElementById('btn-skip');
    const btnEnd = document.getElementById('btn-end');
    const buildSubmenu = document.getElementById('build-submenu');
    const rulesModal = document.getElementById('rules-modal');
    const mortgagePanel = document.getElementById('mortgage-panel');

    // Helper to play click sound
    const playClick = () => { if(window.SoundFX) window.SoundFX.click(); };

    // --- RULES MODAL ---
    const closeRules = () => {
        playClick();
        if (rulesModal) {
            rulesModal.classList.add('opacity-0', 'pointer-events-none');
            // Force hidden to be sure
            setTimeout(() => {
                if (rulesModal.classList.contains('opacity-0')) rulesModal.classList.add('hidden');
            }, 500);
        }
    };

    const showRules = () => {
        playClick();
        if (rulesModal) {
            rulesModal.classList.remove('hidden');
            // Force reflow
            rulesModal.offsetHeight;
            rulesModal.classList.remove('opacity-0', 'pointer-events-none');
        }
    };

    if (document.getElementById('btn-show-rules')) {
        document.getElementById('btn-show-rules').onclick = showRules;
    }

    ['btn-close-rules', 'btn-close-rules-x', 'btn-understood'].forEach(id => {
        const btn = document.getElementById(id);
        if (btn) btn.onclick = closeRules;
    });

    // --- OTHER UI BUTTONS ---
    const btnQuit = document.getElementById('btn-quit');
    if (btnQuit) {
        btnQuit.onclick = () => {
            playClick();
            if(confirm("Bạn có chắc chắn muốn quay lại Menu chính? Mọi tiến trình sẽ bị mất.")) {
                location.reload();
            }
        };
    }

    const btnSurrender = document.getElementById('btn-surrender');
    if (btnSurrender) {
        btnSurrender.onclick = () => {
            playClick();
            if(confirm("Bạn có chắc chắn muốn đầu hàng không?")) {
                const p = Game.players[Game.currentPlayerIndex];
                if(p && !p.isBot) {
                    p.bankrupt = true;
                    logMsg(`🏳️ ${p.name} đã đầu hàng!`);
                    btnSurrender.classList.add('hidden');
                    hideModal();
                    Game.nextTurn();
                }
            }
        };
    }

    const btnMortgageMenu = document.getElementById('btn-mortgage-menu');
    if (btnMortgageMenu) {
        btnMortgageMenu.onclick = () => {
            playClick();
            if (mortgagePanel) {
                if (mortgagePanel.classList.contains('hidden')) {
                    renderMortgagePanel();
                    mortgagePanel.classList.remove('hidden');
                } else {
                    mortgagePanel.classList.add('hidden');
                }
            }
        };
    }
});

// These functions need to be global as they are called by Game engine or inline HTML
function logMsg(msg) {
    const logEl = document.getElementById('game-log');
    if (!logEl) return;
    const div = document.createElement('div');
    div.className = "flex items-start gap-2 animate-in fade-in slide-in-from-left-2 duration-300";
    div.innerHTML = `<span class="w-1.5 h-1.5 mt-2 bg-indigo-500 rounded-full flex-shrink-0 shadow-[0_0_8px_rgba(99,102,241,0.8)]"></span><span class="text-slate-700">${msg}</span>`;
    logEl.appendChild(div);
    logEl.scrollTop = logEl.scrollHeight;
}

function renderPlayerUI() {
    const playersContainer = document.getElementById('players-container');
    if (!window.players || !playersContainer) return;
    playersContainer.innerHTML = '';
    
    window.players.forEach((p, idx) => {
        const isCurrent = (Game.currentPlayerIndex === idx && !p.bankrupt);
        const card = document.createElement('div');
        
        card.className = `glass-panel p-5 w-72 border-l-[12px] transition-all duration-500 flex flex-col gap-1 ${p.bankrupt ? 'opacity-40 grayscale scale-95' : 'shadow-xl'}`;
        card.style.borderLeftColor = p.colorHex;
        
        if (isCurrent) {
            card.classList.add('ring-4', 'ring-white/50', 'scale-105', 'z-20', 'bg-white/60');
        }

        card.innerHTML = `
            <div class="flex justify-between items-center">
                <span class="font-black text-slate-900 text-lg truncate">${p.name} ${p.isBot ? '🤖' : '👤'}</span>
                <span class="text-[10px] font-black px-2 py-1 bg-black/10 rounded-lg uppercase tracking-widest">${p.position} / 40</span>
            </div>
            <div class="text-3xl font-black text-indigo-700 my-1">${Utils.formatMoney(p.money)}</div>
            <div class="flex justify-between items-center">
                <div class="flex flex-col items-end gap-1">
                    <div class="flex items-center gap-2">
                        <div class="w-2 h-2 rounded-full ${p.inJail ? 'bg-red-500 animate-pulse' : 'bg-emerald-500'}"></div>
                        <span class="text-[10px] font-black uppercase tracking-widest ${p.inJail ? 'text-red-600' : 'text-emerald-600'}">
                            ${p.inJail ? 'Đang trong tù' : 'Đang hoạt động'}
                        </span>
                    </div>
                </div>
                ${p.isThinking ? `
                    <div class="flex gap-1">
                        <span class="w-1.5 h-1.5 bg-indigo-500 rounded-full animate-bounce"></span>
                        <span class="w-1.5 h-1.5 bg-indigo-500 rounded-full animate-bounce [animation-delay:-0.15s]"></span>
                        <span class="w-1.5 h-1.5 bg-indigo-500 rounded-full animate-bounce [animation-delay:-0.3s]"></span>
                    </div>
                ` : ''}
            </div>
        `;
        playersContainer.appendChild(card);
    });
}

function showModal(title, desc, buttons = []) {
    const actionModal = document.getElementById('action-modal');
    const modalTitle = document.getElementById('modal-title');
    const modalDesc = document.getElementById('modal-desc');
    const buildSubmenu = document.getElementById('build-submenu');
    if (!actionModal) return;

    modalTitle.innerText = title;
    modalDesc.innerText = desc;
    
    // Reset buttons
    ['btn-roll', 'btn-build-menu', 'btn-buy', 'btn-skip', 'btn-end'].forEach(id => {
        const b = document.getElementById(id);
        if (b) b.classList.add('hidden');
    });
    if (buildSubmenu) buildSubmenu.classList.add('hidden');

    buttons.forEach(bId => {
        const b = document.getElementById('btn-' + bId);
        if (b) b.classList.remove('hidden');
    });

    actionModal.classList.remove('hidden');
    actionModal.offsetHeight; 
    actionModal.classList.remove('scale-0');
}

function hideModal() {
    const actionModal = document.getElementById('action-modal');
    if (!actionModal) return;
    actionModal.classList.add('scale-0');
    setTimeout(() => {
        if (actionModal.classList.contains('scale-0')) actionModal.classList.add('hidden');
    }, 500);
}

function renderMortgagePanel() {
    const mortgagePanel = document.getElementById('mortgage-panel');
    if (!mortgagePanel) return;
    const p = Game.players[Game.currentPlayerIndex];
    if (!p || p.isBot) {
        mortgagePanel.innerHTML = `<div class="p-6 text-center text-slate-500 text-[10px] font-black uppercase">Không phải lượt của bạn</div>`;
        return;
    }
    const owned = boardData.filter(t => t.owner === p.id);
    
    mortgagePanel.innerHTML = `
        <div class="p-4 border-b border-white/10 flex justify-between items-center bg-slate-900/20">
            <h5 class="text-[10px] font-black uppercase tracking-[0.2em] text-amber-500">🏦 Cầm cố / Chuộc đất</h5>
            <button onclick="document.getElementById('mortgage-panel').classList.add('hidden')" class="text-slate-400 hover:text-white">✕</button>
        </div>
        <div class="max-h-56 overflow-y-auto custom-scrollbar p-2 space-y-2">
            ${owned.length === 0 ? '<div class="text-[10px] text-center py-4 text-slate-500 font-bold uppercase italic">Chưa sở hữu đất nào</div>' : ''}
            ${owned.map(t => `
                <div class="bg-white/5 rounded-xl p-3 border border-white/5 flex justify-between items-center gap-3">
                    <div class="text-left flex-1">
                        <div class="text-[10px] font-black uppercase text-slate-900 line-clamp-1">${t.name}</div>
                        <div class="text-[9px] font-bold ${t.isMortgaged ? 'text-red-500' : 'text-emerald-500'} italic">
                            ${t.isMortgaged ? 'ĐANG CẦM CỐ' : (t.houses > 0 ? t.houses + ' nhà - cần bán nhà trước' : 'Có thể cầm cố')}
                        </div>
                    </div>
                    ${t.houses === 0 ? `
                        <button onclick="toggleMortgage(${t.id}); renderMortgagePanel();" 
                            class="${t.isMortgaged ? 'bg-emerald-600' : 'bg-amber-600'} text-white text-[9px] font-black py-2 px-3 rounded-lg transition-all uppercase whitespace-nowrap">
                            ${t.isMortgaged ? 'Chuộc $' + Math.floor(t.price * 0.6) : 'Cầm $' + Math.floor(t.price * 0.5)}
                        </button>
                    ` : ''}
                </div>
            `).join('')}
        </div>
    `;
}

function renderBuildMenu() {
    const buildSubmenu = document.getElementById('build-submenu');
    if (!buildSubmenu) return;
    const p = Game.players[Game.currentPlayerIndex];
    if (!p) return;
    const buildables = Game.getBuildableProperties ? Game.getBuildableProperties(p.id) : [];
    const allOwned = boardData.filter(t => t.owner === p.id);
    
    buildSubmenu.innerHTML = `
        <div class="p-4 border-b border-white/10 flex justify-between items-center bg-slate-900/20">
            <h5 class="text-[10px] font-black uppercase tracking-[0.2em] text-indigo-500">Quản lý bất động sản</h5>
            <button onclick="document.getElementById('build-submenu').classList.add('hidden')" class="text-slate-400 hover:text-white">✕</button>
        </div>
        <div class="max-h-64 overflow-y-auto custom-scrollbar p-2 space-y-2">
            ${allOwned.length === 0 ? '<div class="text-[10px] text-center py-4 text-slate-500 font-bold uppercase italic">Chưa sở hữu đất</div>' : ''}
            ${allOwned.map(t => `
                <div class="bg-white/5 rounded-xl p-3 border border-white/5 flex flex-col gap-2">
                    <div class="flex justify-between items-start">
                        <div class="text-left">
                            <div class="text-[10px] font-black uppercase text-slate-900 line-clamp-1">${t.name}</div>
                            <div class="text-[9px] font-bold text-slate-500 italic">${t.isMortgaged ? '<span class="text-red-500">ĐANG CẦM CỐ</span>' : (t.houses === 5 ? 'Khách sạn' : (t.houses > 0 ? t.houses + ' Nhà' : 'Đất trống'))}</div>
                        </div>
                    </div>
                    <div class="flex gap-2">
                        ${buildables.includes(t) && !t.isMortgaged ? `
                            <button onclick="Game.executeBuildInternal(Game.players[${p.id}], boardData[${t.id}])" class="flex-1 bg-slate-900 hover:bg-indigo-600 text-white text-[9px] font-black py-2 rounded-lg transition-all">XÂY NÀY ($${t.houseCost})</button>
                        ` : ''}
                    </div>
                </div>
            `).join('')}
        </div>
    `;
}
