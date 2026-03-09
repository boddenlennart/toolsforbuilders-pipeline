# @toolsforbuilders — Reel Design Guidelines
*Compiled 2026-03-06 from Opus 4.5 social media + AI educator analysis*

---

## Slide Structure (7 slides)

| # | Slide | Purpose |
|---|-------|---------|
| 1 | Hook | Lime headline on dark — pattern interrupt |
| 2 | Agitate | Problem/bridge on dark |
| 3–5 | Content Points | Tool details (see color rules below) |
| 6 | Proof | Blue full-bleed + lime stat |
| 7 | CTA | Dark, lime handle, Follow Now |

---

## Color Flow Rule (UPDATED)

**Old (flat):** dark → dark → cream → cream → cream → blue → dark

**New (alternating tension):**
| Slide | Background | Why |
|-------|-----------|-----|
| 1 Hook | `#1A1A1A` | Dark anchor |
| 2 Agitate | `#1A1A1A` | Maintains tension |
| 3 Tool 1 | `#F5F5F0` (cream) | Clean slate, relief from dark |
| 4 Tool 2 | `#F0EFE8` (warm tint) | Subtle progression |
| 5 Tool 3 | `#1A1A1A` (dark) | **Pattern interrupt** — kills drop-off |
| 6 Proof | `#0066FF` | High-energy payoff |
| 7 CTA | `#1A1A1A` | Brand anchor |

**Rule:** Never run 3+ identical-background slides in sequence. The dark Tool 3 slide must adapt: light text, accent-colored bullets, reversed watermark.

---

## Content Slide Improvements

### Replace arrow bullets with numbered circles
- **Before:** Blue `→` text marker
- **After:** Circled number badge, 48×48px, accent color fill, white number, weight 800
- **Why:** Sequential numbers create implicit progress. Users remember "the 3rd point" — not "some bullet."

```css
.bullet-num {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 48px;
  height: 48px;
  min-width: 48px;
  border-radius: 50%;
  background: #0066FF;
  color: #fff;
  font-size: 22px;
  font-weight: 800;
  margin-right: 16px;
}
```

### Vertical progress indicator (left edge)
- **Position:** `left: 36px; top: 300px; height: 900px; width: 6px;`
- **Track:** accent color at 15% opacity
- **Fill:** 33% / 66% / 100% for slides 3 / 4 / 5
- **Why:** Creates anticipation ("more coming"), signals the series, reduces drop-off

```css
.vert-track {
  position: absolute;
  left: 36px;
  top: 300px;
  width: 6px;
  height: 900px;
  background: rgba(0,102,255,0.15);
  border-radius: 3px;
}
.vert-fill {
  position: absolute;
  top: 0;
  width: 100%;
  background: #0066FF;
  border-radius: 3px;
  /* height set per slide: 33% / 66% / 100% */
}
```

### Large background accent shape (top-right)
- **What:** Large geometric circle, accent color at 8–12% opacity, top-right corner, partially clipped
- **Size:** 400×400px, `border-radius: 50%`
- **Position:** `top: -60px; right: -80px;`
- **Why:** Fills dead space, adds visual depth without competing with text

```css
.bg-accent {
  position: absolute;
  top: -60px;
  right: -80px;
  width: 400px;
  height: 400px;
  border-radius: 50%;
  background: #0066FF;
  opacity: 0.10;
  pointer-events: none;
}
```

### "Best For" use-case badge (between verdict and bullets)
- **Position:** Below verdict line, above bullet list
- **Style:** Dark (#1A1A1A) rounded pill, white text, 24px, inline-flex
- **Content:** Short phrase like "Quick fact-checks" or "Deep dives"
- Derived from `point.verdict` — first 3 words or a dedicated `bestFor` field

---

## Agitate Slide Improvements

- Add large background number (e.g. "!" or "×") as decorative element, 600px, 4% opacity
- Or: a diagonal accent stripe across the lower third

---

## Text Rendering Rules (mandatory)

- **Every element that receives script content must have `white-space:pre-line`** — script fields use `\n` for line breaks, which only render in HTML with this property
- **Every centered text block must have `text-align:center` explicitly** — flexbox `align-items:center` centers the block, not the text inside
- Elements with `\n` content: `.hook`, `.sub`, `.main`, `.bridge`, `.stat`, `.context`, `.value`, `.verdict`
- Elements that are always single-line: `.pill`, `.label`, `.quickwin`, `.watermark`, `.source`, `.btn`

## Typography Rules (unchanged)
- Font: Inter (local base64 woff2)
- Hook headline: 96px weight 900
- Tool name: 84px weight 900
- Body/bullets: 34px weight 500
- No external fonts — everything is embedded

---

## Implementation Priority
1. ✅ **Numbered circles** (replaces arrows) — Easy, high visual impact
2. ✅ **Vertical progress bar** — Easy, reduces drop-off
3. ✅ **Background accent circle** (top-right on cream slides) — Easy, fills dead space
4. ✅ **Color alternation** (slide 5 → dark) — Medium, requires dark variant of buildPoint
5. 🔲 Tool-specific SVG icons — Hard, skip for now
