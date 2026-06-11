import { ctx3d } from './context.js';

// --- POST-PROCESSING (bloom + vignette, tier aware) ---
// Vignette shader applied after bloom for premium look.

const VignetteShader = {
    uniforms: {
        tDiffuse: { value: null },
        offset:   { value: 1.05 },
        darkness: { value: 1.15 }
    },
    vertexShader: `
        varying vec2 vUv;
        void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }
    `,
    fragmentShader: `
        uniform sampler2D tDiffuse;
        uniform float offset;
        uniform float darkness;
        varying vec2 vUv;
        void main(){
            vec4 texel = texture2D(tDiffuse, vUv);
            vec2 uv = (vUv - 0.5) * 2.0;
            float vig = clamp(1.0 - dot(uv, uv) * 0.55 * offset, 0.0, 1.0);
            vig = pow(vig, darkness);
            gl_FragColor = vec4(texel.rgb * vig, texel.a);
        }
    `
};

function initPostProcessing() {
    const tier = (window.Settings && window.Settings.graphicsTier()) || 'high';
    const bloomStrength = tier === 'low' ? 0.0 : (tier === 'med' ? 0.25 : 0.4);
    const renderScene = new THREE.RenderPass(ctx3d.scene, ctx3d.camera);

    ctx3d.composer = new THREE.EffectComposer(ctx3d.renderer);
    ctx3d.composer.addPass(renderScene);

    if (bloomStrength > 0) {
        const bloomPass = new THREE.UnrealBloomPass(
            new THREE.Vector2(window.innerWidth, window.innerHeight),
            1.5, 0.4, 0.85
        );
        bloomPass.threshold = 0.85;
        bloomPass.strength = bloomStrength;
        bloomPass.radius = 0.3;
        ctx3d.composer.addPass(bloomPass);
    }

    if (tier !== 'low' && THREE.ShaderPass) {
        const vignettePass = new THREE.ShaderPass(VignetteShader);
        vignettePass.renderToScreen = true;
        ctx3d.composer.addPass(vignettePass);
        window._vignettePass = vignettePass;
    }
}

// --- FOCUS VIGNETTE PULSE (dice rolls) ---
// Eases the vignette darkness up ~18% over 300ms while a physics roll is in
// flight, restores it over 400ms at reveal. No-ops cleanly when the composer/
// vignette pass is absent (low tier) or under reduced motion.
const VIGNETTE_BASE_DARKNESS = VignetteShader.uniforms.darkness.value;
const VIGNETTE_PULSE_FACTOR = 1.18;
let _vigAnimId = null;

function pulseVignette(on) {
    const pass = window._vignettePass;
    if (!pass || !pass.uniforms || !pass.uniforms.darkness) return;
    if (window.Settings && window.Settings.isReducedMotion()) return;
    const uniform = pass.uniforms.darkness;
    const from = uniform.value;
    const to = on ? VIGNETTE_BASE_DARKNESS * VIGNETTE_PULSE_FACTOR : VIGNETTE_BASE_DARKNESS;
    const dur = on ? 300 : 400;
    if (_vigAnimId !== null) cancelAnimationFrame(_vigAnimId);
    const t0 = performance.now();
    function tick(now) {
        const t = Math.min(1, (now - t0) / dur);
        const ease = t * (2 - t); // easeOutQuad
        uniform.value = from + (to - from) * ease;
        _vigAnimId = t < 1 ? requestAnimationFrame(tick) : null;
    }
    _vigAnimId = requestAnimationFrame(tick);
}

export { initPostProcessing, pulseVignette };
window.initPostProcessing = initPostProcessing; // LEGACY-BRIDGE
window.PostFX = { pulseVignette }; // LEGACY-BRIDGE
