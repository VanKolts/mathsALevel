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

---

## By icon

### `bolt`  — was ⚡

- `index.html:175` — Quick log

### `book`  — was 📖

- `index.html:137` — Learning — for working through topics from scratch
- `index.html:302` — Glossary

### `calendar`  — was 📅

- `index.html:49` — Revision plan
- `index.html:1055` — Revision plan Exam dates per paper, and the plan they drive

### `camera`  — was 📷 / 📸

- `index.html:176` — Detailed log
- `index.html:202` — Add a photo of the question
- `index.html:708` — 
- `index.html:912` — Click or drop image
- `index.html:2240` — function tutorResetUploader(){ var up=document.getElementById('tutor-uploader'

### `celebrate`  — was 🎉

- `index.html:815` — 
- `index.html:3868` — if(!focus.length) html+=' All caught up for this paper ';

### `chart`  — was 📈

- `index.html:304` — Performance

### `clipboard`  — was 📋

- `index.html:5746` — lnk(links.ms,'clipboard','MS (Stats)');
- `index.html:5747` — lnk(links.ms2,'clipboard','MS (Mech)');
- `index.html:5750` — lnk(links.ms,'clipboard','Mark scheme');

### `document`  — was 📄

- `index.html:5744` — lnk(links.qp,'document','QP (Stats)');
- `index.html:5745` — lnk(links.qp2,'document','QP (Mech)');
- `index.html:5749` — lnk(links.qp,'document','Question paper');

### `download`  — was ⬇

- `index.html:577` — Pull cloud → this device

### `external`  — was ↗

- `index.html:340` — Worksheets on PMT

### `favourite`  — was ♥ / ♡

- `index.html:4720` — const starBtn=document.createElement('button');starBtn.className='fav-star-btn
- `index.html:4748` — starBtn.innerHTML=ico('favourite','ico-live',isFav?'on':'off');

### `graduation`  — was 🎓

- `index.html:305` — Grade Boundaries

### `note`  — was 📝

- `index.html:114` — A note you saved on a topic
- `index.html:4649` — const ni=document.createElement('span');ni.className='note-indicator';ni.inner

### `pin`  — was 📍

- `index.html:838` — 

### `pomodoro`  — was 🍅

- `index.html:1056` — Focus timer Timed study sessions with your own presets

### `repeat`  — was 🔁

- `index.html:139` — Revision — for going back through and solidifying topics
- `index.html:154` — Re-attempt this

### `resources`  — was 📚

- `index.html:48` — Resources
- `index.html:1054` — Resources Hand-picked sites for learning and practice

### `rocket`  — was 🚀

- `index.html:849` — 

### `search`  — was 🔍

- `index.html:426` — 

### `shuffle`  — was 🎲

- `index.html:89` — Random
- `index.html:386` — Random Topic Picker

### `sparkle`  — was ✨

- `index.html:166` — Explain with AI
- `index.html:344` — Practice question
- `index.html:1057` — AI Tutor Photograph a question, get a worked walkthrough
- `index.html:4206` — body.innerHTML=' Generate a practice question ';

### `target`  — was 🎯

- `index.html:3850` — if(focusPool.length) html+=' Today\'s focus '+focusPool.map(function(x){return

### `timer`  — was ⏱

- `index.html:5753` — var tb=document.createElement('button');tb.className='pp-act timer';tb.innerHT

### `tip`  — was 💡

- `index.html:5134` — html+=' Log a past paper question-by-question to see exact marks lost. For now
- `index.html:5752` — if(links.sol)lnk(links.sol,'tip','Worked solutions');

### `upload`  — was ⬆

- `index.html:576` — Push this device → cloud

### `warning`  — was ⚠

- `index.html:5973` — note.innerHTML=' Per-question data isn\'t available for this paper yet. Switch

### `wave`  — was 👋

- `index.html:828` — 

### `wrench`  — was 🔧

- `index.html:5132` — ' Your top 3 leaks alone are '+top3Lost+' marks — roughly '+jumps+' grade boun

---

## Not removed, deliberately

These are text glyphs the UI depends on, not decoration: `✕` (close), `✓` (tick), `×`
(multiplication / attempt count), `＋` (add), `ƒ` (the formula-sheet mark). One `↔` remains
inside a JS comment, where it is not user-facing.
