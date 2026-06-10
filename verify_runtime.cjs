// Headless Chrome verifier: load the game, wait for init, capture console + errors.
// Uses Chrome DevTools Protocol directly via WebSocket — no extra deps.
const { spawn } = require('child_process');
const http = require('http');

const CHROME = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
const URL = 'http://127.0.0.1:8770/';
const TMP = require('os').tmpdir() + '/monopoly-chrome-' + Date.now();
const args = [
    '--headless=new', '--disable-gpu', '--no-sandbox',
    '--remote-debugging-port=9333',
    '--remote-allow-origins=*',
    '--user-data-dir=' + TMP,
    '--window-size=1280,800',
    URL
];

const chrome = spawn(CHROME, args, { detached: false });
chrome.stderr.on('data', () => {});
chrome.stdout.on('data', () => {});

function getJSON(path) {
    return new Promise((res, rej) => {
        http.get('http://127.0.0.1:9333' + path, r => {
            let d = '';
            r.on('data', c => d += c);
            r.on('end', () => { try { res(JSON.parse(d)); } catch (e) { rej(e); } });
        }).on('error', rej);
    });
}

async function wait(ms) { return new Promise(r => setTimeout(r, ms)); }

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
    if (!target) {
        console.error('NO_TARGET');
        chrome.kill();
        process.exit(1);
    }
    const WebSocket = (() => { try { return require('ws'); } catch (e) { return null; } })();
    if (!WebSocket) {
        // ws not available — use built-in via http upgrade
        // simpler: just dump page text via /json/version
        console.log('NO_WS_LIB — installing globally would help; using fallback');
        chrome.kill();
        process.exit(0);
    }
    const ws = new WebSocket(target.webSocketDebuggerUrl);
    const errors = [];
    const logs = [];
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
    ws.on('open', async () => {
        await send('Runtime.enable');
        await send('Log.enable');
        await send('Page.enable');
        await send('Network.enable');
        ws.on('message', (raw) => {
            const m = JSON.parse(raw.toString());
            if (m.method === 'Runtime.consoleAPICalled') {
                const t = m.params.type;
                const txt = (m.params.args || []).map(a => a.value !== undefined ? String(a.value) : (a.description || JSON.stringify(a))).join(' ');
                if (t === 'error') errors.push('console.error: ' + txt);
                logs.push(`[${t}] ${txt}`);
            }
            if (m.method === 'Runtime.exceptionThrown') {
                const ex = m.params.exceptionDetails;
                errors.push('Uncaught: ' + (ex.exception && ex.exception.description ? ex.exception.description : ex.text));
            }
            if (m.method === 'Log.entryAdded') {
                const e = m.params.entry;
                if (e.level === 'error') errors.push('log.error: ' + e.text + (e.url ? ' [' + e.url + ']' : ''));
            }
            if (m.method === 'Network.responseReceived') {
                const r = m.params.response;
                if (r.status >= 400) errors.push('HTTP ' + r.status + ': ' + r.url);
            }
        });
        await wait(6000);
        // Probe initial state
        const probe = await send('Runtime.evaluate', {
            expression: `JSON.stringify({
                Game: typeof Game !== 'undefined',
                Tokens: typeof TokenFactory !== 'undefined',
                Settings: typeof Settings !== 'undefined',
                rollDiceAnimation: typeof rollDiceAnimation !== 'undefined',
                btnRollHasOnclick: !!(document.getElementById('btn-roll') && document.getElementById('btn-roll').onclick),
                fps: window.getPerfMetrics ? window.getPerfMetrics().fps : null,
                LCP: window.getPerfMetrics ? window.getPerfMetrics().LCP : null,
                CLS: window.getPerfMetrics ? window.getPerfMetrics().CLS : null
            })`,
            returnByValue: true
        });
        console.log('PROBE:', probe.result.result.value);

        // Simulate full game launch: click start → bot mode → 1vs1
        await send('Runtime.evaluate', {
            expression: `MenuManager.launchGame(2, 'bot');`
        });
        // Poll until launch completes — Three.js CDN download time varies in a
        // fresh headless profile, so a fixed 2.5s wait races the init (max 20s).
        let launched = false;
        for (let i = 0; i < 40 && !launched; i++) {
            await wait(500);
            const chk = await send('Runtime.evaluate', {
                expression: `!!(window.players && window.players.length > 0 && !document.getElementById('game-ui-layer').classList.contains('hidden'))`,
                returnByValue: true
            });
            launched = chk.result && chk.result.result && chk.result.result.value === true;
        }
        if (!launched) errors.push('LAUNCH_TIMEOUT: game did not initialize within 20s');

        const ingame = await send('Runtime.evaluate', {
            expression: `JSON.stringify({
                playersCount: window.players ? window.players.length : 0,
                gameLogVisible: !document.getElementById('game-ui-layer').classList.contains('hidden'),
                currentPlayer: window.Game ? window.Game.currentPlayerIndex : null
            })`,
            returnByValue: true
        });
        console.log('IN_GAME:', ingame.result.result.value);

        // Click roll (or trigger directly to bypass modal scale-0)
        await send('Runtime.evaluate', { expression: `document.getElementById('btn-roll').click();` });
        await wait(2500);

        const afterRoll = await send('Runtime.evaluate', {
            expression: `JSON.stringify({
                dice1Visible: window.dice1 ? window.dice1.visible : null,
                dice2Visible: window.dice2 ? window.dice2.visible : null,
                isAnimating: !!window.isAnimating,
                lastRoll: window.Game ? window.Game.lastRoll : null
            })`,
            returnByValue: true
        });
        console.log('AFTER_ROLL:', afterRoll.result.result.value);

        // Wait for animation + move complete
        await wait(5000);
        const finalState = await send('Runtime.evaluate', {
            expression: `JSON.stringify({
                fps: window.getPerfMetrics ? window.getPerfMetrics().fps : null,
                LCP_ms: window.getPerfMetrics && window.getPerfMetrics().LCP ? Math.round(window.getPerfMetrics().LCP) : null,
                FCP_ms: window.getPerfMetrics && window.getPerfMetrics().FCP ? Math.round(window.getPerfMetrics().FCP) : null,
                CLS: window.getPerfMetrics ? Number(window.getPerfMetrics().CLS.toFixed(4)) : null,
                playerMoved: window.players && window.players[window.Game.currentPlayerIndex] ? window.players[window.Game.currentPlayerIndex].position : null
            })`,
            returnByValue: true
        });
        console.log('FINAL:', finalState.result.result.value);
        console.log('ERRORS_COUNT:', errors.length);
        errors.slice(0, 25).forEach(e => console.log('  - ' + e));
        chrome.kill();
        process.exit(errors.length > 0 ? 2 : 0);
    });
    ws.on('error', (e) => { console.error('WS_ERR:', e.message); chrome.kill(); process.exit(3); });
})();
