# Generator State — Iteration 002

## What Was Built
SƠN MÀI (Indochine Lacquer Deco) re-direction carried from the token system
(iter-1) INTO every live surface. All 7 cold-palette React surfaces + index.html
menu/HUD/modals + the JS-drawn menu logo now speak the lacquer language.

## What Changed This Iteration (the Evaluator's Top-5, verbatim)

### Fix 1 — Kill the cold-palette utilities across surfaces (DONE)
Converted every rendered cold Tailwind utility to lacquer tokens:
- **ActionModal.tsx**: 0 cold remaining.
- **BuildPanels.tsx**: 0 — rows recolored (gold-tinted cards, son-mài build
  button, jade/gold mortgage buttons, gold/terracotta status text, gold headers).
- **GameLog.tsx**: 0 rendered — bullet+text gold/ivory, header buttons now
  `.log-icon-btn`. (3 remaining hits are the `BOT_CHAT_RE` regex + drain
  querySelector + a doc comment — they MATCH game.js-emitted DOM and must not
  change; not rendered classNames.)
- **MenuScreens.tsx**: 0 stray — seats/labels/spinner/close/swatches/inputs all
  lacquer. (2 remaining `bg-emerald-600` are the jade success semantic on
  VÀO PHÒNG / SẴN SÀNG, re-skinned to jade by CSS — the feedback's KEEP list.)
- **PlayerPanel.tsx**: 0 — money now gold; jail=terracotta, active=jade,
  thinking dots gold.
- **SettingsPanel.tsx**: 0 — overlay/title/headings/choice-buttons/footer all
  lacquer; choice buttons gild when active.
- **TradeModal.tsx**: 0 — indigo focus rings → gold; checkbox accent → son-mài.
- **ToastStack.tsx**: already 0 (uses `.toast-*` CSS, semantic border-left tints).

### Fix 2 — Serif identity (DONE)
`font-display` (Playfair) applied to: ActionModal title (son-700), legacy
#modal-title, MenuScreens "Chơi Online"/"Phòng chờ"/room-code, index.html
"Chọn chế độ chơi"/"Tùy chọn BOT Solo"/1vs1-2-3, Settings "Cài đặt", rules-modal
title, tile-name, player money figures. Tracking tuned (deco serif, not default).

### Fix 3 — Menu hero CTA (DONE)
index.html "BẮT ĐẦU CHƠI" white pill → `.btn-primary` gilded lacquer with the
gold-foil sweep (CSS `::after`). Resume button → jade/gold. Mobile inherits
(`.btn-primary` is responsive). Decor blobs indigo/rose → son-700/gold.

### Fix 4 — ActionModal per-kind button map (DONE)
roll/buy → `.btn-son` (son-mài red + gold border), build → `.btn-terracotta`,
skip → `.btn-taupe` (warm taupe lacquer), end → `.btn-gold` (gold-on-lacquer),
fallback → taupe. New `.btn-action.btn-*` skins added to style.css. Modal body is
now the ivory `.glass-panel.paper` deed-card (matches the welcome modal — the
template the feedback said to replicate).

### Fix 5 — Online overlay + drum watermark (DONE)
Online overlay → `.glass-panel.deco-frame` (khắc-vàng inlay), serif titles, icon
tiles + "MỚI"/"SẮP RA MẮT" badge → oxblood+gold (querySelector updated to match
the new `bg-son-600` badge). Drum-watermark: added a real Đông Sơn SVG (concentric
rings + 16 sun-rays + central star) behind the menu, slow-spinning gold, radial
mask + low opacity so it reads as atmosphere; honors reduced-motion.

## Extras (own judgment)
- Player money: gold + `font-display` + `tabular-nums` (money deserves the leaf).
- `.hud-btn` base: designed gold-leaf hover (lift + gold ring) replacing the old
  `hover:bg-white` per-button utilities.
- Menu logo (menu.js canvas draw, cosmetic only): slate ground → lacquer oxblood,
  banner → son-mài red, inner border → gold hairline, "VIỆT NAM" → gold-300.
- Rules modal → ivory deed-card + serif + son-mài headings.
- Toasts already semantic per direction (jade/gold/terracotta border-left).

## Known Issues
- 6 grep hits remain in surfaces but ALL are justified (logic-interop regex/
  querySelector matching game.js DOM, or the praised jade semantic). Zero stray
  rendered cold utilities.

## Gates (both PASS)
- `npx tsc --noEmit` → exit 0, no errors.
- `node verify_runtime.cjs` → playersCount 2, ERRORS_COUNT 1 (navigator.vibrate
  only = allowed/PASS per spec).

## Dev Server
- URL: http://127.0.0.1:8770
- Status: running (untouched — Vite JIT recompiled Tailwind for the new tokens)
- Command: npm run dev
