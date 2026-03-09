# Technical Specification: Instagram Carousel Generator v5

**HTML/CSS → Puppeteer → PNG Implementation**

Replaces the buggy `node-canvas` implementation (`generate-carousel-v4.mjs`) with a more maintainable and visually precise HTML/CSS rendering approach.

---

## 1. File Structure

```
scripts/instagram/
├── generate-carousel-v5.mjs          # Main entry point, CLI interface
├── templates/
│   ├── base.css                      # Shared CSS: fonts, colors, utilities
│   ├── cover.html                    # Cover slide template
│   ├── cover.css                     # Cover-specific styles
│   ├── tool.html                     # Tool slide template
│   ├── tool.css                      # Tool-specific styles
│   ├── cta.html                      # CTA slide template
│   └── cta.css                       # CTA-specific styles
├── lib/
│   ├── renderer.mjs                  # Puppeteer rendering engine
│   ├── template-engine.mjs           # Template compilation & data injection
│   └── logo-loader.mjs               # Logo → base64 data URI converter
├── assets/
│   └── logos/
│       ├── claude-fav.png
│       ├── gemini-fav.png
│       ├── notebooklm-fav.png
│       ├── capcut-fav.png
│       └── n8n-fav.png
└── data/samples/final/carousel-1/    # Output directory
    ├── slide-1.png
    ├── slide-2.png
    └── ...
```

---

## 2. Template Architecture

**Approach:** Separate HTML/CSS files per slide type (cover, tool, cta), with shared `base.css`.

**Why this approach:**
- Each slide type has distinct layout requirements
- CSS can be tuned per-slide without cascade conflicts
- Easier to preview individual templates in a browser during development
- Shared base handles fonts, colors, reset

**Template compilation flow:**
1. Read HTML template file
2. Read associated CSS file + base.css
3. Inline CSS into `<style>` tag in HTML head
4. Replace `{{placeholder}}` tokens with data values
5. Pass complete HTML string to Puppeteer

---

## 3. Design Tokens (base.css)

```css
/* templates/base.css */

/* ═══════════════════════════════════════════════════════════════════════════
   @toolsforbuilders Design System v5
   ═══════════════════════════════════════════════════════════════════════════ */

/* Google Fonts - Inter */
@import url('https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800;900&display=swap');

/* Reset */
*, *::before, *::after {
  box-sizing: border-box;
  margin: 0;
  padding: 0;
}

/* Slide container - fixed 1080×1080 */
.slide {
  width: 1080px;
  height: 1080px;
  position: relative;
  overflow: hidden;
  font-family: 'Inter', -apple-system, BlinkMacSystemFont, sans-serif;
  -webkit-font-smoothing: antialiased;
  -moz-osx-font-smoothing: grayscale;
}

/* ─── Brand Colors ─────────────────────────────────────────────────────────── */
:root {
  --blue:         #0066FF;
  --blue-dark:    #0052CC;
  --blue-darker:  #003D99;
  --cream:        #F5F5F0;
  --cream-dark:   #E8E8E3;
  --charcoal:     #1A1A1A;
  --charcoal-light: #2D2D2D;
  --lime:         #BFFF00;
  --lime-dark:    #A6E600;
  --red:          #FF3B3B;
  --red-light:    #FF6B6B;
  --white:        #FFFFFF;
  
  /* Opacity variants */
  --cream-60:     rgba(245, 245, 240, 0.6);
  --cream-45:     rgba(245, 245, 240, 0.45);
  --cream-75:     rgba(245, 245, 240, 0.75);
  --charcoal-60:  rgba(26, 26, 26, 0.6);
  --charcoal-35:  rgba(26, 26, 26, 0.35);
  --charcoal-20:  rgba(26, 26, 26, 0.2);
  --white-08:     rgba(255, 255, 255, 0.08);
  --white-12:     rgba(255, 255, 255, 0.12);
  --white-15:     rgba(255, 255, 255, 0.15);
  --white-20:     rgba(255, 255, 255, 0.20);
  --blue-08:      rgba(0, 102, 255, 0.08);
  --blue-60:      rgba(0, 102, 255, 0.6);
  --red-07:       rgba(255, 59, 59, 0.07);
  --lime-15:      rgba(191, 255, 0, 0.15);
  --lime-30:      rgba(191, 255, 0, 0.30);
  --lime-50:      rgba(191, 255, 0, 0.50);
}

/* ─── Typography Scale ─────────────────────────────────────────────────────── */
.text-display {
  font-size: 160px;
  font-weight: 800;
  line-height: 1;
  letter-spacing: -3px;
}

.text-headline-xl {
  font-size: 90px;
  font-weight: 700;
  line-height: 1.1;
  letter-spacing: -1px;
}

.text-headline {
  font-size: 66px;
  font-weight: 700;
  line-height: 1.15;
  letter-spacing: -0.5px;
}

.text-title {
  font-size: 52px;
  font-weight: 700;
  line-height: 1.2;
}

.text-tool-name {
  font-size: 48px;
  font-weight: 700;
  line-height: 1.2;
}

.text-body-lg {
  font-size: 31px;
  font-weight: 400;
  line-height: 1.4;
}

.text-body {
  font-size: 28px;
  font-weight: 400;
  line-height: 1.45;
}

.text-body-sm {
  font-size: 26px;
  font-weight: 400;
  line-height: 1.4;
}

.text-label {
  font-size: 22px;
  font-weight: 400;
  line-height: 1.3;
}

.text-label-sm {
  font-size: 20px;
  font-weight: 500;
  line-height: 1.3;
  text-transform: uppercase;
  letter-spacing: 1.5px;
}

.text-pill {
  font-size: 24px;
  font-weight: 700;
  line-height: 1;
}

.text-micro {
  font-size: 18px;
  font-weight: 500;
  line-height: 1.3;
  text-transform: uppercase;
  letter-spacing: 2px;
}

/* ─── Utility Classes ──────────────────────────────────────────────────────── */
.pill {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  padding: 12px 24px;
  border-radius: 100px;
  font-weight: 700;
}

.rounded-sm { border-radius: 8px; }
.rounded-md { border-radius: 12px; }
.rounded-lg { border-radius: 20px; }
.rounded-full { border-radius: 9999px; }

.shadow-subtle {
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.08);
}

.shadow-medium {
  box-shadow: 0 4px 16px rgba(0, 0, 0, 0.12);
}

.shadow-elevated {
  box-shadow: 0 8px 32px rgba(0, 0, 0, 0.16);
}

/* Logo container */
.logo-circle {
  width: 64px;
  height: 64px;
  border-radius: 50%;
  background: var(--white);
  display: flex;
  align-items: center;
  justify-content: center;
  overflow: hidden;
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.08);
  border: 2px solid rgba(0, 0, 0, 0.06);
}

.logo-circle img {
  width: 100%;
  height: 100%;
  object-fit: cover;
}

.logo-circle--lg {
  width: 80px;
  height: 80px;
}

/* Watermark */
.watermark {
  position: absolute;
  font-size: 20px;
  font-weight: 500;
  opacity: 0.4;
}
```

