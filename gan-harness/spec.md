# Brief: Re-art-direct toàn bộ UI của Cờ Tỷ Phú 3D

## Sản phẩm
Game Cờ Tỷ Phú (Monopoly) 3D tiếng Việt — bàn cờ Three.js là trung tâm sân khấu,
toàn bộ UI là lớp DOM nổi phía trên (menu, lobby online, HUD in-game, modal, toast).
Stack: Tailwind 3.4 build-time + css/style.css + React surfaces (src/ui/react/surfaces/*.tsx).

## Nhiệm vụ
Hiện trạng là dark-glassmorphism generic — đúng kiểu "template look" bị cấm.
Hãy TÁI ĐỊNH HƯỚNG toàn bộ ngôn ngữ thị giác thành một identity có quan điểm rõ,
xứng tầm design award. MỘT hướng nhất quán xuyên suốt mọi surface, ví dụ (chọn 1
hoặc tự đề xuất hướng mạnh hơn):
- **Indochine Art-Deco**: sơn mài đỏ-đen, vàng kim loại, đường kẻ deco, hoa văn trống đồng tiết chế
- **Hà Nội neon-noir**: đêm phố cổ, neon ấm trên nền tối sâu, ánh đèn hắt
- **Dark luxury casino**: nỉ bàn, foil vàng, serif sang trọng, ánh kim có kỷ luật
Cam kết với hướng đã chọn: palette, typography (tối đa 2 họ font, Google Fonts được phép
đổi), depth system, motion language — tất cả phải kể CÙNG một câu chuyện.

## Chất lượng bắt buộc (tối thiểu 6/10 tiêu chí phải hiện diện rõ)
Hierarchy bằng scale tương phản · rhythm chủ đích (không padding đều tăm tắp) ·
depth/layering thật (không chỉ blur) · typography có chiến lược pairing · màu mang
ngữ nghĩa (tiền/nguy hiểm/thành công) · hover/focus/active được THIẾT KẾ · bố cục
dám phá grid khi hợp lý · texture/atmosphere đúng hướng đã chọn · motion làm rõ
luồng (không trang trí) · trạng thái loading/empty được chăm chút.

## Phạm vi file (CHỈ visual — logic bất khả xâm phạm)
- index.html: markup lớp menu + HUD (class, cấu trúc trang trí, thêm phần tử trang trí được)
- css/style.css + src/styles/tailwind.css + tailwind.config.cjs (theme extend)
- src/ui/react/surfaces/*.tsx: JSX/class/markup — KHÔNG đổi store calls, facade overrides, logic

## Ràng buộc cứng (vi phạm = iteration fail bất kể đẹp cỡ nào)
1. GIỮ NGUYÊN mọi element id mà JS tham chiếu: btn-roll, btn-buy, btn-skip, btn-end,
   btn-build-menu, btn-mortgage-menu, btn-settings, btn-trade, btn-quit, btn-surrender,
   btn-start-game, btn-resume-game, mode-bot-trigger, mode-online-trigger,
   screen-intro, screen-modes, screen-bot-detail, main-menu-layer, game-ui-layer,
   canvas-container, money-bg, menu-logo-canvas, react-root, players-shell,
   players-container, players-toggle, game-log, action-modal, modal-title, modal-desc,
   build-submenu, mortgage-panel, rules-modal, tile-info (+ tile-name/price/owner/color).
   Class `hidden`/`menu-screen` semantics và data-* attributes giữ nguyên hành vi.
2. Nhãn tiếng Việt giữ nguyên nội dung (được đổi kiểu chữ/casing trình bày).
3. Không thêm dependency JS mới; ảnh asset mới phải nhẹ (SVG/CSS-first; tổng thêm <100KB).
4. Menu phải render nhanh (không ảnh hero nặng chặn LCP); prefers-reduced-motion được tôn trọng.
5. Cả desktop (1440) lẫn mobile (375) phải intentional — media query hiện có trong style.css
   phải được cập nhật theo hướng mới, không bỏ rơi.
6. Gates phải xanh sau mỗi iteration: `npx tsc --noEmit` + `node verify_runtime.cjs`
   (ERRORS_COUNT 0, hoặc chỉ lỗi navigator.vibrate).

## Triết lý
Visual excellence là mục tiêu SỐ MỘT. Một giao diện nửa-hoàn-thiện nhưng đẹp sững sờ
thắng một giao diện đủ tính năng mà tầm thường. Hãy liều: layout lạ, animation tự viết,
cách dùng màu có chữ ký riêng. Bàn cờ 3D là nhân vật chính — UI phải tôn nó lên,
không che nó đi.
