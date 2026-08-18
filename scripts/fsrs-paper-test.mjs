#!/usr/bin/env node
/* Phase 3 of docs/fsrs-evidence-model.md — past-paper marks as graded rehearsals.
   Engine extracted from index.html and executed, not reimplemented. */
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import vm from 'node:vm';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const TARGET = process.argv[2] || join(ROOT, 'index.html');
const html = readFileSync(TARGET, 'utf8');

const grabFn = n => {
  const m = html.match(new RegExp(`^function ${n}\\([\\s\\S]*?\\n\\}`, 'm'));
  if(!m) throw new Error(`could not extract ${n}()`); return m[0];
};
const grabConst = n => {
  const m = html.match(new RegExp(`^const ${n}\\s*=[^\\n]*$`, 'm'));
  if(!m) throw new Error(`could not extract const ${n}`); return m[0];
};
const grabBlock = n => {
  const m = html.match(new RegExp(`^const ${n}\\s*=\\s*\\{[\\s\\S]*?\\n\\};`, 'm'));
  if(!m) throw new Error(`could not extract const ${n}`); return m[0];
};

function grabVar(name){
  const re = new RegExp(`^var ${name}\\s*=[^\\n]*$`, 'm');
  const m = html.match(re);
  if(!m) throw new Error(`could not extract var ${name} from index.html`);
  return m[0];
}

const source = [
  grabConst('FSRS_W'), grabConst('DECAY'), grabConst('FACTOR'), grabConst('DIFF_D_SEED'),
  grabConst('MAX_INTERVAL'), grabBlock('MISTAKE_EVIDENCE'), grabConst('MISTAKE_EVIDENCE_DEFAULT'),
  grabConst('EV_PAPER'),
  grabVar('_dayCache'), grabFn('_dayMs'),   // one line, declares _dayCacheN too
  grabFn('clamp'), grabFn('daysDiff'), grabFn('forgetting'), grabFn('ratingEase'),
  grabFn('initialStability'), grabFn('initialDifficulty'), grabFn('nextDifficulty'),
  grabFn('stabilityAfterRecall'), grabFn('stabilityAfterLapse'),
  grabFn('applyReview'), grabFn('applyMistake'), grabFn('paperRating'), grabFn('applyPaper'),
  grabFn('buildTimeline'), grabFn('replayTimeline'),
  'var allTopics=[{name:"T",diff:2}];',
  'function topicByName(n){ return allTopics.find(function(t){return t.name===n;}); }',
].join('\n');

const ctx = vm.createContext({ Math, Date, isFinite, parseInt });
vm.runInContext(source, ctx);
const { replayTimeline, buildTimeline, paperRating, forgetting, daysDiff } = ctx;
const FACTOR = vm.runInContext('FACTOR', ctx), DECAY = vm.runInContext('DECAY', ctx);
const MISTAKE_EVIDENCE = vm.runInContext('MISTAKE_EVIDENCE', ctx);

let pass=0, fail=0; const fails=[];
const check=(ok,label)=>{ ok?pass++:(fail++,fails.push(label)); };
const near=(a,b,eps=1e-9)=>Math.abs(a-b)<eps;

const REVIEWS=[{id:'r1',date:'2026-05-20',grade:4},{id:'r2',date:'2026-05-25',grade:4}];
const paper=(date,got,max,k,id)=>({date,id,rating:paperRating(got/max),
  c:(got/max)+(1-got/max)/k,got,max,label:'2024 P1 Q'+id});
const mk=(date,cat,id)=>({date,id,E:MISTAKE_EVIDENCE[cat]});

/* ---- 1. the marks -> rating bands --------------------------------------- */
{
  const cases=[[0,1],[0.2,2],[0.39,2],[0.4,3],[0.69,3],[0.7,4],[0.94,4],[0.95,5],[1,5]];
  let ok=true; for(const [r,want] of cases) if(paperRating(r)!==want) ok=false;
  check(ok,'marks-ratio to rating banding is wrong');
}

