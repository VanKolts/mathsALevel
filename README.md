# Maths Study Hub — Complete Reference

A single-file spaced-repetition study app for A-Level Maths (Edexcel **9MA0** / AS **8MA0** / Further **9FM0**, plus legacy specifications). It helps students track what they know, drill what they don't, log real past papers question-by-question, and see exactly where they lose marks.

- **Live app:** https://vankolts.github.io/mathsALevel
- **The entire app is one file:** [`index.html`](index.html) (~9,000 lines: HTML + CSS + JavaScript, no build step, no server, no dependencies beyond MathJax and the Firebase CDN).
- **Repo:** `VanKolts/mathsALevel` → auto-deploys to GitHub Pages from `main`.

This document describes the app on **three levels**: the **visual/UX layer** (what a student sees), the **feature layer** (what each part does), and the **technical layer** (how it actually works — data model, the spaced-repetition maths, sync, and the AI subsystem).

---

## Table of contents
1. [Architecture in one picture](#architecture-in-one-picture)
2. [The visual layer](#the-visual-layer)
3. [The five pages, feature by feature](#the-five-pages-feature-by-feature)
4. [The spaced-repetition engine (deep dive)](#the-spaced-repetition-engine-deep-dive)
5. [Data model & storage](#data-model--storage)
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

---

## Architecture in one picture

```
┌─────────────────────────── index.html (one file) ───────────────────────────┐
│                                                                              │
│  STATIC DATA (hard-coded)          UI LAYER                 LOGIC LAYER       │
│  • allTopics  (spec topics)   →   5 pages / tab-bar    →   FSRS-4.5 engine   │
│  • FORMULAS   (formula sheet)     8 themes, modals         (scheduling)      │
│  • GLOSSARY   (223 terms)         MathJax rendering        mistake weighting │
│  • PAPER_QUESTIONS (per-Q         responsive + PWA         Leaks analytics   │
│     marks + topics)                                        AI tools          │
│  • GRADE_BOUNDARIES                                                          │
│                                                                              │
│                         ┌──────────── STATE ────────────┐                    │
│                         │  localStorage  (per device)   │                    │
│                         └───────────────┬───────────────┘                    │
└─────────────────────────────────────────┼───────────────────────────────────┘
                                           │  (optional, if signed in)
                                 ┌─────────▼──────────┐
                                 │  Firebase          │  realtime onSnapshot
                                 │  Auth + Firestore  │  + offline persistence
                                 │  (maths-hub-3aa8c) │  true-mirror both ways
                                 └────────────────────┘
```

**Key idea:** the app has *no backend of its own*. All content ships inside the file; all student state lives in `localStorage`; Firebase is an *optional* mirror for multi-device sync. The three AI tools call Google Gemini directly with the student's own key.

---

## The visual layer

**Shell.** A fixed **tab-bar** navigates five pages. Each page is a `<section id="page-…">`; switching pages toggles which section is visible and slides a `.tab-indicator` under the active button. A **due-count badge** (`.tab-due-badge`) on the Checklist tab shows how many topics need review today.

**Theming.** Colours are driven entirely by CSS custom properties (`--bg`, `--surface`, `--accent`, `--text`, …) set on the root via a `data-theme` attribute. There are **8 built-in themes** — Rose, Ocean and Violet each in dark + light, plus Pure Black (OLED) and Pure White. The choice persists in `localStorage['msh-theme']`. Because every colour is a variable, adding a theme is just one CSS block.

**Motion & feel.** Modals scale-and-rise in with a spring cubic-bézier; buttons use solid fills with `:focus-visible` rings (deliberately **no transparent borders on filled buttons** — they create a faint seam). Everything is built mobile-first and installs as a **PWA** (home-screen icon, offline once loaded).

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
- **Settings** (`#page-settings`) — theme picker, exam-date entry (which drives the scheduler's exam ramp), Gemini API key, and a **Sync diagnostics** panel.

---

## The spaced-repetition engine (deep dive)

This is the heart of the app. It's a full **FSRS-4.5** implementation (Free Spaced Repetition Scheduler — the algorithm behind modern Anki), adapted for exam topics rather than flashcards. Everything below lives around lines 2374 and 5567 of `index.html`.

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

**Hard-coded content** (constants in the file, not user data): `allTopics`, `FORMULAS`, `GLOSSARY`, `PAPER_QUESTIONS`, `GRADE_BOUNDARIES`, and the FSRS weight/tuning constants.

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

**34 studyable clusters · 245 topics.** (Non-studyable nav-shortcut clusters are excluded.)

**A-Level Mathematics (`qual:'maths'`) — 12 clusters, 138 topics**

| Cluster id | Component | Topics | Group |
|---|---|--:|---|
| `proof` | Pure | 3 | Proof |
| `algebra` | Pure | 16 | Algebra & Functions |
| `coord` | Pure | 8 | Coordinate Geometry |
| `seq` | Pure | 8 | Sequences & Series |
| `trig` | Pure | 15 | Trigonometry |
| `exp` | Pure | 6 | Exponentials & Logarithms |
| `diff` | Pure | 15 | Calculus — Differentiation |
| `integ` | Pure | 13 | Calculus — Integration |
| `num` | Pure | 4 | Numerical Methods |
| `vec` | Pure | 6 | Vectors |
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
- **Sync:** `applyToLocal(store)`, `schedulePush()`, plus the Firebase `onSnapshot` listener and `enablePersistence` setup.
- **Leaks / analytics:** the paper-log aggregation that ranks marks-lost per topic and maps recoverable marks onto `GRADE_BOUNDARIES`.
- **Rendering helpers:** `tutorEsc`, `leakEsc` (local closure-safe escapers — note the global `esc()` is closure-scoped and not visible to injected/eval'd code).

(Grep `function ` in `index.html` for the exhaustive list; names are stable and descriptive.)

### 9.6 External dependencies & config

- **MathJax** — LaTeX typesetting (CDN).
- **Firebase compat SDK v10.14.1** — `firebase-app`, `firebase-auth`, `firebase-firestore` (CDN `gstatic.com`). Project **`maths-hub-3aa8c`** (`authDomain: maths-hub-3aa8c.firebaseapp.com`). Firestore doc per user at `users/{uid}`; profile-image writes to a sibling doc with a `serverTimestamp()`.
- **Google Gemini** — `gemini-2.5-flash` via the student's own key in `localStorage['alevel-gemini-key-v1']`.
- No other runtime dependencies; no build tooling.

---

## Editing, building & deploying

- **One file, no build.** Open `index.html` in any browser and it runs. There is no bundler, transpiler, or package install.
- **Edit `index.html` directly.** Git history is the backup — no `.bak`/duplicate files.
- **Deploy = push.** Commits to `main` publish straight to GitHub Pages (the live site), so only push states that work: syntax-check the inline `<script>` blocks, verify in a browser, then commit + push.
- **Stack recap:** vanilla HTML/CSS/JS · CSS-variable theming (8 themes) · MathJax · Firebase compat SDK (Auth + Firestore, offline persistence) · Google Gemini for AI · everything else in `localStorage`.

---

*Built and maintained for real A-Level students. If you're a student: log your papers honestly, review what's due, and let the Leaks report tell you what to fix first.*
