// GAN harness screenshot rig — captures a fixed shot set via Chrome CDP.
// Usage: node gan-harness/screenshot.cjs <outDirName>   (default: latest)
// Requires the Vite dev server on http://127.0.0.1:8770.
const { spawn } = require('child_process');
const http = require('http');
const fs = require('fs');
const path = require('path');

const CHROME = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
const URL = 'http://127.0.0.1:8770/';
const OUT = path.join(__dirname, 'shots', process.argv[2] || 'latest');
fs.mkdirSync(OUT, { recursive: true });

const wait = (ms) => new Promise(r => setTimeout(r, ms));

function launchChrome(port, w, h) {
    const tmp = require('os').tmpdir() + `/monopoly-shot-${port}-` + Date.now();
    const proc = spawn(CHROME, [
        '--headless=new', '--disable-gpu', '--no-sandbox', '--hide-scrollbars',
        `--remote-debugging-port=${port}`, '--remote-allow-origins=*',
        '--user-data-dir=' + tmp, `--window-size=${w},${h}`, URL,
    ], { detached: false });
    proc.stderr.on('data', () => {});
    return proc;
}

function getJSON(port, p) {
    return new Promise((res, rej) => {
        http.get(`http://127.0.0.1:${port}` + p, r => {
            let d = ''; r.on('data', c => d += c);
            r.on('end', () => { try { res(JSON.parse(d)); } catch (e) { rej(e); } });
        }).on('error', rej);
    });
}

async function connect(port) {
    let target = null;
    for (let i = 0; i < 20 && !target; i++) {
        try { target = (await getJSON(port, '/json')).find(t => t.type === 'page' && t.url.includes('127.0.0.1')); } catch (e) {}
        if (!target) await wait(500);
    }
    if (!target) throw new Error('NO_TARGET on port ' + port);
    const WebSocket = require('ws');
    const ws = new WebSocket(target.webSocketDebuggerUrl);
    await new Promise((res, rej) => { ws.on('open', res); ws.on('error', rej); });
    let id = 1;
    const send = (m, p) => new Promise(res => {
        const my = id++;
        ws.send(JSON.stringify({ id: my, method: m, params: p }));
        const h = (d) => { const x = JSON.parse(d.toString()); if (x.id === my) { ws.off('message', h); res(x); } };
        ws.on('message', h);
    });
    return { ws, send };
}

async function shot(send, name) {
    const r = await send('Page.captureScreenshot', { format: 'png' });
    if (r.result && r.result.data) {
        fs.writeFileSync(path.join(OUT, name), Buffer.from(r.result.data, 'base64'));
        console.log('SHOT', name);
    } else {
        console.log('SHOT_FAIL', name, JSON.stringify(r.error || {}));
    }
}

async function evalJs(send, expression, awaitPromise = false) {
    const r = await send('Runtime.evaluate', { expression, returnByValue: true, awaitPromise });
    return r.result && r.result.result ? r.result.result.value : undefined;
}

async function waitForLaunch(send) {
    for (let i = 0; i < 40; i++) {
        await wait(500);
        const ok = await evalJs(send, `!!(window.players && window.players.length > 0 && !document.getElementById('game-ui-layer').classList.contains('hidden'))`);
        if (ok) return true;
    }
    return false;
}

(async () => {
    // ---------- Desktop 1440x900 ----------
    let chrome = launchChrome(9340, 1440, 900);
    try {
        await wait(2500);
        const { send } = await connect(9340);
        await send('Page.enable'); await send('Runtime.enable');
        await wait(3500);
        await shot(send, '01-menu-intro.png');

        await evalJs(send, `document.getElementById('btn-start-game')?.click()`);
        await wait(1200);
        await shot(send, '02-menu-modes.png');

        await evalJs(send, `document.getElementById('mode-online-trigger')?.click()`);
        await wait(1500);
        await shot(send, '03-lobby-or-online.png');

        // reload → bot game flow
        await send('Page.navigate', { url: URL });
        await wait(4000);
        await evalJs(send, `MenuManager.launchGame(2, 'bot')`, true);
        await waitForLaunch(send);
        await wait(1500);
        await shot(send, '04-hud-turn-modal.png');

        await evalJs(send, `document.getElementById('btn-roll')?.click()`);
        await wait(1400);
        await shot(send, '05-dice-rolling.png');
        await wait(4500);
        await shot(send, '06-after-roll.png');

        await evalJs(send, `document.getElementById('btn-settings')?.click()`);
        await wait(900);
        await shot(send, '07-settings.png');
    } catch (e) {
        console.error('DESKTOP_ERR:', e.message);
    } finally {
        chrome.kill();
    }

    // ---------- Mobile 375x812 ----------
    chrome = launchChrome(9341, 375, 812);
    try {
        await wait(2500);
        const { send } = await connect(9341);
        await send('Page.enable'); await send('Runtime.enable');
        await wait(3500);
        await shot(send, '08-mobile-menu.png');

        await evalJs(send, `MenuManager.launchGame(2, 'bot')`, true);
        await waitForLaunch(send);
        await wait(1500);
        await shot(send, '09-mobile-hud.png');
    } catch (e) {
        console.error('MOBILE_ERR:', e.message);
    } finally {
        chrome.kill();
    }

    console.log('DONE ->', OUT);
    process.exit(0);
})();
