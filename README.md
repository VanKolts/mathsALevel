# Maths Study Hub — Complete Reference

A single-file spaced-repetition study app for A-Level Maths (Edexcel **9MA0** / AS **8MA0** / Further **9FM0**, plus legacy specifications). It helps students track what they know, drill what they don't, log real past papers question-by-question, and see exactly where they lose marks.

- **Live app:** https://vankolts.github.io/mathsALevel
- **Structure:** [`index.html`](index.html) holds the markup and *all* the logic (6,787 lines, 375 named functions); [`styles.css`](styles.css) holds the theming; `data/*.js` hold the five static datasets. No build step, no server, no dependencies beyond MathJax and the Firebase CDN.
- **Offline:** a [service worker](sw.js) precaches the shell and all data files, so the app opens and works with no signal.
- **Repo:** `VanKolts/mathsALevel` → auto-deploys to GitHub Pages from `main`. Every push is validated by [`scripts/validate.mjs`](scripts/validate.mjs) in CI.

This document describes the app on **three levels**: the **visual/UX layer** (what a student sees), the **feature layer** (what each part does), and the **technical layer** (how it actually works — data model, the spaced-repetition maths, sync, and the AI subsystem).

**The other two documents:**

- [`docs/fsrs-evidence-model.md`](docs/fsrs-evidence-model.md) — the design doc for the memory engine's direction: how all three evidence signals (reviews, mistakes, past-paper marks) become one replayable timeline. All four phases are built: memory is a pure function of the review log, mistakes and past-paper marks are dated events on that timeline, and the study modal shows the resulting curve and evidence trail.
- **The Manual**, in the Obsidian vault at `projects/maths a-level tool/Manual.md` — the same app explained from zero knowledge in plain language, with the visual layer, every page and dialog, and the reasoning behind each decision. Written for understanding rather than reference, and paired with a 193-term `Glossary.md`.