---

## 4. Cover Slide (Slide 1)

### HTML Template (`templates/cover.html`)

```html
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <style>{{BASE_CSS}}{{SLIDE_CSS}}</style>
</head>
<body>
  <div class="slide cover">
    <!-- Background noise texture (CSS-based) -->
    <div class="cover__noise"></div>
    
    <!-- Top pill -->
    <div class="cover__top-pill">
      <span class="pill pill--blue">AI TOOLS ⚡</span>
    </div>
    
    <!-- Price section -->
    <div class="cover__price-section">
      <div class="cover__old-price">
        <span class="price-text">{{OLD_PRICE}}</span>
        <div class="strikethrough"></div>
      </div>
      <div class="cover__new-price">$0</div>
    </div>
    
    <!-- Headline -->
    <div class="cover__headline">
      <h1>{{HEADLINE}}</h1>
      <p class="cover__date">{{DATE_LABEL}}</p>
    </div>
    
    <!-- Tool logos row -->
    <div class="cover__tools">
      {{TOOL_LOGOS}}
    </div>
    
    <!-- Divider -->
    <div class="cover__divider"></div>
    
    <!-- Swipe CTA -->
    <div class="cover__swipe">Swipe to see each tool →</div>
    
    <!-- Watermark -->
    <div class="watermark cover__watermark">@toolsforbuilders</div>
  </div>
</body>
</html>
```

### Cover CSS (`templates/cover.css`)

```css
/* templates/cover.css */

.cover {
  background: var(--charcoal);
  display: flex;
  flex-direction: column;
  align-items: center;
}

/* Subtle noise texture via CSS */
.cover__noise {
  position: absolute;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  background-image: url("data:image/svg+xml,%3Csvg viewBox='0 0 400 400' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='noiseFilter'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.9' numOctaves='4' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23noiseFilter)'/%3E%3C/svg%3E");
  opacity: 0.03;
  mix-blend-mode: overlay;
  pointer-events: none;
}

/* Top pill */
.cover__top-pill {
  margin-top: 75px;
}

.pill--blue {
  background: var(--blue);
  color: var(--lime);
  font-size: 24px;
  padding: 14px 28px;
}

/* Price section */
.cover__price-section {
  margin-top: 55px;
  display: flex;
  flex-direction: column;
  align-items: center;
}

.cover__old-price {
  position: relative;
  display: inline-block;
}

.cover__old-price .price-text {
  font-size: 90px;
  font-weight: 700;
  color: var(--cream-60);
  letter-spacing: -1px;
}

.cover__old-price .strikethrough {
  position: absolute;
  top: 50%;
  left: -8px;
  right: -8px;
  height: 7px;
  background: var(--red);
  transform: translateY(-50%);
}

.cover__new-price {
  font-size: 160px;
  font-weight: 800;
  color: var(--lime);
  line-height: 1;
  letter-spacing: -3px;
  margin-top: 10px;
}

/* Headline */
.cover__headline {
  text-align: center;
  margin-top: 15px;
}

.cover__headline h1 {
  font-size: 52px;
  font-weight: 700;
  color: var(--cream);
  letter-spacing: -0.5px;
}

.cover__date {
  font-size: 22px;
  font-weight: 400;
  color: var(--cream-45);
  margin-top: 12px;
}

/* Tool logos row */
.cover__tools {
  display: flex;
  gap: 52px;
  margin-top: 70px;
  align-items: flex-start;
}

.cover__tool {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 12px;
}

.cover__tool .logo-circle {
  width: 80px;
  height: 80px;
}

.cover__tool-label {
  font-size: 20px;
  font-weight: 400;
  color: var(--cream-75);
}

/* Divider */
.cover__divider {
  width: 160px;
  height: 2px;
  background: var(--blue-60);
  margin-top: 85px;
}

/* Swipe CTA */
.cover__swipe {
  font-size: 26px;
  font-weight: 400;
  color: var(--cream-45);
  margin-top: 135px;
}

/* Watermark */
.cover__watermark {
  right: 55px;
  bottom: 30px;
  font-size: 22px;
  font-weight: 700;
  color: var(--cream);
  opacity: 0.55;
}
```

