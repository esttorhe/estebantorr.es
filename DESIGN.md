---
name: The mind of Esteban
description: Personal site for Esteban Torres — engineering writing, CV, talks, about. Plainspoken, opinionated, idiosyncratic.
colors:
  bg: 'oklch(1 0 0)'
  bg-dark: 'oklch(0.14 0.006 65)'
  surface: 'oklch(0.965 0.006 65)'
  surface-dark: 'oklch(0.19 0.008 65)'
  rule: 'oklch(0.88 0.008 65)'
  rule-strong: 'oklch(0.78 0.012 65)'
  rule-dark: 'oklch(0.28 0.01 65)'
  rule-strong-dark: 'oklch(0.4 0.012 65)'
  ink: 'oklch(0.2 0.005 65)'
  ink-muted: 'oklch(0.42 0.012 65)'
  ink-dark: 'oklch(0.94 0.008 65)'
  ink-muted-dark: 'oklch(0.68 0.012 65)'
  accent: 'oklch(0.58 0.155 60)'
  accent-soft: 'oklch(0.94 0.05 60)'
  accent-ink: 'oklch(0.45 0.17 60)'
  accent-dark: 'oklch(0.82 0.155 60)'
  accent-soft-dark: 'oklch(0.32 0.07 60)'
  accent-ink-dark: 'oklch(0.86 0.16 60)'
typography:
  display:
    fontFamily: "'Bricolage Grotesque Variable', ui-sans-serif, system-ui, -apple-system, 'Segoe UI', sans-serif"
    fontSize: 'clamp(1.875rem, 1.25rem + 2.5vw, 3.5rem)'
    fontWeight: 700
    lineHeight: 1.05
    letterSpacing: '-0.025em'
  headline:
    fontFamily: "'Bricolage Grotesque Variable', ui-sans-serif, system-ui, -apple-system, 'Segoe UI', sans-serif"
    fontSize: 'clamp(1.5rem, 1.25rem + 1vw, 2.125rem)'
    fontWeight: 700
    lineHeight: 1.1
    letterSpacing: '-0.02em'
  title:
    fontFamily: "'Bricolage Grotesque Variable', ui-sans-serif, system-ui, -apple-system, 'Segoe UI', sans-serif"
    fontSize: 'clamp(1.25rem, 1.1rem + 0.4vw, 1.5rem)'
    fontWeight: 600
    lineHeight: 1.15
    letterSpacing: '-0.015em'
  body:
    fontFamily: "'Bricolage Grotesque Variable', ui-sans-serif, system-ui, -apple-system, 'Segoe UI', sans-serif"
    fontSize: '1.0625rem'
    fontWeight: 400
    lineHeight: 1.6
    letterSpacing: 'normal'
  prose:
    fontFamily: "'Vollkorn', Georgia, 'Iowan Old Style', 'Charter', 'Times New Roman', serif"
    fontSize: '1.125rem'
    fontWeight: 400
    lineHeight: 1.65
    letterSpacing: 'normal'
  label:
    fontFamily: "'Geist Mono', ui-monospace, 'SF Mono', Menlo, Consolas, monospace"
    fontSize: '0.8125rem'
    fontWeight: 500
    lineHeight: 1.4
    letterSpacing: '0.04em'
rounded:
  sm: '0.25rem'
  md: '0.5rem'
spacing:
  '2xs': '0.25rem'
  xs: '0.5rem'
  sm: '0.75rem'
  md: '1.5rem'
  lg: '2.5rem'
  xl: '4rem'
  '2xl': '6rem'
  '3xl': '9rem'
  section: 'clamp(3rem, 2rem + 3vw, 6rem)'
components:
  link:
    textColor: '{colors.ink}'
  link-hover:
    textColor: '{colors.accent-ink}'
  link-accent-underline:
    textColor: '{colors.ink}'
  kicker:
    typography: '{typography.label}'
    textColor: '{colors.ink-muted}'
  code-pill:
    backgroundColor: '{colors.accent-soft}'
    textColor: '{colors.accent-ink}'
    rounded: '{rounded.sm}'
    padding: '0.05em 0.35em'
  pdf-button:
    backgroundColor: '{colors.ink}'
    textColor: '{colors.bg}'
    typography: '{typography.label}'
    rounded: '{rounded.sm}'
    padding: '0.7rem 1.1rem'
  pdf-button-hover:
    backgroundColor: '{colors.accent-ink}'
    textColor: '{colors.bg}'
  nav-link:
    typography: '{typography.label}'
    textColor: '{colors.ink-muted}'
  nav-link-current:
    textColor: '{colors.ink}'
  hero-thumbnail:
    backgroundColor: '{colors.surface}'
    rounded: '{rounded.md}'
