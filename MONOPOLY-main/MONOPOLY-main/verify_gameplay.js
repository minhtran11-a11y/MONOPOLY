// Stress test: launch game, simulate ~25 turns, monitor errors continuously.
const { spawn } = require('child_process');
const http = require('http');
const WebSocket = require('ws');

const CHROME = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
const URL = 'http://127.0.0.1:8770/';
const TMP = require('os').tmpdir() + '/monopoly-gameplay-' + Date.now();

const chrome = spawn(CHROME, [
    '--headless=new', '--disable-gpu', '--no-sandbox',
    '--remote-debugging-port=9344',
    '--remote-allow-origins=*',
    '--user-data-dir=' + TMP,
    '--window-size=1280,800',
    URL
], { detached: false });
chrome.stderr.on('data', () => {});
chrome.stdout.on('data', () => {});

function getJSON(p) {
    return new Promise((res, rej) => {
        http.get('http://127.0.0.1:9344' + p, r => {
            let d = ''; r.on('data', c => d += c);
            r.on('end', () => { try { res(JSON.parse(d)); } catch (e) { rej(e); } });
        }).on('error', rej);
    });
}
const wait = ms => new Promise(r => setTimeout(r, ms));

(async () => {
    await wait(2500);
    let target = null;
    for (let i = 0; i < 15 && !target; i++) {
        try {
            const tabs = await getJSON('/json');
            target = tabs.find(t => t.type === 'page' && t.url.includes('127.0.0.1'));
        } catch (e) {}
        if (!target) await wait(500);
    }
    if (!target) { console.error('NO_TARGET'); chrome.kill(); process.exit(1); }

    const ws = new WebSocket(target.webSocketDebuggerUrl);
    const errors = [];
    let id = 1;
    function send(method, params) {
        return new Promise(res => {
            const myId = id++;
            ws.send(JSON.stringify({ id: myId, method, params }));
            const h = (data) => {
                const m = JSON.parse(data.toString());
                if (m.id === myId) { ws.off('message', h); res(m); }
            };
            ws.on('message', h);
        });
    }
    function evalJS(expr, awaitPromise = false) {
        return send('Runtime.evaluate', { expression: expr, returnByValue: true, awaitPromise });
    }

    await new Promise((res) => ws.on('open', res));
    await send('Runtime.enable');
    await send('Log.enable');

    ws.on('message', (raw) => {
        const m = JSON.parse(raw.toString());
        if (m.method === 'Runtime.consoleAPICalled' && m.params.type === 'error') {
            errors.push('console.error: ' + (m.params.args || []).map(a => a.value || a.description || '').join(' '));
        }
        if (m.method === 'Runtime.exceptionThrown') {
            const ex = m.params.exceptionDetails;
            errors.push('Uncaught: ' + (ex.exception && ex.exception.description ? ex.exception.description.split('\n')[0] : ex.text));
        }
        if (m.method === 'Log.entryAdded' && m.params.entry.level === 'error') {
            const e = m.params.entry;
            const txt = e.text || '';
            // Ignore non-blocking warnings
            if (txt.includes('navigator.vibrate') || txt.includes('favicon')) return;
            errors.push('log.error: ' + txt);
        }
    });

    console.log('--- Boot ---');
    await wait(4000);

    console.log('--- Launching solo game (1 vs 1 bot) ---');
    const launch = await evalJS('MenuManager.launchGame(2, "bot")', true);
    await wait(3500);

    const beforePlay = await evalJS(`JSON.stringify({
        players: window.players.map(p => ({ id: p.id, name: p.name, money: p.money, pos: p.position, bot: p.isBot })),
        current: window.Game.currentPlayerIndex
    })`);
    console.log('Initial state:', beforePlay.result.result.value);

    // Force human to roll repeatedly to drive several turns
    const NUM_ROLLS = 20;
    let rollOk = 0, rollFail = 0;
    for (let i = 0; i < NUM_ROLLS; i++) {
        // Wait for human turn
        let waited = 0;
        while (waited < 8000) {
            const state = await evalJS(`JSON.stringify({
                current: window.Game.currentPlayerIndex,
                isBot: window.players[window.Game.currentPlayerIndex].isBot,
                bankrupt: window.players[window.Game.currentPlayerIndex].bankrupt,
                rollVisible: document.getElementById('btn-roll') && !document.getElementById('btn-roll').classList.contains('hidden'),
                animating: !!window.isAnimating,
                processing: !!window.Game.isProcessingTurn
            })`);
            const s = JSON.parse(state.result.result.value);
            if (!s.isBot && s.rollVisible && !s.animating && !s.processing) break;
            await wait(500); waited += 500;
        }
        // Click roll
        const click = await evalJS(`(function(){
            const b = document.getElementById('btn-roll');
            if (!b || b.classList.contains('hidden')) return 'no-btn';
            if (window.isAnimating) return 'animating';
            b.click();
            return 'clicked-' + (window.Game.lastRoll ? window.Game.lastRoll.total : '?');
        })()`);
        const res = click.result.result.value;
        if (res.startsWith('clicked')) rollOk++; else rollFail++;
        process.stdout.write(`Roll ${i + 1}: ${res}  `);

        // Wait for the dice + move animation to finish + auto-end
        await wait(3500);

        // If a "Buy?" modal is open with human, click Buy or Skip randomly to keep flow
        await evalJS(`(function(){
            const buy = document.getElementById('btn-buy');
            const skip = document.getElementById('btn-skip');
            if (buy && !buy.classList.contains('hidden')) {
                (Math.random() < 0.7 ? buy : skip).click();
                return 'bought-or-skipped';
            }
            const end = document.getElementById('btn-end');
            if (end && !end.classList.contains('hidden')) end.click();
            return 'ended';
        })()`);
        await wait(1500);

        // Check game-over
        const gameOver = await evalJS(`window.players.filter(p => !p.bankrupt).length <= 1`);
        if (gameOver.result.result.value) { console.log('\nGame over at roll ' + (i + 1)); break; }
        if ((i + 1) % 5 === 0) console.log('');
    }

    console.log('\n--- Final state ---');
    const finalState = await evalJS(`JSON.stringify({
        players: window.players.map(p => ({ id: p.id, money: p.money, pos: p.position, bankrupt: p.bankrupt })),
        owned: boardData.filter(t => t.owner !== null && t.owner !== undefined).length
    })`);
    const val = finalState && finalState.result && finalState.result.result && finalState.result.result.value;
    console.log(typeof val === 'string' ? val.slice(0, 500) : '(no state)');

    console.log('\nROLLS_OK:', rollOk, '/ no-btn:', rollFail);

    // --- UI smoke tests ---
    console.log('\n--- UI smoke tests ---');
    const tests = [
        { name: 'PropertyCard.open(boardData[1])', expr: `window.PropertyCard.open(window.boardData[1]); !!document.getElementById('property-card-modal')` },
        { name: 'PropertyCard.close()',             expr: `window.PropertyCard.close(); document.getElementById('property-card-modal').classList.contains('hidden')` },
        { name: 'SettingsUI.open()',                expr: `window.SettingsUI.open(); !!document.getElementById('settings-modal')` },
        { name: 'SettingsUI volume slider',         expr: `document.querySelector('#settings-modal input[data-set="master"]').value = 50; document.querySelector('#settings-modal input[data-set="master"]').dispatchEvent(new Event('input')); window.SoundFX.getConfig().master` },
        { name: 'SettingsUI.close()',               expr: `window.SettingsUI.close(); document.getElementById('settings-modal').classList.contains('hidden')` },
        { name: 'TradeUI.open()',                   expr: `window.TradeUI.open(); !!document.getElementById('trade-modal')` },
        { name: 'TradeUI.close()',                  expr: `window.TradeUI.close(); document.getElementById('trade-modal').classList.contains('hidden')` },
        { name: 'replayLastRoll()',                 expr: `if (window.Game.lastRoll) { window.replayLastRoll(); return 'replayed'; } else return 'no-last';` },
        { name: 'exportGameLog()',                  expr: `window.exportGameLog(); 'logged'` },
        { name: 'toggleMortgage(first-owned)',      expr: `(function(){const t = boardData.find(t => t.owner === Game.currentPlayerIndex && t.houses === 0); if (!t) return 'no-owned'; const before = !!t.isMortgaged; window.toggleMortgage(t.id); return 'flipped:' + (t.isMortgaged !== before);})()` },
        { name: 'Tutorial.start()',                 expr: `window.Tutorial.start(); !document.getElementById('tutorial-overlay').classList.contains('hidden')` },
        { name: 'Tutorial close',                   expr: `document.getElementById('tut-skip').click(); document.getElementById('tutorial-overlay').classList.contains('hidden')` }
    ];

    let uiOk = 0, uiFail = 0;
    for (const t of tests) {
        const r = await evalJS(`(function(){ try { return ${t.expr}; } catch(e) { return 'ERR:' + e.message; } })()`);
        const v = r.result && r.result.result && r.result.result.value;
        const ok = typeof v !== 'string' || !v.startsWith('ERR');
        console.log(`  ${ok ? 'PASS' : 'FAIL'}  ${t.name}  →  ${JSON.stringify(v)}`);
        if (ok) uiOk++; else uiFail++;
        await wait(300);
    }

    console.log('\nUI tests:', uiOk + '/' + tests.length, 'passed');
    console.log('ERRORS_COUNT:', errors.length);
    errors.slice(0, 20).forEach(e => console.log('  -', e));

    chrome.kill();
    process.exit(errors.length > 0 || uiFail > 0 ? 2 : 0);
})();
