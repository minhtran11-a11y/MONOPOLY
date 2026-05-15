// --- TOAST NOTIFICATIONS ---
// Lightweight non-blocking feedback. Auto-stacks bottom-right (desktop) / bottom-center (mobile).
(function () {
    const ROOT_ID = 'toast-root';
    const MAX_VISIBLE = 4;
    const DEFAULT_TTL = 3200;

    function ensureRoot() {
        let root = document.getElementById(ROOT_ID);
        if (!root) {
            root = document.createElement('div');
            root.id = ROOT_ID;
            root.className = 'toast-root';
            root.setAttribute('aria-live', 'polite');
            root.setAttribute('aria-atomic', 'false');
            document.body.appendChild(root);
        }
        return root;
    }

    const ICONS = {
        info: 'ℹ️', success: '✅', warn: '⚠️', error: '❌',
        money: '💰', dice: '🎲', build: '🔨', buy: '🏡', jail: '🚓', win: '🏆'
    };

    function show(message, opts = {}) {
        const root = ensureRoot();
        // Cap visible toasts
        while (root.children.length >= MAX_VISIBLE) {
            root.firstElementChild.remove();
        }

        const t = document.createElement('div');
        t.className = `toast toast-${opts.type || 'info'}`;
        t.setAttribute('role', 'status');

        const icon = opts.icon || ICONS[opts.type] || ICONS.info;
        t.innerHTML = `
            <span class="toast-icon" aria-hidden="true">${icon}</span>
            <span class="toast-msg">${message}</span>
        `;
        root.appendChild(t);

        // Animate in
        requestAnimationFrame(() => t.classList.add('toast-in'));

        const ttl = typeof opts.ttl === 'number' ? opts.ttl : DEFAULT_TTL;
        const dismiss = () => {
            t.classList.remove('toast-in');
            t.classList.add('toast-out');
            setTimeout(() => t.remove(), 400);
        };
        const handle = setTimeout(dismiss, ttl);
        t.addEventListener('click', () => { clearTimeout(handle); dismiss(); });
        return dismiss;
    }

    window.Toast = {
        show,
        info:    (m, o) => show(m, { ...o, type: 'info' }),
        success: (m, o) => show(m, { ...o, type: 'success' }),
        warn:    (m, o) => show(m, { ...o, type: 'warn' }),
        error:   (m, o) => show(m, { ...o, type: 'error' }),
        money:   (m, o) => show(m, { ...o, type: 'money', icon: ICONS.money })
    };
})();
