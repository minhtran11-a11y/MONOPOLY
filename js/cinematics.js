// --- CAMERA CINEMATICS ---
// All camera auto-movement has been disabled — player controls camera freely via OrbitControls.

(function () {
    function playIntro(onDone) {
        // No intro animation — keep camera at starting position
        if (window.controls) window.controls.enabled = true;
        if (onDone) onDone();
    }

    function focusOnPlayer(player, onDone) {
        // No auto-focus — player controls camera freely
        if (onDone) onDone();
    }

    function returnToOverview(onDone) {
        // No auto-return — player controls camera freely
        if (onDone) onDone();
    }

    function playWinning(winner) {
        // No winning cinematic camera movement
    }

    window.Cinematics = { playIntro, focusOnPlayer, returnToOverview, playWinning };
})();
