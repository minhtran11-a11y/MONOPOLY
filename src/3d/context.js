// Shared 3D context — single mutable object visible to all scripts (classic + ESM).
// Initialized lazily inside init3D() — THREE is loaded on demand to keep LCP fast.
export const ctx3d = {
    scene: null, camera: null, renderer: null, controls: null,
    boardMeshes: [],
    maxAnisotropy: 1,
    isCameraAnimating: false,
    cameraAnimConfig: null,
    savedCameraPos: null,
    savedCameraTarget: null,
    dice1: null, dice2: null,
    chanceDeck: null, chestDeck: null,
    composer: null, // For Bloom effect
    stars: null,    // For background atmosphere
};
window.ctx3d = ctx3d; // LEGACY-BRIDGE
