// Online integration smoke: 2 anonymous clients play the lobby + first actions
// against the LIVE Supabase project. Run: node verify_online.cjs
const fs = require('fs');
const path = require('path');

// Parse .env.local (not committed)
const env = {};
for (const line of fs.readFileSync(path.join(__dirname, '.env.local'), 'utf8').split(/\r?\n/)) {
    const m = line.match(/^([A-Z_]+)=(.+)$/);
    if (m) env[m[1]] = m[2].trim();
}
const URL = env.VITE_SUPABASE_URL;
const KEY = env.VITE_SUPABASE_ANON_KEY;
if (!URL || !KEY) { console.error('FAIL: .env.local missing'); process.exit(1); }

const { createClient } = require('@supabase/supabase-js');

const mk = () => createClient(URL, KEY, { auth: { persistSession: false } });

let failures = 0;
const check = (name, cond, extra) => {
    console.log(`${cond ? 'PASS' : 'FAIL'}  ${name}${extra ? ' — ' + extra : ''}`);
    if (!cond) failures++;
};

(async () => {
    const A = mk(), B = mk();

    // 1. Anonymous sign-in (requires the dashboard toggle)
    const a = await A.auth.signInAnonymously();
    const b = await B.auth.signInAnonymously();
    check('anonymous sign-in A', !a.error, a.error?.message);
    check('anonymous sign-in B', !b.error, b.error?.message);
    if (a.error || b.error) process.exit(1);

    // 2. Create room (RPC, security definer)
    const created = await A.rpc('create_room', { p_display_name: 'Toàn', p_color: '#ef4444', p_token: 'pawn' });
    check('create_room', !created.error && created.data?.code?.length === 6, created.error?.message || JSON.stringify(created.data));
    const roomId = created.data?.room_id, code = created.data?.code;

    // 3. Join room by code
    const joined = await B.rpc('join_room', { p_code: code, p_display_name: 'Khách', p_color: '#3b82f6', p_token: 'pawn' });
    check('join_room', !joined.error && joined.data === roomId, joined.error?.message);

    // 3b. Wrong code rejected
    const badJoin = await B.rpc('join_room', { p_code: 'ZZZZZZ', p_display_name: 'X', p_color: '#fff', p_token: 'pawn' });
    check('join_room wrong code -> ROOM_NOT_FOUND', /ROOM_NOT_FOUND/.test(badJoin.error?.message || ''), badJoin.error?.message);

    // 4. Both ready (own-row RLS update)
    const rA = await A.from('room_players').update({ is_ready: true }).eq('room_id', roomId).eq('user_id', a.data.user.id);
    const rB = await B.from('room_players').update({ is_ready: true }).eq('room_id', roomId).eq('user_id', b.data.user.id);
    check('setReady A', !rA.error, rA.error?.message);
    check('setReady B', !rB.error, rB.error?.message);

    // 5. RLS: client must NOT be able to write games directly
    const hack = await A.from('games').insert({ room_id: roomId, state: {} });
    check('RLS blocks client games insert', !!hack.error, hack.error ? hack.error.code : 'INSERT SUCCEEDED (BAD!)');

    // 6. Non-host cannot start
    const bStart = await B.functions.invoke('game-action', { body: { roomId, type: 'START_GAME' } });
    const bStartErr = bStart.error ? await bStart.error.context?.json?.().catch(() => null) : null;
    check('non-host START rejected', !!bStart.error, JSON.stringify(bStartErr || bStart.data));

    // 7. Host starts the game (server randomizes the starting player — by design)
    const started = await A.functions.invoke('game-action', { body: { roomId, type: 'START_GAME' } });
    check('host START_GAME', !started.error && started.data?.ok, started.error ? JSON.stringify(await started.error.context?.json?.().catch(() => '?')) : '');
    const st0 = started.data?.state;
    check('initial state: 2 players, 40 tiles', st0?.players?.length === 2 && st0?.tiles?.length === 40);
    const firstSeat = st0?.currentPlayerIndex;
    check('random start seat in {0,1}', firstSeat === 0 || firstSeat === 1, `firstSeat=${firstSeat}`);
    const Cur = firstSeat === 0 ? A : B;   // client whose turn it is
    const Oth = firstSeat === 0 ? B : A;

    // 8. Wrong-turn guard: the OTHER client tries to roll first
    const badRoll = await Oth.functions.invoke('game-action', { body: { roomId, action: { type: 'ROLL' } } });
    const badRollErr = badRoll.error ? await badRoll.error.context?.json?.().catch(() => null) : null;
    check('out-of-turn ROLL -> NOT_YOUR_TURN', badRollErr?.error === 'NOT_YOUR_TURN', JSON.stringify(badRollErr || badRoll.data));

    // 9. Current player rolls (server-side dice)
    const roll = await Cur.functions.invoke('game-action', { body: { roomId, action: { type: 'ROLL' } } });
    const ok9 = !roll.error && roll.data?.ok && roll.data.seq === 1;
    check('current player ROLL accepted, seq 1', ok9, roll.error ? JSON.stringify(await roll.error.context?.json?.().catch(() => '?')) : `seq=${roll.data?.seq}`);
    if (ok9) {
        const act = roll.data.action;
        const moved = roll.data.events?.find((e) => e.type === 'MOVED');
        check('server injected dice 1-6', act?.d1 >= 1 && act?.d1 <= 6 && act?.d2 >= 1 && act?.d2 <= 6, `d1=${act?.d1} d2=${act?.d2}`);
        check('MOVED event emitted', !!moved, JSON.stringify(roll.data.events?.map((e) => e.type)));
    }

    // 10. State persisted with version
    const g = await A.from('games').select('version, state').eq('room_id', roomId).single();
    check('games row version 1 after roll', !g.error && g.data?.version === 1, g.error?.message || `version=${g.data?.version}`);

    // 11. Action log appended by the correct seat
    const log = await A.from('game_actions').select('seq, seat').eq('game_id', (await A.from('games').select('id').eq('room_id', roomId).single()).data.id);
    check('game_actions has seq 1 by first seat', !log.error && log.data?.some((r) => r.seq === 1 && r.seat === firstSeat), log.error?.message);

    // Cleanup: leave room (B then A)
    await B.rpc('leave_room', { p_room_id: roomId });
    await A.rpc('leave_room', { p_room_id: roomId });

    console.log(failures === 0 ? '\nALL ONLINE CHECKS PASSED' : `\n${failures} CHECK(S) FAILED`);
    process.exit(failures === 0 ? 0 : 2);
})().catch((e) => { console.error('CRASH:', e); process.exit(3); });
