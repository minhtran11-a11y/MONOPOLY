# Eval Rubric — GAN Design Loop (Cờ Tỷ Phú 3D UI)

Chấm theo screenshot thật (gan-harness/shots/iter-N/) + đọc code. Mỗi mục 0-10,
điểm tổng = trung bình có trọng số. PASS khi tổng ≥ 7.5 VÀ gates xanh.

### Design Quality (weight: 0.35)
- Hierarchy: mắt biết nhìn đâu trước ở MỖI màn hình? Scale contrast có thật không?
- Depth/layering: hệ thống lớp nhất quán (không phải blur rải đều)?
- Typography: pairing có chiến lược, tracking/leading được tinh chỉnh, không default-stack?
- Màu: palette kỷ luật, màu mang ngữ nghĩa, cả desktop lẫn mobile intentional?
- Composition: bố cục từng surface (menu, lobby, HUD, modal, toast) có chủ đích?

### Originality (weight: 0.30)
- Có QUAN ĐIỂM thị giác riêng không, hay vẫn ngửi thấy mùi template/shadcn/AI-default?
- Hướng đã chọn (deco/noir/casino/...) hiện diện nhất quán ở mọi surface?
- Có ít nhất 2 khoảnh khắc "wow" tự viết (layout lạ, animation chữ ký, chi tiết văn hóa Việt tinh tế)?
- Would this win a design award? Câu hỏi trung tâm của mục này.

### Craft (weight: 0.25)
- Chi tiết hoàn thiện: border/radius/shadow nhất quán theo hệ; không lệch pixel rõ;
  spacing rhythm; trạng thái hover/focus/active/disabled được thiết kế.
- Motion: easing/duration có hệ thống, làm rõ luồng, tôn trọng reduced-motion.
- Mobile 375: không vỡ, không tràn, drawer/panel dùng được, vẫn giữ identity.
- Code sạch: token hóa qua CSS variables/tailwind theme, không magic hex rải rác.

### Functionality (weight: 0.10)
- Gates xanh (tsc + verify_runtime ERRORS 0/vibrate-only).
- Mọi nút bấm được, modal mở/đóng, không che khuất bàn cờ 3D vô lý, không mất nhãn tiếng Việt.

## Output bắt buộc của Evaluator
Ghi `gan-harness/feedback-<N>.md`:
1. Bảng điểm 4 mục + weighted total (1 chữ số thập phân)
2. Top 3 điểm mạnh PHẢI GIỮ (đừng để generator phá cái đang hay)
3. Top 5 việc cụ thể nhất để tăng điểm nhiều nhất (file + element + hướng sửa)
4. Verdict: PASS / ITERATE
Và append 1 dòng vào `gan-harness/scores.csv`: iter,design,originality,craft,functionality,total
