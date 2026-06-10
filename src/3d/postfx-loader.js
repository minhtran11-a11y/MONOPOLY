// Lazy post-processing + confetti loader — replaces the old CDN <script> chain.
// Merges the r128 jsm passes onto the already-loaded window.THREE namespace,
// matching how postfx.js consumes them (THREE.EffectComposer, THREE.RenderPass, ...).

export async function loadPostFX() {
    const [
        { EffectComposer },
        { RenderPass },
        { ShaderPass },
        { CopyShader },
        { LuminosityHighPassShader },
        { UnrealBloomPass },
        confettiModule,
    ] = await Promise.all([
        import('three/examples/jsm/postprocessing/EffectComposer.js'),
        import('three/examples/jsm/postprocessing/RenderPass.js'),
        import('three/examples/jsm/postprocessing/ShaderPass.js'),
        import('three/examples/jsm/shaders/CopyShader.js'),
        import('three/examples/jsm/shaders/LuminosityHighPassShader.js'),
        import('three/examples/jsm/postprocessing/UnrealBloomPass.js'),
        import('canvas-confetti'),
    ]);
    Object.assign(window.THREE, {
        EffectComposer, RenderPass, ShaderPass,
        CopyShader, LuminosityHighPassShader, UnrealBloomPass,
    });
    window.confetti = confettiModule.default;
}
