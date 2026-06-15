import { ctx3d } from './context.js';

// --- DICE ROLL ANIMATION ---
// Self-contained mini physics integrator with:
//   1. Toss-up trajectory under gravity + floor restitution
//   2. Dice-dice sphere-collision (no overlap)
//   3. Quaternion-based angular integration so rotation is uniform over SO(3)
//      (Euler integration biased Z-aligned faces 3+4 to ~12% each — fixed)
//   4. Result d1/d2 read from whichever face ended up pointing world-+Y
//
// The mesh's quaternion is the source of truth for rotation; Euler angles
// are never stored or accumulated.

// --- Layout constants (match engine.js dice mesh size) ---
const BOARD_Y      = 2.4;
const GRAVITY      = 30;
const REST         = 0.35;
const FRICTION     = 0.78;
const ANG_DAMP     = 0.82;
const WALL_XZ      = 9;
const MAX_SIM_MS   = 3000;
const SETTLE_HOLD  = 900;
const SNAP_MS      = 220;
const DICE_RADIUS    = 1.6;
const DICE_MIN_DIST  = DICE_RADIUS * 2;
const COLLIDE_REST   = 0.55;

// --- Face mapping (engine.js BoxGeometry material order [+X,-X,+Y,-Y,+Z,-Z]
// uses pip textures [2, 5, 1, 6, 3, 4]) ---
const FACE_LOCAL_NORMAL = [
    null,
    [0,  1, 0],   // 1 → +Y
    [1,  0, 0],   // 2 → +X
    [0,  0, 1],   // 3 → +Z
    [0,  0, -1],  // 4 → -Z
    [-1, 0, 0],   // 5 → -X
    [0, -1, 0],   // 6 → -Y
];

function faceRot(num) {
    switch (num) {
        case 1: return { x: 0,            y: 0, z: 0 };
        case 6: return { x: Math.PI,      y: 0, z: 0 };
        case 2: return { x: 0,            y: 0, z:  Math.PI / 2 };
        case 5: return { x: 0,            y: 0, z: -Math.PI / 2 };
        case 3: return { x: -Math.PI / 2, y: 0, z: 0 };
        case 4: return { x:  Math.PI / 2, y: 0, z: 0 };
    }
    return { x: 0, y: 0, z: 0 };
}

function powerProfile(power) {
    const p = Math.max(0, Math.min(1, power));
    return {
        vy:   6.0 + p * 10.0,
        vh:   0.6 + p * 1.4,
        spin: 6   + p * 14,
    };
}

// Uniform random quaternion on SO(3) — Shoemake's method. This is the
// difference between fair dice (1/6 per face) and the Euler-angle bias that
// pinned faces 3+4 to ~12% each.
function randomUnitQuaternion() {
    const u1 = Math.random();
    const u2 = Math.random() * Math.PI * 2;
    const u3 = Math.random() * Math.PI * 2;
    const a = Math.sqrt(1 - u1);
    const b = Math.sqrt(u1);
    return {
        x: a * Math.sin(u2),
        y: a * Math.cos(u2),
        z: b * Math.sin(u3),
        w: b * Math.cos(u3),
    };
}

function makeInitialState(power) {
    const jitter = () => (Math.random() - 0.5) * 1.0;
    const prof = powerProfile(power);
    const seed = (sign) => {
        const q = randomUnitQuaternion();
        return {
            mesh: sign < 0 ? ctx3d.dice1 : ctx3d.dice2,
            // Position
            px: sign * 2.6 + jitter(),
            py: 3.0 + Math.random() * 0.4,
            pz: sign * 1.0 + jitter(),
            // Linear velocity (sign carries toward the centerline)
            vx: sign * (prof.vh + Math.random() * 0.6),
            vy: prof.vy + Math.random() * 1.2,
            vz: (Math.random() - 0.5) * prof.vh,
            // Angular velocity (rad/s) — large for visible tumble
            wx: (Math.random() - 0.5) * prof.spin,
            wy: (Math.random() - 0.5) * prof.spin,
            wz: (Math.random() - 0.5) * prof.spin,
            // Orientation as quaternion (NOT Euler — preserves SO(3) uniformity)
            qx: q.x, qy: q.y, qz: q.z, qw: q.w,
        };
    };
    return [seed(-1), seed(1)];
}

// Sync mesh transform from state quaternion + position.
function applyMesh(s) {
    s.mesh.position.set(s.px, s.py, s.pz);
    s.mesh.quaternion.set(s.qx, s.qy, s.qz, s.qw);
}

function isResting(s) {
    const lin = Math.hypot(s.vx, s.vy, s.vz);
    const ang = Math.hypot(s.wx, s.wy, s.wz);
    return s.py <= BOARD_Y + 0.02 && lin < 0.25 && ang < 0.4;
}

