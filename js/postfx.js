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
    const renderScene = new THREE.RenderPass(scene, camera);

    composer = new THREE.EffectComposer(renderer);
    composer.addPass(renderScene);

    if (bloomStrength > 0) {
        const bloomPass = new THREE.UnrealBloomPass(
            new THREE.Vector2(window.innerWidth, window.innerHeight),
            1.5, 0.4, 0.85
        );
        bloomPass.threshold = 0.85;
        bloomPass.strength = bloomStrength;
        bloomPass.radius = 0.3;
        composer.addPass(bloomPass);
    }

    if (tier !== 'low' && THREE.ShaderPass) {
        const vignettePass = new THREE.ShaderPass(VignetteShader);
        vignettePass.renderToScreen = true;
        composer.addPass(vignettePass);
        window._vignettePass = vignettePass;
    }
}
