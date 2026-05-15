// --- UI MANAGER ---
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
document.getElementById('btn-show-rules').onclick = () => {
    rulesModal.classList.remove('opacity-0', 'pointer-events-none');
};
document.getElementById('btn-close-rules').onclick = () => {
    rulesModal.classList.add('opacity-0', 'pointer-events-none');
};

document.getElementById('btn-quit').onclick = () => {
    if(window.SoundFX) window.SoundFX.click();
    if(confirm("Bạn có chắc chắn muốn quay lại Menu chính? Mọi tiến trình sẽ bị mất.")) {
        location.reload();
    }
};

document.getElementById('btn-surrender').onclick = () => {
    if(window.SoundFX) window.SoundFX.click();
    if(confirm("Bạn có chắc chắn muốn đầu hàng không?")) {
        const p = Game.players[Game.currentPlayerIndex];
        if(!p.isBot) {
            p.bankrupt = true;
            logMsg(`🏳️ ${p.name} đã đầu hàng!`);
            document.getElementById('btn-surrender').classList.add('hidden');
            hideModal();
            Game.nextTurn();
        }
    }
};

// --- MORTGAGE PANEL (always accessible) ---
const mortgagePanel = document.getElementById('mortgage-panel');
document.getElementById('btn-mortgage-menu').onclick = () => {
    if(window.SoundFX) window.SoundFX.click();
    if (mortgagePanel.classList.contains('hidden')) {
        renderMortgagePanel();
        mortgagePanel.classList.remove('hidden');
    } else {
        mortgagePanel.classList.add('hidden');
    }
};

