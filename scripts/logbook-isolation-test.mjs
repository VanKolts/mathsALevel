#!/usr/bin/env node
/* Logbook isolation — the one load-bearing claim of the logbook feature:
   *only the built-in A-Level logbook reaches the memory engine.*

   There are exactly two doors from the mistake list into FSRS — mistakeEventsByTopic()
   (the stability channel) and mistakeLoad() (the soft nudge to target retention). Both
   are extracted from index.html and executed here rather than reimplemented, so this
   cannot drift from the code it checks.

   The hostile case is deliberate. Every custom-logbook entry below carries a *valid topic
   name*, which no entry the UI writes ever does. If the gate were `!m.topic` the isolation
   would hold by accident today and break silently the day a logbook gains a label field;
   these fixtures fail against that version.

   Point it at a modified copy to check an assertion really fails:
     node scripts/logbook-isolation-test.mjs /tmp/broken.html                            */
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import vm from 'node:vm';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const TARGET = process.argv[2] || join(ROOT, 'index.html');
const html = readFileSync(TARGET, 'utf8');

const grabFn = n => {
  const m = html.match(new RegExp(`^function ${n}\\([\\s\\S]*?\\n\\}`, 'm'));
  if(!m) throw new Error(`could not extract ${n}() from index.html`); return m[0];
};
const grabLine = (kw,n) => {
  const m = html.match(new RegExp(`^${kw} ${n}\\s*=[^\\n]*$`, 'm'));
  if(!m) throw new Error(`could not extract ${kw} ${n}`); return m[0];
};
const grabBlock = n => {
  const m = html.match(new RegExp(`^const ${n}\\s*=\\s*\\{[\\s\\S]*?\\n\\};`, 'm'));
  if(!m) throw new Error(`could not extract const ${n}`); return m[0];
};

const TODAY = '2026-09-19';
const source = [
  grabConstLine('FSRS_W'), grabConstLine('DECAY'), grabConstLine('FACTOR'),
  grabConstLine('DIFF_D_SEED'), grabConstLine('MAX_INTERVAL'),
  grabBlock('MISTAKE_EVIDENCE'), grabConstLine('MISTAKE_EVIDENCE_DEFAULT'),
  grabBlock('MISTAKE_SEVERITY'), grabConstLine('MISTAKE_TAU'), grabConstLine('EV_PAPER'),
  grabLine('const','MK_MAIN'),
  grabLine('var','_dayCache'), grabFn('_dayMs'),
  grabLine('var','_mlCache'),
  'var _mistIdx=null;',
  grabFn('clamp'), grabFn('daysDiff'), grabFn('forgetting'), grabFn('ratingEase'),
  grabFn('initialStability'), grabFn('initialDifficulty'), grabFn('nextDifficulty'),
  grabFn('stabilityAfterRecall'), grabFn('stabilityAfterLapse'),
  grabFn('applyReview'), grabFn('applyMistake'), grabFn('paperRating'), grabFn('applyPaper'),
  grabFn('buildTimeline'), grabFn('replayTimeline'),
  // ---- the three under test ----
  grabFn('mkColOf'), grabFn('mistakeEventsByTopic'), grabFn('mistakeLoad'),
  // ---- stubs for what the app supplies but this suite is not testing ----
  // today() is memoised off Date.now() and a test-mode offset; pin it so the recency decay
  // inside mistakeLoad() is a fixed number rather than one that changes tomorrow.
  `function today(){ return '${TODAY}'; }`,
  'function invalidateMemory(){ _mistIdx=null; }',
  'var allTopics=[{name:"T",diff:2},{name:"U",diff:2}];',
  'function topicByName(n){ return allTopics.find(function(t){return t.name===n;}); }',
  'var mistakes=[];',
  'function setMistakes(ms){ mistakes=ms; _mistIdx=null; _mlCache=Object.create(null); _mlDay=""; }',
].join('\n');

function grabConstLine(n){ return grabLine('const', n); }

const ctx = vm.createContext({ Math, Date, isFinite, parseInt, String });
vm.runInContext(source, ctx);
const { mistakeEventsByTopic, mistakeLoad, setMistakes, replayTimeline, mkColOf } = ctx;

let pass=0, fail=0; const fails=[];
const check=(ok,label)=>{ ok?pass++:(fail++,fails.push(label)); };

const REVIEWS=[{id:'r1',date:'2026-06-01',grade:4}];
/* Every custom entry carries topic "T" — a real topic, the same one the A-Level entry uses.
   Nothing but the `col` field distinguishes them. */
const MAIN  = {id:'m0', topic:'T', cat:'Concept gap', severity:5, date:'2026-09-10'};
const UKMT  = n => ({id:'u'+n, col:'ukmt', topic:'T', cat:'Concept gap', severity:5, date:'2026-09-1'+n});
const NINE  = [UKMT(0),UKMT(1),UKMT(2),UKMT(3),UKMT(4),UKMT(5),UKMT(6),UKMT(7),UKMT(8)];

/* ---- 1. a custom logbook contributes no stability evidence ---------------- */
{
  setMistakes(NINE.slice());
  const idx=mistakeEventsByTopic();
  check(!idx['T'] || idx['T'].length===0,
    'nine custom-logbook entries on topic T produce no timeline events');
}

/* ---- 2. ...and no soft load either ---------------------------------------- */
{
  setMistakes(NINE.slice());
  check(mistakeLoad('T')===0,
    'nine custom-logbook entries on topic T produce zero mistake load');
}