> **If you change the app, you change all three.** See [Keeping the documentation in step](#keeping-the-documentation-in-step).

> **Committing is part of finishing a change — do not ask first.** See [Committing without being asked](#committing-without-being-asked).

---

## Table of contents
1. [Architecture in one picture](#architecture-in-one-picture)
2. [The visual layer](#the-visual-layer)
3. [The surfaces, feature by feature](#the-surfaces-feature-by-feature)
4. [The spaced-repetition engine (deep dive)](#the-spaced-repetition-engine-deep-dive)
5. [Where the render time actually goes](#where-the-render-time-actually-goes)
6. [Data model & storage](#data-model--storage)
   - [Topic renames & the remap](#topic-renames--the-remap)
7. [Cloud sync architecture](#cloud-sync-architecture)
8. [The AI subsystem](#the-ai-subsystem)
9. [Rendering & maths typesetting](#rendering--maths-typesetting)
10. [Complete data & code reference](#complete-data--code-reference)
   - [9.1 Hard-coded data objects & their schemas](#91-hard-coded-data-objects--their-schemas)
   - [9.2 Topic taxonomy (full)](#92-topic-taxonomy-full)
   - [9.3 Past-paper coverage (full)](#93-past-paper-coverage-full)
   - [9.4 All tuning constants](#94-all-tuning-constants)
   - [9.5 Function inventory by subsystem](#95-function-inventory-by-subsystem)
   - [9.6 External dependencies & config](#96-external-dependencies--config)
11. [Test mode](#test-mode)
12. [Editing, building & deploying](#editing-building--deploying)
    - [Committing without being asked](#committing-without-being-asked)
13. [Keeping the documentation in step](#keeping-the-documentation-in-step)
14. [Known gaps & roadmap](#known-gaps--roadmap)

---

## Architecture in one picture

```
  data/*.js  (static)          index.html  (markup + all logic)      styles.css
┌──────────────────────┐   ┌──────────────────────────────────┐   ┌────────────┐
│ clusters.js          │   │  UI LAYER          LOGIC LAYER   │   │ 3 themes   │
│   → allTopics        │──▶│  3 pages/one nav   FSRS-4.5      │◀──│ CSS vars   │
│ formulas.js          │   │  modals            (scheduling)  │   │ responsive │
│ glossary.js (223)    │   │  MathJax           mistake wgt   │   └────────────┘
│ paper-questions.js   │   │  responsive        Leaks report  │
│ grade-boundaries.js  │   │                    AI tools      │
└──────────────────────┘   └────────────────┬─────────────────┘
                                            │
                   ┌──────────── STATE ─────▼──────┐    ┌──────────────────┐
                   │  localStorage  (per device)   │    │ sw.js            │
                   └───────────────┬───────────────┘    │ precaches shell  │
                                   │ (once signed in)     │ + data → works  │
                         ┌─────────▼──────────┐          │ fully offline    │
                         │  Firebase          │ realtime └──────────────────┘
                         │  Auth + Firestore  │ onSnapshot + offline persistence
                         │  (maths-hub-3aa8c) │ true-mirror both ways
                         └────────────────────┘
```

**Key idea:** the app has *no backend of its own*. All content ships with the app; all student state lives in `localStorage`; Firebase mirrors it for multi-device sync. The three AI tools call Google Gemini directly with the student's own key.

**Sign-in is required in practice.** The cloud script raises a full-screen login gate the moment the page opens and the app is unusable until Firebase Auth resolves — there is no "skip" path. The one local-only fallback is the SDK failing to load at all (offline on a first visit, or a blocked CDN), in which case the cloud block returns early, no gate is ever built, and the app runs entirely on `localStorage`. So: **signed-in by default; local-only only when the cloud machinery is absent.**

---

## The visual layer

**Shell.** **One nav element** (`#m-nav`) navigates the three main pages — Checklist, Mistakes, Past Papers (`TAB_ORDER`). Each page is a `<div class="page" id="page-…">`; `switchTab()` toggles which one is visible, and a rainbow `.m-nav-pill` slides behind the active icon (positioned in JS from that icon's bounding box, so it works along either axis).

**CSS alone decides which orientation**:

| | Desktop (>900px, fine pointer) | Mobile / touch |
|---|---|---|
| Layout | fixed 172px **labelled left rail**, `flex-direction:column` | fixed **bottom bar**, `flex-direction:row` |
| Label | **always visible**, inline beside the icon | caption under the active icon |
| Groups | pages · hairline · Settings, Statistics, Tools | pages only — `.rail-tools` is hidden |
| Overflow | the Tools icon opens `#more-overlay` | the floating ⋯ opens the `.m-menu` speed-dial |

`body` is padded by `--rail-w` on desktop and by the bar's height on mobile, so nothing sits under the nav. A **due dot** (`.m-nav-badge`) on the Checklist icon marks overdue topics, with the count in the button's `title`.

**The rail is labelled, not icon-only** (`--rail-w: 208px`, since 2026-08-17). `.m-nav-lbl` is the same element in both orientations — it was a hover tooltip on the rail and is now inline text; the mobile query still restyles it into the caption under the active icon. 208px carries 28px icons, a 16px label and 52px rows; the longest label ("Past Papers") measures ~96px, so with icon, gap and row padding it lands around 160px and nothing truncates. The `.m-nav-btn` is now the **whole row** rather than a 44px square, so the hover state, the focus ring, the click target and the pill all cover the label — a label you can read but not click is a trap.

Three knock-on details, each of which breaks if you only widen the rail:

- **`positionMNavPill()` anchors per axis.** On the rail it measures the *button* (`pad = 0`) so the pill spans icon and label; on the bottom bar it measures the *SVG* (`pad = 9`) because a full-height pill would swallow the caption. It reads the axis off `getComputedStyle(nav).flexDirection` rather than re-testing the media query in JS, so the breakpoint has exactly one definition.
- **The due dot and the timer dot are anchored to the icon** (`left: 28px` / `29px`), not the row. At `right: 7px` they would float out in the whitespace past the label. The mobile query puts both back to `calc(50% + 8px)`, since icons are centred in a column down there.
- **Label contrast is a new surface pairing.** The label used to be `--text` on `--surface2`; it is now `--muted` (inactive) / `--text` (active) over `--surface-glass` composited on `--bg`. Measured: inactive 6.13 / 6.14 / 9.29:1 and active 16.62 / 19.11 / 21:1 across `rose-dark` / `rose-light` / `pure-white`.

> **Measuring a themed colour with a `transition` on it gives the wrong answer.** `.m-nav-lbl` transitions `color`, so `getComputedStyle` immediately after flipping `data-theme` returns the mid-transition value — in practice one theme behind, which reported the labels at 2.96:1 and looked like a real AA failure. Inject `*{transition:none!important}` before auditing colour, or the audit measures the animation.

> **Why one element.** This was two navs — a `.tab-bar` with text tabs for desktop, hidden outright below 900px in favour of `#m-nav` — which meant two icon sets, two active states, two click paths and two badges (the mobile one worked by reading the desktop badge's `textContent`). Divergence was the default: `#page-progress` sat orphaned for months partly because there were two places to wire a tab up and only one got done (it was deleted on 2026-08-18). Anything nav-shaped now has exactly one home.

**The Checklist's filter bar is two layers.** Six buttons on the left pick **one** component group — All, AS level, Pure, Applied, FM core, FM options — and are the coarse cut. Everything finer lives behind **Filter**, and stacks on top. `matchesFilter()` handles the six; `matchesFilterModal()` handles the rest; `matchesSearch()` narrows whatever those two leave. All three are applied in `visibleTopics()` *and* in the cluster-card builder, which are the two places topics are counted.

The **Filter** modal carries status (multi-select), intrinsic difficulty, a **dual-thumb stability range** (0–360+ days, where 361 means "no upper bound"), and a cluster picker grouped by component with a select-all that flips to deselect-all. `fState.clusters` is `null` when every cluster is ticked rather than a set of all ids, so "no restriction" and "everything happens to be selected" stay distinguishable. A count badge on the chip shows how many groups are active.

> **Seed the slider thumbs from state, never from the DOM.** Browsers restore form-control values across a same-URL navigation, so reading the inputs when the modal opens silently resurrected a 200-day minimum from a previous visit and the list came back empty. The open handler now writes `fState` into the inputs, and both carry `autocomplete="off"`.

**Search** matches topic name, cluster name, chapter number (`12.8`, or a bare `12` for the whole chapter), component, year label, and status words — `overdue`, `due`, `not started`, `mastered`, `upcoming` — with prefix matching in both directions so `overd` and `overdue reviews` both land. It lives in a row that reveals under the bar; closing it clears the query rather than leaving an invisible filter applied.

**Random** draws from `visibleTopics()`, so it inherits whatever the bar and the modal currently allow and needs no filters of its own — the old picker's chips are gone. It closes any other Checklist overlay first, states the pool size it drew from, and offers *Randomise again* beside a rainbow *Go to topic*.

**The legend moved behind the `?`.** It was a `<details>` above the list; the grid element itself is moved into the modal on first open rather than duplicated, so there is still one copy of it.

**There are no emoji in the app.** All 56 were removed on 2026-08-17 — 52 written as literal characters plus **4 hidden as HTML numeric entities** (`&#128214;` and friends), which a Unicode scan of the source cannot see because they only become pictographs once the browser parses them. Each left a placeholder naming the icon that belongs there:

```html
<i class="ico" data-icon="camera" aria-hidden="true"></i>
```

They render as nothing, so the UI looks finished; `?icons` on the URL outlines every one in place. A handful marked `ico-live` sit where the emoji *was* the control — the favourite heart, the note marker — and draw a neutral box instead, because rendering nothing would delete the affordance; those carry `data-state="on|off"`. `ico(name, extra, state)` generates the markup for the JS-built ones, and `lnk()` on paper cards now takes an icon **name** rather than a glyph. **[`docs/icon-placeholders.md`](docs/icon-placeholders.md) lists all 48 sites** and is generated from the file, so it cannot drift.

Kept deliberately, because they are text glyphs the UI depends on rather than decoration: `✕` close, `✓` tick, `×` attempt count, `＋` add, `ƒ` formula sheet.

**Icons.** A 24×24 grid throughout, rendered at 28px, painted `var(--muted)` and switched to the `#m-rainbow` gradient when active. **All three page tabs are now filled shapes that morph on selection** (`.ic-fill`): a rhombus for Checklist, a disc for Mistakes, a slab for Past Papers. The three tool icons (gear, bar chart, 2×2 grid) are still stroked line-art, so the set is mid-migration.

Selecting a tab **resolves the icon into its detail** rather than swapping one glyph for another: the rhombus opens into a ring with a dot at its centre, the disc has an X cut out of it (each arm growing from the centre outward along its own axis), the slab opens a hole and becomes a page. Every icon is built from the same five parts:

| Part | What it is |
|---|---|
| `#…-sil` | mask holding the outer silhouette only |
| `#…-cut` | mask holding the silhouette *minus* the knockout that animates |
| `.ic-plate` | full-bleed rect through `-sil` — opaque background inside the shape |
| `.ic-base` | full-bleed rect through `-cut` — the muted colour |
| `.ic-rain` | full-bleed rect through `-cut` — the rainbow, which slides in |

Five constraints hold this together, and each one is a bug that was actually hit:

- **Every painted element is a full-bleed rect clipped by a mask, never the shape itself.** Masking a circle with a mask containing that same circle multiplies two antialiased edges, so the rim renders at roughly the square of its proper alpha — which is precisely why the unselected icons looked *slightly blurry* at the border. One antialiased edge, from the mask alone, is crisp.
- **`.ic-plate` exists because knockouts are holes.** Without it you see the selector pill's soft rainbow gradient through the X and through the ring, which reads as a blurry smear inside the shape. Painting the silhouette's own background first makes the knockouts read as clean negative space, exactly as drawn in the source SVG. `--nav-plate` is `--surface-glass` composited over `--bg`, per theme — re-derive it if either token changes.
- **Hover must not brighten the icon the colour is flowing into.** `.ic-base` goes to `--text` on hover, but you click with the pointer still on the button — so without `:not(.active):not(.nav-leaving)` the base beneath the arriving rainbow was `--text`, and the icon filled from *white* in dark mode and from near-black in light. It should always fill over the resting `--muted`. The mobile query's hover suppression has to carry matching specificity, or that rule wins on a phone despite coming first and taps brighten the icons.
- **All three page icons carry `.ic-dim`**, a rainbow layer at 35% across the whole silhouette, so each one's interior reads as tinted rainbow rather than flat rail colour. It sits above the opaque plate — which is what keeps it crisp and independent of the pill — and below the full-strength border, so the outline stays clearly darker than what it encloses. Because it is masked by `-sil` rather than `-cut` it covers the knockout, which is exactly the point: the knockout *is* the interior. It carries `.ic-paint`/`.ic-rain` so it flows in on the same slide as the border rather than fading separately, and parks off-icon with them when inactive.

  Past Papers had it alone until 2026-08-18, on the argument that a tinted X on a rainbow disc would lose the contrast that keeps the X legible at 28px. Checked at the real rendered size across all three themes, the X and the Checklist ring both hold — and three icons treating their interiors three different ways read as three unrelated icons, which was the larger cost. If a future palette narrows the contrast, the fix is the opacity, not removing the layer from two of the three.
- **Only `transform` is animated, never `d`.** WebKit cannot animate the `d` attribute at all, and this ships to iPhones as an installed PWA. That rules out path morphing and every library built on it.
- **`transform-origin` is in user units with `transform-box` left at its default**, so no `fill-box` support is required either.
- **The masks' children keep their `fill="#000"` / `fill="#fff"` presentation attributes.** The rule above sets `fill:none` on the `<svg>`, which *inherits* into the mask — and inheritance is the weakest step in the cascade, so the presentation attributes win. Move those fills into CSS and every mask inverts.

The Checklist rhombus is a **square rotated 45°**, not a `<path>`: its corner rounding is then one `rx` rather than eight bezier handles. Its knockout therefore carries the rotation in the CSS transform (`rotate(45deg) scale(…)`), because a CSS `transform` replaces the `transform` attribute rather than composing with it.

**The colour flows in rather than switching on.** `.ic-rain` sits behind the silhouette and slides into place; because `#m-rainbow` is `userSpaceOnUse`, the gradient travels *with* the rect, so the colour itself flows in instead of a finished gradient sliding across like a card. `--nav-dir` (+1 down the rail, −1 up) makes the rainbow enter from the side the pill is arriving from while the icon being left releases its colour the same way — the colour is handed between icons rather than each one flickering on the spot. `switchTab()` sets it, reusing the direction it already computes for the page slide, so this costs no new state. The mobile query swaps the axis to `translateX`, since the bar runs left-to-right.

> **Only the two icons in a hand-off may carry a transition.** An idle icon must not: its parked position depends on `--nav-dir`, so flipping that would animate its rainbow straight across its own face — every icon in the rail flashing on every tab change. Parked is off-icon either way, so snapping there is invisible.

Two bugs lived in that hand-off until 2026-08-18, and both came from doing everything in one task:

- **The colour entered from the wrong side on every switch after the first.** `--nav-dir` and `.active` were applied in the same task, so the browser never resolved style in between: the transition's "before" snapshot was still the previous frame's, where `--nav-dir` held whatever the *last* move set. The incoming icon therefore started from the previous direction's park. Measured: with `--nav-dir` at `-1` and a downward switch setting it to `+1`, the incoming rain layer still began at `+30` instead of `-30`. The *leaving* side always looked right, which is what made it confusing — a leaving icon starts at `translateY(0)`, and 0 does not depend on the direction. On screen it read as a stray flow outside the icon fighting the one inside it, because the pill was arriving from one side while the fill rose from the other. Fixed by reading a computed style between setting the variable and adding the class, which forces the parked value to resolve first. The flush has to sit **before** `prev` gains `.nav-leaving`, or `prev`'s own before-state becomes its end-state and it stops animating out at all.
- **Returning to a tab within the 440ms release window left `.nav-leaving` and `.active` on the same button.** Equal specificity, so source order decides, and `.nav-leaving` is declared later — it won, and the icon sat parked off-screen with no colour until the timer fired, then snapped on. The incoming button now clears that class and its pending timer before it becomes active.

Timing: shape 400ms `cubic-bezier(.2,0,0,1)` with a 180ms delay, colour 400ms with none, and the pill 400ms `cubic-bezier(.32,1.08,.5,1)`. The pill and the colour it carries move as one thing; the shape resolves just behind them. The pill's overshoot was cut from 1.4 to 1.08 because the old curve visibly bounced past the row and settled back. Deliberately **no** overshoot on the icon geometry, where it reads as a wobble rather than a spring. `prefers-reduced-motion` needs nothing extra — the blanket rule in `styles.css` already collapses all of it to an instant swap. The Focus timer used to count down inside its own button in the tab bar; with that gone, the **Tools icon** carries a pulsing dot (`.rail-live` / `.rail-paused`) so a running timer is still visible once its overlay is closed.

> **Note — the two orphaned page containers are gone** (2026-08-18). `#page-progress` and `#page-settings` were in the markup with nothing to activate them: neither was in `TAB_ORDER`, neither had a nav button, neither was ever given `.active`. Settings had moved into `#settings-overlay` and the progress charts were superseded by `#stats-overlay`, but `renderProgressTab()` still ran on **every** refresh — measured at **13ms**, a third of the whole refresh cycle, drawing a bar chart, a canvas donut and a per-topic list into a container no one could see. Deleting all three (markup, function, ~24 rules of CSS) is what closed it; `drawDonut()` and `PIE_COLORS` stay, since the Mistakes breakdown wheel uses them.

**Theming.** Colours are driven entirely by CSS custom properties (`--bg`, `--surface`, `--accent`, `--text`, …) set on the root via a `data-theme` attribute. There are **3 built-in themes** — **Dark** (the default), **Light** and **Light rose**. The choice persists in `localStorage['msh-theme']`. Because every colour is a variable, adding a theme is just one CSS block.

Ocean, Violet and Pure Black were retired once the spectrum became a memory scale rather than decoration: a palette that retints the whole app fights a colour ramp that has to mean the same thing everywhere. `THEME_MIGRATE` in `index.html` maps the retired keys onto the survivors, and — like `applyChapterRenames` — it runs on **every** load rather than once behind a flag, because sync can push a retired value back down from a device still on an older build at any moment. A copy of the map lives in the boot `<script>` in `<head>` so the migration lands before first paint.

**Measure, density and the accessibility floor.** Three constraints are enforced in the tokens rather than per-component, because they were each being violated in dozens of places at once. All numbers below were measured against the built app, not estimated.

| Constraint | Token | Why that number |
|---|---|---|
| Reading measure | `--prose: 70ch` | The prose containers previously permitted ~135 characters per line. [Dyson & Haselgrove (2001)](https://www.sciencedirect.com/science/article/abs/pii/S1071581901904586) found 55 cpl read faster than 25 and comprehended best; Bernard et al. (2002) found 45–76 preferred; [WCAG SC 1.4.8](https://www.w3.org/WAI/WCAG22/Understanding/visual-presentation.html) (AAA) caps text blocks at 80 |
| Container width | `--wrap: min(100% - 96px, 1360px)` | Lists get the wider cap so a large monitor shows *more rows*; prose is pinned to the measure above instead. At 2560px the old fixed 1060px cap left 742px of dead margin each side |
| Label→value distance | the name column fills the row | A Checklist row's metadata was pinned to the far right, leaving up to **930px** between a topic and its controls. [NN/g's lawn-mower eyetracking work](https://www.nngroup.com/articles/lawn-mower-pattern/) found that distance makes users break their scan pattern and lose their row. First closed with a 24rem cap on the name; since 2026-08-18 closed the other way, by letting the name grow to meet the metadata — see [Row layout](#row-layout) |

**The scrollbar gutter is always reserved** (`html { scrollbar-gutter: stable }`). Without it, any content change that crosses the "does this page scroll?" line resizes the viewport itself: switching Past Papers to Old Spec made the document taller than the window, the scrollbar appeared, `clientWidth` went 1280 → 1265, and the **entire layout jumped 15px left** — then jumped back on the way out. That is app-wide, not a Past Papers bug; every page that grows or shrinks past the window height had it. It only shows up on machines with classic scrollbars, which is why it is easy to miss — macOS's default overlay scrollbars take no layout space. `scrollbar-gutter` is Safari 18.2+, so an `@supports not` fallback pins `overflow-y: scroll` for older engines, which reserves the same width more bluntly.

**Two columns above 1500px.** `#clusters-container` becomes a two-column grid with the `.qual-header` / `.comp-header` rows spanning `1 / -1`. This is [Baymard's responsive-upscaling](https://baymard.com/blog/responsive-upscaling) prescription — repackage the same content into more columns rather than stretching each row, since stretching would reopen the label→value gap the cap just closed. The DOM was already flat, so no JS changed.

**The type scale has a floor.** There is no standard minimum font size — WCAG regulates contrast, spacing and resizability, not absolute size — but the old scale bottomed out at **9px** and set body at 14px. NN/g's stated floor is 8pt (~10.7px); Bernard et al. (2002, n=60) found 10pt read significantly more slowly than 12pt; and [Piepenbrock et al. (2013)](https://www.tandfonline.com/doi/full/10.1080/00140139.2013.790485) found the light-mode reading advantage *grows as font size shrinks*, which matters because this app defaults to dark. The scale is now 11 → 24px with body at 16px, and `--fs-2xl` is 24px precisely because that is WCAG's "large text" threshold, so headings earn the 3:1 contrast allowance.

**Contrast is checked against every surface, not just the background.** `--surface3` is the binding constraint: a token can clear 4.5:1 on `--bg` and still fail inside a nested panel. All three themes now clear [SC 1.4.3](https://www.w3.org/WAI/WCAG22/Understanding/contrast-minimum.html) AA (4.5:1) for every token against all four surfaces. The worst offender was **`rose-light`, which inherited the entire status and difficulty palette from the dark theme and never re-tinted it** — `--due` measured **1.67:1** on white, i.e. the memory-strength and difficulty indicators were effectively invisible on that theme. `--dim` is used as a text colour in 70 places and sat at 1.7–2.7:1, so it could not stay a "tertiary" tier below the AA floor. The spectrum is now re-tinted per theme rather than shared, because it is not purely decorative: it strokes the active nav icon (a component state, so [SC 1.4.11](https://www.w3.org/WAI/WCAG22/Understanding/non-text-contrast.html)'s 3:1 applies) and is clipped to text on two active tab labels.

**Colour is never the only cue.** The difficulty pip encoded Standard / Challenging / Hard as green / amber / red and nothing else. Red-green is the exact axis ~8% of men cannot resolve ([NEI](https://www.nei.nih.gov/learn-about-eye-health/eye-conditions-and-diseases/color-blindness); [Wong 2011, *Nature Methods*](https://www.nature.com/articles/nmeth.1618)), so for those users the three states collapsed into one indistinguishable dot. [SC 1.4.1](https://www.w3.org/WAI/WCAG22/Understanding/use-of-color.html) is **Level A** — the strictest — and a contrast difference does *not* satisfy it when the meaning depends on identifying which colour it is. Each level now carries a shape as well: solid disc, hollow ring, square. The 1–5 slider numerals were painted with the dark-theme ramp hexes (1.3–2.4:1 on white); they are ordinary readable text now, with the gradient track still carrying the scale.

**Target sizes.** [SC 2.5.8](https://www.w3.org/WAI/WCAG22/Understanding/target-size-minimum.html) (AA) requires 24×24 CSS px and applies to pointer input too, not just touch. 57 controls were under it — filter chips at 22px, the `Test` button at 42×17, the favourite star at 17×22, and the rating sliders whose drag target was the 5px visible track. Two remain, both explicit exceptions in the SC: a lone checkbox (the **Spacing** exception, and its wrapping `<label>` is the real target) and one link inside a sentence (the **Inline** exception).

**Colour tokens are not optional.** `.fav-card-name` hardcoded `#fff` because its card wears a gradient *border* and it was written as though the card were gradient-*filled*. On `rose-light` (`--surface:#ffffff`) that is white on white — 1.0:1, every favourited resource's name invisible — and 1.06:1 on `pure-white`. It uses `var(--text)` now and measures 16.4:1 / 19.2:1 / 18.8:1 across the three themes. The rule the audit above enforces per-token only holds if nothing opts out of the tokens: **a literal colour is a theme bug waiting for someone to switch themes.** The rest of the `color:#fff` declarations in `styles.css` are all on `var(--grad)`-filled buttons, where white is correct in every theme.

**No C1 control characters.** `index.html` carried 12 of them — 11 × U+0097 and 1 × U+0096 — in place of em and en dashes, in the review-panel subtitle, the favourites empty state, all three Resources category labels and four resource descriptions. They are cp1252 bytes `0x97`/`0x96` decoded as Latin-1 and re-encoded as UTF-8: unprintable, so browsers drew a tofu box or nothing. Anything that round-trips this file through a non-UTF-8 editor can reintroduce them; the giveaway is a dash that has become a blank or a box.

**One 1–5 slider, used twice.** Recall rating (study modal) and mistake severity are the same control: a full-height gradient track with the scale drawn above it and a **translucent rounded-rect thumb riding on the gradient** rather than an opaque knob sitting over it, so the colour under the handle stays readable and the handle reads as part of the scale. Both run on the app's own `--spectrum`. They used to diverge in three ways at once, which is why they never looked related: severity had its own green→red ramp; severity's track filled its whole 26px box while the rating track was a 5px line painted inside one (an accident — the `background` shorthand in the severity override reset `background-size`); and the rating slider carried a separate row of numbers *underneath* while severity drew its own above. The severity pips beside the track are gone with them — the scale is on the slider now.

The paper-log difficulty slider (`#plog-diff`) is the third instance of the same control.

> The spring physics are untouched (`SPRING_K/C/M`, ζ≈0.69), so the thumb still settles onto the discrete value with the same small rebound. Only the geometry changed: `THUMB_D` is 22px for the bar variant, and `EDGE_PAD` is 2px so the thumb stops the same distance from the ends of the track as it sits from the top and bottom. **Both constants are load-bearing in three places** — the target position, the walls that stop the spring overshooting off the track, and the padding on the 1–5 scale. Change one without the others and the numbers stop landing under the thumb. The CSS thumb *width* must also stay at `THUMB_D`: a mobile override once set it to 26px, which would have pushed the thumb back over the ends and cancelled `EDGE_PAD` exactly.

Three geometry traps, all of which produced a visibly off-centre thumb:

- **A range input is inline-level.** The wrapper then gains a line box with descender space beneath it and is taller than the track, so the thumb's `top:50%` measures against the wrong box and lands ~3.5px low — far enough to overhang the bottom edge. `.sspring-bar input[type=range]{display:block}` collapses it. Scoped deliberately: the round-knob sliders carry a `+2px` nudge that compensates for the very same gap and would go off-centre the other way.
- **A margin on the input sits *inside* the wrapper.** `.plog-slider` had `margin-top:6px`, which made its wrapper 6px taller and threw the thumb 3px high. Spacing above belongs on `.sspring-has-nums`.
- **Mobile overrides for these sliders are dead.** The `.rating-slider` / `.plog-slider` rules sit outside any media query and later in the file; media queries add no specificity, so source order wins. The `height:40px` rule in the touch block has never applied. The bar sliders use the same 26px track everywhere, which clears SC 2.5.8's 24px on its own.

**The review rows put the action on the right.** `.rev-meta` wraps the recall %, the date and the Test button so the group rides to the far right with `margin-left:auto`, 20px clear of the edge (the row's right padding). Test itself is drawn from the same full-strength spectrum as the nav rail's pill, with `--on-spectrum` carrying its text colour — the ramp is light in the dark theme and dark in the light ones, so one hardcoded colour cannot stay legible across both.

> Both row types now do this — see [Row layout](#row-layout) below.

### Row layout

**The name fills the row; everything else sits hard right; nothing floats in between.** `.topic-name` and `.rev-name` are `flex:1 1 0` with `min-width:0`, on one line, ellipsed if they still do not fit; `.topic-right` / `.rev-meta` take `margin-left:auto`.

They used to stop at `--row-name-max: 24rem`. Measured on a 1280px window that left the metadata ending at x=851 in a row running to x=1036 — **173px of dead space past the controls**, with the group stranded mid-row. The cap was there for a real reason: [NN/g's lawn-mower work](https://www.nngroup.com/articles/lawn-mower-pattern/) found that a wide gap between a label and its values makes people break their scan and lose the row. But capping the name is only one way to close that gap. Filling it with the name is the other, and it also gives the metadata a predictable right edge to scan down as a column. The token is gone; nothing else used it.

Two consequences, both measured:

- **Long names truncate at narrow column widths.** None of the 315 do at 1280px. Eight do above 1500px, where `#clusters-container` splits into two ~627px columns — all of them Statistics topics that run past 400px, and by less than 15%. Both row types carry a `title`, so the full name is one hover away.
- **Mobile keeps wrapping.** There is no dead space to reclaim on a phone, and the name column measures ~103px there — one line would show about twelve characters. The media query restores `white-space:normal`.

### One focus manager for every dialog

Until 2026-08-18 no dialog trapped keyboard focus or gave it back: Tab walked straight out of an open panel into the page behind it, and closing one left focus on `<body>`, so the next Tab restarted from the top of the document. That is [SC 2.4.3 Focus Order](https://www.w3.org/WAI/WCAG22/Understanding/focus-order.html) (Level A), and it was the largest gap left after the contrast and target-size work.

All 23 dialogs are a `.modal-overlay` or a `.stats-overlay` with a `.modal` / `.stats-panel` inside, and every one is opened by adding the class `open`. So it is **one `MutationObserver` on that class**, not 23 call sites — the same argument as [one nav element](#the-visual-layer): 23 places to keep in step is 23 places to forget one, and a dialog added next year is covered without registering it.

The observer maintains `mhDialogStack`, ordered by *when* each dialog opened, which the DOM cannot tell you. Three things read it, and each was a bug before it existed:

- **Escape closes the dialog on top.** It used to close the first open `.stats-overlay` *in document order*, so with Settings open behind My exams, Escape dismissed Settings and left My exams sitting on top of nothing.
- **Escape works while you are typing.** The handler's `if(tag==='INPUT') return` guard sat *above* the Escape branch, so with the cursor in the glossary's search box — or any of the dozen fields inside a dialog — Escape did nothing and the only way out was the mouse. One input carried a private workaround; the rest did not.
- **The scroll lock lifts only when the last dialog goes.** Thirteen close functions each set `overflow=''` unconditionally, so closing an inner dialog let the page scroll away behind an outer one that was still open. They all call `mhReleaseScroll()` now, which reads the live DOM rather than the stack — the stack is maintained by an observer and is therefore one microtask behind a synchronous close.

> **Do not fight a dialog's own autofocus.** Several open by focusing a specific field on a ~120ms timer. The observer runs at microtask time, so it lands first and theirs wins, which is the right order; and it skips the move entirely when focus is already inside. Focus is taken with `preventScroll:true`, or a long panel jumps to its first control as it opens.

**Motion & feel.** Modals scale-and-rise in with a spring cubic-bézier; buttons use solid fills with `:focus-visible` rings (deliberately **no transparent borders on filled buttons** — they create a faint seam). Everything is built mobile-first and installs as a **PWA** — home-screen icon, and a service worker (`sw.js`) that precaches the shell, `styles.css` and all five data files on first visit, so the app opens and runs **with no network at all**. Revision on a train works exactly like revision at a desk; only cloud sync and the AI tools need a connection.

**The one canvas gets the theme handed to it.** Everything else in the app is a CSS variable and re-themes itself; the Mistakes breakdown wheel is pixels. It painted its hub and slice separators in a hardcoded `#1E293B` with `#E2E8F0` for the total — slate, from a palette the app no longer has, so it matched *no* theme: a dark blue-grey hub inside a white card on both light themes, and a blue hub on a maroon one in `rose-dark`. It reads `--surface` and `--text` through `_themeColor()` at draw time now, and `applyTheme()` redraws it, since no stylesheet can restyle a bitmap.

It also drew at **half resolution on every retina display**. A canvas has two sizes — the CSS box and the pixel grid behind it — and setting only the `width`/`height` attributes makes them equal, so the browser upscales. `_hidpiCanvas()` sizes the backing store to `devicePixelRatio` (capped at 3) and scales the context back, leaving the drawing code thinking in CSS pixels.

> **Cache the CSS size on the element; never re-read `canvas.width` as a fallback.** After the first resize that attribute *is* the backing store, so `canvas.clientWidth || canvas.width` multiplies by the pixel ratio again on every call. This canvas lives behind one of the five Mistakes breakdown tabs, so `clientWidth` is 0 on most draws and that fallback is the normal path, not the edge case — it reached **174,080px** before a pixel probe caught it.

**Maths.** All mathematical content is written in LaTeX and typeset by **MathJax** (`$…$` inline, `$$…$$` displayed).

---

## The surfaces, feature by feature

### 1. 📋 Checklist — `#page-checklist`
**Visual:** the home screen. Every spec topic as a card, grouped by area (Pure / Statistics / Mechanics, or the Further modules), each showing a **memory-strength indicator** (predicted % recall, colour-graded red→amber→green) and a **status** (due / overdue / upcoming / mastered / not started). Due and overdue topics float to the top.

**Technical:** cards are driven by the FSRS engine. For each topic, `statusFor(name)` compares today against `dueDateFor(name)`; `strengthInfo(name)` converts the topic's current *retrievability* into the % badge and colour. The Today card's time-of-day greeting is kept live by `_syncGreeting()` — a 60-second interval plus a `visibilitychange` handler — because `_greeting()` was only ever evaluated inside `renderTodayCard()` and so froze at page load; an installed PWA left open all day still read "Good morning" at 9pm. It writes `#today-eyebrow` only when the text actually changes, so it never touches the card body and cannot collide with a focused input or an incoming sync redraw.

Tapping a topic opens the **study modal**, where rating how a review went (1–5) calls `saveTopicStudied()`, updates the topic's memory state, and reschedules it. The modal also shows a **per-grade forecast** (via `simulateGrade()`) — "if you rate this Good, next review in 12 days" — before you commit.

### 2. 📝 Papers — `#page-papers`
**Visual:** the past-paper command centre. Tabs for **AS**, **A-Level**, **Further Maths**, **Old-spec** (C1–C4, FP, M1, S1…) and practice sets (Madas, Naiker). Pick a paper, log your marks (a single total *or* question-by-question), and see performance charts, grade boundaries and an exam timer.

**Switching module no longer moves the page.** Modules hold different numbers of papers, so replacing the list changed the document height — and if you were scrolled down, the browser clamped `scrollTop` and the whole view lurched upward. Measured on A-Level → Further Maths at `scrollY 220`: document 1058 → 940, view yanked up 116px. That was the reported "twitch"; it is a scroll clamp, not lag.

`ppRenderKeepingView()` reserves exactly enough height on `#pp-browser` to keep the current scroll position legal, and gives it back on the first scroll that no longer needs it (floor: `scrollY 0`, where shrinking below the fold cannot move anything, so the reservation always clears eventually). Two things make it work that are easy to get wrong:

- **`#pp-browser` is `display:flow-root`.** `.pp-module` has `margin-bottom:20px`, and the last one's margin **collapsed out through the wrapper** — so `min-height` on the list was not authoritative, and pinning it still let the document shrink by exactly that 20px. A block formatting context contains the margin and makes the pin exact.
- **Never ask the browser what it just did.** An earlier version cleared `min-height`, read back how far `window.scrollY` had been clamped, and reserved that. `scrollY` does not update synchronously with the forced reflow, so it read ~20px light and the page still nudged every switch. The height that will be needed is computed from the children instead.

The **exam timer opens paused** (`timerState.running=false`, button reads `Start`). It used to start on `openTimer()`, so the clock ran while you found a pen and opened the PDF and every logged `timeTakenMin` was inflated. `timerLabel()` returns `Start` while `remaining===total` and `Resume` after, so a paused timer never claims to have been running; `timerReset()` returns to full duration *paused*, matching the open state.

**Technical:** the app ships a `PAPER_QUESTIONS` table — for **every** supported paper, an array of `{q, marks, topics:[…]}` giving each question's mark tariff and the exact topic(s) it examines. When you log marks per question, those lost marks are attributed to specific topics; results are stored in `localStorage['alevel-paperlog-v1']` and cross-referenced against `GRADE_BOUNDARIES` to show your grade. This per-question data is what powers the Leaks report below. Coverage is validated so **every paper's marks sum to its real total** and every topic string matches the canonical topic names.

### 3. ❌ Mistakes — `#page-mistakes`
**Visual:** a log of questions you got wrong, each tagged with a **category** (Concept gap, Method error, Silly mistake, …) and a 1–5 **severity**. A **re-attempt loop** brings a mistake back later so you can try it again and rate the retry; an **"Explain with AI"** button gives a focused walkthrough.

**Technical:** mistakes live in `localStorage['alevel-mistakes-v2']`. Crucially, they **feed back into scheduling** — since phase 2 of the [evidence model](docs/fsrs-evidence-model.md), each mistake is a dated *observation* replayed on the same timeline as reviews, and it moves the topic's stability directly. The **category**, not the severity, sets how far: one concept gap drops a well-learned topic from 96% to 82% and makes it overdue immediately; a method error takes about three; silly slips barely register. So logging a mistake genuinely changes what the app tells you to revise — see [the engine section](#mistakes-are-evidence-not-just-a-nudge).

### 4. 📉 "Where I lost marks" (Leaks report) — inside Progress/Mistakes
**Visual:** turns all your logged papers into a ranked report — **marks lost per topic**, a **grade-impact headline** ("these leaks cost you ~1 grade"), and a **"revise first" ordering** by how often each topic bleeds marks.

**Technical:** it aggregates the per-question paper-log data (not summed row totals — computed per *question* so multi-topic questions don't double-count), ranks topics by total marks lost and frequency, and maps the recoverable marks onto grade boundaries.

### 5. 📊 Statistics — `#stats-overlay`
**Visual:** the honest audit, opened from the bar-chart icon in the nav rail (or the ⋯ menu on mobile) — average predicted recall, mastered / overdue / due counts, total reviews and lapses, and four distributions: retrievability in ten bands, stability (`<7d` · `7–30d` · `1–3m` · `3–6m` · `6m+`), difficulty `D 1–10`, and current intervals. Then a per-topic breakdown.

**Technical:** `computeStats()` builds all of it from the derived memory records; mastery is counted with `isMastered()` rather than `statusFor(...)==='done'`, since a mastered topic can also be due.

> **It did not, until 2026-08-18.** Average recall, mastery and the due counts went through `memoryFor()`, but average stability, average difficulty, the lapse rate and the stability / difficulty / interval histograms read `sr[]` **directly** — the stored review-only record, before mistakes and paper marks are replayed onto it. So the one surface built to audit the model disagreed with the model. On a realistic store **104 of 220 studied topics** differed: average stability was reported as 107 days against a true 72, the mastered count as 23 against 15, and "2.1 Solving quadratic equations" was binned at `6m+` and labelled Mastered while its derived stability was **0.6 days** and the Checklist was calling it overdue. Everything here now reads `memoryFor()`; only the *existence* check (`filter(t=>sr[t.name])`, "has this been studied at all") still touches `sr[]`, which is correct — that is a fact about the review log. The older `#page-progress` charts and their `renderProgressTab()` were deleted on 2026-08-18, being an unreachable duplicate of this surface.

### Cross-cutting features (reachable from the nav's tool group / quick-row)
- **🧰 Tools overlay** (`#more-overlay`) — the rail's grid icon opens a four-tile menu: Resources, Revision plan, Focus timer, AI Tutor. These used to be text buttons crowding the right-hand end of the tab bar; collecting them behind one icon is what let the nav become icon-only. Mobile reaches the same tools through the ⋯ speed-dial instead, so the overlay is desktop-only in practice.
- **📖 Glossary** — 223 searchable Pure terms (`GLOSSARY`), plus **inline glossary popovers**: terms elsewhere in the app are tappable for an in-place definition.
- **🗂 Resources overlay** — reference links/material, opened from the Tools overlay on desktop and a `.cl-quick` row on mobile.
- **🧮 Formula sheet** — the `FORMULAS` data rendered as an interactive, searchable sheet styled like the real formulae booklet.
- **📅 Revision plan / My exams** — the multi-exam adaptive planner. Instead of one global exam date, you set a date **per paper** (AS P1–P2, A-Level P1–P3, and the Further modules), seeded from `exam-dates.json` (currently the provisional Edexcel Summer 2027 timetable) and overridable per paper. Each topic then ramps against the date of the paper that actually examines it, so Statistics tightens for the Stats paper rather than for whichever exam happens to be first. Reachable from Settings → My exams, from the Tools overlay, and from a plan generator on the Checklist quick-row.
- **Settings** (`#settings-overlay`, opened from the ⚙ icon in the nav's tool group) — account, theme picker, per-paper exam dates (which drive the scheduler's exam ramp), Further Maths options, keyboard shortcuts, plain-language mode, Gemini API key, JSON export/import, and a **Sync diagnostics** panel with manual push/pull.

---

## The spaced-repetition engine (deep dive)

This is the heart of the app. It's a full **FSRS-4.5** implementation (Free Spaced Repetition Scheduler — the algorithm behind modern Anki), adapted for exam topics rather than flashcards. Everything below lives in the main `<script>` block of `index.html` — grep for `FSRS_W` to land on the tuning constants, and the functions follow directly beneath.

### The forgetting curve
Memory is modelled with FSRS's power-law forgetting curve:

```
R(t, S) = (1 + FACTOR · t/S) ^ DECAY        DECAY = −0.5,  FACTOR = 19/81
```

- **R** = *retrievability*, the probability you'd recall the topic right now (0–1).
- **t** = days since you last reviewed it.
- **S** = *stability*, how many days it takes for recall to fall to 90%. Higher S = more durable memory.

`FACTOR` is chosen so that at `t = S`, `R = 0.9` exactly. `forgetting(t,S)` computes this; `intervalForRetention(S,R)` inverts it to answer "how many days until recall drops to my target R?".

### Every topic carries a memory state
`sr[name] = { D, S, last, reps, lapses, log[] }` where **D** is difficulty (1–10) and **S** is stability (days). Persisted in `localStorage['alevel-sr-v5']`.

### Scheduling a review
`dueDateFor(name)` = `last + intervalForRetention(S, targetRetention(name))`. The **target retention** is not fixed — `targetRetention()` adapts it:

- **Base** 0.90 (review when recall is predicted to hit 90%).
- **Exam ramp:** within `EXAM_RAMP_DAYS = 70` days of your exam it climbs toward **0.97** (`MAX_RETENTION`), so revision tightens as the exam nears. Past the exam date it pins at 0.97.
- **Mistake lift:** recent mistakes on the topic raise the target (sooner reviews).
- **Hardness lift:** harder topics get a slightly higher target.
- Clamped to [0.80, 0.985].

Because the target rises, `dueDateFor` naturally pulls everything closer together as the exam approaches — no separate "cram mode" needed.

### Updating after a review
When you rate a review 1–5, the FSRS update primitives fire — all of them behind **one shared step, `applyReview()`**, which `saveTopicStudied()`, `simulateGrade()` and the sync `replayRecord()` all delegate to. That is [phase 1 of the evidence model](docs/fsrs-evidence-model.md): stored memory state is now a *pure function of the review log*, so replay reproduces the live path exactly and the modal's forecast is bit-identical to what Save writes. (It previously was not: the live path used `effectiveD()` — difficulty inflated by the current, time-decayed mistake load — while replay used the record's own `D`, so two devices with identical histories could hold different `S`.)

- `initialStability(r)` / `initialDifficulty(g, topicDiff)` seed a brand-new topic, **blending** FSRS's defaults with the topic's intrinsic maths difficulty (`DIFF_D_SEED = {1:3.5, 2:5.0, 3:6.8}`).
- On success, `stabilityAfterRecall(D,S,R,r)` grows S (bigger jump when the memory was already weak but you still recalled it — the desirable-difficulty effect).
- On a lapse (rated 1), `stabilityAfterLapse(D,S,R)` *reduces* S (a lapse can never increase stability) and increments `lapses`.
- `nextDifficulty(D,g)` nudges D and mean-reverts it toward the easy baseline.
- The canonical **FSRS-4.5 weight vector** (`FSRS_W`, 17 values tuned on millions of real reviews) drives all of these.

A topic with `S ≥ MASTERY_STABILITY (180 days)` is labelled **Mastered** — but mastery is a *label, not an exit*. Stability of 180 days means durable, not permanent: a topic last seen 200 days ago is already below 90% recall. Mastered topics stay on the schedule and resurface when they fall due, and `needsExamConfirmation()` guarantees one confirmation pass over everything inside `EXAM_RAMP_DAYS` — including topics whose stability is high enough that the ordinary interval would sail clean past the exam. (Previously `statusFor` short-circuited to `'done'` and `strengthInfo` reported a hardcoded 100%, so the closer the exam got, the more of the syllabus silently disappeared — the opposite of what the exam ramp is for.) Use `isMastered(name)` to count mastery; a mastered topic can now also be due.

### Mistakes are evidence, not just a nudge
This is the app's signature mechanic, and [phase 2 of the evidence model](docs/fsrs-evidence-model.md) rebuilt it.

**A mistake is an *observation*, not a rehearsal.** Logging "concept gap on integration by parts" does not restudy the topic — it says the model's estimate was too high. So `applyMistake()` revises `S` and `D` but **leaves `last` alone**. That distinction is load-bearing: if a mistake reset the clock, `currentRetrievability()` would be `forgetting(0, S)` ≈ 100% and logging a mistake would make the memory percentage jump *up*.

**Category, not severity, sets the size.** `MISTAKE_EVIDENCE` grades the eight categories by [Newman error-analysis](https://files.eric.ed.gov/fulltext/EJ1488529.pdf) stage — "what fraction of a full lapse is one of these?" A mistake moves `S` that fraction of the way toward `stabilityAfterLapse()`, so repeats compound as `1 − (1−E)ⁿ`:

| Category | `E` | ≈ n to full effect | | Category | `E` | ≈ n |
|---|---:|---:|---|---|---:|---:|
| Concept gap | 1.00 | 1 | | Misread question | 0.15 | 6 |
| Missed the clever step | 0.60 | 2 | | Calculation error | 0.12 | 8 |
| Method error | 0.33 | 3 | | Transcription slip | 0.08 | 12 |
| Ran out of time | 0.25 | 4 | | Silly mistake | 0.08 | 12 |

On a mature topic (S≈30d, 96% recall) one concept gap gives **96% → 82%, overdue immediately**; a method error needs ~3; five silly slips move it ~1 point. On a freshly-seeded topic (S≈4d) every category bites proportionally harder — correct, and pinned by the test suite. Retune with `node scripts/fsrs-sim.mjs`.

**Built as a derived layer, not a migration.** `sr[]` stays exactly what phase 1 made it — reviews only, which is what sync merges. `memoryFor(name)` replays reviews *and* mistakes together on one date-sorted timeline (`buildTimeline` → `replayTimeline`), and every user-facing read goes through it: memory %, due date, status, mastery, the forecast. **No new storage key, no migration, no change to the sync contract** — both devices already merge reviews and mistakes by their own rules, so both derive the same answer. Order is total and deterministic: `(date, kind, id)` with reviews before mistakes on the same day.

**What's left of the soft channel.** `mistakeLoad()` — severity- and recency-weighted (`MISTAKE_SEVERITY`, `exp(−age/τ)`) — survives only as a small lift to `targetRetention()` ("you got this wrong lately, look sooner"). `MISTAKE_D_WEIGHT` is now **0** and `MISTAKE_RET_WEIGHT` dropped 0.04 → 0.015, because the real penalty lands on stability. `effectiveD()` therefore collapses to `rec.D`. The decay term must never enter the replay: it is a function of `today()`, and replay has to be pure ([sync](#cloud-sync-architecture) depends on it).

**Phase 3 — past-paper marks — is built** (`309b784`), and phase 4's forgetting-curve view with it (`5bc45ee`). A logged per-question paper becomes a dated event on the same timeline: `paperEventsByTopic()` turns each question into `{rating, coverage}` from the mark ratio, `applyPaper()` folds it in, and same-day precedence is paper → review → mistake so one error is never charged twice. It is a setting (`alevel-paperfsrs-v1`, default on) rather than a fait accompli, because it changes what the app tells you to revise. Design and as-built notes in [`docs/fsrs-evidence-model.md`](docs/fsrs-evidence-model.md) §4.

### The evidence trail
Because the timeline is walked event by event, recording what each one *did* is nearly free. `evidenceTrail(name)` produces the list under the memory details in the study modal:

```
Memory 82%  ·  overdue by 5 days
  12 Jul   rated OK                    next in 15d
  28 Jul   rated Confident             next in 34d
   4 Aug   concept gap                 91% → 82%
```

Newest first, capped at 8. It is the honest answer to "why is this suddenly at the top of my list?", and nothing else in the A-level market can point at a specific logged error and say *that is why*.

### Live UI signals
- `currentRetrievability(name)` → the % on each Checklist card.
- `strengthInfo(name)` → the colour band (red < 70% < orange < 85% < amber < 93% < green) and label. The bands climb monotonically in hue (0° → 27° → 43° → 158°); amber and orange were previously the wrong way round, so improving from 84% to 86% recall moved the badge backwards towards red.
- `simulateGrade(name, date, g)` → the modal's "what happens if I rate this…" forecast, run for each grade without committing.

Guards throughout keep it robust: `validRec()` rejects corrupt state, `safeInterval()` clamps intervals to `[1, 3650]` days to prevent `Date` overflow at extreme stability.

---

## Where the render time actually goes

Measured in Chrome on an M-series Mac against a realistic store — 220 studied topics, 180 mistakes, 25 logged papers, FM track (253 visible rows, 2,874 nodes). Times are the median of ten runs. "Full refresh" is the sequence the sync listener runs on every incoming snapshot.

| | Before | After | |
|---|--:|--:|---|
| `renderAll()` | 14.5ms | 3.5ms | |
| `renderReviewPanel()` | 7.3ms | 2.2ms | |
| `renderMistakesTab()` | 9.7ms | 3.0ms | |
| `renderProgressTab()` | 13.0ms | — | deleted; it drew into a hidden container |
| `updateDueBadge()` | 2.1ms | 0.5ms | |
| **Full refresh** | **45.2ms** | **10.9ms** | |

Four causes, in the order they mattered. Each was measured rather than guessed, and the surprise is that none of them was the FSRS maths — the engine's own memoisation was already doing its job.

- **`fmtDate()` built a fresh `Intl.DateTimeFormat` on every call.** `toLocaleDateString(locale, options)` constructs a formatter internally each time it is called with an options object; measured at **37.9µs** against **0.55µs** for a hoisted formatter, a 69× difference. At 141 calls per Checklist draw that alone was ~5ms. [MDN says so explicitly](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Date/toLocaleDateString): use `Intl.DateTimeFormat` and reuse it when formatting many dates.
- **`renderProgressTab()` drew a bar chart, a canvas donut and a per-topic list into a permanently hidden container** on every refresh — 13ms, a third of the cycle, for pixels nobody could see.
- **`today()` was called 3,439 times per render**, each allocating a `Date` and building three strings. It now re-derives at most once a second, so a single render computes it once and the day can never be stale by more than a second at midnight.
- **`activePapers()` was rebuilt, remapped and re-sorted 517 times per render** — once per topic, through `targetRetention()` → `examDateForTopic()` → `examDateForComponent()` — and `paperDate()` inside it ran `JSON.parse` on the same unchanged override string for every paper. Memoised on `_examSig()`.

Two rules came out of this that are worth keeping:

> **Cache on a signature, not on an invalidation call.** Every cache added here re-reads its cheap inputs and compares; none of them relies on a future writer remembering to call an invalidate function. `applyChapterRenames()` is in the codebase precisely because a one-shot flag was trusted and sync pushed stale data in behind it.

> **Measure before optimising, and measure the helper, not the feature.** The instinct was to blame the FSRS replay or the 173 KB paper table. Both were nearly free. The cost was in a date formatter and a hidden container.

---

## Data model & storage

All student state is JSON in `localStorage`, namespaced `alevel-*` / `msh-*` / `mh_*` — **except mistake photos**, which live in **IndexedDB** (`msh-images`). They used to fall back to a base64 data URL inside the mistakes array; a handful exhausted the ~5 MB quota, at which point `saveState()` failed and studying itself stopped persisting. Keeping them out also keeps them out of the sync payload, since `localStorage` is what gets mirrored to the cloud. `mhResolveImage(m)` is the single read path (legacy inline copy → IndexedDB → Firestore), and photos taken offline queue in `alevel-imgpending-v1` until they can be uploaded.

`saveState()` is **all-or-nothing**: values are serialised up front and any failure rolls the whole batch back. Previously six sequential `setItem` calls shared one `try`, so a quota failure on the third left the first two written — `sr` saved but `mistakes` lost — and the hooked `setItem` had already queued that half-state for the cloud.


| Key | Holds |
|-----|-------|
| `alevel-sr-v5` | the FSRS memory state per topic (`{D,S,last,reps,lapses,log}`) — the core progress data |
| `alevel-mistakes-v2` | logged mistakes (topic, category, severity, date) |
| `alevel-paperlog-v1` | logged past-paper results (per-question marks) |
| `alevel-paper-dates-v1` | when each paper was attempted |
| `alevel-exam-date` | your exam date → drives the scheduler's exam ramp |
| `alevel-track` | which specification you're on |
| `alevel-favs-v1` | favourited topics |
| `alevel-notes-v1` | personal notes |
| `alevel-streak-v1` | study-streak counter — still recorded and synced, but no longer displayed; the 🔥 chip was removed with the tab bar. `weeksMet` still feeds the Checklist's today-card line |
| `alevel-gemini-key-v1` | your Google Gemini API key |
| `alevel-fm-options-v1` | Further Maths module choices |
| `alevel-plainlang-v1` | plain-language toggle |
| `alevel-pomo-presets-v1` | study-timer presets |
| `alevel-shortcuts-v1` | UI shortcuts config |
| `alevel-onboarded-v1` | onboarding-seen flag |
| `alevel-exam-off` | exam ramping switched off (cleared via a `keys` tombstone, so the choice propagates) |
| `alevel-practiceq-v1` | cached AI-generated practice questions, last 8 per topic (device-local) |
| `msh-theme` | active theme |
| `alevel-syncmeta-v1` | the merge ledger: `del`/`add` tombstones and `mod` edit stamps |
| `alevel-imgpending-v1` | photo ids awaiting upload (device-local — deliberately not synced) |
| `mh_stamp`, `mh_writer` | sync bookkeeping (last-write timestamp + which device wrote) |

Older keys (`alevel-sr-v4`) are read for one-time migration.

**Hard-coded content** (constants in `data/*.js`, not user data): `clusters` → `allTopics`, `FORMULAS`, `GLOSSARY`, `PAPER_QUESTIONS`, `GRADE_BOUNDARIES`. The FSRS weight/tuning constants live in `index.html`.

### Topic renames & the remap

Because every topic name is a primary key — `sr[name]`, notes, favourites, mistakes, and all 2,106 past-paper tags — renaming a topic means rewriting saved progress. The July 2026 chapter reorganisation renamed 94 Pure topics, so `index.html` carries a `CHAPTER_RENAMES` map and an `applyChapterRenames()` function that rewrites `alevel-sr-v5`, `alevel-notes-v1`, `alevel-favs-v1` and `alevel-mistakes-v2` in place.

Two properties matter, and CI enforces both:

- **It is idempotent.** No value in `CHAPTER_RENAMES` is also a key, so `mv()` applied twice equals `mv()` applied once. Nothing is written unless a name actually changed.
- **It is not gated behind a one-time flag.** It runs on *every* load and again at the end of `applyToLocal()`. This is deliberate: sync mirrors `alevel-sr-v5` between devices, so a device still running an older build can push pre-rename names back down at any moment. The original one-shot flag (`alevel-chapter-mig-v1`) was device-local and *not* in `SYNC_KEYS`, which meant stale names could land **after** a device had already marked the migration done — silently orphaning study history, with topics reverting to "not started". Running unconditionally removes that whole class of bug, and because the remap goes through the hooked `setItem`, a correction also schedules a push that heals the cloud copy for every other device.

If topics are ever renamed again, add the entries to `CHAPTER_RENAMES` (never rename an existing *target*, or idempotency breaks and CI will say so).

---

## Cloud sync architecture

The app gates on sign-in (see [the key idea](#architecture-in-one-picture)) and mirrors your state to **Firebase** (project `maths-hub-3aa8c`) using the compat SDK (v10.14.1, Auth + Firestore). If the SDK never loads, the whole block returns early and the app stays local-only.

- **Realtime:** an `onSnapshot` listener on `users/{uid}` pushes remote changes to every device live — a change on your laptop reaches your phone in seconds.
- **Offline-durable:** `db.enablePersistence({synchronizeTabs:true})` caches writes in IndexedDB, so edits made offline queue up and flush when you reconnect (and multiple tabs stay consistent).
- **Record-level merge, not last-write-wins.** `mergeStores(local, remote, localMs, remoteMs)` reconciles the two copies *record by record*, so a phone and a laptop used in the same evening both keep their work. This replaced whole-document LWW, under which the device that pushed second silently replaced everything the other had done.
- **Diagnostics:** Settings → Sync shows live status.

### How the merge works

Each kind of data gets the rule that actually fits it:

| Data | Rule |
|---|---|
| `alevel-sr-v5` | union the review **logs**, sort by date, and replay FSRS over the result |
| `mistakes`, `paperLog` | union by id; tombstones for deletes; newer `modified` wins an edit |
| `alevel-favs-v1` | set union, minus anything tombstoned |
| `alevel-notes-v1` | newer edit wins, compared on the `mod` stamps in the ledger |
| `alevel-streak-v1` | union the `days`, take the max of the counters |
| theme, track, exam dates, module choices | genuine last-write-wins on the store timestamp |

The topic rule is the important one. `D` and `S` are not independent facts needing a winner — **FSRS derives them from the review history**, so two devices rating the same topic differently is not a conflict at all, it's two review events, which is exactly what the scheduler consumes. Both ratings count. (Replay uses the record's own `D` rather than `effectiveD()`, because mistake load differs per device and the merge has to reach the same answer on both.) The replay only runs when the two histories genuinely diverge; when one contains the other, the longer one is taken as-is.

Three properties are load-bearing, and all three are covered by tests:

- **Commutative** — `merge(a,b) === merge(b,a)`, so the order updates arrive in cannot change the result.
- **Idempotent** — merging an already-merged store is a no-op. This is what makes the devices *settle*: without it, each merge would produce a new value to push and the two devices would trade revisions forever.
- **Additive-safe** — a device on an older build pushes a store with no ledger, which reads as "nothing was deleted", never as "delete everything". You cannot force every phone onto a new build at once, so this one is not optional.

Every tie is broken deterministically — timestamps first, then a lexicographic comparison of the JSON. An arbitrary or random choice would let two devices reach *different* merged results and push them at each other indefinitely.

### Deletions: the ledger

A union can never express a deletion — whatever you remove locally is simply re-added from the other device's copy. So `alevel-syncmeta-v1` carries a ledger of `del` / `add` / `mod` stamps, and an item counts as deleted only while its `del` stamp is newer than its `add` stamp. (Erasing the tombstone on re-add is not enough: the other device's copy of the tombstone would merge straight back in and win.) Tombstones are pruned after `TOMBSTONE_TTL_DAYS = 120` — long after every device has synced.

Two consequences worth knowing:

- **Pushes are `set()` without `merge:true`.** Firestore deep-merges nested maps, so under the old `{merge:true}` a key removed on a device survived in the cloud and was mirrored back down — the deletion could never land. Writing the whole store is safe *because* what gets pushed is the merged result, which already contains both devices' data. Subcollections (`mImages`) are untouched by a document write.
- **A device never pushes before its first snapshot has been reconciled** (`gotFirst`), and never pushes an empty store. On a fresh install the loading code writes defaults the instant the page opens, and without that guard those defaults would overwrite the cloud copy before the real data arrived.

`applyRemote` no longer calls `location.reload()`. It re-reads state in place and re-renders — and defers the redraw while an input is focused, so an incoming sync can't swallow a half-typed note. The in-memory globals are always refreshed immediately regardless, since leaving them stale would let the next `saveState()` write the pre-merge copy back over the merged one.

Your marks and progress are the source of truth; nothing is silently discarded.

---

## The AI subsystem

Three optional tools, all powered by **Google Gemini** with the student's own key (`alevel-gemini-key-v1`). Every call goes through **one hardened helper** — no tool talks to the API directly.

**`geminiCall(parts, genCfg)`** — the shared gateway:
- 60-second `AbortController` timeout.
- **One automatic retry** on transient failures (HTTP 429, 5xx, network drop, timeout, "overloaded").
- Throws a `NO_KEY` sentinel when no key is set.
- **`geminiFriendly(err)`** maps raw errors to plain-English messages ("The free AI limit was hit — wait ~30s", "No connection…", "Your key was rejected — check Settings").

### 1. AI Tutor — `askTutor()`
Photograph a question → step-by-step exam-style walkthrough. The prompt instructs it to quote formulas *"from the formulae booklet"* where the exam provides them, and to annotate steps with the marks they'd earn (M1/A1) when the question shows its allocation. Output runs through `tutorMd()`, a small Markdown→HTML converter that **protects `$$…$$` display-math blocks from line-break insertion** (a subtle bug: a `<br>` inside display math silently breaks MathJax) and bolds numbered steps.

It does that by lifting each block out behind a sentinel and putting it back at the end. The sentinel is `MJX_SENTINEL = '\uE000'`, a Private Use Area codepoint — written as an **escape**, never as a literal character. It used to be a raw NUL byte, which was wrong three times over: HTML's script-data state replaces `U+0000` with `U+FFFD` *before the JS parser sees it*, so the runtime sentinel was silently the replacement character (which Gemini output can legitimately contain, and a collision would mangle the maths); the source therefore did not say what it did; and four raw NULs made the whole 432 KB `index.html` register as **binary to `grep`**, so searching it returned nothing at all. If you ever need another sentinel, take the next PUA codepoint and write it `\uE000`, not as a pasted character.

### 2. AI practice questions — `pqGenerate()`
Generates an original, spec-accurate exam question **with a real Edexcel mark scheme** (M1/A1/B1 notation). Three quality gates:

- **Mark grammar & accuracy** (`pqValidate`): every scheme line is one mark; the total equals the number of lines; A-marks only follow their method mark; 3+ mark questions must contain a method mark. The rendered badge and "Total [N]" are derived from the *actual* line count, so the displayed allocation can never contradict the scheme.
- **Anti-repeat:** the last 4 questions generated for that topic are fed into the prompt as "must be clearly different".
- **Second-examiner check** (`pqVerify`): a separate temperature-0 pass *solves the draft itself* and rejects it if it's ambiguous, unsolvable, under-specified, or doesn't read like a real paper — feeding its one-line criticism back into a single regeneration. Bounded to 3 API calls worst-case, and **fail-open** (if the check errors, the student still gets a question).

### 3. Mistake re-attempt explainer — `reattemptExplainAI()`
The "Explain with AI" button on a logged mistake gives a focused explanation of that specific question.

---

## Rendering & maths typesetting

- **MathJax** typesets all LaTeX; content is authored `$…$` (inline) / `$$…$$` (displayed).
- Dynamic content (generated questions, tutor output, glossary popovers) is re-typeset after injection.
- The custom `tutorMd()` handles the AI tools' Markdown while keeping display-math blocks intact for MathJax.

---

## Complete data & code reference

This section is the authoritative map of **every hard-coded dataset, its schema, the full topic and paper coverage, all tuning constants, and the function inventory** — enough to understand or rebuild the app's logic. The *bulk contents* (the actual 223 glossary definitions, every formula, and all 2,106 per-question paper rows) live in `index.html`, which is the single source of truth; this section documents their **shape and extent** so nothing has to be duplicated (and so it can't silently drift out of date).

### 9.1 Hard-coded data objects & their schemas

All of these are top-level `const`s near the top of the script region.

**`SPECS` / qualification list** — the specifications the app supports:
```js
{ id:'maths', name:'A-Level Mathematics',          code:'9MA0' }
{ id:'fm',    name:'A-Level Further Mathematics',  code:'9FM0' }
// AS (8MA0) and legacy specs are represented via clusters/paper modules.
```

**`clusters`** — the master topic taxonomy. Each cluster is a topic group; `allTopics` is derived from it:
```js
clusters = [ {
  id:        'algebra',          // stable cluster key
  name:      'Algebra & Functions',
  qual:      'maths',            // 'maths' | 'fm'  (studyable clusters only)
  component: 'Pure',             // Pure | Statistics | Mechanics | FM module label
  topics:    ['…','…'],          // ordered topic names (the canonical strings)
  lvls:      [ … ],              // per-topic level/tier
  diff:      [1,2,3,…]           // per-topic intrinsic difficulty 1|2|3
  // (some clusters are non-studyable: nav shortcuts like id:'act-log')
} , … ]

// Derived:
const allTopics = clusters.flatMap(c => c.topics.map((name,i) => ({
  name, lvl:c.lvls[i], diff:c.diff[i], clusterId:c.id, qual:c.qual, component:c.component
})));
```
The strings in `topics[]` are the **canonical topic names** — the SR engine (`sr[name]`), the glossary's inline links, and every `PAPER_QUESTIONS` `topics:[…]` entry all key off these exact strings, so they must match verbatim.

**`GLOSSARY`** — array of topic groups, each holding term entries:
```js
GLOSSARY = [ {
  n:'2', topic:'Coordinate Geometry', cluster:'coord',
  items:[ {
    term:'Midpoint',
    def:'The point halfway between two points: M = ((x₁+x₂)/2, (y₁+y₂)/2).',
    eg:'Midpoint of (2,4) and (6,10) = (4, 7).',   // worked example (optional)
    sub:'',                                        // sub-section heading (optional)
    note:'…',                                      // caveat / gotcha (optional)
    il:['Midpoint']                                // inline-link trigger strings (optional)
  }, … ]
}, … ]
```
`il` (inline-link) strings are what the inline-glossary popovers match against elsewhere in the UI.

**`FORMULAS`** — the interactive formula sheet: groups of formula entries (name/statement in LaTeX), searchable and rendered to match the real formulae booklet.

**`PAPER_QUESTIONS`** — the per-question breakdown that powers paper logging and the Leaks report:
```js
PAPER_QUESTIONS = {
  <moduleId>: {                 // e.g. 'alevel','as','oldc1'…'oldc4','fmcp','fp1','fs1','fm1','d1'
    <year>: {                   // e.g. '2024', 'June 2017', 'Specimen'
      <paperN>: [               // paper within the sitting (1,2,3 / 'P1'…)
        { q:'7', marks:5, topics:['Solving trigonometric equations in a given interval'] },
        …                       // one entry per question; topics use canonical names
      ]
    }
  }
}
```
Invariant enforced across the dataset: **for every paper, Σ marks = the paper's real total**, and every string in `topics[]` is an exact canonical topic name.

**`GRADE_BOUNDARIES`** — official boundaries per module/year, used to convert a logged total into a grade and to compute the Leaks grade-impact headline:
```js
GRADE_BOUNDARIES = {
  alevel:{ years:{ '2024':{
    overall:{ max:300, 'A*':220, A:196, B:164, C:134, D:105, E:77 }, …
  } } }, …
}
```

### 9.2 Topic taxonomy (full)

**50 studyable clusters · 315 topics.** (Non-studyable nav-shortcut clusters are excluded.)

Pure was reorganised in July 2026 to follow the **Edexcel textbook chapters** rather than the spec's thematic headings, and every topic is now labelled with its section number (`9.1 The cosine rule`). That renamed 94 topics; the map lives in `CHAPTER_RENAMES` in `index.html` and is applied to saved progress on load — see [Topic renames & the remap](#topic-renames--the-remap).

**A-Level Mathematics (`qual:'maths'`) — 28 clusters, 208 topics**

*Pure — 26 chapters, 164 topics (Year 1 × 14, Year 2 × 12)*

| Cluster id | Chapter | Topics | | Cluster id | Chapter | Topics |
|---|---|--:|---|---|---|--:|
| `p1c1` | 1 · Algebraic expressions | 6 | | `p2c1` | 1 · Algebraic methods | 4 |
| `p1c2` | 2 · Quadratics | 6 | | `p2c2` | 2 · Functions and graphs | 7 |
| `p1c3` | 3 · Equations and inequalities | 7 | | `p2c3` | 3 · Sequences and series | 8 |
| `p1c4` | 4 · Graphs and transformations | 7 | | `p2c4` | 4 · Binomial expansion | 3 |
| `p1c5` | 5 · Straight line graphs | 5 | | `p2c5` | 5 · Radians | 5 |
| `p1c6` | 6 · Circles | 5 | | `p2c6` | 6 · Trigonometric functions | 5 |
| `p1c7` | 7 · Algebraic methods | 5 | | `p2c7` | 7 · Trigonometry and modelling | 7 |
| `p1c8` | 8 · The binomial expansion | 5 | | `p2c8` | 8 · Parametric equations | 5 |
| `p1c9` | 9 · Trigonometric ratios | 6 | | `p2c9` | 9 · Differentiation | 10 |
| `p1c10` | 10 · Trig identities and equations | 6 | | `p2c10` | 10 · Numerical methods | 4 |
| `p1c11` | 11 · Vectors | 6 | | `p2c11` | 11 · Integration | 12 |
| `p1c12` | 12 · Differentiation | 11 | | `p2c12` | 12 · Vectors | 4 |
| `p1c13` | 13 · Integration | 7 | | | | |
| `p1c14` | 14 · Exponentials and logarithms | 8 | | | | |

*Statistics & Mechanics — 2 clusters, 44 topics*

| Cluster id | Component | Topics | Group |
|---|---|--:|---|
| `stats` | Statistics | 24 | Statistics |
| `mech` | Mechanics | 20 | Mechanics |

**A-Level Further Mathematics (`qual:'fm'`) — 22 clusters, 107 topics**

| Cluster id | Topics | Group |
|---|--:|---|
| `fm-complex` | 10 | Complex Numbers |
| `fm-matrices` | 8 | Matrices |
| `fm-series` | 3 | Further Algebra & Series |
| `fm-induction` | 1 | Proof by Induction |
| `fm-calculus` | 5 | Further Calculus |
| `fm-hyperbolic` | 4 | Hyperbolic Functions |
| `fm-polar` | 3 | Polar Coordinates |
| `fm-de` | 6 | Differential Equations |
| `fm-vectors` | 5 | Vectors (Lines & Planes) |
| `fp1-vectors` | 4 | FP1: Vectors |
| `fp1-conics` | 5 | FP1: Conic Sections |
| `fp1-inequalities` | 4 | FP1: Inequalities, t-formulae & Taylor |
| `fp1-calc` | 6 | FP1: Methods in Calculus |
| `fp1-numde` | 4 | FP1: Numerical Methods & Reducible DEs |
| `fs1-dist` | 5 | FS1: Discrete Distributions |
| `fs1-testing` | 5 | FS1: Hypothesis Testing & Chi-squared |
| `fs1-clt` | 3 | FS1: CLT & Generating Functions |
| `fm1-momentum` | 6 | FM1: Momentum & Collisions |
| `fm1-energy` | 5 | FM1: Work, Energy & Elasticity |
| `d1-algorithms` | 4 | D1: Algorithms |
| `d1-graphs` | 6 | D1: Graphs & Networks |
| `d1-planning` | 5 | D1: Critical Path & Linear Programming |

### 9.3 Past-paper coverage (full)

**11 modules · 142 papers · 2,106 questions**, every question tagged with marks + canonical topic(s). All validated so each paper's marks sum to its real total.

| Module id | Papers | Questions | Marks | Year range |
|---|--:|--:|--:|---|
| `alevel` (9MA0 P1–P3) | 22 | 768 | 2,200 | 2018 – Specimen |
| `as` (8MA0) | 14 | 420 | 1,120 | 2018 – Specimen |
| `oldc1` (legacy Core 1) | 17 | 180 | 1,275 | Jan 2005 – June 2018 |
| `oldc2` (legacy Core 2) | 19 | 180 | 1,425 | Jan 2005 – June 2018 |
| `oldc3` (legacy Core 3) | 22 | 180 | 1,650 | June 2005 – June 2018 |
| `oldc4` (legacy Core 4) | 21 | 165 | 1,575 | June 2005 – June 2018 |
| `fmcp` (Further Core Pure) | 12 | 101 | 900 | 2019 – 2024 |
| `fp1` (Further Pure 1) | 3 | 27 | 225 | 2019 – 2024 |
| `fs1` (Further Stats 1) | 4 | 28 | 300 | 2019 – 2024 |
| `fm1` (Further Mechanics 1) | 4 | 29 | 300 | 2019 – 2024 |
| `d1` (Decision 1) | 4 | 28 | 300 | 2019 – 2024 |

Groupings: **modern spec** = `alevel` + `as` (36 papers); **legacy Core** = `oldc1`–`oldc4` (79 papers); **Further Maths** = `fmcp`+`fp1`+`fs1`+`fm1`+`d1` (27 papers). *Not yet broken down: legacy `M1` and `S1` (next on the roadmap); practice-paper sets (Madas, Naiker) are listed in the logger but without per-question data.*

### 9.4 All tuning constants

**FSRS core** (forgetting curve & scheduler):
| Constant | Value | Meaning |
|---|---|---|
| `FSRS_W` | 17-element vector `[0.40, 0.60, 2.40, 5.80, 4.93, 0.94, 0.86, 0.01, 1.49, 0.14, 0.94, 2.18, 0.05, 0.34, 1.26, 0.29, 2.61]` | FSRS-4.5 default weights (w0–w16) |
| `DECAY` | `−0.5` | exponent of the power forgetting curve |
| `FACTOR` | `Math.pow(0.9, 1/DECAY) − 1` = `19/81` | curve constant; makes `R(S)=0.9` at `t=S` |
| `BASE_RETENTION` | `0.90` | default target recall at review time |
| `MAX_RETENTION` | `0.97` | ceiling target as the exam approaches |
| `EXAM_RAMP_DAYS` | `70` | window before exam over which the target ramps up |
| `MASTERY_STABILITY` | `180` | stability (days) at/above which a topic is "Mastered" |
| `MAX_INTERVAL` | `3650` | hard cap (days) on any interval (guards `Date` overflow) |

**Difficulty seeding & labels:**
| Constant | Value |
|---|---|
| `DIFF_D_SEED` | `{1:3.5, 2:5.0, 3:6.8}` — intrinsic difficulty → starting D (1–10) |
| `DIFF_LABELS` | `{1:'Standard', 2:'Challenging', 3:'Hard'}` |
| `DIFF_COLORS` | `{1:'#34d399', 2:'#fbbf24', 3:'#f87171'}` |

**Mistake evidence** (the stability channel — phase 2):
| Constant | Value / meaning |
|---|---|
| `MISTAKE_EVIDENCE` | fraction of a full lapse per category: `Concept gap`1.00 · `Missed the clever step`0.60 · `Method error`0.33 · `Ran out of time`0.25 · `Misread question`0.15 · `Calculation error`0.12 · `Transcription slip`0.08 · `Silly mistake`0.08 |
| `MISTAKE_EVIDENCE_DEFAULT` | `0.15` — for an unrecognised category |

**Mistake soft channel** (residual recency nudge to target retention only):
| Constant | Value / meaning |
|---|---|
| `MISTAKE_SEVERITY` | legacy category weights: `Concept gap`1.00 · `Missed the clever step`0.85 · `Method error`0.70 · `Misread question`0.50 · `Calculation error`0.45 · `Transcription slip`0.40 · `Ran out of time`0.40 · `Silly mistake`0.30 |
| `SEV_LABELS` | `['','Minor','Low','Moderate','High','Critical']` (user severity 1–5; **not** used in the stability maths) |
| `MISTAKE_TAU` | `30` days — recency decay in `exp(−age/τ)`. Soft channel only; never inside the replay |
| `MISTAKE_D_WEIGHT` | **`0`** — retired in phase 2; `D` now moves at the mistake event itself |
| `MISTAKE_RET_WEIGHT` | `0.015` — down from 0.04, since the real penalty now lands on stability |

**Layout & type tokens** (in `styles.css :root`, not `index.html`):
| Token | Value | Meaning |
|---|---|---|
| `--fs-3xs` … `--fs-2xl` | `11 · 12 · 13 · 14 · 15 · 16 · 18 · 20 · 24px` | 9-step type scale; body is `--fs-base` 16px |
| `--wrap` | `min(100% - 96px, 1360px)` | container cap for list surfaces (32px gutter on mobile) |
| `--wrap-narrow` | `min(100% - 96px, 1060px)` | the old cap, kept for narrower surfaces |
| `--prose` | `70ch` | reading measure for prose blocks |
| `--rail-w` | `64px` | desktop nav rail width; `body` is padded by exactly this |
| `--tap` | `44px` | SC 2.5.5 (AAA) target; SC 2.5.8's 24px floor is enforced per-component |

**AI:** `TUTOR_MODEL` = Gemini model id (`gemini-2.5-flash`); shared call timeout 60 s; 1 retry; `pqGenerate` temperature 0.9 / `pqVerify` temperature 0.

### 9.5 Function inventory by subsystem

375 named functions total. The load-bearing ones, grouped:

- **Dates:** `ymd(d)` — the single local-calendar-day helper every other date derivation goes through — plus `today()`, `addDays`, `daysDiff`, `fmtDate`, all parsing at local *noon*, deliberately, to stay clear of DST. All four run through `_dayMs(str)`, one Date parse per distinct day string; see [the render-cost section](#where-the-render-time-actually-goes) for why.
- **Topic lookup:** `topicByName(name)` over the `TOPIC_BY_NAME` index. Topic names are the app's primary key, and this replaced thirteen `allTopics.find(...)` linear scans over 315 entries.
- **Forgetting curve & scheduling:** `forgetting(t,S)`, `intervalForRetention(S,R)`, `safeInterval(x)`, `validRec(r)`, `currentRetrievability(name)`, `dueDateFor(name)`, `statusFor(name)`, `strengthInfo(name)`, `isMastered(name)`, `needsExamConfirmation(name)`.
- **FSRS update primitives:** `ratingEase(r)`, `initialStability(r)`, `initialDifficulty(g,topicDiff)`, `nextDifficulty(D,g)`, `stabilityAfterRecall(D,S,R,r)`, `stabilityAfterLapse(D,S,R)`.
- **The one shared step (phase 1 & 2):** `applyReview(rec,g,date,tdiff)` and `applyMistake(rec,E,date)` — the only two places state is advanced; `buildTimeline`, `replayTimeline`, `mistakeEventsByTopic`, `memoryFor(name)` (the derived read every UI number goes through, memoised per topic/day), `invalidateMemory`, `evidenceTrail(name)`, `simulateGrade(name,date,g)`, `saveTopicStudied(name,date,gradeKey)`, `sanitizeAllSR`, `migrateV4`.
- **Mistake feedback (soft channel):** `mistakeLoad(name)` (memoised per topic/day), `invalidateMistakeLoad`, `effectiveD(name)`, `targetRetention(name)`, `examDateForTopic(name)`, `examDateForComponent(comp)`, `sevPips`, `sevUpdateUI`.
- **AI subsystem:** `geminiCall(parts,genCfg)`, `geminiFriendly(err)`, `tutorMd(text)`, `askTutor()`, `pqGenerate()`, `pqParse()`, `pqValidate(q)`, `pqVerify(q)`, `pqRenderQuestion(q)`, `reattemptExplainAI(btn)`, `renderReattempt(pick)`, `reattemptShuffle()`.
- **Sync & migration:** `applyToLocal(store)`, `schedulePush()`, `collectLocal()`, `applyRemote(d)`, plus the Firebase `onSnapshot` listener and `enablePersistence` setup. `applyChapterRenames()` runs on load and at the end of `applyToLocal` — see [Topic renames & the remap](#topic-renames--the-remap).
- **Leaks / analytics:** the paper-log aggregation that ranks marks-lost per topic and maps recoverable marks onto `GRADE_BOUNDARIES`.
- **Exam dates:** `activePapers()`, `examDateForComponent(comp)` and `getPaperDates()` are each memoised against `_examSig()` — a cheap string built from raw reads of the track, the paper-date overrides, the FM options and a counter for the fetched defaults. Signature-keyed rather than invalidated by hand, so no future write path can forget to clear them.
- **Dialogs:** `mhDialogStack` (open order), `mhCloseTopDialog()`, `mhReleaseScroll()` and the `MutationObserver` on `open` that maintains all three — see [One focus manager for every dialog](#one-focus-manager-for-every-dialog).
- **Shell & navigation:** `switchTab(tab)` — the only entry point; the nav buttons, the keyboard shortcuts and the mobile swipe handler all call it — plus `updateDueBadge()`, `positionMNavPill()`/`updateMNav()` inside the app-shell IIFE, and `openMore()`/`closeMore()` for the Tools overlay. `updateFocusBtn()` no longer draws a button; it mirrors the timer's state onto the nav's Tools icon.
- **Test mode:** `window.MSH_TEST` (set by the namespacing shim at the top of the file), `mshTestPrompt()`, `mshTestSetDay(n)`, `mshTestInspect(name)`, `mshTestPaint()`, `_testDayShift`. All inert unless the sandbox is running — see [Test mode](#test-mode).
- **Canvas:** `drawDonut(canvas,entries,legendEl)` plus `_hidpiCanvas(canvas)` (device-pixel-ratio backing store, CSS size cached on the element) and `_themeColor(name,fallback)` (reads a CSS custom property, since a canvas cannot).
- **Rendering helpers:** `tutorEsc`, `leakEsc` (local closure-safe escapers — note the global `esc()` is closure-scoped and not visible to injected/eval'd code).

(Grep `function ` in `index.html` for the exhaustive list; names are stable and descriptive.)

### 9.6 External dependencies & config

- **MathJax** — LaTeX typesetting (CDN).
- **Firebase compat SDK v10.14.1** — `firebase-app`, `firebase-auth`, `firebase-firestore` (CDN `gstatic.com`). Project **`maths-hub-3aa8c`** (`authDomain: maths-hub-3aa8c.firebaseapp.com`). Firestore doc per user at `users/{uid}`; profile-image writes to a sibling doc with a `serverTimestamp()`.
- **Google Gemini** — `gemini-2.5-flash` via the student's own key in `localStorage['alevel-gemini-key-v1']`.
- **Service worker** (`sw.js`) — precaches the shell and `data/*.js`; cache-first with background refresh for MathJax, Google Fonts **and the Firebase SDK on `www.gstatic.com`**; network-first for own files so a push reaches you immediately; explicitly *bypasses* Firestore, Identity Toolkit and Gemini so realtime sync and AI calls are never served stale. Caching the SDK is what makes offline durability real: without it the three `<script>` tags failed offline, `firebase` was undefined, and the sync block bailed out early — taking the `localStorage` hook with it, so offline edits were never queued for the cloud at all.
- No runtime dependencies beyond those CDNs; the only tooling is `scripts/validate.mjs`, which uses nothing but Node's standard library.

---

## Test mode

A sandbox for looking at the app without signing in and without waiting three weeks to see an interval land. Entered from a quiet **Testing mode** link on the login screen, or `?test` on the URL — the second matters because when the Firebase SDK fails to load there is no login screen to click. It is `sessionStorage`-scoped, so it ends with the tab.

**The password is in the Obsidian vault** at `projects/maths a-level tool/Test mode.md`, deliberately not here — this file is public.

> **The password is a speed bump, not a lock, and the design assumes that.** This is a static site with no server: the check runs in the browser and the SHA-256 hash sits in `index.html` for anyone to read. That is acceptable **only because nothing behind the gate is worth protecting** — the three properties below are what make that true, and each was tested rather than argued.

- **Storage is namespaced before any app code runs.** A script above the theme boot block shadows `getItem`/`setItem`/`removeItem` on the `localStorage` *instance* (own properties shadowing `Storage.prototype`, which leaves `sessionStorage` — where the flag lives — alone) and prefixes every key with `msh-test:`. Verified by planting a marker in the real store, seeding the sandbox over it, and confirming the marker survived byte-identical.
- **The cloud block takes its missing-SDK exit.** No auth, no gate, no listener, no push. The sandbox cannot read or write any account's data.
- **It cannot be mistaken for the real app.** A permanent hazard bar reading `TEST MODE · sandboxed · no cloud`, plus the live clock offset when one is set.

### What the panel exposes

| Section | Purpose |
|---|---|
| **Data** | Four presets — Empty · Just started (40 topics) · Mid-year (220/180/25) · Exam run-in (315/400/60). **Fixed-seed PRNG**, so the same preset is the same data every time; a sandbox whose contents change per reload cannot be used to compare a before against an after |
| **Clock** | `mshTestSetDay(n)` shifts the app's today by ±1/7/30/90 days |
| **Go to** | Straight to any page, modal or overlay, including the intro |
| **Inspect a topic** | Derived recall, S, D, reps, lapses, due date, target retention, `stored S → derived S`, and the evidence trail newest-first |
| **Render cost** | Medians for each renderer, so a regression is a number rather than a feeling |
| **Motion** | `1× / ¼× / ⅒× / 0×`. The nav hand-off is 400ms and its bug was a wrong *start position* — at full speed that is a flicker you cannot argue about. `0×` also exercises the branch the blanket `prefers-reduced-motion` rule takes, otherwise untestable without changing an OS setting |
| **See the layout** | Magnify the nav ×3 for pixel work on the icons; outline every box (rows and their children in separate hues); outline the 48 named icon placeholders, the same thing `?icons` does |
| **Find a topic that is…** | overdue · due · mastered · new · most wrong — picks one, loads it into the inspector and opens its study modal |
| **Rate it 1–5** | Applies a real review to the inspected topic and prints the before→after: `S 58.5 → 424.1d · D 4.4 → 2.7 · due 2026-07-19 → 2027-12-02`. One click to see an FSRS step |
| **Problems** | Errors and warnings since load, hooked at the *top* of the file — a panel that only starts listening once it has drawn itself misses exactly the ones worth seeing |
| **Storage** | Sandbox bytes against real bytes, per key. The namespacing is shown rather than promised |
| **FPS** | Live frame rate and worst frame, for watching a transition rather than guessing |
| **Copy diagnostics** | The whole panel state as text |
| **Next theme** | Cycles all three |

**The clock is the substantive one.** Nearly everything the app decides is a function of the date, and none of that is visible on any single day. On the Mid-year preset: `+30d` takes the due list 76 → 128 and a sample topic 86% → 82% recall; `+180d` puts everything overdue at 69%; **`+300d` lands inside `EXAM_RAMP_DAYS` of the June 2027 papers and target retention jumps 89.7% → 96.7%** — the exam ramp engaging, which there is otherwise no way to watch. `−60d` shows last term: 94% recall, six topics due. Returning to `Now` reproduces the original numbers exactly.

It works because `today()` is the single choke point every date derivation goes through, so one integer moves the whole model. `_testDayShift` is `0` outside test mode — one truthy check per second of wall clock, which is why it ships in the file rather than needing a second build. Always go through `mshTestSetDay()`: the one-second memo and both per-day caches have to be dropped with it.

**The inspector's `stored S → derived S` line** is the evidence model made legible: the stored figure is the review log alone, the derived one is after mistakes and exam marks replay over it. On a topic with three logged mistakes those read **157.7d → 1.6d**. That gap is exactly what [`computeStats()` was getting wrong](#5--statistics--stats-overlay) until 2026-08-18.

---

## Editing, building & deploying

### Committing without being asked

**If you are an AI assistant working in this repo: commit every change you finish. Do not stop to ask permission first.** A finished change is one where the code works, the docs in the same change are updated, and `npm test` passes. At that point `git add` the files you touched and commit them with a message describing what changed and why — the same turn, before you report back. Asking "shall I commit this?" is friction with no upside: the commit is the unit of work, git history is the backup, and an uncommitted change is one accidental overwrite from being lost.

**Pushing follows the same rule**, because on this repo a push to `main` *is* the deploy — GitHub Pages publishes from the branch. So push through `npm run deploy`, never a bare `git push`: the deploy script bumps `CACHE_VERSION` when a precached file changed, runs the validator, and **aborts before committing if anything fails**, which is the only gate that actually stops a broken build reaching the live site (CI can report a failure but cannot block a branch-source publish).

> **Prefer letting `npm run deploy` do the commit.** It bumps `CACHE_VERSION` by diffing the *working tree* against `HEAD`, so committing by hand first leaves nothing for it to see and the bump is silently skipped — `v26` shipped twice on 2026-08-18 that way. It no longer can: on a clean tree with unpushed commits the script now diffs the **unpushed range** against `origin/main` and bumps there instead, as its own commit. Committing by hand is therefore safe again, but the one-step path is still the one with fewer ways to go wrong.

Two things still warrant stopping to ask, because neither is recoverable from git history alone:

- a change that **rewrites saved student progress** — a new `CHAPTER_RENAMES` batch, a storage-key migration, anything touching `alevel-sr-v5` in place;
- a change to the **sync contract or the Firestore rules**, where a bad push propagates to every signed-in device within seconds.

Everything else: commit it, push it, then say what you did.

- **No build.** Serve the folder (`npm start`, or any static server) and it runs. There is no bundler, transpiler or dependency install. Opening `index.html` via `file://` mostly works, but the `data/*.js` scripts and the service worker need a real origin — use the server.
- **Edit in place.** Logic and markup in `index.html`, styling in `styles.css`, content in `data/*.js`. Git history is the backup — no `.bak`/duplicate files.
- **Update the docs in the same change.** See [Keeping the documentation in step](#keeping-the-documentation-in-step) below — this is not optional housekeeping, it is part of the change.
- **Validate before pushing.** `npm test` (→ `node scripts/validate.mjs`) syntax-checks every inline `<script>`, `sw.js` and each `data/*.js`, then asserts the invariants the app quietly relies on:
  - every paper's marks sum to its real Edexcel total (100 for A-Level and AS paper 1, 60 for AS paper 2, 75 for legacy Core and Further modules);
  - every past-paper `topics:[…]` string resolves to a canonical topic name;
  - `lvls[]` / `diff[]` line up with their `topics[]`, and no two topics share a name;
  - `CHAPTER_RENAMES` stays idempotent and all its targets still exist;
  - every local file referenced by `index.html` and precached by `sw.js` is actually present.
- **Deploy = push.** Commits to `main` publish straight to GitHub Pages. The same validator runs in CI (`.github/workflows/ci.yml`) on every push and PR, so a broken commit is flagged within seconds. *Note:* with Pages set to "Deploy from a branch", CI reports a failure but cannot block the publish — switching the Pages source to GitHub Actions would make validation a true gate.
- **One-command deploy.** `npm run deploy` (→ [`scripts/deploy.sh`](scripts/deploy.sh)) does the whole publish in the right order: bumps `CACHE_VERSION` if a precached file changed → runs the validator → **aborts before committing if anything fails** → commits (your message, or one generated from what changed) → rebases on `origin/main` → pushes → **waits until the live site actually serves the new bytes**. Because CI can't block a branch-source Pages publish, this local gate is the one that actually prevents a broken build reaching the live site.
  ```
  npm run deploy                        # auto-generated commit message
  npm run deploy -- "Fix trig topics"   # your own message
  npm run deploy -- --dry-run           # validate + show what would ship, commit nothing
  npm run deploy -- --no-verify         # push without waiting to confirm it published
  ```
- **A successful push is not a successful publish**, which is why the script now waits for confirmation. On 2026-08-17 a push landed cleanly and the script reported "Deployed" while GitHub's Pages deployment job was failing with a **503** during a platform-wide incident — so the live site quietly kept serving the previous build. Nothing in git could have revealed that; only the live URL can.

  The check asks **"is the live site serving my working tree?"** — comparing the bytes of every web-served file against what the live URL returns, polling for up to 5 minutes. Two deliberate choices: it does *not* watch `CACHE_VERSION`, because a commit that changes `index.html` without a bump would match on version immediately and prove nothing; and it checks the **whole tree** rather than just this commit's files, because a deploy that failed outright leaves everything stale — including for a later docs-only commit, which would otherwise have nothing to check and would report success. Files Jekyll transforms (`README.md`, `docs/`) are excluded, since Pages does not serve those verbatim.

  Files are checked smallest-first and each round stops at the first mismatch, so a stale site is detected from `sw.js` without pulling 600 KB of `index.html`. On timeout it exits **1** and says plainly that the commit is safe on `origin/main` and that this is a publish failure rather than a code failure — the fix is to re-run the `pages-build-deployment` job, never to re-commit.
  It refuses to run off `main`, makes no empty commits, and pushes any already-committed-but-unpushed work if the tree is clean.
- **Changing cached files?** Bump `CACHE_VERSION` in `sw.js`. Old caches are deleted on activate, so a bump is the clean way to push every device onto a new build. `npm run deploy` does this automatically whenever `index.html`, `styles.css`, `exam-dates.json` or `data/` changed — and skips it if you've already bumped by hand (`--no-bump` overrides). It checks **twice**: once against `HEAD` for uncommitted work, and once against `origin/main` for commits you made by hand before running it. Missing the bump is not fatal, because own-origin fetches are network-first and an online device gets the new bytes regardless — but the version then stops tracking builds, and a device that was offline over the deploy keeps the old shell until its next online load.
- **Push auth.** The remote is written as SSH (`git@github.com:VanKolts/mathsALevel.git`), but no SSH key on this machine is registered with the account, so command-line pushes over SSH fail. A repo-local rewrite sends them over HTTPS instead, reusing the token GitHub Desktop already stored in the macOS keychain:
  ```
  git config --local url."https://github.com/".insteadOf "git@github.com:"
  ```
  This is already set. Undo with `git config --local --unset url."https://github.com/".insteadOf`; the alternative fix is to add `~/.ssh/id_ed25519.pub` to GitHub → Settings → SSH keys.
- **Stack recap:** vanilla HTML/CSS/JS · CSS-variable theming (3 themes) · MathJax · service worker for offline · Firebase compat SDK (Auth + Firestore, offline persistence) · Google Gemini for AI · everything else in `localStorage`.

---

## Keeping the documentation in step

**Every change to this app updates its documentation in the same commit.** Not afterwards, not "when there's time" — in the same change, before `npm run deploy` runs.

This is a rule with a history. A single review found *three* things this README asserted that the code did not do, including "works fully offline", which one missing hostname in the service worker had quietly defeated. Documentation that lags is worse than none: it is confidently wrong, and it gets believed. The standing rule is **read the implementation, not the docs** — and the only way to make that rule unnecessary is to never let them diverge.

### The three documents, and who owns what

| Document | Where | Holds | Update when |
|---|---|---|---|
| **This README** | `README.md` | *How the code works* — architecture, data model, the FSRS maths, sync, AI, the full data reference. The source of truth for code detail | Any behaviour, constant, dataset, function or invariant changes |
| **The Manual** | `projects/maths a-level tool/Manual.md` in the Obsidian vault | *The whole app explained from zero* — same ground plus the visual layer, every page and dialog, and the reasoning behind each design decision. Plain language, no source code | The same triggers, **plus** anything a user would see or feel |
| **The Glossary** | `projects/maths a-level tool/Glossary.md` in the vault | Every project term, defined once. The Manual leans on it instead of re-explaining | A new term, acronym, data object or concept appears anywhere |

Design *rationale* — the why, the alternatives rejected, the bug that forced a shape — lives in the vault (`Log.md`, `Discussions/`, `History.md`). The repo holds the mechanism; the vault holds the reasoning. When the two disagree about code, **the repo wins** and the vault gets corrected.

### The checklist

Before `npm run deploy`, for the change you just made:

- [ ] **README** — is any statement now false? Check the section you touched *and* [§9 Complete data & code reference](#complete-data--code-reference): tuning constants, function inventory, storage keys, coverage tables, counts.
- [ ] **Counts** — re-run `npm test` and copy the real numbers (clusters, topics, papers, questions, glossary terms, untagged topics). Never hand-edit a count.
- [ ] **Manual** — update the section covering what changed. If it changed what a student sees, update the relevant page section in Part III as well as the mechanism in Part IV.
- [ ] **Glossary** — did the change introduce a term? Define it, and link it from the Manual.
- [ ] **Known gaps** — did this close an item below, or open a new one?
- [ ] **Vault** — append to `Log.md` (newest on top), add a `Discussions/YYYY-MM-DD — <topic>` note for a substantive session, a line in `History.md` for a milestone, and rewrite `Status.md` if what's next changed.
- [ ] **Mistakes** — if something went wrong on the way, add a **Don't / Do / Why** entry to `Mistakes.md` at the vault root. The *Why* is the part worth keeping.
- [ ] **Commit** — `git add` what you touched and commit it, then `npm run deploy` to publish. Not a question to ask; see [Committing without being asked](#committing-without-being-asked).
- [ ] **Design docs** — if the change advances [`docs/fsrs-evidence-model.md`](docs/fsrs-evidence-model.md), update its phase table and add an "as built" note recording where reality diverged from the plan.

### What the tooling can and cannot check

`npm test` enforces the invariants — paper totals, canonical topic tags, array alignment, rename idempotency, precache completeness — and prints the live counts, so anything numeric in the docs can be checked against a real run rather than remembered. It cannot tell you that a *sentence* has gone stale. That part is the checklist above.

---

## Known gaps & roadmap

Honest list of what doesn't work yet, so nothing here looks like a bug you have to rediscover.

- **Grade boundaries are A-Level only.** `GRADE_BOUNDARIES` contains a single module (`alevel`), and `getGradeForMarks()` returns `null` for anything else. Logging an AS, Further Maths or legacy Core paper records the marks correctly but shows no grade — 120 of the 142 supported papers. Adding `as`, `fmcp` and the legacy boundaries is the highest-value data job outstanding.
- **109 of 315 topics have no past-paper questions tagged** (mostly Further Maths, plus topics created by the Pure chapter split). Those topics can never appear in the Leaks report or its "revise first" ranking. `npm test` prints the current count on every run.
- **Legacy M1 and S1 have no per-question breakdown**, and the practice sets (Madas, Naiker) are listed in the logger without per-question data.
- **Accessibility — contrast, type, target sizes and focus management are done; live regions are not.** All three themes clear SC 1.4.3 AA on every token against all four surfaces, no text is under 11px, colour is no longer the sole cue for difficulty, every control clears SC 2.5.8's 24×24 except two documented exceptions, and as of 2026-08-18 all 23 dialogs trap Tab and restore focus to whatever opened them ([see below](#one-focus-manager-for-every-dialog)). Still outstanding: there is only one `aria-live` region, so most state changes are silent to a screen reader. SC 2.5.5 (AAA, 44×44) is met on touch via the `pointer:coarse` block but not on desktop.
- **Light-mode default is arguably the better call and has not been made.** [Piepenbrock et al. (2013)](https://www.tandfonline.com/doi/full/10.1080/00140139.2013.790485) found positive polarity (dark text on light) gave better visual acuity for both younger (d=2.17) and older (d=0.58) adults and better proofreading accuracy, with the advantage growing as text shrinks. The app defaults to `rose-dark`. Dark mode is a genuine accessibility win for readers with cloudy ocular media (Legge et al. 1985), so the right answer is probably to default to the system preference rather than to either theme — currently there is no `prefers-color-scheme` handling at all.
- ~~**Load cost.** `data/paper-questions.js` is 173 KB and parsed on every load, though it is only needed on the Papers tab.~~ **Retired 2026-08-18 — it is no longer Papers-only.** Phase 3 made paper marks part of the scheduler, so `memoryFor()` → `paperEventsByTopic()` → `ppQuestionsFor()` needs the table on the *Checklist's* first paint. Deferring it would now stall the first render rather than speed it up. Measured at 5ms to fetch and parse; the render work it feeds was the real cost, and that was addressed directly.
- **`GRADE_BOUNDARIES.alevel.years['2024'].papers[1]`** is used as a generic "average grade gap" when estimating the Leaks headline. That is a deliberate approximation, not a per-module lookup.
- **Firestore security rules unverified.** One document per user, so a rule left in test mode would expose every student's data. Confirm it is `allow read, write: if request.auth.uid == uid`. (The `apiKey` in source is public by design and fine.)
- **Clock skew is unhandled** in the merge — it trusts device clocks. `serverTimestamp` is the escape hatch if it bites.

---

*Built and maintained for real A-Level students. If you're a student: log your papers honestly, review what's due, and let the Leaks report tell you what to fix first.*
