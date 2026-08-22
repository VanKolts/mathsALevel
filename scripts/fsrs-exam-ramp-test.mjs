#!/usr/bin/env node
/* Exam-ramp invariants.
 *
 * The ramp is the one part of the scheduler that is a function of the *calendar* rather
 * than of the review log, which is why it went wrong quietly and stayed wrong: nothing in
 * the app looks different on any single day, and the app is younger than its own exam
 * timetable, so the failure window had not arrived yet.
 *
 * Shipped 2026-08-22 after `examDateForComponent()` was found returning the earliest paper
 * for a component whether or not it had been sat. Two consequences, both fixed and both
 * pinned here:
 *   - once every paper had passed the target retention stuck at MAX_RETENTION forever
 *     (measured 723 days after the exam, still demanding 96.7%);
 *   - between two papers examining the same component, the passed one still won, so the
 *     fortnight between Pure 1 and Pure 2 was frozen at the ceiling instead of ramping
 *     toward the paper actually next.
 *
 * As with the other suites the functions are pulled out of index.html and executed rather
 * than reimplemented, so this cannot drift away from the code it checks.
 */
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import vm from 'node:vm';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const TARGET = process.argv[2] || join(ROOT, 'index.html');
const html = readFileSync(TARGET, 'utf8');

function grab(re, what){
  const m = html.match(re);
  if(!m) throw new Error(`could not extract ${what} from index.html`);
  return m[0];
}
/* Half the date helpers are written as one-liners (`function ymd(d){ return …; }`), and the
   lazy multi-line pattern runs straight past those to the next `}` at column 0, dragging a
   few hundred unrelated lines in with them. Try the single-line shape first. */
const grabFn = n => {
  const one = html.match(new RegExp(`^function ${n}\\([^\\n]*\\}[^\\n]*$`, 'm'));
  return one ? one[0] : grab(new RegExp(`^function ${n}\\([\\s\\S]*?\\n\\}`, 'm'), `function ${n}()`);
};
const grabConst = n => grab(new RegExp(`^const ${n}\\s*=[^\\n]*$`, 'm'),          `const ${n}`);
const grabVar   = n => grab(new RegExp(`^var ${n}\\s*=[^\\n]*$`, 'm'),            `var ${n}`);
const grabObj   = n => grab(new RegExp(`^const ${n} = \\{[\\s\\S]*?\\n\\};`, 'm'), `const ${n}`);

/* ---- the calendar half of the scheduler, lifted out of the page ---------- */
const source = [
  grabConst('BASE_RETENTION'), grabConst('MAX_RETENTION'), grabConst('EXAM_RAMP_DAYS'),
  grabConst('MISTAKE_RET_WEIGHT'),
  grabObj('EXAM_PAPERS'),
  grabVar('_dayCache'), grabFn('_dayMs'), grabFn('ymd'), grabFn('clamp'),
  grabFn('daysDiff'), grabFn('addDays'),
  grabFn('_examSig'), grabFn('activePapers'),
  grabFn('examDateForComponent'), grabFn('examDateForTopic'),
  grabFn('targetRetention'),
  // Stubs for everything the above reaches that is not part of what we are testing.
  // Kept deliberately dumb: a stub with behaviour is a second implementation.
  `var _apRemoteV=0, _apSig=null, _apVal=null, _edcSig=null, _edcVal=null;`,
  `var TODAY='2026-08-22';`,
  `function today(){ return TODAY; }`,
  `var localStorage={getItem:function(){return null;}};`,
  `var fmOptions=new Set();`,
  `var TRACK='alevel';   function getTrack(){ return TRACK; }`,
  `var EXAM_OFF=false;   function getExamOff(){ return EXAM_OFF; }`,
  `var LEGACY='';        function getExamDate(){ return LEGACY; }`,
  `var _pdVal={};        function getPaperDates(){ return _pdVal; }`,
  `var _remote=null;     function paperDate(p){ return p.date; }`,
  `function topicByName(n){ return TOPICS[n]; }`,
  // 'fm topic' is a component with no paper on the A-Level track, which is how the legacy
  // single-date fallback is reached without inventing a fake track.
  `var TOPICS={ 'pure topic':{component:'pure'}, 'stats topic':{component:'stats'},`
  + ` 'fm topic':{component:'corepure'} };`,
  `function mistakeLoad(){ return 0; }`,
  `function effectiveD(){ return 5; }`,
  // const/let stay in the script's lexical scope and never become properties of the context,
  // so anything the assertions read back has to be handed out through a var.
  `var __out={EXAM_PAPERS:EXAM_PAPERS, BASE_RETENTION:BASE_RETENTION,`
  + ` MAX_RETENTION:MAX_RETENTION, EXAM_RAMP_DAYS:EXAM_RAMP_DAYS};`,
].join('\n');

const ctx = vm.createContext({ Math, Date, isFinite, parseInt, Set, Object, JSON, console });
vm.runInContext(source, ctx);

const at = d => { ctx.TODAY = d; };
const R  = name => ctx.targetRetention(name);
const BASE = ctx.__out.BASE_RETENTION, MAX = ctx.__out.MAX_RETENTION, RAMP = ctx.__out.EXAM_RAMP_DAYS;

let pass=0, fail=0; const fails=[];
const check=(ok,label)=>{ ok?pass++:(fail++,fails.push(label)); };
const near=(a,b)=>Math.abs(a-b)<1e-9;

/* The A-Level track, from the shipped timetable: Pure on 26 May and again on 9 June,
   Stats/Mechanics on 16 June. Read off EXAM_PAPERS so this test tracks the real dates. */
const AL = ctx.__out.EXAM_PAPERS.alevel;
const P1 = AL[0].date, P2 = AL[1].date, P3 = AL[2].date;
const minus = (d,n) => ctx.addDays(d,-n);

