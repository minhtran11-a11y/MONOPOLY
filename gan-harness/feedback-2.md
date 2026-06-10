# Feedback — Iteration 2 (Evaluator)

Direction: **SƠN MÀI (Indochine Lacquer Deco)**. Iteration 2 carried the iter-1 token
system INTO every live surface. Scoring is against what the 9 screenshots SHOW, with
code spot-checks only to confirm claims that the capture could not surface.

## Score table

| Category | Score | Weight | Weighted |
|---|---|---|---|
| Design Quality | 8.0 | 0.35 | 2.80 |
| Originality | 7.5 | 0.30 | 2.25 |
| Craft | 7.8 | 0.25 | 1.95 |
| Functionality | 9.0 | 0.10 | 0.90 |
| **TOTAL** | | | **7.9** |

**Verdict: PASS** (threshold 7.5, gates green: tsc 0, verify ERRORS vibrate-only).

---

## Did iter-1's Top-5 land? (verified against shots, not claims)

1. **Kill 74 cold-palette utilities** — LANDED. Grep across `surfaces/*.tsx` shows 0
   stray *rendered* cold utilities; the 6 remaining hits are the jade-success
   `bg-emerald-600` (KEEP-listed, CSS reskins to jade) + GameLog regex/querySelector
   matching game.js DOM. Shots 02/03 confirm surfaces now read warm.
2. **Serif titles (Playfair)** — LANDED. "Chọn chế độ chơi" (02) went bold-italic SANS
   → Playfair gold serif. "Chơi Online" (03) is serif gold. "CHÀO MỪNG…" (04/07/09) is
   serif oxblood with real high-contrast strokes. Highest-impact fix, clearly visible.
3. **Menu hero CTA → gilded lacquer** — LANDED. "BẮT ĐẦU CHƠI" white pill (iter-1)
   → son-mài red gilded pill with gold border on both desktop (01) and mobile (08).
4. **Per-kind action button map** — LANDED IN CODE, NOT VISUALLY PROVEN. `ActionModal.tsx`
   maps roll/buy→btn-son, build→btn-terracotta, skip→btn-taupe, end→btn-gold, and those
   skins exist in `style.css`. Shots 05/06/07 still show the welcome modal occluding the
   dice/buy/settings states (same harness capture gap as iter-1), so I cannot SEE these.
5. **Online overlay + drum watermark** — MOSTLY LANDED. Overlay is now a khắc-vàng
   `.deco-frame` with serif gold title and corner ticks (03). Drum watermark is now
   faintly visible behind the menu (01/02/08). The "MỚI" badge went magenta → oxblood.
   PARTIAL MISS: the bot/globe icon tiles are still cold (purple bot, cobalt globe).

Four of five landed cleanly; #5 landed except the cold icon tiles.

---

## Top 3 strengths — KEEP (do not regress)

1. **The ivory deed-card modal, now with serif identity** (04/07/09). Playfair oxblood
   title + gold→oxblood step bar + son-mài/taupe button pair + long soft shadow.
   This is the build's anchor and it reads like a real product. Hold it exactly.
2. **Typography pairing is now doing real work.** Serif = identity moments (titles,
   money), sans = functional chrome. The scale contrast carries hierarchy on every
   captured surface. This is the single biggest jump from iter-1.
3. **Token + motion discipline in `style.css`.** 64 hex are nearly all `:root` token
   defs/gradient stops; btn-son/taupe/gold/terracotta + deco-frame + drum-watermark all
   tokenized with `--ease-lac/--ease-gold/--d-*`, and reduced-motion is honored twice
   (body class + media query). Genuinely above tutorial quality.

---

## Top 5 highest-leverage fixes (file + element + direction)

1. **Recolor the mode-card icon tiles — the last cold elements on the menu.**
   `MenuScreens.tsx` (and/or `index.html` modes markup): the BOT SOLO tile renders a
   purple/violet robot icon and ONLINE renders a cobalt globe (visible in 02, and the
   globe again in 03 next to the serif title). These are the ONE thing still failing the
   manifesto's own test ("dark glass with a purple/blue accent = wrong"). Reskin the icon
   tiles to oxblood grounds with gold-leaf glyphs (`bg-son-700/40`, `text-gold-300`,
   `border-gold-600/30`). Highest-leverage because it's the most visible remaining defect.

2. **Make the Đông Sơn drum watermark actually read as a signature.**
   `style.css .drum-watermark`: at current opacity it is barely perceptible (a ghost of
   rings in 01/02/08). The originality "wow" the score is waiting on is invisible. Lift
   opacity ~1.5–2×, warm the gold a touch, and let it bleed wider behind the logo so the
   sun-ray motif is legible as intentional atmosphere — without competing with the CTA.

3. **Clean the legacy `index.html` fallback action buttons.**
   `index.html:187-191`: `btn-roll bg-indigo-600`, `btn-buy bg-emerald-600`,
   `btn-skip bg-slate-500`, `btn-end bg-purple-600` still carry cold utilities. The React
   `ActionModal` renders over them so users don't see them today, but this is a latent
   palette leak if the React path ever fails to mount. Swap to `btn-son/btn-taupe/btn-gold`
   to match the React map. Pure hygiene, removes the last cold hex from the HUD markup.

4. **Surface the in-game action + settings states so they can be judged (capture gap).**
   Not a product fix — a verification gap. The dice-rolling, buy-prompt, and settings
   states are claimed lacquer (Fix 4 + SettingsPanel) but the welcome modal occludes them
   in shots 05/06/07. For iter-3, dismiss the onboarding modal before capturing 05/06/07
   so the per-kind buttons and settings choice-buttons (gilded-when-active) are visible
   evidence, not code-only claims.

5. **Push restraint check on gold density in the deed-card cluster.**
   `ActionModal`/`style.css`: the welcome card stacks serif-gold-ish title + gold step bar
   + gold-bordered son button + gold emoji. It's on the right side of taste now, but watch
   that successive modals (buy offer, rules) don't tip into gold-everywhere. Reserve the
   gold border for the single headline action per card; let taupe/ivory carry the rest.

---

## Coherence check vs direction.md

The manifesto's one-line test — *"if a surface still reads as dark glass with a purple
button, it is wrong"* — now PASSES on: menu intro, action/welcome modal, online overlay
chrome, HUD, mobile. It still FAILS narrowly on the **mode-card icon tiles** (purple bot,
cobalt globe). Fix #1 closes the last gap. The direction is executed with taste and
restraint — it reads as authentic lacquer Deco, not gold kitsch. This is a real PASS, not
a generous one; the remaining items are polish, not conversion.