---

# Design System: The mind of Esteban

## 1. Overview

**Creative North Star: "The Plainspoken Index"**

An archive that respects the reader's time. Newest-first lists, mono meta, no chrome that doesn't earn its keep. The site is one of three things at any moment — _something to read_ (the writing), _something to skim_ (the indexes / CV / talks shelf), or _who is behind this_ (about + footer avatar). Everything else is gone, demoted, or hiding.

The voice is **plainspoken, opinionated, idiosyncratic** (PRODUCT.md, verbatim). That means a Sigil — a wobbly hand-drawn ring with an off-centre dot — instead of a logo. A Spotify-cover-styled selfie on /about/ instead of a LinkedIn headshot. Backtick-wrapped `code`-pills inside titles instead of italicising every technical term. A serif (Vollkorn) only for prose; a single warm sans (Bricolage Grotesque) for everything else, so the read-modes feel different from the scan-modes. Honey accent (the _Workshop Sodium_, see Colors) shows up sparingly — on the Sigil, link underlines, hover, the kickers. Never as flood-fill, never as a gradient.

This system explicitly rejects:

- **Cream / sand / parchment editorial-warm template.** The 2026 AI default. The body bg is true white in light mode, true near-black in dark; only the _surface_ tint warms slightly (hue 65) and only at chroma 0.006.
- **Generic SaaS landing.** No gradient hero, no big-number metric row, no triplet of icon-heading-text feature cards, no "Trusted by" wall.
- **Medium-clone blog.** No grey text on white. No centred serif headlines without chrome. Personality before safety.

**Key Characteristics:**

- **One sans, one serif, one mono** — read-modes vs scan-modes telegraphed by family.
- **OKLCH-only color tokens.** Display-P3 wide-gamut on capable browsers; sRGB-clipped fallback otherwise.
- **Flat surfaces, tonal layering.** Shadows are rare; surface tint + 1px rules carry depth.
- **Sigil as the brand mark.** Reused as wordmark suffix, as post-hero fallback (varied), as the favicon. No second mark.
- **Honey accent on ≤10% of any given screen.** Rarity is the point.

## 2. Colors: The Workshop Palette

A single warm-neutral hue family (65°, near-orange) plus a Workshop Sodium accent (60°). The neutrals are barely tinted (chroma 0.005–0.012) so the page reads as "warm white", not "cream". Light + dark modes are real peers, not a darkened light theme.

### Primary

- **Workshop Sodium** `oklch(0.58 0.155 60)` (light) / `oklch(0.82 0.155 60)` (dark): the only accent in the system. Named for sodium-vapor workshop lighting — warm orange-yellow, a specific lamp not an abstract "amber". Used on: the Sigil ring + dot, link underlines (decoration-color), hover-state title colors, focus rings, code-pill backgrounds (as a 10–14% tint of itself), the page-num current marker. **Not** used on body fill, large headings, or anything bigger than ~10% of a viewport.

### Neutral

- **Pure White** `oklch(1 0 0)` (`--bg` light): the body. True white, chroma 0. Lets the surface tint actually read as warmth-by-contrast.
- **Near Black** `oklch(0.14 0.006 65)` (`--bg` dark): the dark-mode body. Slightly hue-65 tinted at chroma 0.006 — a token amount of warmth, not a "cool charcoal" or "true black".
- **Surface Warm** `oklch(0.965 0.006 65)` (light) / `oklch(0.19 0.008 65)` (dark): tinted surface used for hero-thumbnail bg, theme-toggle bg, code-pill bg (when accent is too loud), pagination current chip. The "barely there" warmth that signals "this is a slot".
- **Rule** `oklch(0.88 0.008 65)` (light) / `oklch(0.28 0.01 65)` (dark): the workhorse 1px divider — section breaks, row separators, the sticky-header bottom edge, the bottom-button rule above the PDF download. The site's structural connective tissue.
- **Rule Strong** `oklch(0.78 0.012 65)` (light) / `oklch(0.4 0.012 65)` (dark): louder rule for the bullet `::before` dashes in `.cv-role__points` and other places where a 1px would disappear.
- **Ink** `oklch(0.2 0.005 65)` (light) / `oklch(0.94 0.008 65)` (dark): primary text color. Cleared 4.5:1 against both bg tokens.
- **Ink Muted** `oklch(0.42 0.012 65)` (light) / `oklch(0.68 0.012 65)` (dark): mono meta, kickers, dates, secondary copy. Cleared 4.5:1 against both bg tokens at sizes ≥ 13px.