function renderMortgagePanel() {
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

function logMsg(msg) {
    const div = document.createElement('div');
    div.className = "flex items-start gap-2 animate-in fade-in slide-in-from-left-2 duration-300";
    div.innerHTML = `<span class="w-1.5 h-1.5 mt-2 bg-indigo-500 rounded-full flex-shrink-0 shadow-[0_0_8px_rgba(99,102,241,0.8)]"></span><span class="text-slate-700">${msg}</span>`;
    logEl.appendChild(div);
    logEl.scrollTop = logEl.scrollHeight;
}

function renderPlayerUI() {
    if (!window.players) return;
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
                    ${p.jailFreeCards > 0 ? `
                        <div class="flex items-center gap-1 text-[9px] font-black text-amber-600 uppercase italic">
                            🎫 Thẻ miễn tù: ${p.jailFreeCards}
                        </div>
                    ` : ''}
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

function updatePlayerUI() {
    renderPlayerUI();
}

let modalTimeout = null;

function showModal(title, desc, buttons = []) {
    if (modalTimeout) { clearTimeout(modalTimeout); modalTimeout = null; }
    
    modalTitle.innerText = title;
    modalDesc.innerText = desc;
    
    // Reset buttons
    [btnRoll, btnBuildMenu, btnBuy, btnSkip, btnEnd].forEach(b => b.classList.add('hidden'));
    buildSubmenu.classList.add('hidden');

    buttons.forEach(bId => {
        if (bId === 'roll') btnRoll.classList.remove('hidden');
        if (bId === 'build') btnBuildMenu.classList.remove('hidden');
        if (bId === 'buy') btnBuy.classList.remove('hidden');
        if (bId === 'skip') btnSkip.classList.remove('hidden');
        if (bId === 'end') btnEnd.classList.remove('hidden');
    });

    actionModal.classList.remove('hidden');
    // Force reflow for animation
    actionModal.offsetHeight; 
    actionModal.classList.remove('scale-0');
}

function hideModal() {
    actionModal.classList.add('scale-0');
    if (modalTimeout) clearTimeout(modalTimeout);
    modalTimeout = setTimeout(() => {
        actionModal.classList.add('hidden');
        modalTimeout = null;
    }, 500);
}

btnBuildMenu.onclick = () => {
    if (buildSubmenu.classList.contains('hidden')) {
        renderBuildMenu();
        buildSubmenu.classList.remove('hidden');
    } else {
        buildSubmenu.classList.add('hidden');
    }
};

function renderBuildMenu() {
    const p = Game.players[Game.currentPlayerIndex];
    const buildables = getBuildableProperties(p.id);
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
                        <div class="text-[10px] font-black text-indigo-600">${Utils.formatMoney(calculateRent(t))}</div>
                    </div>
                    
                    <div class="flex gap-2">
                        ${buildables.includes(t) && !t.isMortgaged ? `
                            <button onclick="executeBuild(${t.id})" class="flex-1 bg-slate-900 hover:bg-indigo-600 text-white text-[9px] font-black py-2 rounded-lg transition-all">XÂY NÀY ($${t.houseCost})</button>
                        ` : ''}
                        
                        ${t.houses === 0 ? `
                            <button onclick="toggleMortgage(${t.id})" class="flex-1 ${t.isMortgaged ? 'bg-emerald-600' : 'bg-red-600'} text-white text-[9px] font-black py-2 rounded-lg transition-all uppercase">
                                ${t.isMortgaged ? 'Chuộc ($' + Math.floor(t.price * 0.6) + ')' : 'Cầm ($' + Math.floor(t.price * 0.5) + ')'}
                            </button>
                        ` : ''}
                    </div>
                </div>
            `).join('')}
        </div>
        <div class="p-3 border-t border-white/10 bg-slate-900/30">
            <button onclick="document.getElementById('build-submenu').classList.add('hidden'); hideModal(); Game.nextTurn();" 
                class="w-full bg-gradient-to-r from-indigo-600 to-purple-600 hover:from-indigo-500 hover:to-purple-500 text-white text-[10px] font-black py-2.5 rounded-xl transition-all uppercase tracking-widest shadow-lg">
                ✅ Kết thúc lượt
            </button>
        </div>
    `;
}

function getBuildableProperties(playerId) {
    return boardData.filter(t => {
        if (t.owner !== playerId || t.type !== TILE_TYPES.PROPERTY || t.houses >= 5 || t.isMortgaged) return false;
        if (!hasMonopoly(playerId, t.groupId)) return false;
        if (Game.players[playerId].money < t.houseCost) return false;
        
        // Strict Even Building Rule
        const groupTiles = boardData.filter(gt => gt.groupId === t.groupId);
        if (groupTiles.some(gt => gt.isMortgaged)) return false; // Can't build if any part of set is mortgaged
        
        const minHouses = Math.min(...groupTiles.map(gt => gt.houses));
        if (t.houses > minHouses) return false;
        
        return true;
    });
}

window.toggleMortgage = (tileId) => {
    const p = Game.players[Game.currentPlayerIndex];
    const tile = boardData[tileId];
    if (tile.isMortgaged) {
        const cost = Math.floor(tile.price * 0.6); 
        if (p.money >= cost) {
            p.money -= cost;
            tile.isMortgaged = false;
            logMsg(`🔓 ${p.name} đã chuộc lại ${tile.name}.`);
        } else {
            logMsg(`❌ Không đủ tiền chuộc ${tile.name}!`);
        }
    } else {
        if (tile.houses > 0) {
            logMsg(`❌ Phải bán hết nhà trước khi cầm cố ${tile.name}!`);
            return;
        }
        const gain = Math.floor(tile.price * 0.5);
        p.money += gain;
        tile.isMortgaged = true;
        logMsg(`🏦 ${p.name} đã cầm cố ${tile.name} lấy ${Utils.formatMoney(gain)}.`);
    }
    updatePlayerUI();
    renderBuildMenu();
};

function hasMonopoly(playerId, groupId) {
    if (!groupId) return false;
    const groupTiles = boardData.filter(t => t.groupId === groupId);
    return groupTiles.every(t => t.owner === playerId);
}

function calculateRent(tile) {
    if (tile.owner === null) return 0;
    
    if (tile.type === TILE_TYPES.RAILROAD) {
        const count = boardData.filter(t => t.type === TILE_TYPES.RAILROAD && t.owner === tile.owner).length;
        return 25 * Math.pow(2, count - 1);
    }
    
    if (tile.type === TILE_TYPES.UTILITY) {
        const count = boardData.filter(t => t.type === TILE_TYPES.UTILITY && t.owner === tile.owner).length;
        // Standard rule is x4 or x10 the dice roll. We'll use a fixed average (7) * multiplier for display, 
        // but ideally this should use the last roll.
        return count === 1 ? 4 * 7 : 10 * 7; 
    }

    if (tile.type !== TILE_TYPES.PROPERTY) return tile.rent || 0;
    if (tile.houses === 0) return hasMonopoly(tile.owner, tile.groupId) ? tile.rent * 2 : tile.rent;
    const multipliers = [1, 5, 15, 45, 60, 75];
    return tile.rent * multipliers[tile.houses];
}