/* ---- 2. a bad paper hurts, a good paper helps ---------------------------- */
{
  const base=replayTimeline('T',REVIEWS,[],[]);
  const bad =replayTimeline('T',REVIEWS,[],[paper('2026-06-01',0,6,1,'7')]);
  const good=replayTimeline('T',REVIEWS,[],[paper('2026-06-01',6,6,1,'7')]);
  check(bad.S<base.S,  'scoring 0/6 on a tagged question did not reduce stability');
  check(good.S>base.S, 'scoring 6/6 did not increase stability');
  check(bad.last==='2026-06-01' && good.last==='2026-06-01',
    'a paper question must reset the clock — it is a real retrieval attempt');
}

/* ---- 3. blame dilution: full marks confirm every topic, zero is ambiguous -- */
{
  const at=(got,max,k)=>replayTimeline('T',REVIEWS,[],[paper('2026-06-01',got,max,k,'7')]).S;
  const base=replayTimeline('T',REVIEWS,[],[]).S;
  // full marks: identical however many topics share the question
  check(near(at(6,6,1),at(6,6,3)),
    'full marks were diluted by topic count — a full-mark answer confirms every topic on it');
  // zero marks: a 3-topic question must bite less than a 1-topic question
  const z1=at(0,6,1), z3=at(0,6,3);
  check(z3>z1, 'a zero on a 3-topic question hurt as much as on a 1-topic question');
  check(z1<base && z3<base, 'a zero should reduce stability at any k');
}

/* ---- 3b. a bad result must never help, at any topic count ----------------
   Regression: blending stability by c while still resetting the clock let a zero on a
   3-topic question RAISE predicted recall (91% -> 94%) and push the next review later,
   because the "you just looked at it" credit outweighed the diluted penalty. */
{
  const REF='2026-06-15';
  const recall=r=>forgetting(Math.max(0,daysDiff(r.last,REF)),r.S);
  const due=r=>{ const iv=(r.S/FACTOR)*(Math.pow(0.9,1/DECAY)-1); return daysDiff('2026-01-01',r.last)+iv; };
  const base=replayTimeline('T',REVIEWS,[],[]);
  for(const k of [1,2,3,4,5]){
    const zero=replayTimeline('T',REVIEWS,[],[paper('2026-06-01',0,6,k,'7')]);
    check(recall(zero)<=recall(base)+1e-9,
      `a zero on a ${k}-topic question raised predicted recall (${(recall(base)*100).toFixed(1)}% -> ${(recall(zero)*100).toFixed(1)}%)`);
    check(due(zero)<=due(base)+1e-9,
      `a zero on a ${k}-topic question pushed the next review later`);
  }
  // and a good result must never hurt
  for(const k of [1,2,3]){
    const good=replayTimeline('T',REVIEWS,[],[paper('2026-06-01',6,6,k,'7')]);
    check(good.S>=base.S-1e-9, `full marks on a ${k}-topic question reduced stability`);
  }
}

/* ---- 4. §12.2 floor: papers before the first review are ignored ----------- */
{
  const early=replayTimeline('T',REVIEWS,[],[paper('2026-01-01',0,6,1,'7')]);
  const base =replayTimeline('T',REVIEWS,[],[]);
  check(near(early.S,base.S),
    'a paper sat before the topic was ever studied changed memory — there is no estimate to refine');
  // and with no reviews at all there is no timeline
  check(replayTimeline('T',[],[],[paper('2026-06-01',0,6,1,'7')])===null,
    'papers alone seeded a topic — reviews are what start a topic');
}

/* ---- 5. double counting: a mistake off the same paper is not charged twice -- */
{
  const p=[paper('2026-06-01',1,6,1,'7')];
  const withMistake=replayTimeline('T',REVIEWS,[mk('2026-06-01','Concept gap','m1')],p);
  const paperOnly  =replayTimeline('T',REVIEWS,[],p);
  check(near(withMistake.S,paperOnly.S),
    'a mistake logged off the same paper charged stability a second time');
  check(withMistake.D>paperOnly.D,
    'the co-located mistake should still inform difficulty — its category is diagnostic');
  // a mistake well away from any paper still bites normally
  const far=replayTimeline('T',REVIEWS,[mk('2026-06-20','Concept gap','m1')],p);
  check(far.S<paperOnly.S,'a mistake unrelated to the paper stopped counting');
}