// Read which face (1..6) is pointing UP. Rotates each face's local normal by
// the die's current quaternion and picks the one with the largest world-Y.
function readFaceUp(s) {
    let best = 1, bestY = -Infinity;
    const qx = s.qx, qy = s.qy, qz = s.qz, qw = s.qw;
    for (let f = 1; f <= 6; f++) {
        const n = FACE_LOCAL_NORMAL[f];
        // v' = q * v * q⁻¹, expanded for v = (n[0], n[1], n[2]):
        const ix =  qw * n[0] + qy * n[2] - qz * n[1];
        const iy =  qw * n[1] + qz * n[0] - qx * n[2];
        const iz =  qw * n[2] + qx * n[1] - qy * n[0];
        const iw = -qx * n[0] - qy * n[1] - qz * n[2];
        const y  =  iy * qw + iw * (-qy) + iz * (-qx) - ix * (-qz);
        if (y > bestY) { bestY = y; best = f; }
    }
    return best;
}

// Quaternion integration: q_dot = 0.5 · ω̂ · q, where ω̂ = (0, wx, wy, wz).
// Then q ← q + q_dot · dt, then re-normalize. Mathematically correct for
// rigid-body angular motion; avoids the Euler-angle Z-bias.
function integrateRotation(s, dt) {
    const wx = s.wx, wy = s.wy, wz = s.wz;
    const qx = s.qx, qy = s.qy, qz = s.qz, qw = s.qw;
    // ω̂ · q  (with ω̂ = (0, wx, wy, wz))
    const dx = 0.5 * ( qw * wx + qy * wz - qz * wy);
    const dy = 0.5 * ( qw * wy - qx * wz + qz * wx);
    const dz = 0.5 * ( qw * wz + qx * wy - qy * wx);
    const dw = 0.5 * (-qx * wx - qy * wy - qz * wz);
    let nx = qx + dx * dt;
    let ny = qy + dy * dt;
    let nz = qz + dz * dt;
    let nw = qw + dw * dt;
    const norm = Math.sqrt(nx * nx + ny * ny + nz * nz + nw * nw);
    if (norm > 1e-8) {
        s.qx = nx / norm; s.qy = ny / norm; s.qz = nz / norm; s.qw = nw / norm;
    }
}

function integrateDie(s, dt) {
    // Linear motion under gravity
    s.vy -= GRAVITY * dt;
    s.px += s.vx * dt;
    s.py += s.vy * dt;
    s.pz += s.vz * dt;

    // Floor collision
    if (s.py <= BOARD_Y) {
        s.py = BOARD_Y;
        if (Math.abs(s.vy) < 0.8) {
            s.vy = 0;
            s.vx *= 0.6;  s.vz *= 0.6;
            s.wx *= 0.55; s.wy *= 0.55; s.wz *= 0.55;
        } else {
            s.vy = -s.vy * REST;
            s.vx *= FRICTION;  s.vz *= FRICTION;
            s.wx *= ANG_DAMP;  s.wy *= ANG_DAMP; s.wz *= ANG_DAMP;
        }
    }
    // Soft wall clamps (keep dice in camera frame)
    if (s.px >  WALL_XZ) { s.px =  WALL_XZ; s.vx = -Math.abs(s.vx) * 0.5; }
    if (s.px < -WALL_XZ) { s.px = -WALL_XZ; s.vx =  Math.abs(s.vx) * 0.5; }
    if (s.pz >  WALL_XZ) { s.pz =  WALL_XZ; s.vz = -Math.abs(s.vz) * 0.5; }
    if (s.pz < -WALL_XZ) { s.pz = -WALL_XZ; s.vz =  Math.abs(s.vz) * 0.5; }

    integrateRotation(s, dt);
}

// Sphere-sphere collision between the two dice. Resolves overlap, applies an
// elastic impulse along contact normal, and kicks angular velocity so dice
// tumble after impact instead of sliding apart cleanly.
function handleDiceCollision(a, b) {
    const dx = b.px - a.px;
    const dy = b.py - a.py;
    const dz = b.pz - a.pz;
    const dist = Math.sqrt(dx * dx + dy * dy + dz * dz);
    if (dist >= DICE_MIN_DIST || dist < 1e-4) return;

    const nx = dx / dist, ny = dy / dist, nz = dz / dist;
    const overlap = DICE_MIN_DIST - dist;

    // Push each die back along the normal so they no longer overlap
    const push = overlap * 0.5;
    a.px -= nx * push; a.py -= ny * push; a.pz -= nz * push;
    b.px += nx * push; b.py += ny * push; b.pz += nz * push;

    // Skip impulse if dice are already separating
    const rvx = a.vx - b.vx;
    const rvy = a.vy - b.vy;
    const rvz = a.vz - b.vz;
    const rvn = rvx * nx + rvy * ny + rvz * nz;
    if (rvn <= 0) return;

    // Elastic impulse, equal masses → impulse split evenly
    const j = (1 + COLLIDE_REST) * rvn * 0.5;
    a.vx -= j * nx; a.vy -= j * ny; a.vz -= j * nz;
    b.vx += j * nx; b.vy += j * ny; b.vz += j * nz;

    // Angular kick from contact (random because contact point isn't tracked)
    const kick = Math.abs(rvn) * 0.6;
    a.wx += (Math.random() - 0.5) * kick;
    a.wy += (Math.random() - 0.5) * kick;
    a.wz += (Math.random() - 0.5) * kick;
    b.wx += (Math.random() - 0.5) * kick;
    b.wy += (Math.random() - 0.5) * kick;
    b.wz += (Math.random() - 0.5) * kick;
}

