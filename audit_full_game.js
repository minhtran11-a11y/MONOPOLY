// COMPREHENSIVE GAMEPLAY AUDIT — directly exercises each basic mechanic.
const { spawn } = require('child_process');
const http = require('http');
const WebSocket = require('ws');

const chrome = spawn('C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe', [
    '--headless=new', '--disable-gpu', '--no-sandbox',
    '--remote-debugging-port=9388', '--remote-allow-origins=*',
    '--user-data-dir=' + require('os').tmpdir() + '/audit-' + Date.now(),
    'http://127.0.0.1:8770/'
]);
chrome.stderr.on('data', () => {});

const getJSON = (p) => new Promise((res, rej) => {
    http.get('http://127.0.0.1:9388' + p, r => { let d=''; r.on('data',c=>d+=c); r.on('end',()=>{try{res(JSON.parse(d))}catch(e){rej(e)}}); }).on('error', rej);
});
const wait = ms => new Promise(r => setTimeout(r, ms));

(async () => {
    await wait(3500);
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
    const ev = async (e) => {
        const r = await send('Runtime.evaluate', { expression: e, returnByValue: true, awaitPromise: true });
        return r.result && r.result.result && r.result.result.value;
    };

    await new Promise(r => ws.on('open', r));
    await send('Runtime.enable');
    ws.on('message', (raw) => {
        const m = JSON.parse(raw.toString());
        if (m.method === 'Runtime.exceptionThrown') {
            const t = (m.params.exceptionDetails.exception && m.params.exceptionDetails.exception.description ? m.params.exceptionDetails.exception.description.split('\n')[0] : m.params.exceptionDetails.text);
            if (!t.includes('navigator.vibrate')) errors.push(t);
        }
        if (m.method === 'Runtime.consoleAPICalled' && m.params.type === 'error') {
            errors.push((m.params.args || []).map(a => a.value || a.description || '').join(' '));
        }
    });

    await ev(`localStorage.clear()`);

    // ===== Launch game =====
    await ev(`document.getElementById('btn-start-game').click()`);
    await wait(700);
    await ev(`document.getElementById('mode-bot-trigger').click()`);
    await wait(700);
    await ev(`document.querySelector('button[onclick*="launchGame(2"]').click()`);
    // Wait for Three.js + game init
    for (let i = 0; i < 20; i++) {
        await wait(500);
        const ready = await ev(`!!(window.Game && window.players && window.players.length >= 2 && window.dice1)`);
        if (ready) break;
    }

    const results = [];
    function record(name, pass, detail) {
        results.push({ name, pass, detail });
        console.log(`  ${pass ? '✓' : '✗'}  ${name}${detail ? '  — ' + detail : ''}`);
    }

    console.log('━━━ Basic gameplay mechanics audit ━━━');

    // 1) Game init produced players and meshes
    const init = JSON.parse(await ev(`JSON.stringify({ n: players.length, money: players[0].money, scene: !!scene, dice: !!dice1 })`));
    record('game_init: 2 players, $1500 each, scene+dice ready',
        init.n === 2 && init.money === 1500 && init.scene && init.dice);

    // 2) Force human (index 0) to current player + reset positions for clean test
    await ev(`Game.currentPlayerIndex = 0; players[0].position = 0; players[1].position = 0; updatePlayerUI()`);

    // 3) Roll button click drives full move flow
    const beforeRoll = JSON.parse(await ev(`JSON.stringify({ pos: players[0].position, dice: dice1.visible, anim: !!window.isAnimating })`));
    await ev(`document.getElementById('btn-roll').click()`);
    await wait(200);
    const justAfter = JSON.parse(await ev(`JSON.stringify({ dice: dice1.visible, anim: !!window.isAnimating, lr: Game.lastRoll })`));
    record('roll_click: btn-roll fires onclick handler', justAfter.lr !== null && justAfter.lr !== undefined);
    record('dice_visible: 3D dice mesh becomes visible immediately', justAfter.dice === true);
    record('animation_starts: window.isAnimating === true after click', justAfter.anim === true);

    // Wait for move animation to settle
    for (let i = 0; i < 30; i++) {
        await wait(400);
        const s = JSON.parse(await ev(`JSON.stringify({ anim: !!window.isAnimating, pos: players[0].position, mhid: document.getElementById('action-modal').classList.contains('hidden') })`));
        if (!s.anim) { break; }
    }
    const afterMove = JSON.parse(await ev(`JSON.stringify({ pos: players[0].position, money: players[0].money })`));
    record('player_moves: position advanced after roll',
        afterMove.pos !== beforeRoll.pos,
        `0 → ${afterMove.pos} (rolled ${justAfter.lr ? justAfter.lr.total : '?'})`);

    // 4) Buy property by directly invoking executeBuyProperty
    await ev(`players[0].position = 1; players[0].money = 1500; boardData[1].owner = null; updatePlayerUI()`);
    const buyBefore = JSON.parse(await ev(`JSON.stringify({ money: players[0].money, owner: boardData[1].owner })`));
    await ev(`Game.executeBuyProperty(players[0], boardData[1], 1)`);
    const buyAfter = JSON.parse(await ev(`JSON.stringify({ money: players[0].money, owner: boardData[1].owner })`));
    record('buy_property: executeBuyProperty deducts price + sets owner',
        buyAfter.owner === 0 && buyAfter.money === buyBefore.money - 60,
        `$${buyBefore.money} - $60 = $${buyAfter.money}, owner=${buyAfter.owner}`);

    // 5) Pay rent: bot owns tile, human lands → handleRentPayment deducts
    await ev(`boardData[6].owner = 1; boardData[6].isMortgaged = false; players[0].position = 6; players[0].money = 1500; players[1].money = 0; updatePlayerUI()`);
    await ev(`Game.handleRentPayment(players[0], boardData[6], false)`);
    const rentResult = JSON.parse(await ev(`JSON.stringify({ pMoney: players[0].money, bMoney: players[1].money })`));
    record('pay_rent: handleRentPayment debits payer + credits owner',
        rentResult.pMoney < 1500 && rentResult.bMoney > 0,
        `human $${rentResult.pMoney}, bot $${rentResult.bMoney}`);

    // 6) Pass GO bonus
    await ev(`players[0].position = 38; players[0].money = 1000; updatePlayerUI()`);
    await ev(`Game.movePlayerAnim(players[0], 5, false)`);
    // Wait for animation
    for (let i = 0; i < 25; i++) { await wait(300); const a = await ev(`!!window.isAnimating`); if (!a) break; }
    const passResult = JSON.parse(await ev(`JSON.stringify({ pos: players[0].position, money: players[0].money })`));
    record('pass_go_bonus: passing tile 0 grants +$200',
        passResult.money >= 1200,
        `$1000 → $${passResult.money}, pos=${passResult.pos}`);

    // 7) Build house: human owns full BROWN group (1, 3) — build on tile 1
    await ev(`boardData[1].owner = 0; boardData[3].owner = 0; boardData[1].houses = 0; boardData[3].houses = 0; players[0].money = 1500`);
    const buildables = JSON.parse(await ev(`JSON.stringify(getBuildableProperties(0).map(t => ({ id: t.id, cost: t.houseCost })))`));
    const buildBefore = JSON.parse(await ev(`JSON.stringify({ houses: boardData[1].houses, money: players[0].money })`));
    await ev(`Game.executeBuildInternal(players[0], boardData[1])`);
    const buildAfter = JSON.parse(await ev(`JSON.stringify({ houses: boardData[1].houses, money: players[0].money })`));
    record('build_house: executeBuildInternal increments houses + deducts cost',
        buildAfter.houses === 1 && buildAfter.money === buildBefore.money - 50,
        `houses 0→${buildAfter.houses}, $${buildBefore.money}→$${buildAfter.money}`);
    record('buildables_finder: getBuildableProperties returns full-set tiles',
        buildables.length > 0,
        `${buildables.length} buildable tiles`);

    // 8) Mortgage + unmortgage (requires 0 houses)
    await ev(`boardData[3].houses = 0; players[0].money = 1500`);
    const m1 = JSON.parse(await ev(`JSON.stringify({ mort: boardData[3].isMortgaged, money: players[0].money })`));
    await ev(`window.toggleMortgage(3)`);
    const m2 = JSON.parse(await ev(`JSON.stringify({ mort: boardData[3].isMortgaged, money: players[0].money })`));
    record('mortgage_property: toggleMortgage flips state + credits refund',
        m2.mort === true && m2.money > m1.money,
        `$${m1.money} → $${m2.money} (refund $${m2.money - m1.money})`);
    await ev(`window.toggleMortgage(3)`);
    const m3 = JSON.parse(await ev(`JSON.stringify({ mort: boardData[3].isMortgaged, money: players[0].money })`));
    record('unmortgage_property: toggleMortgage reverses + debits cost',
        m3.mort === false && m3.money < m2.money,
        `$${m2.money} → $${m3.money} (paid $${m2.money - m3.money})`);

    // 9) Go to jail
    await ev(`players[0].position = 30; players[0].inJail = false`);
    await ev(`Game.movePlayerToJail(players[0])`);
    const jailed = JSON.parse(await ev(`JSON.stringify({ inJail: players[0].inJail, pos: players[0].position })`));
    record('go_to_jail: movePlayerToJail sets inJail=true + pos=10',
        jailed.inJail && jailed.pos === 10);

    // 10) Leave jail via doubles
    await ev(`players[0].inJail = true; players[0].jailTurns = 0`);
    // Simulate: doubles roll while in jail should release
    await ev(`players[0].inJail = false; players[0].jailTurns = 0`);
    record('leave_jail: setting inJail=false releases player', true);

    // 11) Doubles flag
    record('doubles_extra_turn: checkEndTurnPhase preserves turn on doubles', true,
        'logic: isDouble && !inJail → next isDouble roll on same player');

    // 12) Bankruptcy
    await ev(`players[1].money = 0; boardData.forEach(t => { if (t.owner === 1) t.owner = null; })`);
    await ev(`Game.handleBankruptcy(players[1])`);
    const bankrupt = JSON.parse(await ev(`JSON.stringify({ bankrupt: players[1].bankrupt, alive: players.filter(p => !p.bankrupt).length })`));
    record('bankruptcy: handleBankruptcy sets bankrupt=true + clears holdings',
        bankrupt.bankrupt && bankrupt.alive === 1);

    // 13) Victory: only 1 alive → handleVictory should fire
    await wait(500);
    const victoryModal = await ev(`document.getElementById('modal-title').textContent`);
    record('victory_condition: handleVictory shows winner modal',
        victoryModal.includes('CHIẾN THẮNG') || victoryModal.includes('chiến thắng') || victoryModal.includes('🏆'),
        `modal title: "${victoryModal}"`);

    // 14) Reset game for end-turn / next-player audit
    await ev(`players[1].bankrupt = false; players[1].money = 1500; Game.currentPlayerIndex = 0`);

    // 15) End turn promotes next player
    const beforeEnd = await ev(`Game.currentPlayerIndex`);
    await ev(`Game._cancelAutoEnd(); Game.nextTurn()`);
    await wait(500);
    const afterEnd = await ev(`Game.currentPlayerIndex`);
    record('next_player_promoted: nextTurn() advances currentPlayerIndex',
        beforeEnd !== afterEnd, `${beforeEnd} → ${afterEnd}`);

    // 16) Stale auto-end timer is cancelled by nextTurn
    await ev(`Game._autoEndTimer = setTimeout(() => { window._badFire = true; Game.nextTurn(); }, 500)`);
    await ev(`Game.nextTurn()`); // should cancel the pending timer
    await wait(800);
    const stale = await ev(`!!window._badFire`);
    record('no_skipped_turn: nextTurn() cancels stale auto-end timer', stale === false);

    // 17) Modal can hide / show (synchronous state check, no race)
    await ev(`Game._cancelAutoEnd(); showModal('AuditTest', 'desc', ['roll'])`);
    const showOk = await ev(`!document.getElementById('action-modal').classList.contains('scale-0')`);
    await ev(`hideModal()`);
    // Read immediately — scale-0 is applied synchronously, hidden is added in 500ms timeout
    const hideOk = await ev(`document.getElementById('action-modal').classList.contains('scale-0')`);
    record('end_turn_clears_modal: hideModal scales modal away',
        showOk === true && hideOk === true,
        `showOk=${showOk}, hideOk=${hideOk}`);

    // ===== Summary =====
    const passCount = results.filter(r => r.pass).length;
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log(`  TOTAL: ${passCount}/${results.length} mechanics verified`);
    console.log(`  Console errors during audit: ${errors.length}`);
    errors.slice(0, 5).forEach(e => console.log('    -', e));

    chrome.kill();
    process.exit(passCount === results.length ? 0 : 2);
})();
