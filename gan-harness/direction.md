# Art Direction — "SƠN MÀI" (Indochine Lacquer Deco)

A Hanoi 1930s lacquer-and-gold-leaf interpretation of Art-Deco. Think of a
sơn mài (lacquerware) board game in a colonial salon: deep oxblood-black panels,
hand-leafed gold, thin deco rules, and a single disciplined jade accent.
Luxury through restraint, not blur. The 3D board is the lit stage; the UI is
the lacquered frame around it.

## Palette (hex, exact — tokenized in style.css :root)
- Lacquer black   --lac-900 #0B0A0C   (deepest ground)
- Oxblood         --lac-800 #1A0E10 / sơn mài red --son-700 #6E1414, --son-600 #8A1A1A
- Gold leaf       --gold-400 #E8C16B  (primary accent), --gold-300 #F4D99A (highlight), --gold-600 #B8893C (shadow line)
- Jade            --jade-500 #2E7D6B  (semantic: success / "an toàn")
- Ivory paper     --ivory  #F4ECD8   (light surfaces / modal bodies — aged paper, NOT pure white)
- Danger          --danger #C2410C (terracotta-red, money loss / jail)
- Money green stays jade; "tiền vào" uses gold.

## Typography (2 families, Google Fonts)
- Display: "Playfair Display" (900 / italic) — deco serif for titles, logo, modal headings. High contrast strokes carry the salon feel.
- Body/UI: "Be Vietnam Pro" (kept — Vietnamese diacritics safe) for labels, log, stats, buttons. Uppercase + wide tracking for deco chrome.
- Pairing rule: serif = identity moments (titles, money figures), sans = functional chrome. Never serif on small UI controls.

## Depth system (3 tiers — layering, not uniform blur)
1. Ground: lacquer-black canvas + faint gold trống-đồng radial behind menu.
2. Lacquer panels: oxblood gradient + 1px gold hairline border + inset top gold sheen + long soft drop shadow. This replaces .glass-panel everywhere.
3. Ivory cards: aged-paper modal/property bodies sitting ABOVE lacquer (deed-card feel), with a gold color-strip header.
Elevation = warmer border + longer shadow, never more blur.

## Motion language
- Easing: --ease-lac cubic-bezier(.2,.8,.2,1) for entrances; --ease-gold cubic-bezier(.34,1.4,.5,1) for button press spring.
- Gold-foil sweep on primary CTA hover (signature). Entrances rise + fade (translateY+opacity), 420–620ms. No bounce decoration.
- Durations tokenized: --d-fast 160ms, --d-norm 320ms, --d-slow 560ms. All respect prefers-reduced-motion / body.reduced-motion.

## Văn hóa Việt accent (signature, CSS/SVG only)
- Đông Sơn drum (trống đồng) concentric sun-ray motif: a thin gold SVG used as (a) menu backdrop watermark and (b) deco divider above CTAs.
- "Khắc vàng" hairline deco frames (double gold rule with corner ticks) around the logo and key panels — the lacquer-inlay look.

## Coherence rule for future iterations
Every surface: lacquer ground, gold hairline + serif title + sans chrome, one
jade/gold/terracotta semantic accent. If a surface still reads as "dark glass
with a purple button", it is wrong.
