// --- FIRST-HOVER TILE HINTS ---
// Show a one-time hint when the player hovers over a tile type for the first time.
(function () {
    const KEY = 'monopoly3d_hints_v1';
    const HINTS = {
        PROPERTY: 'Đây là ô đất. Nhấp để xem giá thuê chi tiết, hoặc dừng lại để mua.',
        RAILROAD: 'Bến tàu / sân bay. Sở hữu càng nhiều, tiền thuê càng cao (25 → 200).',
        UTILITY:  'Công ty tiện ích. Tiền thuê = số trên xí ngầu × 4 (hoặc × 10 nếu sở hữu cả 2).',
        CHANCE:   'Ô Cơ Hội. Rút thẻ bài bất ngờ — có thể tốt hoặc xấu!',
        CHEST:    'Ô Khí Vận. Rút thẻ khí vận để nhận lộc hoặc trả phí.',
        TAX:      'Ô Thuế. Bạn phải nộp một khoản cho ngân hàng khi dừng tại đây.',
        JAIL:     'Thăm Tù. Nếu chỉ đi ngang, không sao. Bị bắt vào tù mới mất lượt.',
        GOTOJAIL: 'Vào Tù! Dừng đây là bị bắt giam ngay lập tức.',
        START:    'Ô Bắt Đầu. Mỗi lần đi qua, bạn nhận được $200.',
        PARKING:  'Bãi đậu xe miễn phí. Nghỉ ngơi, không có gì xảy ra.'
    };

    function loadSeen() {
        try { return JSON.parse(localStorage.getItem(KEY) || '{}'); } catch (e) { return {}; }
    }
    function saveSeen(seen) {
        try { localStorage.setItem(KEY, JSON.stringify(seen)); } catch (e) {}
    }

    const seen = loadSeen();

    function maybeShow(tileType) {
        if (!tileType || seen[tileType] || !HINTS[tileType]) return;
        // Only show hints while tutorial hasn't been completed (avoids nagging veterans).
        if (window.Tutorial && !window.Tutorial.shouldShow()) {
            seen[tileType] = 1; saveSeen(seen); return;
        }
        seen[tileType] = 1;
        saveSeen(seen);
        if (window.Toast) {
            window.Toast.show(`💡 ${HINTS[tileType]}`, { type: 'info', icon: '💡', ttl: 5000 });
        }
    }

    function reset() {
        try { localStorage.removeItem(KEY); } catch (e) {}
    }

    window.HintHover = { maybeShow, reset };
})();
