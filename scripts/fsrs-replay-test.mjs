#!/usr/bin/env node
/* Phase 1 of docs/fsrs-evidence-model.md — proves stored memory state is exactly
   what replaying the review log produces.
   Every later phase adds event types to that replay, so if this invariant does not
   hold there is nothing safe to build on.
   The engine is pulled out of index.html and executed, not reimplemented, so this
   test cannot quietly drift away from the code it is checking. */
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import vm from 'node:vm';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
// argv[2] lets the suite be pointed at a mutated copy, to check these assertions
// actually fail when the invariant is broken.
const TARGET = process.argv[2] || join(ROOT, 'index.html');
const html = readFileSync(TARGET, 'utf8');

/* ---- pull the engine out of index.html ---------------------------------- */
function grabFn(name){
  const re = new RegExp(`^function ${name}\\([\\s\\S]*?\\n\\}`, 'm');
  const m = html.match(re);
  if(!m) throw new Error(`could not extract function ${name}() from index.html`);
  return m[0];
}
function grabConst(name){
  const re = new RegExp(`^const ${name}\\s*=[^\\n]*$`, 'm');
  const m = html.match(re);
  if(!m) throw new Error(`could not extract const ${name} from index.html`);
  return m[0];
}

const source = [
  grabConst('FSRS_W'), grabConst('DECAY'), grabConst('FACTOR'), grabConst('DIFF_D_SEED'),
  grabFn('clamp'), grabFn('daysDiff'), grabFn('forgetting'), grabFn('ratingEase'),
  grabFn('initialStability'), grabFn('initialDifficulty'), grabFn('nextDifficulty'),
  grabFn('stabilityAfterRecall'), grabFn('stabilityAfterLapse'),
  grabFn('applyReview'),
].join('\n');

const ctx = vm.createContext({ Math, Date, isFinite, parseInt });
vm.runInContext(source, ctx);
const { applyReview } = ctx;

/* ---- the two paths under test ------------------------------------------- */
// LIVE: what saveTopicStudied does — step the record forward, appending to the log.
function live(events, tdiff){
  let rec=null, log=[];
  for(const e of events){
    const n=applyReview(rec, e.grade, e.date, tdiff);
    rec={D:n.D,S:n.S,last:n.last,reps:n.reps,lapses:n.lapses};
    log.push({id:e.id,date:e.date,grade:e.grade,r:Math.round(n.R*100)/100,elapsed:n.elapsed});
  }
  return {rec, log};
}
// REPLAY: what replayRecord does — rebuild from the log alone.
function replay(log, tdiff){
  let rec=null;
  for(const e of log) rec=applyReview(rec, e.grade, e.date, tdiff);
  if(!rec) return null;
  return {D:rec.D,S:rec.S,last:rec.last,reps:rec.reps,lapses:rec.lapses};
}

/* ---- deterministic PRNG so failures are reproducible --------------------- */
let seed=12345;
const rnd=()=> (seed=(seed*1103515245+12345)&0x7fffffff)/0x7fffffff;
const randHistory=()=>{
  const n=1+Math.floor(rnd()*14); const evs=[];
  let day=new Date('2025-09-01T12:00:00');
  for(let i=0;i<n;i++){
    day=new Date(day.getTime()+(1+Math.floor(rnd()*60))*86400000);
    evs.push({id:'e'+i, date:day.toISOString().slice(0,10), grade:1+Math.floor(rnd()*5)});
  }
  return evs;
};

const eq=(a,b)=>a&&b&&['D','S','last','reps','lapses'].every(k=>
  typeof a[k]==='number' ? Math.abs(a[k]-b[k])<1e-12 : a[k]===b[k]);

let pass=0, fail=0; const fails=[];
const check=(ok,label)=>{ ok?pass++:(fail++,fails.push(label)); };

