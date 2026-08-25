#!/usr/bin/env node
/* Streak-merge invariants.
 *
 * The merge is the one place in the app where a mistake propagates to every signed-in
 * device within seconds, so its three load-bearing properties — commutative, idempotent,
 * additive-safe — are worth pinning rather than asserting in a comment. Until this file
 * existed nothing in scripts/ exercised mergeStores() at all, despite the README saying
 * all three were covered.
 *
 * The immediate reason it exists: "reset my study streak" (2026-08-25). A union can never
 * express a deletion — mergeStreak() unions `days` and takes the max of the counters, so a
 * cleared streak was silently restored by the very next snapshot from another device. The
 * fix is `resetAt`, the streak's own tombstone, mirroring the per-topic 'sr' one in
 * mergeSr(). The properties below are what make that safe:
 *
 *   commutative    merge(a,b) === merge(b,a)          — arrival order cannot change the result
 *   idempotent     merge(m,m) === m                   — the two devices settle instead of
 *                                                       trading revisions forever
 *   additive-safe  a store with no resetAt reads as "never reset", never as "reset now" —
 *                  you cannot force every phone onto a new build at once
 *
 * Plus the rule that makes a tombstone survivable: study logged *after* the reset, on a
 * device that has not heard about it yet, must not be thrown away.
 *
 * As with the FSRS suites, mergeStreak() is pulled out of index.html and executed rather
 * than reimplemented, so this cannot drift away from the code it checks. Pass a path as
 * argv[2] to point it at a deliberately broken copy and confirm the assertions bite.
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
  if(!m) throw new Error(`could not extract ${what} from ${TARGET}`);
  return m[0];
}
/* mergeStreak and num live inside the cloud IIFE, so they are indented — the ^function
   anchor the other suites use would run straight past them. One-liners are matched first
   for the same reason as elsewhere: the lazy multi-line shape overshoots to the next
   closing brace at that indent and drags unrelated code in with it. */
const grabFn = (n, indent='') => {
  const one = html.match(new RegExp(`^${indent}function ${n}\\([^\\n]*\\}[^\\n]*$`, 'm'));
  return one ? one[0] : grab(new RegExp(`^${indent}function ${n}\\([\\s\\S]*?\\n${indent}\\}`, 'm'), `function ${n}()`);
};

const source = [
  grabFn('ymd'),
  grabFn('num', '  '),
  grabFn('mergeStreak', '  '),
  `const WEEK_GOAL=4;`,
  `var __out={mergeStreak:mergeStreak, ymd:ymd};`,
].join('\n');

const ctx = vm.createContext({ Math, Date, isFinite, String, Object, JSON, console });
vm.runInContext(source, ctx);
const { mergeStreak, ymd } = ctx.__out;

let pass=0, fail=0; const fails=[];
const check=(ok,label)=>{ ok?pass++:(fail++,fails.push(label)); };
const eq=(a,b)=>JSON.stringify(a)===JSON.stringify(b);

/* A reset stamped at a known instant, and the calendar day it lands on. Days are compared
   as local calendar strings, exactly as mergeSr() compares its tombstone against rec.last. */
const RESET_MS = new Date('2026-06-15T10:30:00').getTime();
const RESET_DAY = ymd(new Date(RESET_MS));
const before = ['2026-06-01','2026-06-08','2026-06-14'];
const after  = ['2026-06-16','2026-06-18'];

const plain  = { days:[...before], weekStart:'2026-06-08', goal:4, weeksMet:7, last:'2026-06-14' };
const wasReset = { days:[], weekStart:'', goal:4, weeksMet:0, last:'', resetAt:RESET_MS };
// A device that never heard about the reset and kept studying afterwards.
const keptGoing = { days:[...before,...after], weekStart:'2026-06-15', goal:4, weeksMet:9, last:'2026-06-18' };

/* ---- 1. the reset actually lands ------------------------------------------ */
{
  const m = mergeStreak(plain, wasReset);
  check(m.days.length===0, `a reset must clear days logged before it, got ${JSON.stringify(m.days)}`);
  check(m.weeksMet===0,    `weeksMet must not survive a reset, got ${m.weeksMet}`);
  check(m.last==='',       `last must not survive a reset, got "${m.last}"`);
  check(m.resetAt===RESET_MS, `the reset stamp must carry through the merge, got ${m.resetAt}`);
}