// Slerp each die onto faceRot(faces[i]) over SNAP_MS, also lerp y → BOARD_Y.
// The face passed in is the one already CLOSEST to up, so the angular delta
// is small (a few degrees) — visually a "settle", not a flip.
function slerpToFace(state, faces, onLanded) {
    if (typeof THREE === 'undefined') {
        state.forEach((s, i) => {
            const r = faceRot(faces[i]);
            s.mesh.rotation.set(r.x, r.y, r.z);
            s.mesh.position.y = BOARD_Y;
        });
        if (window.SoundFX && window.SoundFX.diceSettle) window.SoundFX.diceSettle();
        onLanded();
        return;
    }
    const fromQ = state.map((s) => s.mesh.quaternion.clone());
    const toQ = state.map((s, i) => {
        const r = faceRot(faces[i]);
        return new THREE.Quaternion().setFromEuler(new THREE.Euler(r.x, r.y, r.z, 'XYZ'));
    });
    const fromY = state.map((s) => s.mesh.position.y);

    const t0 = performance.now();
    function tick(now) {
        const t = Math.min(1, (now - t0) / SNAP_MS);
        const ease = t * (2 - t);
        state.forEach((s, i) => {
            s.mesh.quaternion.copy(fromQ[i]).slerp(toQ[i], ease);
            s.mesh.position.y = fromY[i] + (BOARD_Y - fromY[i]) * ease;
        });
        if (t < 1) {
            requestAnimationFrame(tick);
        } else {
            if (window.SoundFX && window.SoundFX.diceSettle) window.SoundFX.diceSettle();
            onLanded();
        }
    }
    requestAnimationFrame(tick);
}

// Core simulation loop. `forcedFaces` (if provided) overrides the read-from-
// physics result — used only by the replay path so a saved roll plays back
// to its original (d1, d2).
function runToss(power, onResult, forcedFaces) {
    if (!ctx3d.dice1 || !ctx3d.dice2) {
        onResult(1, 1);
        return;
    }
    const state = makeInitialState(power);

    state.forEach((s) => {
        s.mesh.visible = true;
        applyMesh(s);
    });

    const t0 = performance.now();
    let lastT = t0;

    function step(now) {
        const dt = Math.min(0.05, (now - lastT) / 1000);
        lastT = now;
        const elapsed = now - t0;

        state.forEach((s) => integrateDie(s, dt));
        handleDiceCollision(state[0], state[1]);
        state.forEach(applyMesh);

        if (state.every(isResting) || elapsed >= MAX_SIM_MS) {
            const d1 = forcedFaces ? forcedFaces[0] : readFaceUp(state[0]);
            const d2 = forcedFaces ? forcedFaces[1] : readFaceUp(state[1]);
            slerpToFace(state, [d1, d2], () => {
                setTimeout(() => {
                    ctx3d.dice1.visible = false;
                    ctx3d.dice2.visible = false;
                    onResult(d1, d2);
                }, SETTLE_HOLD);
            });
            return;
        }
        requestAnimationFrame(step);
    }
    requestAnimationFrame(step);
}

// PUBLIC: physics-driven toss. Callback receives (d1, d2) read from whichever
// face ended up on top of each die after the simulation settles.
function tossDice(callback, power = 0.6) {
    window.isAnimating = true;
    runToss(power, (d1, d2) => {
        window.isAnimating = false;
        if (typeof callback === 'function') callback(d1, d2);
    }, null);
}

// LEGACY / REPLAY: caller already knows d1/d2 (saved roll) and wants the
// animation to land on those specific faces. Same physics for visual
// consistency, but the final slerp targets the saved faces.
function rollDiceAnimation(d1, d2, callback, power = 0.6) {
    window.isAnimating = true;
    runToss(power, () => {
        window.isAnimating = false;
        if (typeof callback === 'function') callback();
    }, [d1, d2]);
}

export { rollDiceAnimation, tossDice, readFaceUp };
window.rollDiceAnimation = rollDiceAnimation; // LEGACY-BRIDGE
window.tossDice = tossDice; // LEGACY-BRIDGE