const N=500;
try{
for(let i=0;i<N;i++){
  const evs=randHistory(), tdiff=1+Math.floor(rnd()*3);
  const {rec, log}=live(evs, tdiff);

  // A. stored state == replay of its own log
  check(eq(rec, replay(log, tdiff)), `#${i} stored != replay(log)`);

  // B. order-independence: shuffle, re-sort by (date,id), replay -> same answer.
  //    This is what the sync merge relies on; without it two devices can settle on
  //    different S and push at each other forever.
  const shuffled=log.slice();
  for(let k=shuffled.length-1;k>0;k--){ const j=Math.floor(rnd()*(k+1)); [shuffled[k],shuffled[j]]=[shuffled[j],shuffled[k]]; }
  shuffled.sort((x,y)=> x.date!==y.date ? (x.date>y.date?1:-1) : (x.id>y.id?1:x.id<y.id?-1:0));
  check(eq(rec, replay(shuffled, tdiff)), `#${i} replay not order-independent`);

  // C. idempotent: replaying an already-replayed result changes nothing
  check(eq(replay(log, tdiff), replay(log, tdiff)), `#${i} replay not deterministic`);
}

/* ---- D. purity: applyReview must carry no hidden state -------------------
   The numeric tests above cannot tell live from replay (both step through the same
   extracted function), so the thing worth proving here is that the function is a
   pure function of its arguments. A stability path that reads mutable outside state
   — which is exactly what effectiveD() did — fails this. */
{
  seed=999; const probe=randHistory(); const first=replay(probe,2);
  seed=4242; for(let i=0;i<50;i++) replay(randHistory(), 1+Math.floor(rnd()*3));
  check(eq(first, replay(probe,2)), 'applyReview() is not pure — result depends on prior calls');
}
}catch(err){
  // A throw here means the engine reached for something outside its arguments
  // (the classic case: effectiveD/mistakeLoad, which need app globals). That is
  // the invariant failing, so report it as such rather than as a stack trace.
  check(false, `engine threw during replay — it is reading state outside its arguments: ${err.message}`);
}

/* ---- E. structural: exactly one implementation of the FSRS step -----------
   This is what the refactor actually buys, and numbers cannot check it: both call
   sites must delegate to applyReview() rather than stepping the model themselves.
   Two hand-maintained copies is how live and replay drifted apart in the first place. */
const PRIMITIVES=/stabilityAfterRecall|stabilityAfterLapse|nextDifficulty|initialStability|initialDifficulty/;
const applySrc=grabFn('applyReview');
const saveSrc=grabFn('saveTopicStudied');
const replaySrc=(html.match(/ {2}function replayRecord\([\s\S]*?\n {2}\}/)||[''])[0];

check(!/effectiveD|mistakeLoad/.test(applySrc),
  'applyReview() references effectiveD/mistakeLoad — stored S would stop being a pure function of the log');
check(/rec\.D/.test(applySrc), 'applyReview() no longer uses rec.D');

check(/applyReview\(/.test(saveSrc), 'saveTopicStudied() does not delegate to applyReview()');
check(!PRIMITIVES.test(saveSrc), 'saveTopicStudied() steps the FSRS model itself — second implementation');
check(!/effectiveD/.test(saveSrc), 'saveTopicStudied() calls effectiveD — live and replay would diverge');

check(replaySrc.length>0, 'could not locate replayRecord()');
check(/applyReview\(/.test(replaySrc), 'replayRecord() does not delegate to applyReview()');
check(!PRIMITIVES.test(replaySrc), 'replayRecord() steps the FSRS model itself — second implementation');

check(/applyReview\(/.test(grabFn('simulateGrade')), 'simulateGrade() does not delegate to applyReview() — the forecast would not match what Save does');

/* ---- report -------------------------------------------------------------- */
console.log(`\nFSRS replay invariants — ${N} random histories\n`);
if(fail===0){
  console.log(`  ok  stored state == replay(log)`);
  console.log(`  ok  replay is order-independent under (date,id) sort`);
  console.log(`  ok  replay is deterministic`);
  console.log(`  ok  applyReview() is pure — no hidden state`);
  console.log(`  ok  one FSRS step: saveTopicStudied / simulateGrade / replayRecord all delegate`);
  console.log(`  ok  stability path is free of mistake load`);
  console.log(`\n  ${pass} assertions passed.\n`);
} else {
  console.error(`  FAILED ${fail} of ${pass+fail} assertions:\n`);
  for(const f of fails.slice(0,10)) console.error('    - '+f);
  process.exit(1);
}
