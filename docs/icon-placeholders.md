# Icon placeholders

Every emoji was removed from the app on **2026-08-17**. Each one left a placeholder naming
the icon that belongs there, so nothing has to be rediscovered when the real icons exist.

```html
<i class="ico" data-icon="camera" aria-hidden="true"></i>
```

**Find them three ways**

| | |
|---|---|
| In the source | `grep -n 'data-icon' index.html` — and `grep -n "ico('" index.html` for the ones built in JS |
| In the console | `document.querySelectorAll('.ico')` |
| On screen | add `?icons` to the URL, or set `localStorage['msh-show-icons']='1'` — every placeholder outlines itself in place |

**Two kinds.** Most render as *nothing*, so the app looks finished today. A few marked
`ico-live` sit where the emoji **was** the control — the favourite heart, the note marker —
and draw a small neutral box instead, because rendering nothing would remove the affordance.
Those also carry `data-state="on|off"`.

**To replace one:** swap the `<i>` for your SVG and delete its row here. `ico(name, extra, state)`
in `index.html` is the single place the markup is generated for the JS-built ones.

> **Line numbers go stale fast.** This file is generated — regenerate it rather than editing
> by hand, or trust the icon names and `grep` for them instead. Last generated against a
> 8071-line `index.html`.

---

## By icon

### `bolt`  — was ⚡

- `index.html:232` — Quick log

### `book`  — was 📖

- `index.html:194` — Learning — for working through topics from scratch
- `index.html:340` — Glossary

### `calendar`  — was 📅

- `index.html:105` — Revision plan
- `index.html:1156` — Revision plan Exam dates per paper, and the plan they drive

### `camera`  — was 📷 / 📸

- `index.html:233` — Detailed log
- `index.html:259` — Add a photo of the question
- `index.html:804` — 
- `index.html:1008` — Click or drop image
- `index.html:2389` — function tutorResetUploader(){ var up=document.getElementById('tutor-uploader'

### `celebrate`  — was 🎉

- `index.html:911` — 
- `index.html:4256` — if(!focus.length) html+=' All caught up for this paper ';

### `chart`  — was 📈

- `index.html:342` — Performance

### `clipboard`  — was 📋

- `index.html:6380` — lnk(links.ms,'clipboard','MS (Stats)');
- `index.html:6381` — lnk(links.ms2,'clipboard','MS (Mech)');
- `index.html:6384` — lnk(links.ms,'clipboard','Mark scheme');

### `document`  — was 📄

- `index.html:6378` — lnk(links.qp,'document','QP (Stats)');
- `index.html:6379` — lnk(links.qp2,'document','QP (Mech)');
- `index.html:6383` — lnk(links.qp,'document','Question paper');

### `download`  — was ⬇

- `index.html:666` — Pull cloud → this device

### `external`  — was ↗

- `index.html:378` — Worksheets on PMT

### `favourite`  — was ♥ / ♡  · **live**

- `index.html:5319` — const starBtn=document.createElement('button');starBtn.className='fav-star-btn
- `index.html:5347` — starBtn.innerHTML=ico('favourite','ico-live',isFav?'on':'off');

### `graduation`  — was 🎓

- `index.html:343` — Grade Boundaries

### `note`  — was 📝  · **live**

- `index.html:171` — A note you saved on a topic
- `index.html:5248` — const ni=document.createElement('span');ni.className='note-indicator';ni.inner

### `pin`  — was 📍

- `index.html:934` — 

### `pomodoro`  — was 🍅

- `index.html:1157` — Focus timer Timed study sessions with your own presets

### `repeat`  — was 🔁

- `index.html:196` — Revision — for going back through and solidifying topics
- `index.html:211` — Re-attempt this

### `resources`  — was 📚

- `index.html:104` — Resources
- `index.html:1155` — Resources Hand-picked sites for learning and practice

### `rocket`  — was 🚀

- `index.html:945` — 

### `search`  — was 🔍

- `index.html:518` — 

### `sparkle`  — was ✨

- `index.html:223` — Explain with AI
- `index.html:382` — Practice question
- `index.html:1158` — AI Tutor Photograph a question, get a worked walkthrough
- `index.html:4597` — body.innerHTML=' Generate a practice question ';

### `target`  — was 🎯

- `index.html:4238` — if(focusPool.length) html+=' Today\'s focus '+focusPool.map(function(x){return

### `timer`  — was ⏱

- `index.html:6387` — var tb=document.createElement('button');tb.className='pp-act timer';tb.innerHT

### `tip`  — was 💡

- `index.html:5747` — html+=' Log a past paper question-by-question to see exact marks lost. For now
- `index.html:6386` — if(links.sol)lnk(links.sol,'tip','Worked solutions');

### `upload`  — was ⬆

- `index.html:665` — Push this device → cloud

### `warning`  — was ⚠

- `index.html:6607` — note.innerHTML=' Per-question data isn\'t available for this paper yet. Switch

### `wave`  — was 👋

- `index.html:924` — 

### `wrench`  — was 🔧

- `index.html:5745` — ' Your top 3 leaks alone are '+top3Lost+' marks — roughly '+jumps+' grade boun

---

## Not removed, deliberately

These are text glyphs the UI depends on, not decoration: `✕` (close), `✓` (tick), `×`
(multiplication / attempt count), `＋` (add), `ƒ` (the formula-sheet mark). One `↔` remains
inside a JS comment, where it is not user-facing.
