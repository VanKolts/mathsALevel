# Maths Study Hub

A single-file spaced-repetition study app for A-Level Maths (Edexcel **9MA0** / AS **8MA0** / Further **9FM0**, plus legacy specifications). Built for students to track what they know, drill what they don't, log past papers, and see exactly where they lose marks.

- **Live app:** https://vankolts.github.io/mathsALevel
- **The entire app is one file:** [`index.html`](index.html) — HTML, CSS and JavaScript together, no build step, no server.
- **Repo:** `VanKolts/mathsALevel` (deploys automatically to GitHub Pages from `main`).

---

## Contents
1. [How it works at a glance](#how-it-works-at-a-glance)
2. [Features](#features)
3. [The spaced-repetition engine](#the-spaced-repetition-engine)
4. [Cloud sync](#cloud-sync)
5. [The AI features](#the-ai-features)
6. [Data behind the app](#data-behind-the-app)
7. [For anyone editing the code](#for-anyone-editing-the-code)

---

## How it works at a glance

There is **no backend of our own**. Everything the app needs is either:

- **In the file** — the app's code, the topic list, all the formulas, the glossary, and every past-paper mark/topic breakdown are hard-coded into `index.html`.
- **In your browser** — your progress, review history, mistakes log and settings are stored in the browser's `localStorage` on each device.
- **In the cloud (optional)** — if you sign in, your data is mirrored to **Firebase** so your phone and laptop stay in sync.

Because it's one static file, it loads instantly, works offline once opened, and can be installed to a phone home screen as a PWA (progressive web app).

---

## Features

### 📋 Checklist (the home screen)
Every topic in the specification, grouped by area (Pure, Statistics, Mechanics; Further topics for FM). For each topic you record how confident you are, and the app schedules when you should next review it. Topics that are **due** are surfaced first so you always know what to revise today.

### 📝 Past-paper command centre
A logger for real exam papers, split into tabs: **AS**, **A-Level**, **Further Maths**, and **Old-spec** (legacy C1–C4, FP, M1, S1, etc.), plus practice-paper sets (Madas, Naiker).

For each paper you can:
- **Log your marks** — either a single total, or question-by-question.
- See a **per-question breakdown** — every question's mark tariff and the topic(s) it tests are stored in the app, so logging a paper automatically attributes your lost marks to specific topics.
- Track performance over time with **charts**, compare against **grade boundaries**, and use the built-in **exam timer**.

### ❌ Mistakes tab
A running log of questions you got wrong, with a **re-attempt loop**: you come back to a mistake, try it again, and rate how it went. Includes an **"Explain with AI"** button (see below).

### 📉 "Where I lost marks" (Leaks report)
An analytics view inside Mistakes that turns all your logged papers into a ranked report:
- **Marks lost per topic**, so you can see your biggest leaks.
- A **grade-impact headline** — how many grade boundaries those lost marks cost you.
- A **"revise first" ordering** by how often a topic costs you marks.

### 📖 Glossary
223 searchable A-Level Pure terms with clear definitions. Also powers **inline glossary popovers** — key terms elsewhere in the app can be tapped to see their definition without leaving the page.

### 🌳 Skill tree & Resources
A visual **skill tree** showing topics and how mastery builds up, plus a **Resources overlay** (reference material, links) reachable from the header on desktop and a quick-access row on mobile.

### 🧮 Formula sheet
The formulas students need, presented in an interactive, searchable sheet styled to match the real formulae booklet.

---

## The spaced-repetition engine

The app uses a modern spaced-repetition algorithm (an **FSRS-style** engine — Free Spaced Repetition Scheduler). In plain terms:

- Each topic has a **memory state** (how well you know it and how fast you're forgetting it).
- When you review a topic and rate how it went, the engine updates that state and picks the **next review date** — sooner for shaky topics, much later for solid ones.
- The **Checklist** reads those dates and shows you what's **due** now, so revision is always focused on what you're about to forget rather than what you already know.

This is the same principle behind Anki, tuned for exam topics rather than flashcards.

---

## Cloud sync

Sign-in is optional but recommended if you use more than one device.

- Sign in and your data mirrors to **Firebase** (Google's cloud) under your account.
- Sync is **realtime** — a change on your laptop appears on your phone within seconds (it uses Firestore's live `onSnapshot` listener).
- It works **offline** — changes made with no connection are saved locally and pushed when you're back online (IndexedDB persistence).
- The sync is a **true mirror**: your devices converge on exactly the same state, including which topics are scheduled and when.
- A **diagnostics panel** in Settings → Sync shows sync status if you ever need to check it.

Your marks and progress are the source of truth; nothing is silently discarded.

---

## The AI features

The app has AI tools powered by **Google Gemini**. They're optional — you add your own free Gemini API key in Settings, and everything else in the app works without it.

There are three AI tools:

1. **AI Tutor** — take or upload a photo of a question and get a step-by-step walkthrough. It writes in exam style, quotes formulas "from the formulae booklet" where relevant, and annotates steps with the marks they'd earn (M1/A1) when the question shows its allocation.

2. **AI practice questions** — inside a topic, generate a fresh, original exam-style question with a proper **Edexcel mark scheme** (M1/A1/B1 notation). These are quality-controlled:
   - **Accurate mark allocation** — the number of scheme lines matches the total marks, A-marks only follow their method mark, and the displayed total always matches the actual scheme.
   - **Anti-repeat** — it won't keep giving you near-identical questions.
   - **A second-examiner check** — a separate pass solves the draft question and rejects it if it's ambiguous, unsolvable, or doesn't read like a real paper, regenerating it once with specific feedback.

3. **Mistake re-attempt explainer** — the "Explain with AI" button on a logged mistake gives a focused explanation of that question.

All three share one hardened connection to Gemini: a 60-second timeout, one automatic retry on a temporary glitch (rate limit, server overload, dropped connection), and clear plain-English error messages instead of raw API errors.

**Note on privacy/keys:** each user supplies their own Gemini key. For wider student distribution, the plan is to route AI calls through a small proxy so the key isn't exposed in the page.

---

## Data behind the app

All of this is baked into `index.html`:

- **The topic list** for each specification, with difficulty and grouping.
- **The formula sheet** contents.
- **The glossary** (223 terms + definitions).
- **Per-question past-paper breakdowns** — for each paper, every question's marks and the topic(s) it tests. Currently covered and validated (marks sum to the paper total, topics use exact canonical names):
  - A-Level (9MA0) and AS (8MA0) papers
  - Old-spec Core: C1, C2, C3, C4 — 79 papers
  - Further Maths: Core Pure, FP1, FS1, FM1, D1 — 27 papers
  - *(In progress: old-spec M1 and S1.)*

These breakdowns are what make the **Leaks report** possible — because the app knows which topic every mark belongs to.

---

## For anyone editing the code

- **Everything is in [`index.html`](index.html).** There is no build step — open it in a browser and it runs.
- Edit that one file directly; the repo's git history is the backup.
- Commits to `main` deploy straight to GitHub Pages (the live site), so only push states that work.
- The maths is rendered with **MathJax**; content is written in LaTeX (`$...$` inline, `$$...$$` displayed).
- State lives in `localStorage`; cloud sync uses the **Firebase compat SDK** (Firestore + Auth).

---

*This app is built and maintained for real A-Level students. If you're a student using it: log your papers honestly, review what's due, and let the Leaks report tell you what to fix first.*