### Cover Tool Logo HTML Fragment (inserted into `{{TOOL_LOGOS}}`)

```html
<!-- Repeated for each tool -->
<div class="cover__tool">
  <div class="logo-circle">
    <img src="{{LOGO_DATA_URI}}" alt="{{TOOL_NAME}}">
  </div>
  <span class="cover__tool-label">{{TOOL_NAME}}</span>
</div>
```

---

## 5. Tool Slide (Slides 2-5)

### HTML Template (`templates/tool.html`)

```html
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <style>{{BASE_CSS}}{{SLIDE_CSS}}</style>
</head>
<body>
  <div class="slide tool">
    <!-- Top accent bar -->
    <div class="tool__accent-bar"></div>
    
    <!-- Two-column layout -->
    <div class="tool__columns">
      
      <!-- LEFT COLUMN (65%) - Cream background -->
      <div class="tool__left">
        <!-- Slide counter -->
        <div class="tool__counter">
          <span class="pill pill--counter">{{SLIDE_NUM}}/{{SLIDE_TOTAL}}</span>
        </div>
        
        <!-- Tool header: logo + name -->
        <div class="tool__header">
          <div class="tool__accent-line" style="background: {{TOOL_COLOR}};"></div>
          <div class="logo-circle logo-circle--lg">
            <img src="{{LOGO_DATA_URI}}" alt="{{TOOL_NAME}}">
          </div>
          <h2 class="tool__name">{{TOOL_NAME}}</h2>
        </div>
        
        <!-- Plan pill -->
        <div class="tool__plan">
          <span class="pill pill--lime">{{PLAN}}</span>
        </div>
        
        <!-- Replaces box -->
        <div class="tool__replaces-box">
          <div class="tool__replaces-line1">
            <span class="replaces-label">Replaces:</span>
            <span class="replaces-name">{{REPLACES}}</span>
          </div>
          <div class="tool__replaces-line2">
            {{REPLACES_COST}} → you pay $0
          </div>
        </div>
        
        <!-- Bullet points -->
        <ul class="tool__bullets">
          {{BULLETS_HTML}}
        </ul>
        
        <!-- Stats bar -->
        <div class="tool__stats">
          <div class="tool__stats-accent"></div>
          <div class="tool__stats-content">
            <div class="stat">
              <span class="stat__label">BEST FOR</span>
              <span class="stat__value">{{BEST_FOR}}</span>
            </div>
            <div class="stat">
              <span class="stat__label">DIFFICULTY</span>
              <div class="stat__difficulty">
                <div class="difficulty-dots">
                  {{DIFFICULTY_DOTS}}
                </div>
                <span class="difficulty-text">{{DIFFICULTY}}</span>
              </div>
            </div>
          </div>
        </div>
        
        <!-- Watermark -->
        <div class="watermark tool__watermark-left">@toolsforbuilders</div>
      </div>
      
      <!-- RIGHT COLUMN (35%) - Blue gradient -->
      <div class="tool__right">
        <!-- Ghost initial -->
        <div class="tool__ghost-initial">{{INITIALS}}</div>
        
        <!-- Quick Start panel -->
        <div class="tool__quickstart">
          <span class="quickstart__label">QUICK START</span>
          <div class="quickstart__divider"></div>
          <p class="quickstart__tip">{{QUICK_START}}</p>
          
          {{#if SHOW_SAVINGS}}
          <div class="quickstart__savings">
            <span class="pill pill--savings">Saves {{SAVES}}</span>
          </div>
          {{/if}}
        </div>
      </div>
      
    </div>
  </div>
</body>
</html>
```

### Tool CSS (`templates/tool.css`)