### Named Rules

**The Workshop Sodium Rule.** The accent appears on ≤10% of any given screen. The Sigil counts. Link underlines count. A 100% sodium fill behind a hero is forbidden — drop it back to `--accent-soft` (10% tint) or use it as text color via `--accent-ink`, not as a flood.

**The Warm Neutral Tint Rule.** All neutrals share hue 65 at chroma ≤ 0.012. No grey-blue (hue 230), no cool slate, no green-tinted off-white. The whole grayscale ramp is one warm family.

**The True White Rule.** The light-mode body bg is `oklch(1 0 0)` — chroma 0. Tinted near-whites land in `--surface`, never in `--bg`. This is the defence against the cream/sand/parchment slop.

## 3. Typography

**Display Font:** Bricolage Grotesque Variable (with `ui-sans-serif`, `system-ui` fallbacks)
**Body Font:** Bricolage Grotesque Variable (same family, different role + size)
**Prose Font:** Vollkorn (with `Georgia`, `Iowan Old Style`, `Charter` fallbacks) — _article body only_
**Label / Mono Font:** Geist Mono (with `ui-monospace`, `SF Mono`, `Menlo` fallbacks)

**Character:** A single warm humanist sans (Bricolage's variable-width / variable-weight axes are exploited on the hero wordmark) carries everything that scans — titles, navigation, indexes, the homepage hero. Vollkorn (an open-axis old-style serif) carries everything that _reads_ — the article body, the about prose, the talks pitch line. Geist Mono lives in the meta strata (dates, reading time, kickers, pagination, `code` spans). The pairing is a triplet by _role_, not by visual contrast: read vs scan vs label.

### Hierarchy

- **Display** (700, `clamp(1.875rem, 1.25rem + 2.5vw, 3.5rem)`, 1.05, -0.025em): page H1s — Writing / Talks / About / CV / individual article titles. Always `text-wrap: balance`.
- **Headline** (700, `clamp(1.5rem, 1.25rem + 1vw, 2.125rem)`, 1.1, -0.02em): CV group titles ("Zenjob · Berlin"), homepage hero name, larger section blocks.
- **Title** (600, `clamp(1.25rem, 1.1rem + 0.4vw, 1.5rem)`, 1.15, -0.015em): in-row titles — blog post rows, talk rows, CV section headings.
- **Body** (400, `1.0625rem` / 17px, 1.6): general copy in sans, scan-mode lists, page meta lines after a kicker.
- **Prose** (400, `1.125rem` / 18px, **1.65** line-height — looser than body): article body via the `.prose` class. Vollkorn. Capped at `var(--measure)` = 65ch.
- **Label** (500, `0.8125rem` / 13px, +0.04em letter-spacing, `text-transform: lowercase` on kickers): Geist Mono. Dates, kickers, footer, pagination, "Updated June 2026", "All N posts →".

### Named Rules

**The 65ch Rule.** Prose body lines are capped at `var(--measure)` (65ch) via `max-width`. Wider rows look cheap. The wide variant (`--measure-wide` = 78ch) exists for the CV grouped layout and contact-block prose where strict 65ch is too narrow.

**The Read-vs-Scan Family Rule.** Vollkorn is reserved for surfaces the reader _settles into_ — articles, /about/, the talks pitch. Indexes, CVs, navigation, and all rows use Bricolage. Mixing serif into scan-mode surfaces is forbidden; it signals "this is to read" and the row interrupts the flow.

**The Lowercase Kicker Rule.** Kickers (the category tag above a blog title, the conference name above a talk title, the year markers between posts) are lowercase Geist Mono with +0.04em tracking. Never uppercase, never bold, never above a section heading as scaffolding ("ABOUT", "PROCESS"). Lowercase keeps them as _content tags_ and not as the AI-default tracked uppercase eyebrow.

## 4. Elevation

The system is **flat by default**. Depth is carried by 1px rules (`--rule`) and tonal surface tints (`--surface` over `--bg`), not by shadows. The site's structural connective tissue is the horizontal rule, not the drop shadow.

Shadows appear only as **state responses**, never at rest:

- **Hero-thumbnail hover lift.** A 1-step `translateY(-2px)` plus a very soft diffuse shadow on `.post-row__hero:hover`. This is the only place a box-shadow renders in the resting design system.
- **Backdrop blur on the sticky header.** Not a shadow per se — `backdrop-filter: saturate(140%) blur(10px)` on the sticky header wrapper, with `color-mix(in oklab, var(--bg) 84%, transparent)` underneath. Used purposefully to soften scrolling article text under the chrome.

### Shadow Vocabulary

- **Hover lift** (`box-shadow: 0 8px 24px -12px color-mix(in oklab, var(--ink) 24%, transparent)`): the only resting-state shadow in the system. Applied to `.post-row__hero` on hover/focus-visible.

### Named Rules

**The Flat-By-Default Rule.** Surfaces are flat at rest. Shadows are _only_ state responses (hover, focus, drag). Anywhere a shadow appears at rest is a defect.

**The Rule Over Shadow Rule.** When you want to separate two stacked sections, reach for a 1px `border-top: 1px solid var(--rule)` first. Shadows always look heavier than rules; the site reads as "carefully spaced", not "dimensionally elaborate".

## 5. Components

### Buttons

The site has essentially one button — the CV PDF download — plus a smaller pill variant in the CV's top-right corner.

- **Shape:** gently rounded (`var(--radius-sm)` = 0.25rem). Never a pill, never sharp 0 corners.
- **Primary** (`.cv__pdf-button`): solid ink fill (`--ink`) on bg (`--bg`), Geist Mono small (`--text-small`), padding `0.7rem 1.1rem`, inline-flex with a `↓` glyph. The dark fill is the strongest visual the system makes — reserved for the _single_ CTA per page.
- **Hover / Focus:** swap fill to `--accent-ink`, lift `translateY(-1px)`, no outline change beyond `outline: none` (focus is handled by the lift + color shift, accessible via the color contrast change).
- **Secondary** (`.cv__pdf-floating`): top-right floating pill — `1px solid var(--rule)`, `--surface` bg, mono text, padding `0.3rem 0.6rem`. Quiet repeat of the same affordance. The bottom button is the primary one.

### Code Pills (signature)

- **Style:** background = `color-mix(in oklab, var(--accent) 14%, transparent)` (a Workshop Sodium 14% tint), text = `--accent-ink`, mono, `font-size: 0.85em` (relative — shrinks inside larger headings), `border-radius: 0.25rem`, padding `0.05em 0.35em`. Letter-spacing reset to 0.
- **Where used:** inside titles for technical terms (`Head of Platform Engineering`, `Backstage`, `MVVM`), inside /about/ prose, inside talk titles. The visual signal: "this is a proper noun the reader should recognise as a thing, not just a word."
- **Forbidden:** outside titles or prose. Code pills don't show up in navigation, in the footer, in kickers, or in meta lines.

### Cards / Containers

The site has **no resting cards.** Surfaces are flat strips separated by 1px rules; the closest things to "containers" are:

- **Hero thumbnail box** (`.post-row__hero`, `.talk-row__cover`, `.about-page__photo`): 3:2 or 1:1, `border-radius: var(--radius-md)`, `background: var(--surface)`, `overflow: hidden`. Hosts a real image or a Sigil fallback SVG.
- **Print-page banner** (`.cv--print::before`): 1px dashed `--rule` border, mono text — the only dashed border in the system, reserved for "you are looking at a developer surface".

No drop shadows on containers. No nested cards. No filled card-on-card.

### Inputs / Fields

The site has **no input fields.** No newsletter signup, no search, no comments form. Comments on articles are utteranc.es (renders as a GitHub-issue thread inside an iframe; not a styled component of this system).

### Navigation (sticky)

- **Style:** wordmark + Sigil left, restrained nav (Writing / Talks / CV / About) center-right, theme toggle right. Geist Mono small for nav labels. The whole bar is `position: sticky; top: 0; z-index: 50;` with `backdrop-filter: saturate(140%) blur(10px)` and a semi-transparent body bg.
- **Default link state:** `--ink-muted` text, no underline.
- **Hover:** `--ink` text + `1px solid var(--ink)` bottom border.
- **Current (`aria-current="page"`):** `--ink` text + `1px solid var(--accent)` bottom border. The accent here is the _only_ place the sodium underlines a nav link.
- **Mobile (<540px):** nav wraps below the wordmark; theme toggle stays beside the wordmark.

### Sigil (signature)

A small hand-drawn SVG of a wobbly ring (`stroke-width: 1.6`) with an off-centre filled dot, rendered in `currentColor` (defaults to `--accent` everywhere it's used). Re-uses:

- Suffix to the "Esteban Torres" wordmark in the header.
- Punctuating glyph between "Berlin" and "San José" in the footer location strip.
- As the _favicon_ (both `favicon.svg` and the rasters), with `#C97114` hex pinned for browser-tab use.
- As the **post-hero fallback** when a blog post or talk doesn't have a committed cover image — 10 curated rotation/scale/position variants seeded by the post slug, so a row of fallbacks reads as a family rather than 10 copies.
- As a "thumbnail mark" inside the footer avatar slot (when no me.jpg), at 36px.

The Sigil is the only mark. There is no second mark. There is no monogram.

### Row layouts (signature)

The recurring spine across /blog/, /talks/, and the homepage "Recent writing" surface:

- 3:2 hero thumbnail left (17.5rem desktop, full-width stacked on mobile <720px) · text right.
- Text column: kicker (mono lowercase) → title (Bricolage display) → optional lede (Vollkorn) → meta line (mono: date · location · reading-time · slides → / video → arrows).
- 1px `--rule` between rows (or generous gap; varies by surface — the writing index uses gap, the talks shelf uses no rule, the CV uses border-top on group headers).

## 6. Do's and Don'ts

### Do:

- **Do use `oklch()` for every color token.** The whole palette lives in `src/styles/global.css` as OKLCH custom properties. Light + dark modes redeclare the same names. Never paste a hex into a component file; use the variable.
- **Do use Bricolage for scan-mode surfaces and Vollkorn for read-mode.** Indexes, navigation, CV, hero — Bricolage. Article body, /about/ prose, talks pitch line — Vollkorn.
- **Do reach for a 1px `border-top: 1px solid var(--rule)` first** to separate stacked sections.
- **Do wrap technical proper nouns in backticks inside titles.** The renderer (`/talks/`, blog titles) translates them to code-pill spans. Reads as "this is a thing the audience recognises, not a word".
- **Do respect the 65ch measure on prose.** Wider rows look cheap. The wide variant (`--measure-wide` = 78ch) exists for the CV grouped layout only.
- **Do use the Sigil — not a monogram, not a logo wordmark — as the brand mark.** Every fallback / favicon / footer dot is the same shape.
- **Do test light AND dark at 1440 / 768 / 375.** The palette is real peers, not a darkened light theme; both must look intentional.
- **Do cap the Workshop Sodium accent at ~10% screen coverage.** Its rarity is what makes it read as deliberate.

### Don't:

- **Don't ship the cream / sand / parchment editorial-warm template.** Body bg is `oklch(1 0 0)` (pure white) in light mode, period. Tinted near-whites land in `--surface`, never in `--bg`. Token names like `--paper`, `--cream`, `--sand`, `--bone`, `--linen`, `--parchment` are forbidden.
- **Don't ship generic SaaS landing.** No gradient heroes. No big-number metric rows. No triplet of icon-heading-text feature cards. No "Trusted by" logo wall.
- **Don't ship Medium-clone blog.** No grey text on white. No big centred serif headlines without chrome. No personality-free read surfaces.
- **Don't add a second display font.** Bricolage Grotesque is the only sans for headings, titles, body in scan-mode, and the hero. Pairing it with Inter / DM Sans / Plus Jakarta is forbidden.
- **Don't add tracked uppercase eyebrows.** No `text-transform: uppercase` with positive letter-spacing above section headings. Lowercase Geist Mono kickers are the system's answer.
- **Don't add numbered section markers.** No `01 · About / 02 · Process / 03 · Pricing` scaffolding. Numbers only earn their place when the sequence carries information (a real 3-step process).
- **Don't use `border-left` greater than 1px as a colored stripe.** Side-stripe borders on cards / callouts / alerts are a hard no. Full borders, background tints, or nothing.
- **Don't use `background-clip: text` with a gradient.** No gradient text anywhere.
- **Don't use glassmorphism decoratively.** Backdrop-blur is reserved for the sticky header (purposeful — it softens scrolling article text under the chrome). Glass cards are forbidden.
- **Don't use circular avatars or round profile crops.** The site's idiom is square + sigil. Round avatars would feel imported.
- **Don't add box-shadow at rest.** Shadows are state responses only (hover, focus). Anywhere a shadow appears at rest is a defect — reach for a 1px rule instead.
- **Don't add a hero-metric row** ("4M+ users · 18 teams · 5 years experience"). SaaS cliché. The CV grouped narrative carries scope without a number wall.
- **Don't ship a card grid** ("Skills" with 9 identical icon-heading-text tiles). The Technical Skills row uses mono-pill chips wrapped inline; that's the answer.
