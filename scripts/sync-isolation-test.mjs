#!/usr/bin/env node
/* Test data and other accounts' data must never reach an account through sync.
 *
 * Found 2026-10-03: a real account held 180 seeded mistakes (ids m0–m179) and 25 seeded paper
 * logs (p0–p24) — the test seeder's "Mid-year" preset, written straight into a real store by a
 * session on 2026-08-18, before test mode namespaced storage. They reached the account by the
 * one route sync offers: sign-out leaves local storage alone, and the first snapshot after a
 * sign-in MERGES local into the cloud. Whatever was in that browser became the account's.
 *
 * Two guards, both pinned here:
 *   1. stripTestRecords() — seeded records are dropped from what is pushed AND from every
 *      snapshot before it is merged. Tombstones cannot do this job: they expire after
 *      TOMBSTONE_TTL_DAYS, after which a long-offline device pushes the records back.
 *   2. claimLocalFor(uid) — local data is merged into an account only if it is that account's.
 *      Owned by another account, or by none (never synced), it is dropped, not merged.
 *
 * Every "this must not move" assertion has a control showing the same input does move without
 * the guard (Mistakes.md, "An assertion that passes for the wrong reason"). As with the other
 * suites the functions are pulled out of index.html and executed; pass a path as argv[2] to
 * point it at a broken copy and confirm the assertions bite.
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
const grabFn = (n, indent='') => {
  const one = html.match(new RegExp(`^${indent}function ${n}\\([^\\n]*\\}[^\\n]*$`, 'm'));
  return one ? one[0] : grab(new RegExp(`^${indent}function ${n}\\([\\s\\S]*?\\n${indent}\\}`, 'm'), `function ${n}()`);
};

const SYNC_KEYS = ['alevel-sr-v5','alevel-mistakes-v2','alevel-paperlog-v1','alevel-onboarded-v1','msh-theme'];
const source = [
  grabFn('mhIsTestId'),
  grabFn('sj', '  '),
  grabFn('stripTestRecords', '  '),
  grabFn('claimLocalFor', '  '),
  `var OWNER_KEY='mh_owner', needCleanPush=false, refreshed=0;`,
  `var SYNC_KEYS=${JSON.stringify(SYNC_KEYS)}, IMG_PENDING_KEY='alevel-imgpending-v1';`,
  `var _ls={}; var localStorage={getItem:function(k){return k in _ls?_ls[k]:null;},`
  + `setItem:function(k,v){_ls[k]=String(v);},removeItem:function(k){delete _ls[k];}};`,
  `function nativeSet(k,v){ _ls[k]=String(v); }`,
  `function refreshFromStorage(){ refreshed++; }`,
  `var console={info:function(){}};`,
].join('\n');

const ctx = {};
vm.createContext(ctx);
vm.runInContext(source, ctx);
const run = js => vm.runInContext(js, ctx);

let pass = 0, fail = 0;
function ok(cond, msg){ if(cond){ pass++; } else { fail++; console.log('  FAIL  ' + msg); } }
const J = JSON.stringify;

/* ---- 1. the fingerprint ------------------------------------------------------------------ */
const isT = id => run(`mhIsTestId(${J(id)})`);
for(const id of ['msh-test-m0','msh-test-p24','msh-test-r3_1','m0','m179','p0','p24','r12_3'])
  ok(isT(id) === true, `mhIsTestId(${J(id)}) should be true`);
// Every real id shape in a real account, as found on 2026-10-03, plus near-misses.
for(const id of ['9b2e4c1a-1f0e-4f7e-9c55-2d1c8e0f6a11','id-lq3k2-abcd1234','1781644300000','17843344',
                 'm','p','mq_m0','map','m0x','pm0','r1','r1_','', null, undefined, 12])
  ok(isT(id) === false, `mhIsTestId(${J(id)}) should be false`);

/* ---- 2. stripTestRecords ----------------------------------------------------------------- */
const realM = [{id:'17816443',topic:'7.3 Double-angle formulae',text:'real'},
               {id:'24ee3855-0000-4000-8000-000000000000',col:'ukmt',text:'real'}];
const fakeM = [{id:'m0',topic:'X',note:''},{id:'m179',topic:'Y',note:''},{id:'msh-test-m3',topic:'Z'}];
const realP = [{id:'id-abc-123',moduleId:'as',year:'2018',paperN:1}];
const fakeP = [{id:'p0',moduleId:'d1'},{id:'msh-test-p9',moduleId:'fp1'}];
const sr = {
  'Real topic':  {S:10,D:5,log:[{id:'aaaa-real',grade:4}]},
  'Seeded topic':{S:150,D:4,log:[{id:'r1_0',grade:3},{id:'msh-test-r1_1',grade:2}]},
  'Mixed topic': {S:20,D:5,log:[{id:'r2_0',grade:1},{id:'bbbb-real',grade:5}]},
  'Unlogged':    {S:3,D:5}
};
const dirty = {
  'alevel-mistakes-v2': J([...realM, ...fakeM]),
  'alevel-paperlog-v1': J([...realP, ...fakeP]),
  'alevel-sr-v5':       J(sr),
  'msh-theme':          'rose-dark',
  'alevel-onboarded-v1':'1'
};
const out = run(`stripTestRecords(${J(dirty)})`);
const outM = JSON.parse(out['alevel-mistakes-v2']), outP = JSON.parse(out['alevel-paperlog-v1']);
const outSr = JSON.parse(out['alevel-sr-v5']);
ok(J(outM) === J(realM), 'mistakes: exactly the real ones survive, in order');
ok(J(outP) === J(realP), 'paper logs: exactly the real ones survive');
ok(!('Seeded topic' in outSr), 'a topic whose every review was seeded is dropped (its S and D are seeded too)');
ok(J(outSr['Mixed topic'].log) === J([{id:'bbbb-real',grade:5}]), 'a mixed topic keeps only its real reviews');
ok(J(outSr['Real topic']) === J(sr['Real topic']) && J(outSr['Unlogged']) === J(sr['Unlogged']),
   'real topics are untouched, including one with no log');