```css
/* templates/tool.css */

.tool {
  position: relative;
}

/* Top accent bar */
.tool__accent-bar {
  position: absolute;
  top: 0;
  left: 0;
  right: 0;
  height: 8px;
  background: var(--blue);
}

/* Two-column layout */
.tool__columns {
  display: flex;
  width: 100%;
  height: 100%;
}

/* ─── LEFT COLUMN ──────────────────────────────────────────────────────────── */
.tool__left {
  width: 700px;
  height: 100%;
  background: var(--cream);
  padding: 32px 50px 28px 75px;
  position: relative;
  display: flex;
  flex-direction: column;
}

/* Counter pill */
.tool__counter {
  position: absolute;
  top: 25px;
  right: 30px;
}

.pill--counter {
  background: var(--blue);
  color: var(--cream);
  font-size: 28px;
  padding: 10px 20px;
}

/* Tool header */
.tool__header {
  display: flex;
  align-items: center;
  gap: 20px;
  margin-top: 58px;
  position: relative;
}

.tool__accent-line {
  position: absolute;
  left: -14px;
  top: -10px;
  width: 6px;
  height: 84px;
  border-radius: 3px;
}

.tool__name {
  font-size: 48px;
  font-weight: 700;
  color: var(--charcoal);
  letter-spacing: -0.5px;
}

/* Plan pill */
.tool__plan {
  margin-top: 26px;
}

.pill--lime {
  background: var(--lime);
  color: var(--charcoal);
  font-size: 19px;
  font-weight: 700;
  padding: 8px 16px;
}

/* Replaces box */
.tool__replaces-box {
  margin-top: 75px;
  background: var(--red-07);
  border: 2px solid var(--red);
  border-radius: 12px;
  padding: 18px 20px;
  max-width: 575px;
}

.tool__replaces-line1 {
  font-size: 22px;
  line-height: 1.4;
}

.replaces-label {
  font-weight: 700;
  color: var(--charcoal);
}

.replaces-name {
  color: var(--red);
  font-weight: 400;
  text-decoration: line-through;
  margin-left: 4px;
}

.tool__replaces-line2 {
  font-size: 22px;
  font-weight: 700;
  color: var(--red);
  margin-top: 10px;
}

/* Bullet points */
.tool__bullets {
  margin-top: 28px;
  list-style: none;
  display: flex;
  flex-direction: column;
  gap: 18px;
  max-width: 555px;
}

.tool__bullets li {
  display: flex;
  align-items: flex-start;
  gap: 16px;
  font-size: 29px;
  font-weight: 400;
  color: var(--charcoal);
  line-height: 1.35;
}

.tool__bullets .bullet-dot {
  width: 14px;
  height: 14px;
  min-width: 14px;
  background: var(--blue);
  border-radius: 50%;
  margin-top: 10px;
}

/* Stats bar */
.tool__stats {
  margin-top: auto;
  background: var(--blue-08);
  position: relative;
  padding: 22px 24px;
  max-width: 575px;
}

.tool__stats-accent {
  position: absolute;
  left: 0;
  top: 0;
  bottom: 0;
  width: 5px;
  background: var(--blue);
}

.tool__stats-content {
  display: flex;
  flex-direction: column;
  gap: 18px;
}

.stat {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.stat__label {
  font-size: 18px;
  font-weight: 600;
  color: var(--charcoal-60);
  text-transform: uppercase;
  letter-spacing: 1px;
}

.stat__value {
  font-size: 26px;
  font-weight: 700;
  color: var(--charcoal);
}

.stat__difficulty {
  display: flex;
  align-items: center;
  gap: 16px;
}

.difficulty-dots {
  display: flex;
  gap: 10px;
}

.difficulty-dot {
  width: 18px;
  height: 18px;
  border-radius: 50%;
  background: var(--charcoal-20);
}

.difficulty-dot--active {
  background: var(--blue);
}

.difficulty-text {
  font-size: 22px;
  font-weight: 400;
  color: var(--charcoal-60);
}

/* Watermark left */
.tool__watermark-left {
  position: absolute;
  right: 20px;
  bottom: 22px;
  color: var(--charcoal-35);
}

/* ─── RIGHT COLUMN ─────────────────────────────────────────────────────────── */
.tool__right {
  width: 380px;
  height: 100%;
  background: linear-gradient(180deg, var(--blue) 0%, var(--blue-dark) 100%);
  position: relative;
  display: flex;
  flex-direction: column;
  align-items: center;
}

/* Ghost initial */
.tool__ghost-initial {
  position: absolute;
  top: 50%;
  left: 50%;
  transform: translate(-50%, -50%);
  font-size: 280px;
  font-weight: 800;
  color: var(--white-08);
  pointer-events: none;
  user-select: none;
}

/* Quick Start panel */
.tool__quickstart {
  margin-top: 320px;
  display: flex;
  flex-direction: column;
  align-items: center;
  padding: 0 28px;
  width: 100%;
  position: relative;
  z-index: 1;
}

.quickstart__label {
  font-size: 18px;
  font-weight: 600;
  color: var(--lime);
  text-transform: uppercase;
  letter-spacing: 2px;
}

.quickstart__divider {
  width: 100%;
  height: 1px;
  background: var(--lime-30);
  margin-top: 14px;
}

.quickstart__tip {
  margin-top: 28px;
  font-size: 25px;
  font-weight: 400;
  color: rgba(255, 255, 255, 0.92);
  line-height: 1.45;
  text-align: center;
}

.quickstart__savings {
  margin-top: 36px;
}

.pill--savings {
  background: var(--lime-15);
  border: 1px solid var(--lime-50);
  color: var(--lime);
  font-size: 20px;
  font-weight: 700;
  padding: 10px 18px;
}
```

### Bullet HTML Fragment (inserted into `{{BULLETS_HTML}}`)

```html
<li>
  <span class="bullet-dot"></span>
  <span>{{BULLET_TEXT}}</span>
</li>
```

### Difficulty Dots HTML Fragment (inserted into `{{DIFFICULTY_DOTS}}`)

```html
<!-- For Easy (1 active): -->
<span class="difficulty-dot difficulty-dot--active"></span>
<span class="difficulty-dot"></span>
<span class="difficulty-dot"></span>

<!-- For Medium (2 active): -->
<span class="difficulty-dot difficulty-dot--active"></span>
<span class="difficulty-dot difficulty-dot--active"></span>
<span class="difficulty-dot"></span>

<!-- For Hard (3 active): -->
<span class="difficulty-dot difficulty-dot--active"></span>
<span class="difficulty-dot difficulty-dot--active"></span>
<span class="difficulty-dot difficulty-dot--active"></span>
```

---

## 6. CTA Slide (Slide 6)

### HTML Template (`templates/cta.html`)

