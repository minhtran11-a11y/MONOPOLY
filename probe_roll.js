// Targeted probe: click "Bắt đầu chơi" → click roll button as human → inspect state.
const { spawn } = require('child_process');
const http = require('http');
const WebSocket = require('ws');

const chrome = spawn('C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe', [
    '--headless=new', '--disable-gpu', '--no-sandbox',
    '--remote-debugging-port=9355', '--remote-allow-origins=*',
    '--user-data-dir=' + require('os').tmpdir() + '/probe-' + Date.now(),
    'http://127.0.0.1:8770/'
]);
chrome.stderr.on('data', () => {});
chrome.stdout.on('data', () => {});

const getJSON = (p) => new Promise((res, rej) => {
    http.get('http://127.0.0.1:9355' + p, r => { let d=''; r.on('data',c=>d+=c); r.on('end',()=>{try{res(JSON.parse(d))}catch(e){rej(e)}}); }).on('error', rej);
});
const wait = ms => new Promise(r => setTimeout(r, ms));

(async () => {
    await wait(3000);
    let target = null;
    for (let i = 0; i < 15 && !target; i++) {
        try { target = (await getJSON('/json')).find(t => t.type === 'page' && t.url.includes('127.0.0.1')); } catch (e) {}
        if (!target) await wait(500);
    }
    const ws = new WebSocket(target.webSocketDebuggerUrl);
    let id = 1;
    const errors = [];
    function send(method, params) {
        return new Promise(res => {
            const myId = id++;
            ws.send(JSON.stringify({ id: myId, method, params }));
            const h = (data) => { const m = JSON.parse(data.toString()); if (m.id === myId) { ws.off('message', h); res(m); } };
            ws.on('message', h);
        });
    }
    const evalJS = (e) => send('Runtime.evaluate', { expression: e, returnByValue: true, awaitPromise: true });

    await new Promise(r => ws.on('open', r));
    await send('Runtime.enable');
    ws.on('message', (raw) => {
        const m = JSON.parse(raw.toString());
        if (m.method === 'Runtime.exceptionThrown') {
            const ex = m.params.exceptionDetails;
            errors.push((ex.exception && ex.exception.description ? ex.exception.description.split('\n')[0] : ex.text));
        }
        if (m.method === 'Runtime.consoleAPICalled' && m.params.type === 'error') {
            errors.push('console.error: ' + (m.params.args || []).map(a => a.value || a.description || '').join(' '));
        }
    });

    console.log('--- T+3s: Menu state ---');
    const menu = await evalJS(`JSON.stringify({
        startBtnExists: !!document.getElementById('btn-start-game'),
        startBtnText: document.getElementById('btn-start-game') && document.getElementById('btn-start-game').textContent.trim(),
        threeLoaded: !!window._threeLoaded,
        MenuManager: typeof MenuManager
    })`);
    console.log(menu.result.result.value);

    console.log('\n--- Clicking "Bắt đầu chơi" (start button) ---');
    const click1 = await evalJS(`document.getElementById('btn-start-game').click(); 'clicked'`);
    console.log(click1.result.result.value);
    await wait(800);
    const screen1 = await evalJS(`document.getElementById('screen-intro').classList.contains('hidden') + ' / modes: ' + !document.getElementById('screen-modes').classList.contains('hidden')`);
    console.log('After click → intro hidden:', screen1.result.result.value);

    console.log('\n--- Click "BOT SOLO" → "1vs1" ---');
    await evalJS(`document.getElementById('mode-bot-trigger').click()`);
    await wait(800);
    await evalJS(`document.querySelector('button[onclick*="launchGame(2"]').click()`);
    await wait(500);
    console.log('Game launching, waiting for Three.js load...');

    // Wait up to 8s for game UI to appear
    let inGame = false;
    for (let i = 0; i < 16; i++) {
        await wait(500);
        const s = await evalJS(`JSON.stringify({
            hudVisible: !document.getElementById('game-ui-layer').classList.contains('hidden'),
            threeLoaded: !!window._threeLoaded,
            scene: !!window.scene,
            dice1: !!window.dice1,
            players: window.players ? window.players.length : 0,
            current: window.Game ? window.Game.currentPlayerIndex : -1
        })`);
        const obj = JSON.parse(s.result.result.value);
        if (obj.hudVisible && obj.dice1 && obj.players > 0) { inGame = true; console.log('IN_GAME at t+' + (3 + i * 0.5) + 's:', obj); break; }
    }
    if (!inGame) { console.log('STUCK — game did not initialize'); chrome.kill(); process.exit(1); }

    // Wait for human turn (longer timeout + log every state change)
    await wait(1500);
    let humanTurn = false;
    let lastState = '';
    for (let i = 0; i < 40; i++) {
        const s = await evalJS(`JSON.stringify({
            current: Game.currentPlayerIndex,
            isBot: players[Game.currentPlayerIndex].isBot,
            isThinking: players[Game.currentPlayerIndex].isThinking,
            rollBtnHidden: document.getElementById('btn-roll').classList.contains('hidden'),
            modalHidden: document.getElementById('action-modal').classList.contains('hidden'),
            modalScaled: document.getElementById('action-modal').classList.contains('scale-0'),
            animating: !!window.isAnimating,
            processing: !!Game.isProcessingTurn,
            playerPos: players[Game.currentPlayerIndex].position
        })`);
        const stateStr = s.result.result.value;
        if (stateStr !== lastState) { console.log('  t+' + (i*0.5) + 's:', stateStr); lastState = stateStr; }
        const obj = JSON.parse(stateStr);
        if (!obj.isBot && !obj.rollBtnHidden && !obj.modalHidden && !obj.modalScaled && !obj.animating) {
            humanTurn = true;
            console.log('HUMAN TURN ready at iter ' + i);
            break;
        }
        await wait(500);
    }
    if (!humanTurn) {
        console.log('NO HUMAN TURN within 10s');
        const s = await evalJS(`JSON.stringify({ current: Game.currentPlayerIndex, isBot: players[Game.currentPlayerIndex].isBot, rollBtnHidden: document.getElementById('btn-roll').classList.contains('hidden') })`);
        console.log('Final state:', s.result.result.value);
    } else {
        console.log('\n--- Now clicking ĐỔ XÍ NGẦU ---');
        const before = await evalJS(`JSON.stringify({ dice1Visible: dice1.visible, isAnimating: !!window.isAnimating, hasOnclick: !!document.getElementById('btn-roll').onclick })`);
        console.log('Before click:', before.result.result.value);
        await evalJS(`document.getElementById('btn-roll').click()`);
        await wait(200);
        const after1 = await evalJS(`JSON.stringify({ dice1Visible: dice1.visible, isAnimating: !!window.isAnimating, lastRoll: Game.lastRoll })`);
        console.log('200ms after click:', after1.result.result.value);
        await wait(1500);
        const after2 = await evalJS(`JSON.stringify({ dice1Visible: dice1.visible, dice1Pos: dice1.position.toArray().map(n => +n.toFixed(2)), isAnimating: !!window.isAnimating })`);
        console.log('1700ms after click:', after2.result.result.value);
        // Headless without GPU is slow — wait up to 15s for animation to settle
        for (let i = 0; i < 30; i++) {
            await wait(500);
            const s = await evalJS(`JSON.stringify({ dice1Vis: dice1.visible, anim: !!window.isAnimating, pos: players[Game.currentPlayerIndex].position, idx: Game.currentPlayerIndex })`);
            const obj = JSON.parse(s.result.result.value);
            if (!obj.anim) { console.log(`Settled at +${1.7 + i*0.5}s after click:`, s.result.result.value); break; }
        }
    }

    console.log('\nERRORS:', errors.length);
    errors.forEach(e => console.log('  -', e));
    chrome.kill();
    process.exit(errors.length > 0 ? 2 : 0);
})();
