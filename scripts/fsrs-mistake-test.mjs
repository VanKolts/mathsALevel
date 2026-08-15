#!/usr/bin/env node
/* Phase 2 of docs/fsrs-evidence-model.md — mistakes as dated observations on the
   same timeline as reviews.
   Like the phase 1 suite, the engine is extracted from index.html and executed
   rather than reimplemented, so this cannot drift from the code it checks. */
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
const grabConst = n => {
  const m = html.match(new RegExp(`^const ${n}\\s*=[^\\n]*$`, 'm'));
  if(!m) throw new Error(`could not extract const ${n}`); return m[0];
};
// MISTAKE_EVIDENCE spans several lines
const grabBlock = n => {
  const m = html.match(new RegExp(`^const ${n}\\s*=\\s*\\{[\\s\\S]*?\\n\\};`, 'm'));
  if(!m) throw new Error(`could not extract const ${n}`); return m[0];
};

const source = [
  grabConst('FSRS_W'), grabConst('DECAY'), grabConst('FACTOR'), grabConst('DIFF_D_SEED'),
  grabConst('MAX_INTERVAL'), grabBlock('MISTAKE_EVIDENCE'), grabConst('MISTAKE_EVIDENCE_DEFAULT'),
  grabConst('EV_PAPER'),
  grabFn('clamp'), grabFn('daysDiff'), grabFn('forgetting'), grabFn('ratingEase'),
  grabFn('initialStability'), grabFn('initialDifficulty'), grabFn('nextDifficulty'),
  grabFn('stabilityAfterRecall'), grabFn('stabilityAfterLapse'),
  grabFn('applyReview'), grabFn('applyMistake'), grabFn('paperRating'), grabFn('applyPaper'),
  grabFn('buildTimeline'), grabFn('replayTimeline'),
  // replayTimeline resolves topic difficulty through allTopics
  'var allTopics=[{name:"T",diff:2}];',
].join('\n');

const ctx = vm.createContext({ Math, Date, isFinite, parseInt });
vm.runInContext(source, ctx);
const { applyMistake, replayTimeline, forgetting, daysDiff } = ctx;
// `const` declarations create lexical bindings that never appear on the context
// object, unlike function declarations — so read it back as an expression.
const MISTAKE_EVIDENCE = vm.runInContext('MISTAKE_EVIDENCE', ctx);

let pass=0, fail=0; const fails=[];
const check=(ok,label)=>{ ok?pass++:(fail++,fails.push(label)); };
const near=(a,b,eps=1e-9)=>Math.abs(a-b)<eps;

const REVIEWS=[{id:'r1',date:'2026-06-01',grade:4}];
const mk=(date,cat,id)=>({date,id,E:MISTAKE_EVIDENCE[cat]});

/* ---- 1. a mistake must not reset the clock ------------------------------- */
{
  const base=replayTimeline('T',REVIEWS,[]);
  const after=replayTimeline('T',REVIEWS,[mk('2026-06-20','Concept gap','m1')]);
  check(after.last===base.last,
    'a mistake reset `last` — memory % would jump to ~100% on logging a mistake');
  check(after.S<base.S, 'a concept gap did not reduce stability');
  check(after.D>base.D, 'a concept gap did not raise difficulty');
}

/* ---- 2. category, not severity, sets how many it takes -------------------
   Measured on a *mature* topic (two spaced reviews -> S ~= 23d), which is the case
   the design table describes. On a freshly-seeded topic S is only ~4d, and every
   category bites proportionally harder — correct behaviour, since a topic you have
   seen once really is that fragile, but not the case these thresholds describe. */
{
  const MATURE=[{id:'r1',date:'2026-05-20',grade:4},{id:'r2',date:'2026-05-25',grade:4}];
  const at=(cat,n)=>{
    const ms=[]; for(let i=0;i<n;i++) ms.push(mk('2026-06-'+String(1+i).padStart(2,'0'),cat,'m'+i));
    const rec=replayTimeline('T',MATURE,ms);
    return forgetting(Math.max(0,daysDiff(rec.last,'2026-06-10')),rec.S);
  };
  const clean=(()=>{const r=replayTimeline('T',MATURE,[]);
    return forgetting(Math.max(0,daysDiff(r.last,'2026-06-10')),r.S);})();
  const gap1=at('Concept gap',1), meth1=at('Method error',1), meth3=at('Method error',3);
  const silly5=at('Silly mistake',5);

  check(gap1 < meth3, 'one concept gap should bite harder than three method errors');
  check(meth1 > meth3, 'method errors must compound');
  check(clean-gap1 > 0.08, 'one concept gap barely moved memory — it should drop a lot');
  check(clean-silly5 < 0.03, `five silly mistakes cost ${((clean-silly5)*100).toFixed(1)} points — they are noise and should barely register`);
  // scale-free: whatever the starting stability, noise must stay far below a real gap
  check((clean-silly5) < 0.25*(clean-gap1),
    'five silly mistakes cost more than a quarter of one concept gap');
}

