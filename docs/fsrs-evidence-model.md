# The evidence model — making FSRS use everything the app knows

**Status:** phases 1–4 implemented.
**Scope:** how topic memory is estimated. Replaces the current mistake-weighting mechanic, adds past-paper marks as a first-class input, and unifies all three signals into one replayable timeline.

---

## 1. The problem

The app collects three kinds of evidence about whether a student knows a topic. Only one of them reaches the scheduler.

| Signal | Volume | Reaches the scheduler? |
|---|---|---|
| Self-rated reviews (1–5) | one per study session | **Yes** — drives `S` and `D` |
| Past-paper marks, per question | 2,106 tagged questions across 142 papers | **No** — analytics only |
| Logged mistakes (category + severity) | one per logged error | **Partially** — see below |

Two things are wrong with that.

**Past-paper marks are the best signal in the app and are entirely unused by the scheduler.** `refreshPaperTopicStats()` ([index.html:1473](../index.html)) aggregates `got`/`max` per topic and feeds the Leaks report. Nothing in `dueDateFor`, `targetRetention`, `effectiveD` or `saveTopicStudied` reads it. A student can score 1/6 on a Q7 that examines *Solving trigonometric equations*, and the checklist will go on claiming 94% predicted recall for that topic, because the only thing that moved `S` was a self-rating three weeks earlier. A mark scheme is an objective, externally-graded retrieval attempt under exam conditions — strictly better evidence than "I felt OK about it".

**Mistakes never touch memory.** They currently act through two soft channels only:

```js
effectiveD(name)      = clamp(D + 1.30 * mistakeLoad(name), 1, 10)
targetRetention(name) = ... + 0.04 * mistakeLoad(name) + (effectiveD(name)-5)*0.004
```

`effectiveD` is consumed *only* by `targetRetention`. `dueDateFor` uses the raw `rec.S`. So a mistake raises the target retention, which shortens the interval — but `currentRetrievability()` is `forgetting(t, rec.S)` on raw stability, so **the memory percentage the student sees is completely blind to mistakes**. Log five concept gaps on Index laws and the card still says 96%.

The effect that does exist is also temporary in the wrong way: `mistakeLoad` decays with `exp(-age/30)`, so after ~90 days it is as if the mistake never happened — regardless of whether the student ever actually fixed the problem. Decay is standing in for "recovery", but it is not measuring recovery.

---

## 2. The core idea: one evidence timeline

> Every dated thing the student does that reveals something about a topic becomes an event. Events are sorted by date and replayed through FSRS. `S` and `D` are always *derived*, never stored as independent truth.

This is already how the sync merge works for reviews — the README's merge rule is "union the review **logs**, sort by date, and replay FSRS over the result", precisely because `D` and `S` are not independent facts needing a winner. Extending the timeline to paper questions and mistakes means that property keeps holding, for free.

Three event types:

| Event | Source | Kind | Resets the clock? |
|---|---|---|---|
| `review` | study modal, rating 1–5 | rehearsal | **yes** |
| `paper` | a logged past-paper question tagged with this topic | rehearsal *(only when unambiguous — see §4.2)* | **only when `c = 1`** |
| `mistake` | a logged mistake, by category | **observation** | **no** |

### 2.1 The rehearsal / observation distinction

This is the load-bearing design decision.

A **rehearsal** is an actual retrieval attempt: you sat down, tried to produce the answer, and found out. FSRS treats these as the thing that resets `last` and updates `S`. Reviews and paper questions are both rehearsals.

A **mistake** is an *observation about* your memory, not a rehearsal of it. Logging "I had a concept gap on integration by parts" does not restudy integration by parts. It tells the model its estimate was too high.

So a mistake updates `S` and `D` but leaves `last` alone.

This matters concretely. If a mistake reset `last`, then `currentRetrievability` would be `forgetting(0, S_new)` ≈ **100%** — logging a mistake would make the memory percentage jump *up*, which is the exact opposite of the intent. Leaving `last` untouched means the reduced `S` immediately drags the displayed percentage down, which is what the student expects to see.