/* ---- 6. same-day precedence: paper before review before mistake ----------- */
{
  const evs=buildTimeline(
    [{id:'r1',date:'2026-06-01',grade:4}],
    [mk('2026-06-01','Concept gap','m1')],
    [paper('2026-06-01',3,6,1,'7')]);
  const kinds=evs.filter(e=>e.date==='2026-06-01').map(e=>e.kind);
  check(JSON.stringify(kinds)===JSON.stringify([0,1,2]),
    'same-day ordering must be paper -> review -> mistake, got '+JSON.stringify(kinds));
}

/* ---- 7. order-independence (sync depends on it) -------------------------- */
{
  const ps=[paper('2026-06-05',2,6,2,'3'),paper('2026-06-05',6,6,1,'9'),paper('2026-06-18',1,4,3,'5')];
  const ms=[mk('2026-06-12','Method error','m1')];
  const ref=replayTimeline('T',REVIEWS,ms,ps);
  let ok=true;
  for(const perm of [[2,0,1],[1,2,0],[2,1,0]]){
    const got=replayTimeline('T',REVIEWS.slice().reverse(),ms,perm.map(i=>ps[i]));
    if(!near(got.S,ref.S)||!near(got.D,ref.D)) ok=false;
  }
  check(ok,'paper replay is not order-independent — two devices could settle on different S');
}

/* ---- 8. bounds hold under a pile of zeroes -------------------------------- */
{
  const ps=[]; for(let i=0;i<40;i++) ps.push(paper('2026-07-'+String(1+(i%28)).padStart(2,'0'),0,6,1,'q'+i));
  const r=replayTimeline('T',REVIEWS,[],ps);
  check(r&&isFinite(r.S)&&r.S>=0.1,'stability floor breached under repeated zero-mark questions');
  check(r&&r.D<=10&&r.D>=1,'difficulty escaped [1,10]');
}

/* ---- 9. structural ------------------------------------------------------- */
{
  const src=grabFn('applyPaper');
  check(/applyReview\(/.test(src),'applyPaper() must delegate to applyReview() — one FSRS step');
  // Unambiguous evidence (c === 1) is a rehearsal and resets the clock via applyReview;
  // ambiguous evidence must carry `last` through, or the clock reset outweighs the
  // diluted penalty and a bad result ends up helping (see 3b).
  check(/last:rec\.last/.test(src),
    'applyPaper() resets the clock even when the evidence is ambiguous');
  check(/if\(!rec\|\|!\(c<1\)\) return full;/.test(src),
    'applyPaper() must take the full update when c === 1');
  const idx=grabFn('paperEventsByTopic');
  check(/paperMarksFeedScheduler\(\)/.test(idx),'paper events must respect the settings toggle');
  check(/qMarks/.test(idx),'paper events must come from per-question marks only');
  check(!/memoryFor|applyPaper/.test(grabFn('saveTopicStudied')),
    'saveTopicStudied() must keep sr[] a pure function of the review log');
}

console.log(`\nFSRS past-paper invariants\n`);
if(fail===0){
  console.log('  ok  marks band to 1-5 correctly; a paper resets the clock');
  console.log('  ok  bad papers hurt, good papers help');
  console.log('  ok  full marks confirm every topic; a zero is diluted across k topics');
  console.log('  ok  papers before the first review are ignored');
  console.log('  ok  a mistake off the same paper is not charged twice');
  console.log('  ok  same-day precedence is paper -> review -> mistake');
  console.log('  ok  replay is order-independent; bounds hold');
  console.log(`\n  ${pass} assertions passed.\n`);
} else {
  console.error(`  FAILED ${fail} of ${pass+fail} assertions:\n`);
  for(const f of fails) console.error('    - '+f);
  process.exit(1);
}