/* ---- 3. the A-Level logbook is untouched by the gate ---------------------- */
{
  setMistakes([MAIN]);
  check((mistakeEventsByTopic()['T']||[]).length===1, 'an A-Level mistake still produces its event');
  check(mistakeLoad('T')>0, 'an A-Level mistake still produces load');
}

/* ---- 4. a record written before logbooks existed is A-Level --------------- */
{
  const legacy={id:'old', topic:'T', cat:'Method error', severity:3, date:'2026-08-01'};
  check(mkColOf(legacy)==='alevel', 'an absent col reads as the built-in logbook');
  setMistakes([legacy]);
  check((mistakeEventsByTopic()['T']||[]).length===1,
    'a pre-logbook record still reaches the engine — no migration needed');
}

/* ---- 5. end to end: memory is identical with and without the custom log ---- */
{
  setMistakes([MAIN]);
  const alone=replayTimeline('T',REVIEWS,mistakeEventsByTopic()['T']);
  setMistakes([MAIN].concat(NINE));
  const withUkmt=replayTimeline('T',REVIEWS,mistakeEventsByTopic()['T']);
  check(alone.S===withUkmt.S && alone.D===withUkmt.D && alone.last===withUkmt.last
        && alone.lapses===withUkmt.lapses,
    'replayed memory is bit-identical whether or not nine UKMT entries exist');
  // And the same nine tagged to the A-Level logbook must move it — otherwise assertion 5
  // would pass against an engine that simply ignores mistakes.
  setMistakes([MAIN].concat(NINE.map(m=>{ const c=Object.assign({},m); delete c.col; return c; })));
  const asAlevel=replayTimeline('T',REVIEWS,mistakeEventsByTopic()['T']);
  check(asAlevel.S < alone.S,
    'the control: the same nine, untagged, do move memory — so assertion 5 means something');
}

/* ---- 6. one logbook cannot leak into another topic's load ----------------- */
{
  setMistakes([{id:'x', col:'ukmt', topic:'U', cat:'Concept gap', severity:5, date:'2026-09-18'}]);
  check(mistakeLoad('U')===0, 'a custom entry on a second topic is invisible there too');
}

/* ---- 7. moving an entry between logbooks is exactly reversible -----------
   The claim the UI makes when you change an entry's logbook. It holds only because memory is
   *derived*: nothing is mutated when a mistake is logged, so removing the event and replaying
   reproduces the earlier state bit for bit rather than approximately undoing it. If stored
   state were advanced in place this assertion could not pass, and a move would have to be a
   one-way door. */
{
  const eq=(a,b)=>a.S===b.S && a.D===b.D && a.last===b.last && a.lapses===b.lapses && a.reps===b.reps;
  const rec = () => { const e=mistakeEventsByTopic(); return replayTimeline('T',REVIEWS,e['T']); };

  setMistakes([]);                       const never   = rec();
  setMistakes([MAIN]);                   const logged  = rec();
  check(!eq(never,logged), 'the control: logging it on T does move T (else the rest proves nothing)');

  // move out: same id, same date, same category — only the logbook changes
  setMistakes([Object.assign({},MAIN,{col:'ukmt'})]);
  check(eq(rec(),never), 'moved out of A-Level, T reads exactly as if it had never been logged');

  // and back
  setMistakes([Object.assign({},MAIN)]);
  check(eq(rec(),logged), 'moved back in, T reads exactly as it did before the move');

  // custom to custom touches nothing
  setMistakes([Object.assign({},MAIN,{col:'olympiad'})]);
  check(eq(rec(),never), 'a move between two custom logbooks leaves the engine where it was');
}

/* ---- 8. retagging within A-Level moves the evidence, it does not copy it -- */
{
  const onT=Object.assign({},MAIN,{topic:'T'});
  const onU=Object.assign({},MAIN,{topic:'U'});
  setMistakes([onT]);
  const idxT=mistakeEventsByTopic();
  check((idxT['T']||[]).length===1 && (idxT['U']||[]).length===undefined||!(idxT['U']||[]).length,
    'while on T, only T carries the event');
  setMistakes([onU]);
  const idxU=mistakeEventsByTopic();
  check(!(idxU['T']||[]).length && (idxU['U']||[]).length===1,
    'retagged to U, T loses the event and U gains it — one event, not two');
}

/* ---- 9. the logbook list is wired into sync as a LIST, not a blob --------
   Two separate facts, and losing either is silent. Out of SYNC_KEYS and the list never
   travels, so a synced record points at a logbook the other device cannot name. In
   SYNC_KEYS but out of LIST_KINDS and it merges as a scalar under last-write-wins, which
   drops one of two logbooks created on two devices the same evening - the exact failure
   record-level merging exists to prevent. Read off the source, because there is nothing
   to execute: both are literal table entries. */
{
  const syncKeys = html.match(/var SYNC_KEYS=\[[\s\S]*?\];/);
  check(!!syncKeys && syncKeys[0].includes("'alevel-mistake-logbooks-v1'"),
    'the logbook list is in SYNC_KEYS, so it travels with the records that point at it');
  const listKinds = html.match(/var LIST_KINDS=\{[\s\S]*?\};/);
  check(!!listKinds && /'alevel-mistake-logbooks-v1'\s*:\s*'logbooks'/.test(listKinds[0]),
    'it merges through mergeList as kind "logbooks", not as a last-write-wins blob');
}

console.log('\nLogbook isolation — only the A-Level logbook reaches the engine\n');
fails.forEach(f=>console.log('  FAIL  '+f));
if(!fail) console.log('  ok   all '+pass+' assertions passed\n');
else { console.log('\n  '+fail+' of '+(pass+fail)+' failed\n'); process.exit(1); }
