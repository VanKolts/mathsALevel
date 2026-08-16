# Maths Study Hub — Complete Reference

A single-file spaced-repetition study app for A-Level Maths (Edexcel **9MA0** / AS **8MA0** / Further **9FM0**, plus legacy specifications). It helps students track what they know, drill what they don't, log real past papers question-by-question, and see exactly where they lose marks.

- **Live app:** https://vankolts.github.io/mathsALevel
- **Structure:** [`index.html`](index.html) holds the markup and *all* the logic (6,786 lines, 375 named functions); [`styles.css`](styles.css) holds the theming; `data/*.js` hold the five static datasets. No build step, no server, no dependencies beyond MathJax and the Firebase CDN.
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
5. [Data model & storage](#data-model--storage)
   - [Topic renames & the remap](#topic-renames--the-remap)
6. [Cloud sync architecture](#cloud-sync-architecture)
7. [The AI subsystem](#the-ai-subsystem)
8. [Rendering & maths typesetting](#rendering--maths-typesetting)
9. [Complete data & code reference](#complete-data--code-reference)
   - [9.1 Hard-coded data objects & their schemas](#91-hard-coded-data-objects--their-schemas)
   - [9.2 Topic taxonomy (full)](#92-topic-taxonomy-full)
   - [9.3 Past-paper coverage (full)](#93-past-paper-coverage-full)
   - [9.4 All tuning constants](#94-all-tuning-constants)
   - [9.5 Function inventory by subsystem](#95-function-inventory-by-subsystem)
   - [9.6 External dependencies & config](#96-external-dependencies--config)
10. [Editing, building & deploying](#editing-building--deploying)
    - [Committing without being asked](#committing-without-being-asked)
11. [Keeping the documentation in step](#keeping-the-documentation-in-step)
12. [Known gaps & roadmap](#known-gaps--roadmap)

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

The nav is **icon-only in both orientations, and CSS alone decides which**:

| | Desktop (>900px, fine pointer) | Mobile / touch |
|---|---|---|
| Layout | fixed 64px **left rail**, `flex-direction:column` | fixed **bottom bar**, `flex-direction:row` |
| Label | hover tooltip beside the icon | caption under the active icon |
| Groups | pages · hairline · Settings, Statistics, Tools | pages only — `.rail-tools` is hidden |
| Overflow | the Tools icon opens `#more-overlay` | the floating ⋯ opens the `.m-menu` speed-dial |

`body` is padded by `--rail-w` on desktop and by the bar's height on mobile, so nothing sits under the nav. A **due dot** (`.m-nav-badge`) on the Checklist icon marks overdue topics, with the count in the button's `title`.

> **Why one element.** This was two navs — a `.tab-bar` with text tabs for desktop, hidden outright below 900px in favour of `#m-nav` — which meant two icon sets, two active states, two click paths and two badges (the mobile one worked by reading the desktop badge's `textContent`). Divergence was the default: `#page-progress` is still orphaned partly because there were two places to wire a tab up and only one got done. Anything nav-shaped now has exactly one home.

**Icons.** Line-art SVGs on a 24×24 grid, stroked `var(--muted)` and switched to the `#m-rainbow` gradient when active: ruled lines for Checklist, an X for Mistakes, a tilted page with a folded corner for Past Papers, then a gear, a bar chart and a 2×2 grid for the tool group. The Focus timer used to count down inside its own button in the tab bar; with that gone, the **Tools icon** carries a pulsing dot (`.rail-live` / `.rail-paused`) so a running timer is still visible once its overlay is closed.

> **Note — two orphaned page containers.** `#page-progress` and `#page-settings` still exist in the markup but nothing activates them: neither is in `TAB_ORDER`, neither has a nav button, and neither is ever given `.active`. Settings content moved into `#settings-overlay`; the progress charts are effectively superseded by `#stats-overlay`. `renderProgressTab()` still runs on every refresh, rendering into a permanently hidden container. Both should be either wired up or deleted.

**Theming.** Colours are driven entirely by CSS custom properties (`--bg`, `--surface`, `--accent`, `--text`, …) set on the root via a `data-theme` attribute. There are **3 built-in themes** — **Dark** (the default), **Light** and **Light rose**. The choice persists in `localStorage['msh-theme']`. Because every colour is a variable, adding a theme is just one CSS block.

Ocean, Violet and Pure Black were retired once the spectrum became a memory scale rather than decoration: a palette that retints the whole app fights a colour ramp that has to mean the same thing everywhere. `THEME_MIGRATE` in `index.html` maps the retired keys onto the survivors, and — like `applyChapterRenames` — it runs on **every** load rather than once behind a flag, because sync can push a retired value back down from a device still on an older build at any moment. A copy of the map lives in the boot `<script>` in `<head>` so the migration lands before first paint.

**Motion & feel.** Modals scale-and-rise in with a spring cubic-bézier; buttons use solid fills with `:focus-visible` rings (deliberately **no transparent borders on filled buttons** — they create a faint seam). Everything is built mobile-first and installs as a **PWA** — home-screen icon, and a service worker (`sw.js`) that precaches the shell, `styles.css` and all five data files on first visit, so the app opens and runs **with no network at all**. Revision on a train works exactly like revision at a desk; only cloud sync and the AI tools need a connection.

**Maths.** All mathematical content is written in LaTeX and typeset by **MathJax** (`$…$` inline, `$$…$$` displayed).

---

## The surfaces, feature by feature

### 1. 📋 Checklist — `#page-checklist`
**Visual:** the home screen. Every spec topic as a card, grouped by area (Pure / Statistics / Mechanics, or the Further modules), each showing a **memory-strength indicator** (predicted % recall, colour-graded red→amber→green) and a **status** (due / overdue / upcoming / mastered / not started). Due and overdue topics float to the top.

**Technical:** cards are driven by the FSRS engine. For each topic, `statusFor(name)` compares today against `dueDateFor(name)`; `strengthInfo(name)` converts the topic's current *retrievability* into the % badge and colour. Tapping a topic opens the **study modal**, where rating how a review went (1–5) calls `saveTopicStudied()`, updates the topic's memory state, and reschedules it. The modal also shows a **per-grade forecast** (via `simulateGrade()`) — "if you rate this Good, next review in 12 days" — before you commit.

### 2. 📝 Papers — `#page-papers`
**Visual:** the past-paper command centre. Tabs for **AS**, **A-Level**, **Further Maths**, **Old-spec** (C1–C4, FP, M1, S1…) and practice sets (Madas, Naiker). Pick a paper, log your marks (a single total *or* question-by-question), and see performance charts, grade boundaries and an exam timer.

**Technical:** the app ships a `PAPER_QUESTIONS` table — for **every** supported paper, an array of `{q, marks, topics:[…]}` giving each question's mark tariff and the exact topic(s) it examines. When you log marks per question, those lost marks are attributed to specific topics; results are stored in `localStorage['alevel-paperlog-v1']` and cross-referenced against `GRADE_BOUNDARIES` to show your grade. This per-question data is what powers the Leaks report below. Coverage is validated so **every paper's marks sum to its real total** and every topic string matches the canonical topic names.

### 3. ❌ Mistakes — `#page-mistakes`
**Visual:** a log of questions you got wrong, each tagged with a **category** (Concept gap, Method error, Silly mistake, …) and a 1–5 **severity**. A **re-attempt loop** brings a mistake back later so you can try it again and rate the retry; an **"Explain with AI"** button gives a focused walkthrough.

**Technical:** mistakes live in `localStorage['alevel-mistakes-v2']`. Crucially, they **feed back into scheduling** — since phase 2 of the [evidence model](docs/fsrs-evidence-model.md), each mistake is a dated *observation* replayed on the same timeline as reviews, and it moves the topic's stability directly. The **category**, not the severity, sets how far: one concept gap drops a well-learned topic from 96% to 82% and makes it overdue immediately; a method error takes about three; silly slips barely register. So logging a mistake genuinely changes what the app tells you to revise — see [the engine section](#mistakes-are-evidence-not-just-a-nudge).

### 4. 📉 "Where I lost marks" (Leaks report) — inside Progress/Mistakes
**Visual:** turns all your logged papers into a ranked report — **marks lost per topic**, a **grade-impact headline** ("these leaks cost you ~1 grade"), and a **"revise first" ordering** by how often each topic bleeds marks.

**Technical:** it aggregates the per-question paper-log data (not summed row totals — computed per *question* so multi-topic questions don't double-count), ranks topics by total marks lost and frequency, and maps the recoverable marks onto grade boundaries.

### 5. 📊 Statistics — `#stats-overlay`
**Visual:** the honest audit, opened from the bar-chart icon in the nav rail (or the ⋯ menu on mobile) — average predicted recall, mastered / overdue / due counts, total reviews and lapses, and four distributions: retrievability in ten bands, stability (`<7d` · `7–30d` · `1–3m` · `3–6m` · `6m+`), difficulty `D 1–10`, and current intervals. Then a per-topic breakdown.

**Technical:** `computeStats()` builds all of it from the derived memory records; mastery is counted with `isMastered()` rather than `statusFor(...)==='done'`, since a mastered topic can also be due. The older `#page-progress` charts (`renderProgressTab`) are the orphaned container noted above.

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

**Phase 3 — past-paper marks — is still outstanding.** 2,106 tagged questions with real marks are the best evidence in the app and the scheduler still ignores them. Design in [`docs/fsrs-evidence-model.md`](docs/fsrs-evidence-model.md) §4.

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

**AI:** `TUTOR_MODEL` = Gemini model id (`gemini-2.5-flash`); shared call timeout 60 s; 1 retry; `pqGenerate` temperature 0.9 / `pqVerify` temperature 0.

### 9.5 Function inventory by subsystem

375 named functions total. The load-bearing ones, grouped:

- **Dates:** `ymd(d)` — the single local-calendar-day helper every other date derivation goes through — plus `today()`, `addDays`, `daysDiff`, `fmtDate` (which parse at local *noon*, deliberately, to stay clear of DST).
- **Forgetting curve & scheduling:** `forgetting(t,S)`, `intervalForRetention(S,R)`, `safeInterval(x)`, `validRec(r)`, `currentRetrievability(name)`, `dueDateFor(name)`, `statusFor(name)`, `strengthInfo(name)`, `isMastered(name)`, `needsExamConfirmation(name)`.
- **FSRS update primitives:** `ratingEase(r)`, `initialStability(r)`, `initialDifficulty(g,topicDiff)`, `nextDifficulty(D,g)`, `stabilityAfterRecall(D,S,R,r)`, `stabilityAfterLapse(D,S,R)`.
- **The one shared step (phase 1 & 2):** `applyReview(rec,g,date,tdiff)` and `applyMistake(rec,E,date)` — the only two places state is advanced; `buildTimeline`, `replayTimeline`, `mistakeEventsByTopic`, `memoryFor(name)` (the derived read every UI number goes through, memoised per topic/day), `invalidateMemory`, `evidenceTrail(name)`, `simulateGrade(name,date,g)`, `saveTopicStudied(name,date,gradeKey)`, `sanitizeAllSR`, `migrateV4`.
- **Mistake feedback (soft channel):** `mistakeLoad(name)` (memoised per topic/day), `invalidateMistakeLoad`, `effectiveD(name)`, `targetRetention(name)`, `examDateForTopic(name)`, `examDateForComponent(comp)`, `sevPips`, `sevUpdateUI`.
- **AI subsystem:** `geminiCall(parts,genCfg)`, `geminiFriendly(err)`, `tutorMd(text)`, `askTutor()`, `pqGenerate()`, `pqParse()`, `pqValidate(q)`, `pqVerify(q)`, `pqRenderQuestion(q)`, `reattemptExplainAI(btn)`, `renderReattempt(pick)`, `reattemptShuffle()`.
- **Sync & migration:** `applyToLocal(store)`, `schedulePush()`, `collectLocal()`, `applyRemote(d)`, plus the Firebase `onSnapshot` listener and `enablePersistence` setup. `applyChapterRenames()` runs on load and at the end of `applyToLocal` — see [Topic renames & the remap](#topic-renames--the-remap).
- **Leaks / analytics:** the paper-log aggregation that ranks marks-lost per topic and maps recoverable marks onto `GRADE_BOUNDARIES`.
- **Shell & navigation:** `switchTab(tab)` — the only entry point; the nav buttons, the keyboard shortcuts and the mobile swipe handler all call it — plus `updateDueBadge()`, `positionMNavPill()`/`updateMNav()` inside the app-shell IIFE, and `openMore()`/`closeMore()` for the Tools overlay. `updateFocusBtn()` no longer draws a button; it mirrors the timer's state onto the nav's Tools icon.
- **Rendering helpers:** `tutorEsc`, `leakEsc` (local closure-safe escapers — note the global `esc()` is closure-scoped and not visible to injected/eval'd code).

(Grep `function ` in `index.html` for the exhaustive list; names are stable and descriptive.)

### 9.6 External dependencies & config

- **MathJax** — LaTeX typesetting (CDN).
- **Firebase compat SDK v10.14.1** — `firebase-app`, `firebase-auth`, `firebase-firestore` (CDN `gstatic.com`). Project **`maths-hub-3aa8c`** (`authDomain: maths-hub-3aa8c.firebaseapp.com`). Firestore doc per user at `users/{uid}`; profile-image writes to a sibling doc with a `serverTimestamp()`.
- **Google Gemini** — `gemini-2.5-flash` via the student's own key in `localStorage['alevel-gemini-key-v1']`.
- **Service worker** (`sw.js`) — precaches the shell and `data/*.js`; cache-first with background refresh for MathJax, Google Fonts **and the Firebase SDK on `www.gstatic.com`**; network-first for own files so a push reaches you immediately; explicitly *bypasses* Firestore, Identity Toolkit and Gemini so realtime sync and AI calls are never served stale. Caching the SDK is what makes offline durability real: without it the three `<script>` tags failed offline, `firebase` was undefined, and the sync block bailed out early — taking the `localStorage` hook with it, so offline edits were never queued for the cloud at all.
- No runtime dependencies beyond those CDNs; the only tooling is `scripts/validate.mjs`, which uses nothing but Node's standard library.

---

## Editing, building & deploying

### Committing without being asked

**If you are an AI assistant working in this repo: commit every change you finish. Do not stop to ask permission first.** A finished change is one where the code works, the docs in the same change are updated, and `npm test` passes. At that point `git add` the files you touched and commit them with a message describing what changed and why — the same turn, before you report back. Asking "shall I commit this?" is friction with no upside: the commit is the unit of work, git history is the backup, and an uncommitted change is one accidental overwrite from being lost.

**Pushing follows the same rule**, because on this repo a push to `main` *is* the deploy — GitHub Pages publishes from the branch. So push through `npm run deploy`, never a bare `git push`: the deploy script bumps `CACHE_VERSION` when a precached file changed, runs the validator, and **aborts before committing if anything fails**, which is the only gate that actually stops a broken build reaching the live site (CI can report a failure but cannot block a branch-source publish).

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
- **One-command deploy.** `npm run deploy` (→ [`scripts/deploy.sh`](scripts/deploy.sh)) does the whole publish in the right order: bumps `CACHE_VERSION` if a precached file changed → runs the validator → **aborts before committing if anything fails** → commits (your message, or one generated from what changed) → rebases on `origin/main` → pushes → prints the live URL. Because CI can't block a branch-source Pages publish, this local gate is the one that actually prevents a broken build reaching the live site.
  ```
  npm run deploy                        # auto-generated commit message
  npm run deploy -- "Fix trig topics"   # your own message
  npm run deploy -- --dry-run           # validate + show what would ship, commit nothing
  ```
  It refuses to run off `main`, makes no empty commits, and pushes any already-committed-but-unpushed work if the tree is clean.
- **Changing cached files?** Bump `CACHE_VERSION` in `sw.js`. Old caches are deleted on activate, so a bump is the clean way to push every device onto a new build. `npm run deploy` does this automatically whenever `index.html`, `styles.css`, `exam-dates.json` or `data/` changed — and skips it if you've already bumped by hand (`--no-bump` overrides).
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
- **Accessibility needs a pass.** Many controls fall below the 44 px touch target on a narrow phone, there is one `aria-live` region, and modals do not trap or restore focus.
- **Load cost.** `data/paper-questions.js` is 173 KB and parsed on every load, though it is only needed on the Papers tab; deferring it would speed up the Checklist's first paint.
- **`GRADE_BOUNDARIES.alevel.years['2024'].papers[1]`** is used as a generic "average grade gap" when estimating the Leaks headline. That is a deliberate approximation, not a per-module lookup.
- **Two orphaned page containers.** `#page-progress` and `#page-settings` are in the markup but unreachable — not in `TAB_ORDER`, no nav button, never given `.active`. `renderProgressTab()` still runs on every refresh, drawing into a hidden container. Wire them up or delete them.
- **Past-paper marks still don't reach the scheduler** — phase 3 of [`docs/fsrs-evidence-model.md`](docs/fsrs-evidence-model.md). The best evidence in the app, 2,106 tagged questions, is analytics-only. Highest-value engine work outstanding.
- **Firestore security rules unverified.** One document per user, so a rule left in test mode would expose every student's data. Confirm it is `allow read, write: if request.auth.uid == uid`. (The `apiKey` in source is public by design and fine.)
- **Clock skew is unhandled** in the merge — it trusts device clocks. `serverTimestamp` is the escape hatch if it bites.

---

*Built and maintained for real A-Level students. If you're a student: log your papers honestly, review what's due, and let the Leaks report tell you what to fix first.*