```html
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <style>{{BASE_CSS}}{{SLIDE_CSS}}</style>
</head>
<body>
  <div class="slide cta">
    <!-- Accent line -->
    <div class="cta__accent-line"></div>
    
    <!-- Headline -->
    <h1 class="cta__headline">Save this. Your stack.</h1>
    
    <!-- Value box -->
    <div class="cta__value-box">
      <p class="cta__value-intro">Following @toolsforbuilders gets you:</p>
      <ul class="cta__benefits">
        <li>✓  Weekly free tool roundups</li>
        <li>✓  Automation workflows you can copy</li>
        <li>✓  Stack updates as tools change</li>
      </ul>
    </div>
    
    <!-- CTA button -->
    <button class="cta__button">Follow @toolsforbuilders</button>
    
    <!-- Save prompt -->
    <p class="cta__save-prompt">💾  Save this before you forget</p>
    
    <!-- Counter pill -->
    <div class="cta__counter">
      <span class="pill pill--ghost">{{SLIDE_NUM}}/{{SLIDE_TOTAL}}</span>
    </div>
  </div>
</body>
</html>
```

### CTA CSS (`templates/cta.css`)

```css
/* templates/cta.css */

.cta {
  background: linear-gradient(180deg, var(--blue) 0%, var(--blue-dark) 100%);
  display: flex;
  flex-direction: column;
  align-items: center;
  padding-top: 240px;
}

/* Accent line */
.cta__accent-line {
  position: absolute;
  top: 265px;
  left: 50%;
  transform: translateX(-50%);
  width: 100px;
  height: 6px;
  background: var(--lime);
  border-radius: 3px;
}

/* Headline */
.cta__headline {
  font-size: 66px;
  font-weight: 700;
  color: var(--cream);
  letter-spacing: -0.5px;
  margin-top: 54px;
}

/* Value box */
.cta__value-box {
  margin-top: 55px;
  background: var(--white-12);
  border: 1px solid var(--white-20);
  border-radius: 20px;
  padding: 38px 48px 42px;
  width: 820px;
}

.cta__value-intro {
  font-size: 27px;
  font-weight: 700;
  color: var(--lime);
  text-align: center;
  margin-bottom: 24px;
}

.cta__benefits {
  list-style: none;
  display: flex;
  flex-direction: column;
  gap: 20px;
}

.cta__benefits li {
  font-size: 28px;
  font-weight: 400;
  color: var(--cream);
  line-height: 1.4;
}

/* CTA button */
.cta__button {
  margin-top: 52px;
  background: var(--cream);
  color: var(--blue);
  font-size: 32px;
  font-weight: 700;
  padding: 22px 64px;
  border-radius: 100px;
  border: none;
  cursor: pointer;
  box-shadow: 0 4px 20px rgba(0, 0, 0, 0.15);
}

/* Save prompt */
.cta__save-prompt {
  margin-top: 48px;
  font-size: 25px;
  font-weight: 400;
  color: var(--cream-60);
}

/* Counter pill */
.cta__counter {
  margin-top: 42px;
}

.pill--ghost {
  background: var(--white-15);
  color: rgba(245, 245, 240, 0.7);
  font-size: 24px;
  padding: 12px 22px;
}
```

---

## 7. Font Loading Strategy

**Primary:** Google Fonts CDN (Inter)

```css
@import url('https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800;900&display=swap');
```

**In Puppeteer, ensure fonts are loaded before screenshot:**

```javascript
// In renderer.mjs
await page.setContent(html, { waitUntil: 'networkidle0' });
// Additional wait for font rendering
await page.evaluate(() => document.fonts.ready);
```

**Fallback (if network unavailable):**
Download Inter woff2 files to `assets/fonts/` and embed as base64 in CSS:

```css
@font-face {
  font-family: 'Inter';
  font-weight: 400;
  src: url('data:font/woff2;base64,...') format('woff2');
}
```

---

## 8. Logo Rendering (Base64 Data URIs)

### lib/logo-loader.mjs

```javascript
/**
 * Logo loader - converts local PNG files to base64 data URIs
 */
import { readFileSync, existsSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const LOGO_DIR = join(__dirname, '..', 'assets', 'logos');

const cache = new Map();

/**
 * Get logo as base64 data URI
 * @param {string} key - Logo key (e.g., 'claude', 'gemini')
 * @returns {string|null} - Data URI or null if not found
 */
export function getLogoDataURI(key) {
  if (cache.has(key)) {
    return cache.get(key);
  }
  
  const variants = [
    `${key}-fav.png`,
    `${key}.png`,
  ];
  
  for (const filename of variants) {
    const filepath = join(LOGO_DIR, filename);
    if (existsSync(filepath)) {
      const buffer = readFileSync(filepath);
      const base64 = buffer.toString('base64');
      const dataURI = `data:image/png;base64,${base64}`;
      cache.set(key, dataURI);
      return dataURI;
    }
  }
  
  // Fallback: return a placeholder SVG
  const fallbackSVG = generateFallbackLogo(key);
  cache.set(key, fallbackSVG);
  return fallbackSVG;
}

/**
 * Generate a simple SVG fallback with first letter
 */
function generateFallbackLogo(key) {
  const letter = key.charAt(0).toUpperCase();
  const svg = `
    <svg width="64" height="64" xmlns="http://www.w3.org/2000/svg">
      <circle cx="32" cy="32" r="32" fill="#888888"/>
      <text x="32" y="42" text-anchor="middle" 
            font-family="Inter, sans-serif" font-size="28" 
            font-weight="700" fill="white">${letter}</text>
    </svg>
  `.trim();
  return `data:image/svg+xml;base64,${Buffer.from(svg).toString('base64')}`;
}

export default { getLogoDataURI };
```

