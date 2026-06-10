# Feedback — Iteration 1 (Evaluator)

Direction: **SƠN MÀI (Indochine Lacquer Deco)**. Generator crashed mid-flight: tokens
+ `css/style.css` + `index.html` + `direction.md` done; the 8 React surfaces in
`src/ui/react/surfaces/*.tsx` were NOT touched. Result is a **half-converted** UI:
ground layer and shared chrome (`.glass-panel`, `.btn-action`, `.btn-primary`,
`.glass-panel.paper`) now render lacquer, but inline Tailwind utilities inside the JSX
still hardcode the old slate/indigo/purple palette. **74 stray cold-palette utilities
remain across 7 of 8 surfaces.** Scoring reflects what the screenshots SHOW, not what the
token system promises.

## Score table

| Category | Score | Weight | Weighted |
|---|---|---|---|
| Design Quality | 4.8 | 0.35 | 1.68 |
| Originality | 4.5 | 0.30 | 1.35 |
| Craft | 6.5 | 0.25 | 1.63 |
| Functionality | 7.5 | 0.10 | 0.75 |
| **TOTAL** | | | **5.4** |

**Verdict: ITERATE** (threshold 7.5).

---

## Per-shot notes (iter-0 → iter-1)

- **01 menu-intro:** Ground glow cold-blue → warm oxblood radial. On-brief. But CTA
  "BẮT ĐẦU CHƠI" is still a generic **white pill** — no gold foil, no lacquer. The single
  most visible menu element ignores the direction.
- **02 menu-modes:** Cards picked up gold hairline + warm ground via shared CSS. But title
  "CHỌN CHẾ ĐỘ CHƠI" is still bold-**italic sans**, not Playfair serif. Icons still
  cold blue/purple. "MỚI" badge still magenta. Reads half-converted.
- **03 online overlay:** Real win — "TẠO PHÒNG" CTA went indigo → sơn-mài red,
  "VÀO PHÒNG" → jade, panel warmed. But title still sans; modal is dark-glass, not the
  prescribed ivory deed-card; globe icon still cold blue.
- **04 / 05 / 06 / 07 / 09 (welcome modal):** **Strongest proof point.** The action modal
  is now an ivory aged-paper deed card: oxblood-colored title, gold→oxblood step bar,
  sơn-mài red "TIẾP THEO", warm taupe "BỎ QUA". This is exactly the direction landing.
  HUD chrome behind is warm now. (Shots 05/06/07 captured the modal still up, not the
  dice/settings states — harness capture limitation, not a design signal.) **Gap:** the
  title is `text-slate-900 ... font-black` (bold sans that merely reads dark on ivory),
  NOT `.view-title`/Playfair. The serif identity moment the direction demands is absent.
- **08 mobile-menu:** Warm ground, no overflow, intact. CTA still white pill.
- **09 mobile-hud:** Deed-card modal renders correctly at 375 — readable, reachable,
  identity preserved. Same title-not-serif gap.

---

## Top 3 strengths — KEEP (do not let iteration 2 regress these)

1. **The ivory deed-card action modal** (`.glass-panel.paper` in `style.css`, shots 04/07/09).
   Best surface in the build — ivory paper, gold/oxblood top rule, warm secondary button.
   This is the template for every other modal. Keep it; replicate it.
2. **The token system in `css/style.css :root` + `tailwind.config.cjs`.** Clean semantic
   scale (lac/son/gold/jade/ivory/terracotta), 3-tier panel/paper/deco-frame depth, motion
   tokens (`--ease-lac`, `--ease-gold`, `--d-*`), designed `:hover/:active/:focus-visible`.
   Genuinely above tutorial quality. Build on it, don't re-token.
3. **The warm oxblood ground + lacquer CTA recolor** (online "TẠO PHÒNG" red, "VÀO PHÒNG"
   jade). Where shared classes flow through, the palette shift is correct and semantic.

---

## Top 5 highest-leverage fixes (file + element + direction)

1. **Restyle the 8 React surfaces — kill the 74 cold-palette utilities.**
   File: `src/ui/react/surfaces/*.tsx` (worst: `MenuScreens.tsx` 17, `SettingsPanel.tsx` 14,
   `BuildPanels.tsx` 13, `GameLog.tsx` 12). Replace every `text-slate-*`, `bg-slate-*`,
   `bg-indigo-*`, `from-indigo-*`, `*-purple-*` with lacquer tokens (`text-ivory`,
   `text-gold-300`, `bg-son-600`, `text-lac-900` on ivory, `border-gold-600/30`). This is
   the single biggest coverage gain — it converts the remaining ~7 surfaces in one pass.

2. **Make titles serif — apply Playfair to every heading.**
   `ActionModal.tsx:214` uses `text-4xl font-black text-slate-900 ... uppercase`; swap for
   `.view-title`/`font-display` (Playfair). Same for `MenuScreens.tsx` view titles
   ("CHỌN CHẾ ĐỘ CHƠI"), online overlay "CHƠI ONLINE", and the action-modal title. The
   serif identity moment is defined in CSS (`.view-title`, `.tutorial-title`, `font-display`)
   but never reaches the live title elements. This is the highest-impact originality fix.

3. **Replace the menu CTA white pill with the gold-foil lacquer button.**
   File: `index.html` (and/or `MenuScreens.tsx`) "BẮT ĐẦU CHƠI" + "BẮT ĐẦU CHƠI" mobile.
   It is the hero element of the menu and currently reads as a default component. Use
   `.btn-primary` with the gold-foil sweep on hover (signature motion already in `style.css`).

4. **Fix the per-kind action buttons before they render incoherent in-game.**
   `ActionModal.tsx:62-71`: `roll → bg-indigo-600`, `skip → bg-slate-500`, fallback
   `bg-slate-700`. These aren't visible in the captured shots (welcome modal occludes them)
   but WILL render indigo/slate the moment buy/roll/skip show. Map them to semantic lacquer:
   primary action → `bg-son-600` gold-border, skip/secondary → warm taupe, danger → terracotta.

5. **Convert the online overlay + mode-card icons/badges to the lacquer language.**
   `MenuScreens.tsx`: make the "CHƠI ONLINE" modal use `.glass-panel.paper` (deed-card) like
   the welcome modal; recolor the bot/globe icon tiles off cold blue/purple onto oxblood+gold;
   recolor the "MỚI" badge from magenta to gold-on-oxblood. Also surface the **drum-watermark**
   (it exists in `style.css` but is invisible in every shot) as the menu backdrop — that is a
   missing signature "wow" moment the originality score is waiting on.

---

## Coherence check vs direction.md

The manifesto's own test — *"if a surface still reads as dark glass with a purple button,
it is wrong"* — currently FAILS on: menu modes (sans title, cold icons, magenta badge),
online overlay (dark-glass body, cold icon), and any in-game action button. It PASSES on the
welcome/action modal. Iteration 2 should make every surface pass that one-line test.