ok(out['msh-theme'] === 'rose-dark' && out['alevel-onboarded-v1'] === '1', 'other keys pass through');

// A clean store must come back byte-identical, or every sync would look like a change and push.
const clean = {'alevel-mistakes-v2': J(realM), 'alevel-paperlog-v1': J(realP), 'alevel-sr-v5': J({'Real topic':sr['Real topic']})};
const outClean = run(`stripTestRecords(${J(clean)})`);
ok(Object.keys(clean).every(k => outClean[k] === clean[k]), 'a clean store is returned byte-identical (no push loop)');
// Garbage is not this function's business.
const odd = run(`stripTestRecords({'alevel-mistakes-v2':'not json','alevel-paperlog-v1':'{"a":1}'})`);
ok(odd['alevel-mistakes-v2'] === 'not json' && odd['alevel-paperlog-v1'] === '{"a":1}', 'unparseable or non-array values pass through');
ok(run(`stripTestRecords(null)`) === null, 'null store is returned as-is');

/* ---- 3. claimLocalFor ---------------------------------------------------------------------- */
function stage(ls){ run(`_ls=${J(ls)}; needCleanPush=false; refreshed=0;`); }
const ls  = () => run(`_ls`);
const A = 'uidA', B = 'uidB';
const mine = {'alevel-mistakes-v2': J(realM), 'msh-theme':'pure-white', 'mh_stamp':'w|1', 'alevel-imgpending-v1':'["x"]'};

// Same owner: nothing happens.
stage({...mine, mh_owner:A});
run(`claimLocalFor(${J(A)})`);
ok(ls()['alevel-mistakes-v2'] === J(realM) && ls()['mh_stamp'] === 'w|1', 'same account: local data kept');
ok(run('refreshed') === 0 && run('needCleanPush') === false, 'same account, clean data: no refresh, no push');

// A device already in use before mh_owner existed: has synced (stamp), no owner → adopted.
stage({...mine});
run(`claimLocalFor(${J(A)})`);
ok(ls()['alevel-mistakes-v2'] === J(realM), 'pre-upgrade device (stamp, no owner): data adopted, not dropped');
ok(ls()['mh_owner'] === A, 'pre-upgrade device: owner recorded');

// Another account's data: dropped, never merged into this one.
stage({...mine, mh_owner:A});
run(`claimLocalFor(${J(B)})`);
ok(ls()['alevel-mistakes-v2'] === undefined && ls()['msh-theme'] === undefined, "another account's data is dropped");
ok(ls()['mh_stamp'] === undefined, "another account's sync stamp is dropped, so the first snapshot is taken whole");
ok(ls()['alevel-imgpending-v1'] === undefined, "another account's queued photo uploads are dropped");
ok(ls()['mh_owner'] === B && run('refreshed') === 1, 'new owner recorded and in-memory state reloaded');

// Data that never came from any account — the 2026-08-18 shape: seeded, never synced.
stage({'alevel-mistakes-v2': J(fakeM.concat(realM)), 'alevel-onboarded-v1':'1'});
run(`claimLocalFor(${J(A)})`);
ok(ls()['alevel-mistakes-v2'] === undefined, 'signed-out data with no sync stamp is not merged into the account');

// Own data with seeded records mixed in: cleaned locally, and the cloud copy flagged for correction.
stage({...mine, mh_owner:A, 'alevel-mistakes-v2': J([...realM, ...fakeM])});
run(`claimLocalFor(${J(A)})`);
ok(ls()['alevel-mistakes-v2'] === J(realM), 'own data: seeded records removed from this browser');
ok(run('needCleanPush') === true && run('refreshed') === 1, 'own data: cleaned copy redrawn and queued to correct the cloud');

/* ---- 4. controls: the inputs above DO move without the guards ------------------------------ */
// If these failed, every "dropped"/"removed" assertion above could be passing vacuously.
ok(JSON.parse(dirty['alevel-mistakes-v2']).length === realM.length + fakeM.length, 'control: the dirty fixture really holds seeded mistakes');
ok(JSON.parse(dirty['alevel-sr-v5'])['Seeded topic'], 'control: the dirty fixture really holds a seeded topic');
ok(fakeM.every(m => isT(m.id)) && realM.every(m => !isT(m.id)), 'control: fixtures split exactly on the fingerprint');

console.log(`sync-isolation: ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