---

## 9. Template Engine

### lib/template-engine.mjs

```javascript
/**
 * Simple template engine - replaces {{placeholders}} with values
 */
import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const TEMPLATE_DIR = join(__dirname, '..', 'templates');

const templateCache = new Map();

/**
 * Load and cache a template file
 */
function loadTemplate(name) {
  if (templateCache.has(name)) {
    return templateCache.get(name);
  }
  const content = readFileSync(join(TEMPLATE_DIR, name), 'utf-8');
  templateCache.set(name, content);
  return content;
}

/**
 * Compile a slide template with data
 * @param {string} type - 'cover', 'tool', or 'cta'
 * @param {object} data - Data to inject
 * @returns {string} - Complete HTML string
 */
export function compileTemplate(type, data) {
  // Load templates
  const baseCSS = loadTemplate('base.css');
  const slideCSS = loadTemplate(`${type}.css`);
  let html = loadTemplate(`${type}.html`);
  
  // Inject CSS
  html = html.replace('{{BASE_CSS}}', baseCSS);
  html = html.replace('{{SLIDE_CSS}}', slideCSS);
  
  // Replace all {{PLACEHOLDER}} tokens
  for (const [key, value] of Object.entries(data)) {
    const regex = new RegExp(`{{${key}}}`, 'g');
    html = html.replace(regex, value ?? '');
  }
  
  // Handle conditional blocks: {{#if CONDITION}}...{{/if}}
  html = html.replace(/\{\{#if (\w+)\}\}([\s\S]*?)\{\{\/if\}\}/g, (match, condition, content) => {
    return data[condition] ? content : '';
  });
  
  // Remove any remaining unreplaced placeholders
  html = html.replace(/\{\{[^}]+\}\}/g, '');
  
  return html;
}

/**
 * Build cover slide data object
 */
export function buildCoverData({ oldPrice, headline, dateLabel, tools }) {
  // Build tool logos HTML
  const toolLogosHTML = tools.map(t => `
    <div class="cover__tool">
      <div class="logo-circle">
        <img src="${t.logoDataURI}" alt="${t.name}">
      </div>
      <span class="cover__tool-label">${t.name}</span>
    </div>
  `).join('');
  
  return {
    OLD_PRICE: oldPrice,
    HEADLINE: headline,
    DATE_LABEL: dateLabel,
    TOOL_LOGOS: toolLogosHTML,
  };
}

/**
 * Build tool slide data object
 */
export function buildToolData(tool) {
  // Build bullets HTML
  const bulletsHTML = tool.bullets.map(b => `
    <li>
      <span class="bullet-dot"></span>
      <span>${escapeHtml(b)}</span>
    </li>
  `).join('');
  
  // Build difficulty dots HTML
  const difficultyMap = { 'Easy': 1, 'Medium': 2, 'Hard': 3 };
  const diffLevel = difficultyMap[tool.difficulty] || 2;
  const difficultyDotsHTML = [1, 2, 3].map(i => 
    `<span class="difficulty-dot ${i <= diffLevel ? 'difficulty-dot--active' : ''}"></span>`
  ).join('');
  
  // Clean tool name (remove "Free" or "Self-Hosted" suffixes)
  const displayName = tool.tool.replace(/ Free$/, '').replace(/ Self-Hosted$/, '');
  
  // Check if savings should be shown
  const showSavings = tool.saves && tool.saves !== '$0' && tool.saves.startsWith('$');
  
  return {
    SLIDE_NUM: tool.num,
    SLIDE_TOTAL: tool.total,
    TOOL_COLOR: tool.color,
    LOGO_DATA_URI: tool.logoDataURI,
    TOOL_NAME: displayName,
    PLAN: tool.plan,
    REPLACES: escapeHtml(tool.replaces),
    REPLACES_COST: tool.replacesCost,
    BULLETS_HTML: bulletsHTML,
    BEST_FOR: escapeHtml(tool.bestFor),
    DIFFICULTY: tool.difficulty,
    DIFFICULTY_DOTS: difficultyDotsHTML,
    INITIALS: tool.initials || displayName.charAt(0).toUpperCase(),
    QUICK_START: escapeHtml(tool.quickStart),
    SAVES: tool.saves,
    SHOW_SAVINGS: showSavings,
  };
}

/**
 * Build CTA slide data object
 */
export function buildCtaData({ num, total }) {
  return {
    SLIDE_NUM: num,
    SLIDE_TOTAL: total,
  };
}

/**
 * Escape HTML special characters
 */
function escapeHtml(str) {
  if (!str) return '';
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

export default { compileTemplate, buildCoverData, buildToolData, buildCtaData };
```

---

## 10. Puppeteer Renderer

### lib/renderer.mjs

