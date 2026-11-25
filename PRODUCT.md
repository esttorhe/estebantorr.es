# Product

## Register

brand

Primary surface is brand: portfolio, long-form writing, identity. The CV index, Talks shelf, and the Blog index get denser, more product-ish treatment when they have to, but the default lens is brand. The site IS the product.

## Users

Three audiences, deliberately weighted equally:

- **Hiring managers and founders evaluating Esteban.** Context: a 60-second skim from a LinkedIn message or a referral. Job to be done: decide whether he is worth a conversation. They want to see scope, current role, and the texture of how he thinks.
- **Engineers and engineering managers reading the writing.** Context: arrived from search, a link, or RSS. Job to be done: read something useful, then read another thing useful. They want long-form to actually read like long-form, and they want to find more once they finish one.
- **Conference organizers and community.** Context: looking him up after a talk pitch or a recommendation. Job to be done: confirm credibility and find prior talks. They want a real Talks shelf and a believable bio, not a SaaS bio.

Secondary audience, not weighted with the three above:

- **Potential clients.** Context: a founder or engineering leader who heard Esteban takes on a few outside engagements (fractional CTO, software development, leadership coaching, SOC 2 / ISO 27001 groundwork) alongside his Peec AI role. Job to be done: understand what he offers and whether to email. Served by `/services/`, which is linked from About and the footer and deliberately kept out of the header nav, so it never competes with the three primary audiences.

The site does not pick a hero audience. Hierarchy on every page has to work for all three in five seconds.

## Product Purpose

Esteban's personal home on the web at `estebantorr.es`. Long-form writing on engineering and engineering management, supported by CV, Talks, Portfolio, About, Now, and Uses. It is the canonical "who is this person" link he shares with hiring managers, organizers, and readers.

Success, six months out: returning readers read **more than one post per visit**. Reading depth is the north star metric. Inbound (jobs, talks, intros) and the feeling that "this is a place I'm proud to share" are downstream of doing reading depth well; they are not separate goals to optimize independently.

## Brand Personality

Three words: **plainspoken, opinionated, idiosyncratic**.

- **Plainspoken.** Costa Rican to Berlin via iOS engineering and into engineering management. Low BS, direct, written like a human. Not corporate-soft, not over-edited.
- **Opinionated.** The writing has a point of view. The site shouldn't try to be safe; if a layout move is interesting, it earns its place.
- **Idiosyncratic.** Personal-site freedom is the point — room for weird typography, motion, hand-doodled illustration (lobsters, wavy underlines, mono-typed footers separated by dots). The weirdness is voice, not decoration; it should reward attention, not demand it.

The emotional target: confidence without polish-anxiety. Someone reading this should feel they're in the hands of a senior practitioner who is having a good time.

## Anti-references

Hard bans. If a variant or proposal lands in any of these, reject and rework.

- **Cream / sand / parchment editorial-warm template.** Warm off-white body, serif body copy, tracked uppercase eyebrows, numbered section markers (01 · About / 02 · Process). The 2026 saturated AI default. Off-limits.
- **Generic SaaS landing.** Gradient hero, big-number metric row, three identical icon-heading-text feature cards, "Trusted by" logo wall. Not appropriate for a personal site.
- **Medium-clone blog.** Gray text on white, big centered serif headlines, no chrome, no personality. Safe to the point of invisible.
- **Dev-blog-from-2018.** Sidebar with tag cloud, dense post list, "Recent posts / Categories / Archive" boxes, noisy chrome. The default Hugo/Jekyll personal-dev-blog look.

## Design Principles

Strategic, not visual. These are how Esteban and I (and any agent helping later) judge whether a layout decision is on-brief.

1. **Reading depth is the north star.** Every navigation, layout, and motion decision earns its place by answering "does this get a reader to post #2?" If a section doesn't help reading flow or reading discovery, it gets cut or demoted.
2. **Personality beats polish.** Plainspoken + idiosyncratic is the lane. "Corporate-safe", "clean and modern", "minimalist tasteful" are failure states. When in doubt, push toward weirder.
3. **Three audiences, one front door.** No separate landing pages for hiring vs reading vs talks. The home page has to work in five seconds for each of the three audiences, and the writing has to be reachable from all three.
4. **Voice lives in typography first.** Brand identity is carried more by the type system (display family, weights, mono pairings, doodle accents) than by colored chrome or decorated UI. Color is restrained; type is loud.
5. **Astro is the design target.** All new design work targets the in-flight Astro version (View Transitions, themed CSS variables, dark/light parity). The Hugo + `KeepIt` site on the `source` branch is the live deploy but is sunsetting; do not invest design effort there.

## Accessibility & Inclusion

- **WCAG 2.2 AA** as the committed floor for body copy contrast, focus states, and interactive affordances.
- **`prefers-reduced-motion` respected** on every animation. Reveal animations, hover transforms, View Transitions, and stagger effects all need a reduced-motion alternative (typically a crossfade or instant transition). Reduced motion is not optional.
- **Keyboard-complete.** Skip link present, focus rings visible on every interactive element, no keyboard traps, mobile menu reachable and dismissible from the keyboard.
- **Dark / light parity.** The theme toggle is real product surface, not a gimmick — both themes must pass the same contrast and motion tests.
