// --- FIRST-RUN INTERACTIVE TUTORIAL ---
// 5-step intro. Shown only on first launch (persisted via localStorage).
    const KEY = 'monopoly3d_tutorial_done_v1';
    const ROOT_ID = 'tutorial-overlay';

    const STEPS = [
        {
            title: '👋 Chào mừng tới Cờ Tỷ Phú VN!',
            body: 'Game phiên bản Việt Nam mang tới 4 quân cờ đặc trưng — ô tô, tàu thủy, nón lá, trâu — và các địa danh nổi tiếng (Khuê Văn Các, Chùa Một Cột, Lăng Bác, Bến Nhà Rồng).'
        },
        {
            title: '🎲 Cách di chuyển',
            body: 'Nhấn giữ nút <strong>TUNG XÚC XẮC</strong> (hoặc phím <strong>Space</strong>) để tăng lực, thả ra để tung 2 xúc xắc. Quân cờ của bạn sẽ tự động di chuyển trên bàn cờ.'
        },
        {
            title: '🏡 Mua đất & xây nhà',
            body: 'Khi dừng ở một ô đất chưa có chủ, bạn có thể <strong>MUA</strong>. Sở hữu cả nhóm cùng màu cho phép xây nhà → khách sạn để tăng tiền thuê.'
        },
        {
            title: '💰 Quản lý tài chính',
            body: 'Nhấp vào bất kỳ ô đất nào để xem chi tiết giá thuê. Khi cần tiền, dùng <strong>Cầm cố 🏦</strong> để nhận lại nửa giá. Phá sản khi không trả nổi.'
        },
        {
            title: '⚙️ Tùy chỉnh trải nghiệm',
            body: 'Mở <strong>Cài đặt ⚙️</strong> bất cứ lúc nào để điều chỉnh âm lượng, mức đồ họa, tốc độ animation, chế độ trợ năng. Game tự lưu cài đặt.'
        }
    ];

    function build() {
        const el = document.createElement('div');
        el.id = ROOT_ID;
        el.className = 'tutorial-overlay hidden';
        el.setAttribute('role', 'dialog');
        el.setAttribute('aria-modal', 'true');
        el.innerHTML = `
            <div class="tutorial-card">
                <div class="tutorial-progress" id="tut-progress"></div>
                <h2 class="tutorial-title" id="tut-title"></h2>
                <div class="tutorial-body" id="tut-body"></div>
                <div class="tutorial-actions">
                    <button class="tutorial-btn tutorial-btn-secondary" id="tut-skip" type="button">Bỏ qua</button>
                    <button class="tutorial-btn tutorial-btn-primary" id="tut-next" type="button">Tiếp theo →</button>
                </div>
            </div>`;
        document.body.appendChild(el);
        return el;
    }

    let stepIdx = 0;
    let rootEl = null;

    function render() {
        if (!rootEl) return;
        const step = STEPS[stepIdx];
        rootEl.querySelector('#tut-title').textContent = step.title;
        rootEl.querySelector('#tut-body').innerHTML = step.body;
        const prog = rootEl.querySelector('#tut-progress');
        prog.innerHTML = STEPS.map((_, i) => `<span class="${i <= stepIdx ? 'is-active' : ''}"></span>`).join('');
        const nextBtn = rootEl.querySelector('#tut-next');
        nextBtn.textContent = (stepIdx === STEPS.length - 1) ? 'Bắt đầu chơi ✓' : 'Tiếp theo →';
    }

    function finish() {
        try { localStorage.setItem(KEY, '1'); } catch (e) {}
        if (rootEl) rootEl.classList.add('hidden');
        if (window.SoundFX) window.SoundFX.click();
    }

    function start() {
        if (!rootEl) rootEl = build();
        stepIdx = 0;
        render();
        rootEl.classList.remove('hidden');
        const skipBtn = rootEl.querySelector('#tut-skip');
        const nextBtn = rootEl.querySelector('#tut-next');
        skipBtn.onclick = () => { finish(); };
        nextBtn.onclick = () => {
            if (window.SoundFX) window.SoundFX.click();
            if (stepIdx < STEPS.length - 1) { stepIdx++; render(); }
            else { finish(); }
        };
    }

    function shouldShow() {
        try { return localStorage.getItem(KEY) !== '1'; } catch (e) { return true; }
    }

    function reset() {
        try { localStorage.removeItem(KEY); } catch (e) {}
    }

    window.Tutorial = { start, shouldShow, reset }; // LEGACY-BRIDGE

export const Tutorial = window.Tutorial;