```javascript
/**
 * Puppeteer rendering engine
 * Reuses browser instance across all slides for performance
 */
import puppeteer from 'puppeteer';
import { mkdirSync, existsSync } from 'fs';
import { dirname } from 'path';

let browser = null;

const VIEWPORT = {
  width: 1080,
  height: 1080,
  deviceScaleFactor: 1,
};

const LAUNCH_OPTIONS = {
  headless: true,
  args: [
    '--no-sandbox',
    '--disable-setuid-sandbox',
    '--disable-dev-shm-usage',
    '--disable-gpu',
    '--font-render-hinting=none',
  ],
};

/**
 * Initialize browser instance (call once at start)
 */
export async function initBrowser() {
  if (!browser) {
    browser = await puppeteer.launch(LAUNCH_OPTIONS);
    console.log('  🌐 Browser initialized');
  }
  return browser;
}

/**
 * Close browser instance (call at end)
 */
export async function closeBrowser() {
  if (browser) {
    await browser.close();
    browser = null;
    console.log('  🌐 Browser closed');
  }
}

/**
 * Render HTML to PNG file
 * @param {string} html - Complete HTML string
 * @param {string} outputPath - Where to save PNG
 */
export async function renderToPNG(html, outputPath) {
  if (!browser) {
    throw new Error('Browser not initialized. Call initBrowser() first.');
  }
  
  // Ensure output directory exists
  const dir = dirname(outputPath);
  if (!existsSync(dir)) {
    mkdirSync(dir, { recursive: true });
  }
  
  // Create new page
  const page = await browser.newPage();
  
  try {
    // Set viewport
    await page.setViewport(VIEWPORT);
    
    // Load HTML content
    await page.setContent(html, {
      waitUntil: 'networkidle0',
      timeout: 30000,
    });
    
    // Wait for fonts to be ready
    await page.evaluate(() => document.fonts.ready);
    
    // Small delay for any final rendering
    await new Promise(r => setTimeout(r, 100));
    
    // Take screenshot
    await page.screenshot({
      path: outputPath,
      type: 'png',
      fullPage: false,
      clip: {
        x: 0,
        y: 0,
        width: VIEWPORT.width,
        height: VIEWPORT.height,
      },
    });
    
    // Get file size for logging
    const { size } = await import('fs').then(fs => 
      fs.promises.stat(outputPath)
    );
    const sizeKB = Math.round(size / 1024);
    
    console.log(`  ✅ ${outputPath} (${sizeKB}KB)`);
    
  } finally {
    // Always close the page
    await page.close();
  }
}

export default { initBrowser, closeBrowser, renderToPNG };
```

---

## 11. Main Script Interface

### generate-carousel-v5.mjs

```javascript
#!/usr/bin/env node
/**
 * @toolsforbuilders — Professional carousel generator v5
 * HTML/CSS → Puppeteer → PNG
 * 
 * Usage: node generate-carousel-v5.mjs [--out <dir>]
 * Default output: data/samples/final/carousel-1/
 */

import { initBrowser, closeBrowser, renderToPNG } from './lib/renderer.mjs';
import { compileTemplate, buildCoverData, buildToolData, buildCtaData } from './lib/template-engine.mjs';
import { getLogoDataURI } from './lib/logo-loader.mjs';
import { parseArgs } from 'util';

// ════════════════════════════════════════════════════════════════════════════
// CONFIGURATION
// ════════════════════════════════════════════════════════════════════════════

const DEFAULT_OUTPUT = 'data/samples/final/carousel-1';

// Cover slide config
const COVER_CONFIG = {
  oldPrice: '$44/mo',
  headline: 'The Free AI Stack',
  dateLabel: 'Updated 03/2026',
  tools: [
    { logoKey: 'claude',     name: 'Claude'     },
    { logoKey: 'gemini',     name: 'Gemini'     },
    { logoKey: 'notebooklm', name: 'NotebookLM' },
    { logoKey: 'capcut',     name: 'CapCut'     },
  ],
};

// Tool slides data - KEEP COMPATIBLE WITH EXISTING STRUCTURE
const TOOLS = [
  {
    num: 2,
    total: 6,
    logoKey: 'claude',
    tool: 'Claude',
    color: '#CC785C',
    initials: 'C',
    plan: 'FREE PLAN',
    replaces: 'ChatGPT Plus',
    replacesCost: '$20/mo',
    saves: '$20/mo',
    bestFor: 'Writing, editing, long-form drafts',
    difficulty: 'Easy',
    bullets: [
      '~40 msgs/day free — enough for a full content workflow',
      'Longer, structured outputs per message than GPT-4o free',
      '5h reset windows: spread use across morning and evening',
    ],
    quickStart: 'Paste a caption draft. Ask: make this punchier.',
  },
  {
    num: 3,
    total: 6,
    logoKey: 'gemini',
    tool: 'Gemini',
    color: '#1A73E8',
    initials: 'G',
    plan: 'FREE PLAN',
    replaces: 'Google One AI Premium',
    replacesCost: '$20/mo',
    saves: '$20/mo',
    bestFor: 'Research, long docs, web questions',
    difficulty: 'Easy',
    bullets: [
      '1M token context — paste a full PDF and ask questions',
      'Replaces Google One AI: same Gemini model, no subscription',
      'Best free option for working with large documents',
    ],
    quickStart: 'Upload a competitor PDF. Ask: what is their core offer?',
  },
  {
    num: 4,
    total: 6,
    logoKey: 'notebooklm',
    tool: 'NotebookLM',
    color: '#34A853',
    initials: 'NLM',
    plan: '100% FREE',
    replaces: 'ChatGPT Plus for docs',
    replacesCost: '$20/mo',
    saves: '$0',
    bestFor: 'Synthesizing multiple sources fast',
    difficulty: 'Easy',
    bullets: [
      '50 sources per notebook — ask questions across all at once',
      'Audio Overview: turns sources into a 10-min AI podcast',
      'Free with Google account — no paid plan needed',
    ],
    quickStart: 'Upload 3 competitor articles. Ask: what gap do they miss?',
  },
  {
    num: 5,
    total: 6,
    logoKey: 'capcut',
    tool: 'CapCut',
    color: '#1C1C1C',
    initials: 'CC',
    plan: 'FREE PLAN',
    replaces: 'InShot Pro',
    replacesCost: '$4/mo',
    saves: '$4/mo',
    bestFor: 'Reels, TikToks, short-form video',
    difficulty: 'Easy',
    bullets: [
      'Auto-captions in 60+ languages — one tap, accurate',
      'AI background removal on mobile, no green screen needed',
      'Standard exports: no watermark (premium templates: watermark)',
    ],
    quickStart: 'Record 60 sec talking. Auto-caption it. Post as a Reel.',
  },
];

// ════════════════════════════════════════════════════════════════════════════
// MAIN
// ════════════════════════════════════════════════════════════════════════════

async function main() {
  // Parse CLI args
  const { values } = parseArgs({
    options: {
      out: { type: 'string', short: 'o' },
    },
    allowPositionals: false,
  });
  
  const outputDir = values.out || DEFAULT_OUTPUT;
  
  console.log('\n🎨 @toolsforbuilders Carousel Generator v5');
  console.log(`   Output: ${outputDir}/\n`);
  
  try {
    // Initialize browser (reused for all slides)
    await initBrowser();
    
    // ─── Slide 1: Cover ───────────────────────────────────────────────────
    console.log('📸 Rendering slides...\n');
    
    const coverTools = COVER_CONFIG.tools.map(t => ({
      ...t,
      logoDataURI: getLogoDataURI(t.logoKey),
    }));
    
    const coverData = buildCoverData({
      ...COVER_CONFIG,
      tools: coverTools,
    });
    
    const coverHTML = compileTemplate('cover', coverData);
    await renderToPNG(coverHTML, `${outputDir}/slide-1.png`);
    
    // ─── Slides 2-5: Tool slides ──────────────────────────────────────────
    for (const tool of TOOLS) {
      const toolWithLogo = {
        ...tool,
        logoDataURI: getLogoDataURI(tool.logoKey),
      };
      
      const toolData = buildToolData(toolWithLogo);
      const toolHTML = compileTemplate('tool', toolData);
      await renderToPNG(toolHTML, `${outputDir}/slide-${tool.num}.png`);
    }
    
    // ─── Slide 6: CTA ─────────────────────────────────────────────────────
    const ctaData = buildCtaData({ num: 6, total: 6 });
    const ctaHTML = compileTemplate('cta', ctaData);
    await renderToPNG(ctaHTML, `${outputDir}/slide-6.png`);
    
    console.log('\n✅ All 6 slides generated successfully.\n');
    
  } catch (err) {
    console.error('\n❌ Error:', err.message);
    process.exit(1);
    
  } finally {
    // Always close browser
    await closeBrowser();
  }
}

main();
```

