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
9. [Editing, building & deploying](#editing-building--deploying)

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

## Editing, building & deploying

- **One file, no build.** Open `index.html` in any browser and it runs. There is no bundler, transpiler, or package install.
- **Edit `index.html` directly.** Git history is the backup — no `.bak`/duplicate files.
- **Deploy = push.** Commits to `main` publish straight to GitHub Pages (the live site), so only push states that work: syntax-check the inline `<script>` blocks, verify in a browser, then commit + push.
- **Stack recap:** vanilla HTML/CSS/JS · CSS-variable theming (8 themes) · MathJax · Firebase compat SDK (Auth + Firestore, offline persistence) · Google Gemini for AI · everything else in `localStorage`.

---

*Built and maintained for real A-Level students. If you're a student: log your papers honestly, review what's due, and let the Leaks report tell you what to fix first.*