/* ---- 3. recovery is real: a good review after a mistake heals it ---------- */
{
  const hurt=replayTimeline('T',REVIEWS,[mk('2026-06-10','Concept gap','m1')]);
  const healed=replayTimeline('T',
    REVIEWS.concat([{id:'r2',date:'2026-06-20',grade:5}]),
    [mk('2026-06-10','Concept gap','m1')]);
  check(healed.S>hurt.S,
    'a later strong review did not recover stability — recovery must come from the timeline, not a decay term');
}

/* ---- 4. ordering: same-day mistake is applied after the review ------------ */
{
  const a=replayTimeline('T',[{id:'r1',date:'2026-06-01',grade:4}],[mk('2026-06-01','Concept gap','m1')]);
  const b=replayTimeline('T',[{id:'r1',date:'2026-06-01',grade:4}],[mk('2026-06-01','Concept gap','m1')]);
  check(near(a.S,b.S), 'same-day ordering is not deterministic');
  const reviewOnly=replayTimeline('T',[{id:'r1',date:'2026-06-01',grade:4}],[]);
  check(a.S<reviewOnly.S, 'a same-day mistake had no effect — it was applied before the review');
}

/* ---- 5. order-independence of the input arrays (sync depends on it) ------- */
{
  const ms=[mk('2026-06-05','Method error','m1'),mk('2026-06-12','Silly mistake','m2'),
            mk('2026-06-19','Concept gap','m3')];
  const revs=REVIEWS.concat([{id:'r2',date:'2026-06-15',grade:3}]);
  const ref=replayTimeline('T',revs,ms);
  let ok=true;
  const perms=[[2,0,1],[1,2,0],[2,1,0],[0,2,1]];
  for(const p of perms){
    const shuffled=p.map(i=>ms[i]);
    const got=replayTimeline('T',revs.slice().reverse(),shuffled);
    if(!near(got.S,ref.S)||!near(got.D,ref.D)) ok=false;
  }
  check(ok,'replayTimeline is not order-independent — two devices could settle on different S');
}

/* ---- 6. a mistake before any review is a no-op ---------------------------- */
{
  const r=replayTimeline('T',REVIEWS,[mk('2026-01-01','Concept gap','m0')]);
  const base=replayTimeline('T',REVIEWS,[]);
  check(near(r.S,base.S),'a mistake predating every review changed state — there is no estimate to revise yet');
}

/* ---- 7. stability floor holds under a pile of mistakes ------------------- */
{
  const ms=[]; for(let i=0;i<60;i++) ms.push(mk('2026-07-'+String(1+(i%28)).padStart(2,'0'),'Concept gap','m'+i));
  const r=replayTimeline('T',REVIEWS,ms);
  check(r&&isFinite(r.S)&&r.S>=0.1,'stability floor breached under repeated mistakes');
  check(r&&r.D<=10&&r.D>=1,'difficulty escaped [1,10]');
}

/* ---- 8. structural: sr[] must stay reviews-only -------------------------- */
{
  const src=grabFn('applyMistake');
  check(/last:rec\.last/.test(src),'applyMistake() must carry `last` through unchanged');
  check(!/effectiveD|mistakeLoad/.test(src),'applyMistake() reads mistake load — it must take E as an argument');
  const save=grabFn('saveTopicStudied');
  check(!/memoryFor|applyMistake/.test(save),
    'saveTopicStudied() writes mistake-derived state into sr[] — sr[] must stay a pure function of the review log for sync replay');
}

console.log(`\nFSRS mistake-evidence invariants\n`);
if(fail===0){
  console.log('  ok  a mistake revises memory without resetting the clock');
  console.log('  ok  category sets how many it takes (gap 1, method ~3, silly ~never)');
  console.log('  ok  recovery comes from a later review, not a decay term');
  console.log('  ok  same-day mistake observes the post-review state');
  console.log('  ok  timeline replay is order-independent');
  console.log('  ok  pre-first-review mistakes are no-ops; floors hold');
  console.log('  ok  sr[] stays reviews-only, so sync replay is unaffected');
  console.log(`\n  ${pass} assertions passed.\n`);
} else {
  console.error(`  FAILED ${fail} of ${pass+fail} assertions:\n`);
  for(const f of fails) console.error('    - '+f);
  process.exit(1);
}