---

## 12. Performance Considerations

### Browser Reuse
- **Single browser instance** for all 6 slides (initialized once, closed once)
- **New page per slide** — pages are lightweight, browsers are not
- Expected generation time: ~2-4 seconds for all 6 slides

### Font Loading
- `networkidle0` + `document.fonts.ready` ensures fonts render before screenshot
- First slide may take slightly longer (font download)
- Subsequent slides use cached fonts

### Memory
- Pages are closed after each screenshot
- Logo data URIs are cached in memory
- No DOM accumulation between slides

---

## 13. Gotchas & Edge Cases

### 1. Font Rendering Differences
Chrome/Puppeteer may render fonts slightly differently than macOS Preview. This is expected. The CSS includes `-webkit-font-smoothing: antialiased` for consistency.

### 2. Long Tool Names
If a tool name is very long, it may overflow. The current design uses `max-width` constraints. Test with names like "Google One AI Premium" (17 chars).

### 3. Long Bullet Text
Bullets auto-wrap via CSS. Test with maximum expected bullet length (~80 chars).

### 4. Network Dependency
Google Fonts requires network. For offline use:
1. Download Inter WOFF2 files
2. Convert to base64
3. Embed in `base.css` via `@font-face`

### 5. Puppeteer Sandbox
On Ubuntu without a display, `--no-sandbox` is required. This is already in launch options.

### 6. Logo File Missing
Falls back to SVG with first letter. Not pretty, but won't crash.

### 7. HTML Escaping
All user-provided text (tool names, bullets) is HTML-escaped to prevent injection.

---

## 14. Testing Checklist

Before calling implementation complete:

- [ ] All 6 slides generate without errors
- [ ] Fonts render correctly (Inter, not fallback sans-serif)
- [ ] Logos display correctly (not broken images)
- [ ] Colors match spec exactly
- [ ] Slide counter shows correct numbers
- [ ] "Replaces" text has strikethrough
- [ ] Difficulty dots show correct count
- [ ] Quick Start panel is readable
- [ ] CTA button looks clickable
- [ ] File sizes are reasonable (<500KB per slide)
- [ ] No console errors in Puppeteer

---

## 15. Future Enhancements (Out of Scope for v5)

- Dynamic carousel content from JSON file
- CLI flag to select specific slides
- Watch mode for template hot-reload during design iteration
- Additional slide types (comparison, testimonial)
- Animated GIF output option

---

*Spec version: 1.0*  
*Author: Skynet*  
*Date: 2026-03-03*
