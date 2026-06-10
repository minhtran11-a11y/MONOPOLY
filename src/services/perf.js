// --- WEB VITALS + FPS MEASUREMENT ---
// Logs LCP/CLS/INP/FCP to console. Optional on-screen HUD via ?debug=1 or Settings.
    const metrics = { LCP: null, CLS: 0, INP: null, FCP: null, FID: null, fps: 0 };

    function reportToConsole() {
        const out = {
            LCP_ms: metrics.LCP ? Math.round(metrics.LCP) : null,
            FCP_ms: metrics.FCP ? Math.round(metrics.FCP) : null,
            CLS:    metrics.CLS.toFixed(4),
            INP_ms: metrics.INP ? Math.round(metrics.INP) : null,
            FPS:    metrics.fps
        };
        if (window._perfLogged) return;
        window._perfLogged = true; // LEGACY-BRIDGE
        // eslint-disable-next-line no-console
        console.info('[Web Vitals]', out);
    }

    function observe(type, cb) {
        try {
            new PerformanceObserver((list) => {
                for (const entry of list.getEntries()) cb(entry);
            }).observe({ type, buffered: true });
        } catch (e) {}
    }

    // LCP
    observe('largest-contentful-paint', (e) => { metrics.LCP = e.startTime; updateHUD(); });
    // CLS
    observe('layout-shift', (e) => {
        if (!e.hadRecentInput) { metrics.CLS += e.value; updateHUD(); }
    });
    // FCP
    observe('paint', (e) => {
        if (e.name === 'first-contentful-paint') { metrics.FCP = e.startTime; updateHUD(); }
    });
    // INP approximation via event timing
    observe('event', (e) => {
        if (e.duration && (!metrics.INP || e.duration > metrics.INP)) {
            metrics.INP = e.duration; updateHUD();
        }
    });

    // FPS counter via rAF — opt-in via ?debug=1 or localStorage flag to avoid
    // pinning the main thread during normal play (otherwise it inflates TBT).
    function startFpsTick() {
        let frames = 0, lastTime = performance.now();
        function tick() {
            frames++;
            const now = performance.now();
            if (now - lastTime >= 1000) {
                metrics.fps = Math.round((frames * 1000) / (now - lastTime));
                frames = 0; lastTime = now;
                updateHUD();
            }
            requestAnimationFrame(tick);
        }
        requestAnimationFrame(tick);
    }
    if (isHudOn()) startFpsTick();

    // Report 5s after first paint
    setTimeout(reportToConsole, 5000);
    // And on hide / unload
    document.addEventListener('visibilitychange', () => {
        if (document.hidden) reportToConsole();
    });

    // HUD overlay
    let hud = null;
    function ensureHud() {
        if (hud) return hud;
        hud = document.createElement('div');
        hud.id = 'perf-hud';
        hud.className = 'perf-hud';
        document.body.appendChild(hud);
        return hud;
    }
    function updateHUD() {
        if (!isHudOn()) {
            if (hud) hud.style.display = 'none';
            return;
        }
        const el = ensureHud();
        el.style.display = 'block';
        el.innerHTML = `
            <div><strong>FPS</strong> ${metrics.fps}</div>
            <div><strong>LCP</strong> ${metrics.LCP ? Math.round(metrics.LCP) + 'ms' : '—'}</div>
            <div><strong>FCP</strong> ${metrics.FCP ? Math.round(metrics.FCP) + 'ms' : '—'}</div>
            <div><strong>CLS</strong> ${metrics.CLS.toFixed(3)}</div>
            <div><strong>INP</strong> ${metrics.INP ? Math.round(metrics.INP) + 'ms' : '—'}</div>`;
    }

    function isHudOn() {
        try {
            if (location.search.includes('debug=1')) return true;
            return localStorage.getItem('monopoly3d_perf_hud') === '1';
        } catch (e) { return false; }
    }

    // Toggle helper for console
    window.togglePerfHud = function () { // LEGACY-BRIDGE
        const on = isHudOn();
        try { localStorage.setItem('monopoly3d_perf_hud', on ? '0' : '1'); } catch (e) {}
        updateHUD();
    };
    window.getPerfMetrics = function () { return { ...metrics }; }; // LEGACY-BRIDGE

// ESM exports — same function objects as the legacy window bridges above.
export const togglePerfHud = window.togglePerfHud;
export const getPerfMetrics = window.getPerfMetrics;