/* ---- 1. outside the run-in the ramp is not engaged ----------------------- */
at(minus(P1, RAMP+1));
check(near(R('pure topic'), BASE), `at ${RAMP+1}d out the target should be BASE, got ${R('pure topic')}`);
at(minus(P1, RAMP));
check(near(R('pure topic'), BASE), `at exactly ${RAMP}d out the target should still be BASE`);

/* ---- 2. inside it, it climbs monotonically to the ceiling ---------------- */
let prev = -Infinity, monotonic = true;
for(let d=RAMP-1; d>=0; d--){
  const r = (at(minus(P1,d)), R('pure topic'));
  if(r < prev - 1e-12) monotonic = false;
  prev = r;
}
check(monotonic, 'target retention should never fall as the exam approaches');
at(minus(P1,1));
check(R('pure topic') > BASE && R('pure topic') < MAX, 'the day before the exam should sit between BASE and MAX');
at(P1);
check(near(R('pure topic'), MAX), `on exam morning the target should be MAX, got ${R('pure topic')}`);

/* ---- 3. THE BUG: a component with a later paper ramps toward that one ----- */
/* Pure is examined twice. Between the two papers the old code answered P1 — passed, so
   pinned at the ceiling — instead of ramping toward P2. */
at(ctx.addDays(P1,1));
check(ctx.examDateForComponent('pure')===P2,
  `the day after Pure 1, the Pure ramp should target Pure 2 (${P2}), got ${ctx.examDateForComponent('pure')}`);
check(R('pure topic') < MAX,
  'between Pure 1 and Pure 2 the target must come off the ceiling — that fortnight is when the ramp should steer');
at(P2);
check(near(R('pure topic'), MAX), 'on Pure 2 morning the target should be back at MAX');

/* ---- 4. THE BUG: once every paper has been sat, the ramp lets go ---------- */
for(const days of [1, 30, 123, 423, 723, 1000]){
  at(ctx.addDays(P3, days));
  check(ctx.examDateForComponent('pure')==='',  `${days}d after the last paper, Pure should have no exam date`);
  check(ctx.examDateForComponent('stats')==='', `${days}d after the last paper, Stats should have no exam date`);
  check(near(R('pure topic'), BASE),
    `${days}d after the last paper the target should be back to BASE (${BASE}), got ${R('pure topic')} — this is the bug that pinned it at ${MAX} forever`);
}

/* ---- 5. each component ramps toward its own paper, not the soonest -------- */
at(minus(P1, 5));   // deep inside Pure's run-in, still 40+ days from the Stats paper
check(ctx.examDateForComponent('stats')===P3, 'Stats should target the Stats paper, not whichever exam is first');
check(R('pure topic') > R('stats topic'), 'with Pure imminent and Stats weeks away, Pure should demand the higher target');

/* ---- 6. the legacy single date gets the same treatment -------------------- */
/* It is a fallback for stores predating per-paper dates. A fallback that has passed is not
   a fallback, and it reached targetRetention() by a different path, so it needed its own fix. */
ctx.LEGACY='2027-01-15';
at('2027-01-10');
check(ctx.examDateForTopic('fm topic')==='2027-01-15', 'a legacy exam date still ahead should be used');
at('2027-01-16');
check(ctx.examDateForTopic('fm topic')==='', 'a legacy exam date that has passed must not keep the ramp engaged');
check(ctx.targetRetention('fm topic')===BASE, 'a passed legacy date must leave the target at BASE');
ctx.LEGACY='';

/* ---- 7. "exam dates off" wins over everything ----------------------------- */
ctx.EXAM_OFF=true;
at(minus(P1,1));
check(ctx.examDateForTopic('pure topic')==='', 'with exam dates off there should be no exam date at all');
check(near(R('pure topic'), BASE), 'with exam dates off the target should be BASE the day before the exam');
ctx.EXAM_OFF=false;

/* ---- 8. the memo cannot outlive the day it was computed on ---------------- */
/* examDateForComponent() is memoised, and its answer now depends on today(). Before the fix
   the signature had no day in it, so a tab left open across midnight — or the test clock
   moving — would keep answering with yesterday's paper. */
at(minus(P1,1));
const before = ctx.examDateForComponent('pure');
at(ctx.addDays(P1,1));
const after  = ctx.examDateForComponent('pure');
check(before===P1 && after===P2,
  `the memo must invalidate when the day changes: got ${before} then ${after}, expected ${P1} then ${P2}`);
check(/today\(\)/.test(ctx._examSig.toString()),
  '_examSig() must include today(), or both exam caches can strand on a stale day');

/* ---- report --------------------------------------------------------------- */
console.log(`\nExam-ramp invariants\n`);
if(fail===0){
  console.log(`  ok  the ramp is idle outside the ${RAMP}-day run-in`);
  console.log(`  ok  inside it, the target climbs monotonically to the ceiling`);
  console.log(`  ok  a component with a later paper ramps toward that one, not the paper just sat`);
  console.log(`  ok  once every paper is sat the ramp lets go — no permanent ${MAX} pin`);
  console.log(`  ok  each component tracks its own paper, not whichever exam is soonest`);
  console.log(`  ok  a passed legacy exam date does not keep the ramp engaged`);
  console.log(`  ok  "exam dates off" overrides all of it`);
  console.log(`  ok  the memo carries the day, so it cannot answer with yesterday's paper`);
  console.log(`\n  ${pass} assertions passed.\n`);
} else {
  console.error(`  FAILED ${fail} of ${pass+fail} assertions:\n`);
  for(const f of fails.slice(0,12)) console.error('    - '+f);
  process.exit(1);
}
