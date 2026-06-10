// Lazy Three.js loader — replaces the old CDN <script> injection.
// Vite code-splits this into its own chunk; nothing here lands in the entry
// bundle, preserving the lazy-on-game-start LCP strategy.
// Legacy code consumes the global THREE namespace (THREE.Scene, THREE.OrbitControls...),
// so we merge core + addons onto window.THREE (namespace objects are frozen — copy needed).

export async function loadThree() {
    const [THREE, { OrbitControls }] = await Promise.all([
        import('three'),
        import('three/examples/jsm/controls/OrbitControls.js'),
    ]);
    window.THREE = Object.assign({}, THREE, { OrbitControls });
}
