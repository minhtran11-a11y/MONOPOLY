const menuLayer = document.getElementById('main-menu-layer');
const gameUILayer = document.getElementById('game-ui-layer');

const vIntro = document.getElementById('view-intro');
const vMode = document.getElementById('view-mode');
const vBotSelect = document.getElementById('view-bot-select');
const vLogin = document.getElementById('view-login');
const vOnlineSelect = document.getElementById('view-online-select');

// Navigation
document.getElementById('btn-start-game').onclick = function() {
    if(window.SoundFX) window.SoundFX.buy(); // Play sound
    this.classList.add('animate-btn-pop');
    setTimeout(() => {
        switchView(vIntro, vMode);
        this.classList.remove('animate-btn-pop');
    }, 450);
};
document.querySelectorAll('.btn-back-intro').forEach(b => b.onclick = () => switchView(vMode, vIntro));

document.getElementById('btn-mode-bot').onclick = () => switchView(vMode, vBotSelect);
document.querySelectorAll('.btn-back-mode').forEach(b => b.onclick = () => {
    if (!vBotSelect.classList.contains('opacity-0')) switchView(vBotSelect, vMode);
    else if (!vLogin.classList.contains('opacity-0')) switchView(vLogin, vMode);
});

document.getElementById('btn-mode-online').onclick = () => switchView(vMode, vLogin);
document.getElementById('btn-do-login').onclick = () => switchView(vLogin, vOnlineSelect);
document.querySelectorAll('.btn-back-login').forEach(b => b.onclick = () => switchView(vOnlineSelect, vLogin));

function switchView(from, to) {
    from.classList.add('opacity-0', 'scale-90', 'pointer-events-none');
    from.classList.remove('scale-100');
    
    setTimeout(() => {
        to.classList.remove('opacity-0', 'scale-90', 'pointer-events-none');
        to.classList.add('scale-100');
    }, 400);
}

// Start Game Triggers
document.querySelectorAll('.btn-start-bot').forEach(btn => {
    btn.onclick = () => {
        const total = parseInt(btn.getAttribute('data-total'));
        window.botDifficulty = document.getElementById('bot-difficulty').value;
        initGameSession(total, 'bot');
    };
});

document.querySelectorAll('.btn-start-online').forEach(btn => {
    btn.onclick = () => {
        const total = parseInt(btn.getAttribute('data-total'));
        window.botDifficulty = 'medium'; // Mock opponents play like medium bots
        
        // Mock matchmaking UI
        const btnText = btn.innerHTML;
        btn.innerHTML = '<span class="text-2xl animate-spin inline-block">⏳</span> MATCHMAKING...';
        btn.classList.add('opacity-50', 'pointer-events-none');
        
        setTimeout(() => {
            initGameSession(total, 'online');
            // reset just in case
            btn.innerHTML = btnText;
            btn.classList.remove('opacity-50', 'pointer-events-none');
        }, 2500 + Math.random() * 2000); // 2.5s - 4.5s mock search
    };
});

function initGameSession(total, mode) {
    menuLayer.classList.add('opacity-0');
    setTimeout(() => {
        menuLayer.style.display = 'none';
        gameUILayer.style.display = 'block';
        
        createPlayers(total, mode);
        startGame();
    }, 700);
}
