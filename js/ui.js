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

function logMsg(msg) {
    const div = document.createElement('div');
    div.className = "flex items-start gap-2 animate-in fade-in slide-in-from-left-2 duration-300";
    div.innerHTML = `<span class="w-1.5 h-1.5 mt-2 bg-slate-400 rounded-full flex-shrink-0"></span><span>${msg}</span>`;
    logEl.appendChild(div);
    logEl.scrollTop = logEl.scrollHeight;
}

function renderPlayerUI() {
    playersContainer.innerHTML = '';
    players.forEach(p => {
        const card = document.createElement('div');
        card.className = `glass-panel p-5 rounded-2xl w-64 border-l-8 transition-all duration-300 ${p.bankrupt ? 'opacity-50 grayscale' : 'shadow-lg'}`;
        card.style.borderLeftColor = p.colorHex;
        
        const isCurrent = players[currentPlayerIndex].id === p.id && !p.bankrupt;
        if (isCurrent) card.classList.add('ring-2', 'ring-white', 'scale-105', 'z-20');

        card.innerHTML = `
            <div class="flex justify-between items-center mb-2">
                <span class="font-black text-slate-900 truncate pr-2">${p.name} ${p.isBot ? '🤖' : ''}</span>
                <span class="text-xs font-bold px-2 py-0.5 bg-slate-900/10 rounded-full">${p.position} / 40</span>
            </div>
            <div class="text-2xl font-black text-indigo-700 mb-1">${Utils.formatMoney(p.money)}</div>
            <div class="flex gap-1 items-center">
                <span class="text-[10px] font-bold uppercase tracking-tighter text-slate-500">${p.inJail ? '🔴 IN JAIL' : '🟢 ACTIVE'}</span>
                ${p.bankrupt ? '<span class="text-[10px] font-bold text-red-600">💀 BANKRUPT</span>' : ''}
            </div>
        `;
        playersContainer.appendChild(card);
    });
}

function updatePlayerUI() {
    renderPlayerUI();
}

function showModal(title, desc, buttons = []) {
    modalTitle.innerText = title;
    modalDesc.innerText = desc;
    
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
    setTimeout(() => actionModal.classList.remove('scale-0'), 10);
}

function hideModal() {
    actionModal.classList.add('scale-0');
    setTimeout(() => actionModal.classList.add('hidden'), 500);
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
    const p = players[currentPlayerIndex];
    const buildables = getBuildableProperties(p.id);
    buildSubmenu.innerHTML = '';
    
    if (buildables.length === 0) {
        buildSubmenu.innerHTML = '<p class="text-sm text-slate-500 font-bold">No properties available for building.</p>';
        return;
    }

    buildables.forEach(t => {
        const item = document.createElement('div');
        item.className = "flex justify-between items-center bg-white/40 p-3 rounded-xl border border-white/50";
        item.innerHTML = `
            <div class="text-left">
                <div class="text-sm font-black text-slate-800">${t.name}</div>
                <div class="text-xs font-bold text-slate-500">${t.houses === 4 ? 'Hotel' : 'House'} cost: ${Utils.formatMoney(t.houseCost)}</div>
            </div>
            <button onclick="executeBuild(${t.id})" class="bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-black py-2 px-4 rounded-lg shadow-md transition transform active:scale-95">
                ${t.houses === 4 ? 'BUILD HOTEL' : 'BUILD HOUSE'}
            </button>
        `;
        buildSubmenu.appendChild(item);
    });
}