### 2.2 Recovery becomes real

Because events replay in date order, a good review *after* a bad mistake naturally raises `S` again. There is no need for `MISTAKE_TAU` to fake recovery by fading the mistake out over 30 days. A mistake you never fixed keeps its effect; a mistake you demonstrably fixed gets overwritten by the later evidence.

**`MISTAKE_TAU` is retired from the stability channel.** (See §6 for what remains of the soft channel.)

---

## 3. Mistakes: how many of each type should move the needle

### 3.1 Grounding the weights

The eight mistake categories map cleanly onto [Newman's Error Analysis](https://files.eric.ed.gov/fulltext/EJ1488529.pdf) — a standard framework in maths education that breaks problem-solving failure into five *hierarchical* stages: reading → comprehension → transformation → process skills → encoding. The hierarchy is the useful part: a failure early in the chain means the student never had the method, while a failure late in the chain means they had it and fumbled the execution.

Only the early stages are evidence about *topic memory*. That justifies a much steeper gradient than the current `MISTAKE_SEVERITY` (which spans a mere 0.30–1.00).

| Category | Newman stage | What it says about memory | `E` | ≈ n to full effect |
|---|---|---|---:|---:|
| Concept gap | Transformation | You had no method to select. Direct memory failure. | **1.00** | 1 |
| Missed the clever step | Transformation | Had the tools, failed to select. Retrieval failure. | **0.60** | 2 |
| Method error | Process skills | Right plan, wrong procedure. Partial. | **0.33** | 3 |
| Ran out of time | *(fluency — outside NEA)* | Known but not automatic. Real, weaker. | **0.25** | 4 |
| Misread question | Reading / Comprehension | Attention, not topic memory. | **0.15** | 6 |
| Calculation error | Process skills (arithmetic) | Execution noise. | **0.12** | 8 |
| Transcription slip | Encoding | Copying. Almost no signal. | **0.08** | 12 |
| Silly mistake | Encoding / noise | Noise. | **0.08** | 12 |

`E` is "what fraction of a full lapse does one mistake of this type represent".

### 3.2 The update

A mistake moves stability a fraction `E` of the way toward what a genuine failed review would have produced:

```js
R      = forgetting(t, S)                    // retrievability at the moment of the mistake
Slapse = stabilityAfterLapse(D, S, R)        // existing FSRS-4.5 primitive, unchanged
S_new  = S - E * (S - Slapse)
D_new  = D + E * (nextDifficulty(D, 1) - D)  // a lapse-flavoured difficulty nudge
// `last` is NOT touched — see §2.1
```

Because it is a fractional step toward the same target each time, repeated mistakes **compound geometrically**: after `n` mistakes the topic has travelled `1 - (1-E)^n` of the way to a full lapse. No thresholds, no counters, no special-casing.

### 3.3 Simulated results

Starting from a well-learned topic — `S = 30d`, `D = 5`, last reviewed 10 days ago, memory **96.3%** — run against the app's actual FSRS-4.5 primitives:

**Memory percentage after n mistakes of one type**

| Category | n=1 | n=2 | n=3 | n=4 | n=5 |
|---|---:|---:|---:|---:|---:|
| Concept gap | **81.6%** | 67.9% | 60.2% | 56.0% | 53.7% |
| Missed the clever step | 92.9% | **87.9%** | 81.7% | 75.4% | 69.7% |
| Method error | 95.0% | 93.3% | **91.3%** | 88.9% | 86.3% |
| Ran out of time | 95.4% | 94.3% | 93.0% | **91.5%** | 89.9% |
| Misread question | 95.8% | 95.2% | 94.6% | 94.0% | 93.2% |
| Calculation error | 95.9% | 95.5% | 95.0% | 94.5% | 94.0% |
| Transcription slip | 96.1% | 95.8% | 95.5% | 95.2% | 94.9% |
| Silly mistake | 96.1% | 95.8% | 95.5% | 95.2% | 94.9% |

**Stability and next-review timing**

| Category | S after 1 | due | S after 3 | due |
|---|---:|---:|---:|---:|
| Concept gap | 4.7d | **overdue 5d** | 1.3d | overdue 9d |
| Missed the clever step | 14.8d | 5d | 4.7d | overdue 5d |
| Method error | 21.6d | 12d | 11.8d | **2d** |
| Ran out of time | 23.7d | 14d | 15.0d | 5d |
| Misread question | 26.2d | 16d | 20.1d | 10d |
| Calculation error | 27.0d | 17d | 21.9d | 12d |
| Transcription slip | 28.0d | 18d | 24.4d | 14d |
| Silly mistake | 28.0d | 18d | 24.4d | 14d |

This is the specified behaviour: **one concept gap drops memory 96% → 82% and makes the topic overdue immediately**; **method errors need about three** before the topic is pulled to the front; a handful of silly mistakes barely register (96.1% → 94.9% over five), which is correct — they are execution noise, not forgetting.

Reproduce with `node scripts/fsrs-sim.mjs` — it reimplements the app's FSRS primitives verbatim, so retuning `E` for a category is a one-line edit and a re-run.

### 3.4 Severity stays out of it

Per the brief, the 1–5 severity slider does **not** determine how many mistakes are needed — category does. Severity is currently a `(sev/3)` multiplier inside `mistakeLoad`; in the new model it does not enter the stability calculation at all.

It keeps two jobs: sorting and filtering the mistake list for the student, and the residual soft nudge in §6. Leaving it out of the maths also removes a perverse incentive to inflate severity to force a topic up the queue.

---

## 4. Past-paper marks: the missing input

### 4.1 Marks → rating

Each logged question yields `got/max` for every topic in its `topics[]` array. Convert the ratio to the app's existing 1–5 scale and feed it as a `review`-kind event dated to the paper attempt:

| ratio | rating | reading |
|---|---:|---|
| 0 | 1 | Blank — a genuine lapse |
| 0 < r < 0.4 | 2 | Shaky |
| 0.4 ≤ r < 0.7 | 3 | OK |
| 0.7 ≤ r < 0.95 | 4 | Confident |
| r ≥ 0.95 | 5 | Mastered |

### 4.2 Blame dilution on multi-topic questions

A question tagged with `k` topics creates an attribution problem: if you scored 2/7, which topic cost you? The Leaks report already dodges this by computing per question rather than summing rows.

The key asymmetry: **a high mark confirms every topic on the question** (you cannot score full marks on a question without all of its topics working), while **a low mark is ambiguous** across them. So confidence should depend on the direction of the result:

```js
c = r + (1 - r) / k        // r = marks ratio, k = number of topics tagged

if (c === 1) {             // unambiguous: single-topic question, or full marks
  → full rehearsal: reset the clock, take the whole FSRS update
} else {                   // ambiguous: k topics shared one question
  S_new = S + c * (S_fsrs(rating) - S)
  last  = unchanged        // this topic was not necessarily rehearsed
}
```

**The `last = unchanged` branch is not cosmetic.** Blending stability by `c` while *also* resetting the clock lets a zero on a 3-topic question raise predicted recall (91% → 94%) and push the next review later: the "you just looked at it" credit outweighs the weakened penalty. Ambiguous evidence revises the estimate; it does not count as having rehearsed the topic.

| marks | ratio | rating | c (k=1) | c (k=2) | c (k=3) |
|---|---:|---:|---:|---:|---:|
| 0/5 | 0.00 | 1 | 1.00 | 0.50 | 0.33 |
| 1/5 | 0.20 | 2 | 1.00 | 0.60 | 0.47 |
| 2/5 | 0.40 | 3 | 1.00 | 0.70 | 0.60 |
| 3/5 | 0.60 | 3 | 1.00 | 0.80 | 0.73 |
| 4/5 | 0.80 | 4 | 1.00 | 0.90 | 0.87 |
| 5/5 | 1.00 | 5 | 1.00 | 1.00 | 1.00 |

Full marks always applies at full confidence regardless of `k`; a zero on a three-topic question applies at one third to each.

### 4.3 Dating

Paper events are dated from the paper-log entry / `alevel-paper-dates-v1`, **not** from today. Logging a paper you sat in March inserts events in March, and the replay handles the rest. This is what makes retroactive logging safe and is why the timeline has to be date-sorted rather than append-only.

### 4.4 Only papers with per-question data

A paper logged as a single total (no `qMarks`) carries no per-topic information and generates no events. Today that is 120 of 142 papers when logged by total; the per-question logger is what unlocks this, which is a good reason to nudge students toward it in the UI.

---

## 5. Double-counting rules

Three signals can describe the same underlying failure. Rules, applied at replay:

1. **Paper question beats mistake.** If a `mistake` falls within ±1 day of a `paper` event for the same topic, the mistake contributes its **difficulty** nudge (the category is diagnostic information the marks do not carry) but **not** a second stability penalty. The marks already measured the failure.
2. **Paper beats self-rating.** A `review` and a `paper` for the same topic on the same date: the paper wins as the objective measurement; the self-rating is dropped from the replay.
3. **Ordering must be deterministic.** Sort by `(date, kindPriority, id)` with `paper > review > mistake`, so a mistake observes the post-rehearsal state. The `id` tiebreak keeps the sort total, which sync depends on (§7).

---

## 6. What remains of the soft channel

The existing decaying `mistakeLoad` is not deleted wholesale — it still expresses something the stability channel does not: *"you got this wrong recently, so look at it sooner than the model alone says."*

- `MISTAKE_D_WEIGHT` → **0** (retired) — **in phase 2, not phase 1.** Difficulty will move directly at the event, so lifting it again per-render would double-count. But phase 1 removes `effectiveD` from the *stability* path without yet adding the mistake events that replace it, so zeroing this in phase 1 would leave a release where mistakes quietly matter less than before. It stays at 1.30 until the mistake channel exists. (It contributes roughly 13% of the current mistake effect: `1.30 × 0.004 = 0.0052` of retention lift per unit load, against `MISTAKE_RET_WEIGHT`'s 0.04.)
- `MISTAKE_RET_WEIGHT` → **0.04 → 0.015**. Keeps a mild recency tightening without re-applying the full penalty.
- `MISTAKE_TAU` → retained at 30 days **for this channel only**.

`effectiveD()` collapses to `rec.D` and can be inlined or kept as a one-liner for call-site compatibility.

**Performance note:** this is a net win. Today `mistakeLoad` is the hottest function in the app — `targetRetention` calls it directly *and* again via `effectiveD`, `dueDateFor` calls `targetRetention`, `statusFor` calls `dueDateFor`, so a checklist render scans the mistake list roughly four times per topic (the existing comment in the source records ~250k date parses per render before memoisation). In the new model the expensive work happens **once at load** during replay, and per-render calls read a plain number off `sr[name]`.

---

## 7. Sync: this is the part that must not break

The merge rule for `alevel-sr-v5` replays FSRS over the union of review logs, and the README is explicit that three properties are load-bearing and covered by tests: **commutative**, **idempotent**, **additive-safe**.

Extending the timeline preserves all three *if and only if*:

- The replay input is the **union of all three event streams**, each already merged by its own existing rule (`mistakes` and `paperLog` merge by id with tombstones; reviews union by log).
- The sort is **total and deterministic** (§5.3). A non-total sort would let two devices produce different orderings, hence different `S`, and push at each other forever.
- Replay is a **pure function** of the merged event set. No reads of `today()`, no reads of device-local state. Note this rules out using `mistakeLoad`'s recency decay inside the replay — another reason the stability channel must not use it.

Derived `S`/`D` are never merged directly; they are recomputed on both devices from the merged events and therefore agree by construction. This is strictly *safer* than today, where mistakes influence scheduling through a device-local decay term that is a function of `today()`.

---

## 8. Migration

Rebuilding every topic's memory state from full history will visibly change the schedule for an existing user — potentially by a lot, since paper marks have never been applied before.

- Write to a **new key `alevel-sr-v6`** and leave `alevel-sr-v5` untouched, so the change is revertible and a downgrade does not destroy data.
- Replay is derived, so migration is just "run the replay" — it is idempotent by construction and needs no one-shot flag (the same reasoning as `applyChapterRenames`, which is deliberately not flag-gated).
- Add `alevel-sr-v6` to `SYNC_KEYS`; keep mirroring v5 for one release so mixed-version devices do not fight.
- **Show the student what happened.** A one-time summary: *"Your schedule now includes 1,204 past-paper marks and 87 logged mistakes. 47 topics moved earlier, 12 moved later."* Silently reshuffling someone's revision plan the night before a mock is not acceptable.

---

## 9. Visual and UX changes

The engine change is only half of it. The app's ethos is that the model is legible — the study modal already shows a per-grade forecast before you commit. The same honesty should extend to the new inputs.

### 9.1 "Why is this due?" — the evidence trail

The single highest-value addition. In the study modal, under the memory percentage, list the events that produced it:

```
Memory 82%  ·  overdue by 5 days

  12 Jul   rated OK                                  96%  →  97%
  28 Jul   2023 P1 Q7 — 3 of 5 marks                 95%  →  91%
   4 Aug   concept gap logged                        91%  →  82%
```

Nothing else in the A-level market can show a student *why* the app thinks they are weak on a topic, traced to specific marks on specific questions. This is also the honest answer to "why is this suddenly at the top of my list?".

### 9.2 Immediate feedback when evidence lands

Logging a mistake or a paper currently gives no sense of consequence. It should:

- **Mistake logged** → toast: *"Index laws: memory 96% → 82%, now overdue."*
- **Paper logged** → a summary screen rather than a silent save: *"31 topics examined · 14 rescheduled sooner · 3 confirmed strong · 6 marks recoverable in Trigonometry."* This turns per-question logging from data entry into the payoff moment, which is exactly the behaviour worth encouraging (§4.4).

### 9.3 The forgetting curve, with the evidence on it

Plot `R(t,S)` for the topic with a "you are here" dot, and mark each event as a notch where the curve stepped. This visualises the whole model in one object and explains the mechanic without a word of documentation.

**This is where the rainbow belongs.** Per the identity decision, the spectrum stays the app's signature and lives on the things that express memory — the curve itself, the strength bars, the percentage badges, the review-rating slider. That keeps the rainbow prominent while making it *mean* something.

### 9.4 Evidence-strength (confidence) indicator

A topic scheduled from one self-rating is a guess; one scheduled from six exam questions is a measurement. The model currently presents both with identical authority.

Show it: a solid strength bar when the estimate rests on objective evidence (paper marks), a dotted or hollow one when it rests on self-ratings alone. Cheap to compute, and it quietly teaches students that logging papers makes the app smarter.

### 9.5 Checklist card

Room for one small marker showing the dominant evidence type — a paper glyph when the topic's most recent evidence is exam marks. Deferred until the icon system is unified (currently the app mixes colour emoji with stroke SVGs).

---

## 10. Which FSRS version

**Recommendation: stay on the FSRS-4.5 weight vector.**

[FSRS-5](https://expertium.github.io/Algorithm.html) adds two parameters (19 total), mainly to model **same-day** reviews, plus an improved initial-difficulty calculation, for roughly 4% lower prediction error. [FSRS-6](https://github.com/open-spaced-repetition/srs-benchmark) adds two more (21 total), including a trainable `w20` governing the shape of the forgetting curve per user, with a default decay of 0.2 rather than 0.5.

Neither is worth taking here:

- **Same-day reviews barely exist in this app.** Topics are revised days apart, so FSRS-5's headline improvement targets a case that does not arise.
- **The gains come from *training* the parameters**, not from the formula. FSRS-6's per-user curve shape is fitted on a large personal review history; one student across 315 topics will not produce enough reviews to fit 21 parameters without overfitting badly.
- Adopting a newer formula while keeping default weights imports the extra machinery and none of the benefit.

The far larger accuracy win available here is not a newer version of the algorithm — it is **feeding the algorithm the 2,106 tagged exam questions it currently ignores**.

Worth noting as a future tunable: FSRS-6's flatter default decay (0.2 vs 0.5) lengthens intervals at the long tail. Changing `DECAY` is a one-line experiment, but without training data it is a guess, so it should not ship blind.

---

## 11. Constants summary

```js
// Evidence weight per mistake category — "fraction of a full lapse".
// Graded by Newman error-analysis stage; see §3.1.
const MISTAKE_EVIDENCE = {
  'Concept gap':            1.00,
  'Missed the clever step': 0.60,
  'Method error':           0.33,
  'Ran out of time':        0.25,
  'Misread question':       0.15,
  'Calculation error':      0.12,
  'Transcription slip':     0.08,
  'Silly mistake':          0.08,
};

// Past-paper marks ratio -> 1-5 rating (§4.1)
const PAPER_BANDS = [[0,1],[0.4,2],[0.7,3],[0.95,4],[Infinity,5]];

// Retired / retuned (§6)
MISTAKE_D_WEIGHT   : 1.30 -> 0      // D now moves at the event
MISTAKE_RET_WEIGHT : 0.04 -> 0.015  // residual recency nudge only
MISTAKE_TAU        : 30 (soft channel only; not used in replay)

// Unchanged
FSRS_W, DECAY, FACTOR, BASE_RETENTION, MAX_RETENTION,
EXAM_RAMP_DAYS, MASTERY_STABILITY, MAX_INTERVAL, DIFF_D_SEED
```

---

## 12. Risks and open questions

1. **Retroactive shock.** A student with a long paper history sees a large one-off reshuffle. Mitigated by the §8 summary screen, but the first run needs care — ideally not during exam season.
2. **Old papers, current memory.** Logging a paper sat 18 months ago inserts 18-month-old events. The replay handles it correctly (later evidence dominates), but a paper sat *before the topic was ever studied* may produce odd trajectories. Probably needs a floor: ignore paper events predating the topic's first review.
3. **Are exam marks harsher than self-ratings?** Real papers are harder than self-testing, so the band boundaries in §4.1 may systematically under-rate. They are a first guess and should be checked against real logged data before they are treated as settled.
4. **Mastery interaction.** `needsExamConfirmation()` guarantees one pass over everything inside the exam ramp. Paper events could satisfy that requirement directly — if a topic was examined and scored well last week, it arguably does not need a confirmation review.
5. **Validator coverage.** `scripts/validate.mjs` should gain assertions that replay is deterministic, commutative and idempotent over a shuffled event set — the same properties the merge tests already cover, since the replay is now what sync depends on.
6. **Floors.** A pile of old mistakes must not drive `S` to the 0.1 clamp. `stabilityAfterLapse` already clamps to `[0.1, S]`, but the compounding path needs its own sanity floor.

---

## 13. Suggested phasing

| Phase | Change | Risk |
|---|---|---|
| **1 ✅ done** | One shared FSRS step (`applyReview`) behind `saveTopicStudied`, `simulateGrade` and `replayRecord`; stored state is now a pure function of the review log. Invariants locked by `scripts/fsrs-replay-test.mjs`. | one behavioural change — see below |
| **2 ✅ done** | `mistake` events on the timeline (§3), plus the evidence trail (§9.1) and memory-delta toast (§9.2). Invariants in `scripts/fsrs-mistake-test.mjs`. | medium |
| **3 ✅ done** | `paper` events (§4), a settings toggle, and a summary of what logging a paper changed. Invariants in `scripts/fsrs-paper-test.mjs`. | highest value, highest shock |
| **4 ✅ done** | Forgetting-curve view (§9.3) and evidence-quality indicator (§9.4). | low, visual only |

Phase 1 is the one that de-risks everything else: if the replay reproduces current behaviour bit-for-bit from the review log alone, then every later phase is just adding events to a mechanism already known to be correct.

### Phase 2, as built

Built as a **derived layer** rather than the rebuild-and-migrate in §8, which turned out to be unnecessary. `sr[]` stays exactly what phase 1 made it — a pure function of the review log, which is what sync merges and replays. Mistake evidence is layered on top in `memoryFor()`, which replays reviews and mistakes together on one timeline and is what every user-facing read now goes through (memory %, due date, status, mastery, the forecast).

That means **no new storage key, no migration, and no change to the sync contract**. Both devices already merge reviews and mistakes by their own existing rules, so both derive the same answer from the same merged inputs. The §8 migration plan and the `alevel-sr-v6` key are not needed.

Measured on a topic with two spaced reviews (S ≈ 24.5d, 91% recall, next review 21 Aug):

| | memory | stability | next review | status |
|---|---:|---:|---|---|
| clean | 91% | 24.5d | 21 Aug | upcoming |
| + one concept gap | **69%** | **4.4d** | 29 Jul | **overdue** |

`sr[].S` stayed at 24.5 throughout — the phase 1 invariant is intact and its suite still passes unchanged.

`MISTAKE_D_WEIGHT` is now 0 and `MISTAKE_RET_WEIGHT` drops to 0.015 as designed, since the real penalty now lands on stability.

**Scale dependence worth knowing:** the §3.3 table assumes a mature topic. On a freshly-seeded one (a single review leaves S ≈ 4d) every category bites proportionally harder. That is correct — a topic you have seen once really is that fragile — but it means "five silly mistakes are negligible" holds for established topics, not brand-new ones. The test suite pins both cases.

### Phase 3, as built

**The dilution rule needed correcting.** §4.2 said to blend stability by `c` and otherwise treat a paper question as a rehearsal. Implemented literally, that let a zero on a 3-topic question *raise* predicted recall from 91% to 94% and push the next review a week later — because resetting the clock credits the topic with "you just looked at it", and that outweighed the weakened penalty.

The fix draws the line at what the evidence actually establishes:

- **`c === 1`** — a single-topic question, or full marks on any question — is unambiguously about this topic. It is a true rehearsal: reset the clock, take the whole update.
- **`c < 1`** — several topics shared one question and we cannot say which cost the marks. Revise stability by `c` but **leave the clock alone**. This topic was not necessarily rehearsed.

Measured on real 2019–2024 paper data, two topics with identical history at 91%, due 18 Aug:

| | memory | next review |
|---|---:|---|
| before | 91% | 18 Aug (upcoming) |
| zero on a **1-topic** question | 80% | 9 Aug (**overdue**) |
| zero on a **3-topic** question | 88% | 11 Aug (**overdue**) |
| full marks on a 1-topic question | 99% | 13 Nov |

Both zeroes pull the topic forward; the ambiguous one bites less. Full marks pushes it three months out. The suite pins "a bad result never raises recall and never delays the review, at every k from 1 to 5" as a regression test.

**Scope of the dilution rule:** 531 of the 2,106 tagged questions carry 2–5 topics, so this affects about a quarter of the dataset.

**Papers refine, they do not seed** (§12.2). A paper dated before the topic's first review is dropped, and papers alone never start a topic. This keeps "not started" meaning what it says everywhere else in the UI, at the cost of ignoring paper evidence for never-reviewed topics — revisit if that proves too conservative.

**Double counting** (§5.1) is implemented as designed: a mistake logged within ±1 day of a paper event for the same topic still informs difficulty — its category is diagnostic information the marks do not carry — but does not charge stability twice. The evidence trail labels it *"already counted in the paper"*.

**A settings toggle** (`alevel-paperfsrs-v1`, synced, default on) can turn the whole channel off. This is the largest change to how the app chooses what to revise, so it should not be a fait accompli. The key is stored inverted so its absence reads as "on" — existing installs get the new behaviour with no migration.

**Logging a paper now reports what it did:** *"31 topics examined · 14 rescheduled sooner · 2 pushed back"*, and a paper logged as a single total says so, since without per-question marks nothing reaches the scheduler.

### Phase 4, as built

**The forgetting curve** (§9.3) sits in the study modal, above the grade forecast. It replays the topic's timeline day by day and plots predicted recall, so the curve shows the actual trajectory — stepping down where a mistake or a bad paper landed, jumping back up at a review. Markers are colour-coded by event kind (review / paper / mistake), with a "you are here" dot at today, a dashed line at the target retention, and a marker for the due date.

**This is where the spectrum earns its keep.** The stroke is a vertical gradient across `--spec-1…5`, so the line is literally red where memory is weak and green-blue where it is strong. The rainbow stays the app's signature, but here it is a scale rather than decoration — which is the compromise between keeping the identity and making the colour mean something.

One thing needed fixing during the build: a fixed 0–100% y-axis squashed every real curve into the top sliver, because recall rarely drops far. The axis is now floored just below the lowest point in the series — but never zooms past 50%, so a shallow dip cannot be dramatised into a collapse, and both bounds are labelled so a floored axis can't be mistaken for a full one.

**The evidence-quality indicator** (§9.4) distinguishes a measurement from a guess. A strength bar backed by exam marks renders solid; one resting on self-ratings alone renders as a hollow outline with a faded fill, and its tooltip says which. The memory-details panel spells it out: *"Measured against real exam marks — 3 reviews, 1 exam question, 1 mistake."*

That quietly teaches the thing worth teaching: logging papers question-by-question makes the app's advice better, and the UI now shows the difference rather than presenting a guess and a measurement with identical authority.

### Phase 1, as built

It turned out not to be a *pure* refactor. `replayRecord()` already existed for the sync merge, but the live path and the replay path were two separate implementations that disagreed on one term: `saveTopicStudied` and `simulateGrade` computed stability from `effectiveD(name)` — difficulty inflated by the current, recency-decayed mistake load — while `replayRecord` used the record's own `D`.

That made stored `S` a function of device-local, time-varying state that the log does not record. Two devices with identical review histories but different mistake-sync timing could hold different `S`, and no replay could ever reproduce what the live path had written. Fixing it means **`S` now grows very slightly faster after a review on a topic with recent mistakes than it used to** — the mistake penalty moves to its own properly-dated channel in phase 2 instead of leaking in through difficulty.

Verified: the modal's per-grade forecast is now bit-identical to what Save writes for all five grades (it previously shared the same contaminated term, so it agreed by luck rather than construction), and a six-review history including a lapse replays to the stored record exactly.

`scripts/fsrs-replay-test.mjs` runs 500 randomised histories and is wired into `npm test`, `scripts/deploy.sh` and CI. It asserts order-independence under the `(date,id)` sort that sync depends on, purity of `applyReview`, and — structurally — that all three call sites delegate rather than keeping a second copy of the model. It was mutation-tested against three regressions (a re-inlined step in `saveTopicStudied`, a reintroduced `effectiveD`, and a hidden accumulator); all three are caught.

---

*Sources: [Newman's Error Analysis (ERIC)](https://files.eric.ed.gov/fulltext/EJ1488529.pdf) · [A technical explanation of FSRS](https://expertium.github.io/Algorithm.html) · [srs-benchmark](https://github.com/open-spaced-repetition/srs-benchmark)*
