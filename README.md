# Maths Study Hub — Complete Reference

A single-file spaced-repetition study app for A-Level Maths (Edexcel **9MA0** / AS **8MA0** / Further **9FM0**, plus legacy specifications). It helps students track what they know, drill what they don't, log real past papers question-by-question, and see exactly where they lose marks.

- **Live app:** https://vankolts.github.io/mathsALevel
- **Structure:** [`index.html`](index.html) holds the markup and *all* the logic (~5,900 lines); [`styles.css`](styles.css) holds the theming; `data/*.js` hold the five static datasets. No build step, no server, no dependencies beyond MathJax and the Firebase CDN.
- **Offline:** a [service worker](sw.js) precaches the shell and all data files, so the app opens and works with no signal.
- **Repo:** `VanKolts/mathsALevel` → auto-deploys to GitHub Pages from `main`. Every push is validated by [`scripts/validate.mjs`](scripts/validate.mjs) in CI.

This document describes the app on **three levels**: the **visual/UX layer** (what a student sees), the **feature layer** (what each part does), and the **technical layer** (how it actually works — data model, the spaced-repetition maths, sync, and the AI subsystem).

---

## Table of contents
1. [Architecture in one picture](#architecture-in-one-picture)
2. [The visual layer](#the-visual-layer)
3. [The five pages, feature by feature](#the-five-pages-feature-by-feature)
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
11. [Known gaps & roadmap](#known-gaps--roadmap)

---

## Architecture in one picture

```
  data/*.js  (static)          index.html  (markup + all logic)      styles.css
┌──────────────────────┐   ┌──────────────────────────────────┐   ┌────────────┐
│ clusters.js          │   │  UI LAYER          LOGIC LAYER   │   │ 8 themes   │
│   → allTopics        │──▶│  5 pages/tab-bar   FSRS-4.5      │◀──│ CSS vars   │
│ formulas.js          │   │  modals            (scheduling)  │   │ responsive │
│ glossary.js (223)    │   │  MathJax           mistake wgt   │   └────────────┘
│ paper-questions.js   │   │  responsive        Leaks report  │
│ grade-boundaries.js  │   │                    AI tools      │
└──────────────────────┘   └────────────────┬─────────────────┘
                                            │
                   ┌──────────── STATE ─────▼──────┐    ┌──────────────────┐
                   │  localStorage  (per device)   │    │ sw.js            │
                   └───────────────┬───────────────┘    │ precaches shell  │
                                   │ (optional, signed in)│ + data → works  │
                         ┌─────────▼──────────┐          │ fully offline    │
                         │  Firebase          │ realtime └──────────────────┘
                         │  Auth + Firestore  │ onSnapshot + offline persistence
                         │  (maths-hub-3aa8c) │ true-mirror both ways
                         └────────────────────┘
```

**Key idea:** the app has *no backend of its own*. All content ships with the app; all student state lives in `localStorage`; Firebase is an *optional* mirror for multi-device sync. The three AI tools call Google Gemini directly with the student's own key.

---

## The visual layer

**Shell.** A fixed **tab-bar** navigates five pages. Each page is a `<section id="page-…">`; switching pages toggles which section is visible and slides a `.tab-indicator` under the active button. A **due-count badge** (`.tab-due-badge`) on the Checklist tab shows how many topics need review today.

**Theming.** Colours are driven entirely by CSS custom properties (`--bg`, `--surface`, `--accent`, `--text`, …) set on the root via a `data-theme` attribute. There are **8 built-in themes** — Rose, Ocean and Violet each in dark + light, plus Pure Black (OLED) and Pure White. The choice persists in `localStorage['msh-theme']`. Because every colour is a variable, adding a theme is just one CSS block.

**Motion & feel.** Modals scale-and-rise in with a spring cubic-bézier; buttons use solid fills with `:focus-visible` rings (deliberately **no transparent borders on filled buttons** — they create a faint seam). Everything is built mobile-first and installs as a **PWA** — home-screen icon, and a service worker (`sw.js`) that precaches the shell, `styles.css` and all five data files on first visit, so the app opens and runs **with no network at all**. Revision on a train works exactly like revision at a desk; only cloud sync and the AI tools need a connection.

**Maths.** All mathematical content is written in LaTeX and typeset by **MathJax** (`$…$` inline, `$$…$$` displayed).

---

## The five pages, feature by feature

### 1. 📋 Checklist — `#page-checklist`
**Visual:** the home screen. Every spec topic as a card, grouped by area (Pure / Statistics / Mechanics, or the Further modules), each showing a **memory-strength indicator** (predicted % recall, colour-graded red→amber→green) and a **status** (due / overdue / upcoming / mastered / not started). Due and overdue topics float to the top.

**Technical:** cards are driven by the FSRS engine. For each topic, `statusFor(name)` compares today against `dueDateFor(name)`; `strengthInfo(name)` converts the topic's current *retrievability* into the % badge and colour. Tapping a topic opens the **study modal**, where rating how a review went (1–5) calls `saveTopicStudied()`, updates the topic's memory state, and reschedules it. The modal also shows a **per-grade forecast** (via `simulateGrade()`) — "if you rate this Good, next review in 12 days" — before you commit.

### 2. 📝 Papers — `#page-papers`
**Visual:** the past-paper command centre. Tabs for **AS**, **A-Level**, **Further Maths**, **Old-spec** (C1–C4, FP, M1, S1…) and practice sets (Madas, Naiker). Pick a paper, log your marks (a single total *or* question-by-question), and see performance charts, grade boundaries and an exam timer.

**Technical:** the app ships a `PAPER_QUESTIONS` table — for **every** supported paper, an array of `{q, marks, topics:[…]}` giving each question's mark tariff and the exact topic(s) it examines. When you log marks per question, those lost marks are attributed to specific topics; results are stored in `localStorage['alevel-paperlog-v1']` and cross-referenced against `GRADE_BOUNDARIES` to show your grade. This per-question data is what powers the Leaks report below. Coverage is validated so **every paper's marks sum to its real total** and every topic string matches the canonical topic names.

### 3. ❌ Mistakes — `#page-mistakes`
**Visual:** a log of questions you got wrong, each tagged with a **category** (Concept gap, Method error, Silly mistake, …) and a 1–5 **severity**. A **re-attempt loop** brings a mistake back later so you can try it again and rate the retry; an **"Explain with AI"** button gives a focused walkthrough.

**Technical:** mistakes live in `localStorage['alevel-mistakes-v2']`. Crucially, they **feed back into scheduling** — see `mistakeLoad()` in the engine section: a recent, high-severity concept-gap mistake raises the topic's effective difficulty and pulls its next review earlier, and the effect decays with age. So logging a mistake genuinely changes what the app tells you to revise.

### 4. 📉 "Where I lost marks" (Leaks report) — inside Progress/Mistakes
**Visual:** turns all your logged papers into a ranked report — **marks lost per topic**, a **grade-impact headline** ("these leaks cost you ~1 grade"), and a **"revise first" ordering** by how often each topic bleeds marks.

**Technical:** it aggregates the per-question paper-log data (not summed row totals — computed per *question* so multi-topic questions don't double-count), ranks topics by total marks lost and frequency, and maps the recoverable marks onto grade boundaries.

### 5. 📊 Progress — `#page-progress`
**Visual:** charts and stats — memory strength across the syllabus, review history, streaks, and paper performance over time.

### Cross-cutting features (reachable from the header / quick-row)
- **📖 Glossary** — 223 searchable Pure terms (`GLOSSARY`), plus **inline glossary popovers**: terms elsewhere in the app are tappable for an in-place definition.
- **🌳 Skill tree** — a visual mastery graph of topics and how they build up.
- **🗂 Resources overlay** — reference links/material, opened from the header on desktop and a `.cl-quick` row on mobile.
- **🧮 Formula sheet** — the `FORMULAS` data rendered as an interactive, searchable sheet styled like the real formulae booklet.
- **📅 Revision plan / My exams** — the multi-exam adaptive planner. Instead of one global exam date, you set a date **per paper** (AS P1–P2, A-Level P1–P3, and the Further modules), seeded from `exam-dates.json` (currently the provisional Edexcel Summer 2027 timetable) and overridable per paper. Each topic then ramps against the date of the paper that actually examines it, so Statistics tightens for the Stats paper rather than for whichever exam happens to be first. Reachable from Settings → My exams, with a plan generator on the Checklist quick-row.
- **Settings** (`#page-settings`) — theme picker, per-paper exam dates (which drive the scheduler's exam ramp), Gemini API key, a JSON backup export, and a **Sync diagnostics** panel.

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
When you rate a review 1–5, the FSRS update primitives fire:

- `initialStability(r)` / `initialDifficulty(g, topicDiff)` seed a brand-new topic, **blending** FSRS's defaults with the topic's intrinsic maths difficulty (`DIFF_D_SEED = {1:3.5, 2:5.0, 3:6.8}`).
- On success, `stabilityAfterRecall(D,S,R,r)` grows S (bigger jump when the memory was already weak but you still recalled it — the desirable-difficulty effect).
- On a lapse (rated 1), `stabilityAfterLapse(D,S,R)` *reduces* S (a lapse can never increase stability) and increments `lapses`.
- `nextDifficulty(D,g)` nudges D and mean-reverts it toward the easy baseline.
- The canonical **FSRS-4.5 weight vector** (`FSRS_W`, 17 values tuned on millions of real reviews) drives all of these.

A topic with `S ≥ MASTERY_STABILITY (180 days)` is shown as **Mastered**.

### Mistakes actually change the schedule
This is the app's signature mechanic. `mistakeLoad(name)` sums a topic's logged mistakes, each weighted by:

- **Category severity** (`MISTAKE_SEVERITY`): Concept gap = 1.00 … Silly mistake = 0.30.
- **User-set severity** (1–5, scaled ~0.33×–1.67×).
- **Recency decay** (`exp(−age/τ)`): old mistakes fade out.

That load feeds `effectiveD()` (raises difficulty) and `targetRetention()` (raises the review target), so a fresh conceptual error visibly moves that topic up your revision queue — and the effect gently fades if you stop getting it wrong.

### Live UI signals
- `currentRetrievability(name)` → the % on each Checklist card.
- `strengthInfo(name)` → the colour band (red < 70% < amber < 85% < orange < 93% < green) and label.
- `simulateGrade(name, date, g)` → the modal's "what happens if I rate this…" forecast, run for each grade without committing.

Guards throughout keep it robust: `validRec()` rejects corrupt state, `safeInterval()` clamps intervals to `[1, 3650]` days to prevent `Date` overflow at extreme stability.

---

## Data model & storage

All student state is JSON in `localStorage`, namespaced `alevel-*` / `msh-*` / `mh_*`:

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
| `alevel-streak-v1` | study-streak counter |
| `alevel-gemini-key-v1` | your Google Gemini API key |
| `alevel-fm-options-v1` | Further Maths module choices |
| `alevel-plainlang-v1` | plain-language toggle |
| `alevel-pomo-presets-v1` | study-timer presets |
| `alevel-shortcuts-v1` | UI shortcuts config |
| `alevel-onboarded-v1` | onboarding-seen flag |
| `msh-theme` | active theme |
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

Sign-in is optional. When you do, the app mirrors your state to **Firebase** (project `maths-hub-3aa8c`) using the compat SDK (v10.14.1, Auth + Firestore).

- **Realtime:** an `onSnapshot` listener on `users/{uid}` pushes remote changes to every device live — a change on your laptop reaches your phone in seconds.
- **Offline-durable:** `db.enablePersistence({synchronizeTabs:true})` caches writes in IndexedDB, so edits made offline queue up and flush when you reconnect (and multiple tabs stay consistent).
- **True mirror:** `applyToLocal(store)` makes the device converge on *exactly* the remote state, **including removing keys that are absent upstream**. (This was a real bug once: an earlier version only *added* keys, so a stale exam date could linger on one device → different `dueDateFor` results → "both accounts synced but showing different topics." The mirror fix removed that class of divergence.)
- **Conflict handling:** `mh_stamp` / `mh_writer` record the last write and its origin so the newest state wins rather than clobbering blindly.
- **Diagnostics:** Settings → Sync shows live status.

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

**Mistake-weighting** (mistakes feed back into scheduling):
| Constant | Value / meaning |
|---|---|
| `MISTAKE_SEVERITY` | category weights: `Concept gap`1.00 · `Missed the clever step`0.85 · `Method error`0.70 · `Misread question`0.50 · `Calculation error`0.45 · `Transcription slip`0.40 · `Ran out of time`0.40 · `Silly mistake`0.30 |
| `SEV_LABELS` | `['','Minor','Low','Moderate','High','Critical']` (user severity 1–5) |
| `MISTAKE_TAU` | recency-decay time constant in `exp(−age/τ)` |
| `MISTAKE_D_WEIGHT` | how strongly mistake-load lifts effective difficulty |
| `MISTAKE_RET_WEIGHT` | how strongly mistake-load lifts target retention |

**AI:** `TUTOR_MODEL` = Gemini model id (`gemini-2.5-flash`); shared call timeout 60 s; 1 retry; `pqGenerate` temperature 0.9 / `pqVerify` temperature 0.

### 9.5 Function inventory by subsystem

~322 functions total. The load-bearing ones, grouped:

- **Forgetting curve & scheduling:** `forgetting(t,S)`, `intervalForRetention(S,R)`, `safeInterval(x)`, `validRec(r)`, `currentRetrievability(name)`, `dueDateFor(name)`, `statusFor(name)`, `strengthInfo(name)`.
- **FSRS update primitives:** `ratingEase(r)`, `initialStability(r)`, `initialDifficulty(g,topicDiff)`, `nextDifficulty(D,g)`, `stabilityAfterRecall(D,S,R,r)`, `stabilityAfterLapse(D,S,R)`, `simulateGrade(name,date,g)`, `saveTopicStudied(name,date,gradeKey)`.
- **Mistake feedback:** `mistakeLoad(name)`, `effectiveD(name)`, `targetRetention(name)`, `examDateForTopic(name)`, `sevPips`, `sevUpdateUI`.
- **AI subsystem:** `geminiCall(parts,genCfg)`, `geminiFriendly(err)`, `tutorMd(text)`, `askTutor()`, `pqGenerate()`, `pqParse()`, `pqValidate(q)`, `pqVerify(q)`, `pqRenderQuestion(q)`, `reattemptExplainAI(btn)`, `renderReattempt(pick)`, `reattemptShuffle()`.
- **Sync & migration:** `applyToLocal(store)`, `schedulePush()`, `collectLocal()`, `applyRemote(d)`, plus the Firebase `onSnapshot` listener and `enablePersistence` setup. `applyChapterRenames()` runs on load and at the end of `applyToLocal` — see [Topic renames & the remap](#topic-renames--the-remap).
- **Leaks / analytics:** the paper-log aggregation that ranks marks-lost per topic and maps recoverable marks onto `GRADE_BOUNDARIES`.
- **Rendering helpers:** `tutorEsc`, `leakEsc` (local closure-safe escapers — note the global `esc()` is closure-scoped and not visible to injected/eval'd code).

(Grep `function ` in `index.html` for the exhaustive list; names are stable and descriptive.)

### 9.6 External dependencies & config

- **MathJax** — LaTeX typesetting (CDN).
- **Firebase compat SDK v10.14.1** — `firebase-app`, `firebase-auth`, `firebase-firestore` (CDN `gstatic.com`). Project **`maths-hub-3aa8c`** (`authDomain: maths-hub-3aa8c.firebaseapp.com`). Firestore doc per user at `users/{uid}`; profile-image writes to a sibling doc with a `serverTimestamp()`.
- **Google Gemini** — `gemini-2.5-flash` via the student's own key in `localStorage['alevel-gemini-key-v1']`.
- **Service worker** (`sw.js`) — precaches the shell and `data/*.js`; cache-first with background refresh for MathJax and Google Fonts; network-first for own files so a push reaches you immediately; explicitly *bypasses* Firestore, Identity Toolkit and Gemini so realtime sync and AI calls are never served stale.
- No runtime dependencies beyond those CDNs; the only tooling is `scripts/validate.mjs`, which uses nothing but Node's standard library.

---

## Editing, building & deploying

- **No build.** Serve the folder (`npm start`, or any static server) and it runs. There is no bundler, transpiler or dependency install. Opening `index.html` via `file://` mostly works, but the `data/*.js` scripts and the service worker need a real origin — use the server.
- **Edit in place.** Logic and markup in `index.html`, styling in `styles.css`, content in `data/*.js`. Git history is the backup — no `.bak`/duplicate files.
- **Validate before pushing.** `npm test` (→ `node scripts/validate.mjs`) syntax-checks every inline `<script>`, `sw.js` and each `data/*.js`, then asserts the invariants the app quietly relies on:
  - every paper's marks sum to its real Edexcel total (100 for A-Level and AS paper 1, 60 for AS paper 2, 75 for legacy Core and Further modules);
  - every past-paper `topics:[…]` string resolves to a canonical topic name;
  - `lvls[]` / `diff[]` line up with their `topics[]`, and no two topics share a name;
  - `CHAPTER_RENAMES` stays idempotent and all its targets still exist;
  - every local file referenced by `index.html` and precached by `sw.js` is actually present.
- **Deploy = push.** Commits to `main` publish straight to GitHub Pages. The same validator runs in CI (`.github/workflows/ci.yml`) on every push and PR, so a broken commit is flagged within seconds. *Note:* with Pages set to "Deploy from a branch", CI reports a failure but cannot block the publish — switching the Pages source to GitHub Actions would make validation a true gate.
- **Changing cached files?** Bump `CACHE_VERSION` in `sw.js`. Old caches are deleted on activate, so a bump is the clean way to push every device onto a new build.
- **Stack recap:** vanilla HTML/CSS/JS · CSS-variable theming (8 themes) · MathJax · service worker for offline · Firebase compat SDK (Auth + Firestore, offline persistence) · Google Gemini for AI · everything else in `localStorage`.

---

## Known gaps & roadmap

Honest list of what doesn't work yet, so nothing here looks like a bug you have to rediscover.

- **Grade boundaries are A-Level only.** `GRADE_BOUNDARIES` contains a single module (`alevel`), and `getGradeForMarks()` returns `null` for anything else. Logging an AS, Further Maths or legacy Core paper records the marks correctly but shows no grade — 120 of the 142 supported papers. Adding `as`, `fmcp` and the legacy boundaries is the highest-value data job outstanding.
- **109 of 315 topics have no past-paper questions tagged** (mostly Further Maths, plus topics created by the Pure chapter split). Those topics can never appear in the Leaks report or its "revise first" ranking. `npm test` prints the current count on every run.
- **Legacy M1 and S1 have no per-question breakdown**, and the practice sets (Madas, Naiker) are listed in the logger without per-question data.
- **Accessibility needs a pass.** Many controls fall below the 44 px touch target on a narrow phone, there is one `aria-live` region, and modals do not trap or restore focus.
- **Load cost.** `data/paper-questions.js` is 173 KB and parsed on every load, though it is only needed on the Papers tab; deferring it would speed up the Checklist's first paint.
- **`GRADE_BOUNDARIES.alevel.years['2024'].papers[1]`** is used as a generic "average grade gap" when estimating the Leaks headline. That is a deliberate approximation, not a per-module lookup.

---

*Built and maintained for real A-Level students. If you're a student: log your papers honestly, review what's due, and let the Leaks report tell you what to fix first.*