/* ---- 2. but never over study logged after it ------------------------------ */
{
  const m = mergeStreak(keptGoing, wasReset);
  check(eq(m.days, after),
    `study after the reset must survive; expected ${JSON.stringify(after)}, got ${JSON.stringify(m.days)}`);
  /* weeksMet goes to 0 even though this side holds 9, and that is deliberate: the counter
     is a cumulative total with no record of when each week was earned, so it cannot be
     split at the reset boundary. Dropping it over-deletes by at most the weeks a device
     earned while offline across the reset; keeping it would let one stale device hold the
     counter up forever and the reset would never land. */
  check(m.weeksMet===0,
    `weeksMet cannot be split at the reset, so a side with no resetAt contributes 0; got ${m.weeksMet}`);
  check(m.last==='2026-06-18', `last must be the newest surviving day, got "${m.last}"`);
  /* weekStart must NOT be cleared by the reset. Clearing it makes the next
     _rolloverStreak() see a week change and wipe `days` — throwing away the post-reset
     study the filter just preserved. This assertion is the regression. */
  check(m.weekStart==='2026-06-15',
    `weekStart must survive so the next rollover does not wipe the surviving days, got "${m.weekStart}"`);
}
// The day of the reset itself is dropped — same > comparison as mergeSr's tombDay, so a
// device whose clock is a few hours behind cannot resurrect the streak it just cleared.
{
  const sameDay = { days:[RESET_DAY], weekStart:'', goal:4, weeksMet:0, last:RESET_DAY };
  const m = mergeStreak(sameDay, wasReset);
  check(m.days.length===0, `a day equal to the reset day must not survive, got ${JSON.stringify(m.days)}`);
}

/* ---- 3. commutative ------------------------------------------------------- */
{
  const pairs = [[plain,wasReset],[keptGoing,wasReset],[plain,keptGoing],
                 [wasReset,wasReset],[plain,plain]];
  for(const [a,b] of pairs){
    check(eq(mergeStreak(a,b), mergeStreak(b,a)),
      `merge(a,b) must equal merge(b,a) for ${JSON.stringify(a)} / ${JSON.stringify(b)}`);
  }
  // Two independent resets: the newer one wins from either direction.
  const older = { days:[], weekStart:'', goal:4, weeksMet:0, last:'', resetAt:RESET_MS-86400000 };
  check(eq(mergeStreak(older,wasReset), mergeStreak(wasReset,older)),
    'two resets must merge commutatively');
  check(mergeStreak(older,wasReset).resetAt===RESET_MS, 'the newer reset must win');
}

/* ---- 4. idempotent -------------------------------------------------------- */
{
  const cases = [[plain,wasReset],[keptGoing,wasReset],[plain,keptGoing]];
  for(const [a,b] of cases){
    const m = mergeStreak(a,b);
    check(eq(mergeStreak(m,m), m),
      `merge(m,m) must be m, else the devices trade revisions forever: ${JSON.stringify(m)}`);
    // and merging the result back into either input must not move it again
    check(eq(mergeStreak(m,a), m), `re-merging the result with a must be a no-op`);
    check(eq(mergeStreak(m,b), m), `re-merging the result with b must be a no-op`);
  }
}

/* ---- 5. additive-safe ----------------------------------------------------- */
{
  // Neither side carries resetAt — an older build. Behaviour must be exactly what it was
  // before this field existed: union the days, max the counters, keep the later markers.
  const a = { days:['2026-06-01','2026-06-03'], weekStart:'2026-06-01', goal:4, weeksMet:2, last:'2026-06-03' };
  const b = { days:['2026-06-03','2026-06-05'], weekStart:'2026-06-01', goal:4, weeksMet:5, last:'2026-06-05' };
  const m = mergeStreak(a,b);
  check(eq(m.days,['2026-06-01','2026-06-03','2026-06-05']),
    `with no resetAt the days must simply union, got ${JSON.stringify(m.days)}`);
  check(m.weeksMet===5, `with no resetAt weeksMet is still the max, got ${m.weeksMet}`);
  check(m.last==='2026-06-05', `with no resetAt last is still the later, got "${m.last}"`);
  check(!('resetAt' in m), 'no resetAt must be introduced where neither side had one');
  // An old build pushing a store with no resetAt must never read as "reset everything".
  check(mergeStreak(a, {days:[],weekStart:'',goal:4,weeksMet:0,last:''}).days.length===2,
    'an empty streak with no resetAt is not a deletion');
}

/* ---- 6. the null/absent edges --------------------------------------------- */
{
  check(eq(mergeStreak(null, plain), plain), 'a missing side must yield the other unchanged');
  check(eq(mergeStreak(plain, null), plain), 'a missing side must yield the other unchanged');
  const m = mergeStreak(wasReset, null);
  check(m.resetAt===RESET_MS, 'a reset must survive a merge against nothing');
}

/* ---- report --------------------------------------------------------------- */
console.log(`\nStreak-merge invariants\n`);
if(fail===0){
  console.log('  ok  a reset clears the days and counters it predates');
  console.log('  ok  study logged after the reset survives it');
  console.log('  ok  merge is commutative, including between two resets');
  console.log('  ok  merge is idempotent, so the devices settle');
  console.log('  ok  a store with no resetAt is additive-safe, never a deletion');
  console.log('  ok  the null edges are unchanged');
  console.log(`\n  ${pass} assertions passed.\n`);
} else {
  console.error(`  FAILED ${fail} of ${pass+fail} assertions:\n`);
  for(const f of fails.slice(0,12)) console.error('    - '+f);
  process.exit(1);
}
