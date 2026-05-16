// Probe: launch game, wait for HUMAN turn, then DO NOTHING for 10 seconds.
// If turn auto-ends without a click, capture the call stack.
const { spawn } = require('child_process');
const http = require('http');
const WebSocket = require('ws');

const chrome = spawn('C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe', [
    '--headless=new', '--disable-gpu', '--no-sandbox',
    '--remote-debugging-port=9366', '--remote-allow-origins=*',
    '--user-data-dir=' + require('os').tmpdir() + '/idle-probe-' + Date.now(),
    'http://127.0.0.1:8770/'
]);
chrome.stderr.on('data', () => {});

const getJSON = (p) => new Promise((res, rej) => {
    http.get('http://127.0.0.1:9366' + p, r => { let d=''; r.on('data',c=>d+=c); r.on('end',()=>{try{res(JSON.parse(d))}catch(e){rej(e)}}); }).on('error', rej);
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

    // Hook nextTurn to capture stack trace whenever it's called
    await evalJS(`(function(){
        const orig = Game.nextTurn.bind(Game);
        window._nextTurnLog = [];
        Game.nextTurn = function() {
            const err = new Error('nextTurn called');
            window._nextTurnLog.push({
                time: Date.now(),
                currentPlayer: Game.currentPlayerIndex,
                isBot: players[Game.currentPlayerIndex] && players[Game.currentPlayerIndex].isBot,
                stack: err.stack.split('\\n').slice(1, 6).join('\\n')
            });
            return orig();
        };
        return 'hooked';
    })()`);
    console.log('hook installed');

    // Launch game
    await evalJS(`document.getElementById('btn-start-game').click()`);
    await wait(700);
    await evalJS(`document.getElementById('mode-bot-trigger').click()`);
    await wait(700);
    await evalJS(`document.querySelector('button[onclick*="launchGame(2"]').click()`);
    console.log('launching...');

    // Wait for HUMAN turn (no click on roll)
    let humanIdx = -1;
    for (let i = 0; i < 40; i++) {
        await wait(500);
        const s = await evalJS(`window.players && window.Game ? JSON.stringify({ idx: Game.currentPlayerIndex, isBot: players[Game.currentPlayerIndex].isBot, anim: !!window.isAnimating, proc: !!Game.isProcessingTurn, rollHidden: document.getElementById('btn-roll').classList.contains('hidden'), endHidden: document.getElementById('btn-end').classList.contains('hidden'), modalHidden: document.getElementById('action-modal').classList.contains('hidden') }) : 'not-ready'`);
        const v = s.result.result.value;
        if (v === 'not-ready') continue;
        const obj = JSON.parse(v);
        if (!obj.isBot && !obj.rollHidden && !obj.modalHidden) { humanIdx = obj.idx; console.log('HUMAN turn at t+' + (3 + i * 0.5) + 's:', v); break; }
    }
    if (humanIdx < 0) { console.log('No human turn'); chrome.kill(); process.exit(1); }

    // NOW DO NOTHING — watch what happens for 10 seconds
    console.log('\n--- IDLE WAIT (10s, no clicks) ---');
    for (let i = 0; i < 20; i++) {
        await wait(500);
        const s = await evalJS(`JSON.stringify({
            idx: Game.currentPlayerIndex,
            isBot: players[Game.currentPlayerIndex].isBot,
            rollHidden: document.getElementById('btn-roll').classList.contains('hidden'),
            endHidden: document.getElementById('btn-end').classList.contains('hidden'),
            buyHidden: document.getElementById('btn-buy').classList.contains('hidden'),
            modalHidden: document.getElementById('action-modal').classList.contains('hidden'),
            modalScaled: document.getElementById('action-modal').classList.contains('scale-0'),
            modalTitle: document.getElementById('modal-title').textContent,
            modalDesc: document.getElementById('modal-desc').textContent,
            anim: !!window.isAnimating,
            proc: !!Game.isProcessingTurn,
            ntCalls: window._nextTurnLog.length
        })`);
        const v = JSON.parse(s.result.result.value);
        const t = (i+1) * 0.5;
        if (v.idx !== humanIdx || v.ntCalls > 0) {
            console.log(`[t+${t}s] *** STATE CHANGE ***`, v);
        }
        if ((i+1) % 4 === 0) console.log(`[t+${t}s] idx:${v.idx} isBot:${v.isBot} rollHidden:${v.rollHidden} title:"${v.modalTitle}" desc:"${v.modalDesc.slice(0, 50)}" anim:${v.anim} proc:${v.proc} ntCalls:${v.ntCalls}`);
    }

    const log = await evalJS(`JSON.stringify(window._nextTurnLog)`);
    console.log('\nnextTurn call log:', log.result.result.value);

    chrome.kill();
    process.exit(0);
})();
