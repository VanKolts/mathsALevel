#!/usr/bin/env node
/* Restoring a backup must out-rank the tombstones covering what it restores.
 *
 * The failure this pins is silent and delayed, which is the worst combination. A tombstoned
 * record is dropped by the merge unless it is *newer* than the tombstone (`recDate(rec) >
 * tombDay` in mergeSr). A backup is by definition older. So:
 *
 *     Export  ->  Reset revision logs  ->  change your mind  ->  Import
 *
 * put every topic back on screen, `saveState()` persisted it, everything looked right — and
 * the next snapshot from any device deleted it all again, minutes later, with no message.
 * Export is the *documented* safety net for the reset, so the one recovery path the UI
 * offers was the one that did not work.
 *
 * The fix is `mhRestoreFromBackup()`: an `add` stamp of now for every id in the backup,
 * across all six kinds the export carries. That is the same mechanism `saveTopicStudied()`
 * already uses to revive a topic you study again after resetting it — an add stamp newer
 * than the del stamp beats it on every device, not just this one.
 *
 * Added 2026-08-25 with "Reset revision logs". The trap pre-dates it (the study modal could
 * always tombstone one topic at a time) but was theoretical at one-per-click; a button that
 * tombstones all 315 at once makes it the likely path.
 *
 * As with the other suites, the merge and the restore helper are pulled out of index.html
 * and executed rather than reimplemented. Pass a path as argv[2] to point it at a broken
 * copy and confirm the assertions bite.
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

/* Two halves that never meet in the source: the ledger writers live at the top of the file,
   the merge lives inside the cloud IIFE at the bottom. The whole point of this suite is that
   they agree, so both are lifted into one context. */
const source = [
  grabFn('ymd'),
  // ledger writers (top-level)
  `var syncMeta={v:1,del:{},add:{},mod:{}};`,
  `function saveSyncMeta(){}`,
  grabFn('mhTombstone'),
  grabFn('mhUntombstone'),
  grabFn('mhRestoreFromBackup'),
  // merge (inside the IIFE, hence indented)
  grabFn('num', '  '), grabFn('sj', '  '), grabFn('lexPick', '  '),
  grabFn('stampOf', '  '), grabFn('isDeleted', '  '), grabFn('mergeMeta', '  '),
  grabFn('evKey', '  '), grabFn('recDate', '  '), grabFn('pickRec', '  '),
  grabFn('mergeRecord', '  '), grabFn('mergeSr', '  '),
  grabFn('itemKey', '  '), grabFn('pickItem', '  '), grabFn('mergeList', '  '),
  grabFn('mergeSet', '  '),
  // Not reached below: every case here gives both sides the identical history, so
  // mergeRecord short-circuits on "same history" before it would replay.
  `function replayRecord(){ return null; }`,
  `var __out={syncMeta:syncMeta, mhTombstone:mhTombstone, mhRestoreFromBackup:mhRestoreFromBackup,`
  + ` mergeSr:mergeSr, mergeList:mergeList, mergeSet:mergeSet, mergeMeta:mergeMeta};`,
].join('\n');

const ctx = vm.createContext({ Math, Date, JSON, Object, String, Array, isFinite, parseInt, console });
vm.runInContext(source, ctx);
const A = ctx.__out;

let pass=0, fail=0; const fails=[];
const check=(ok,label)=>{ ok?pass++:(fail++,fails.push(label)); };
const reset=()=>{ ctx.syncMeta.del={}; ctx.syncMeta.add={}; ctx.syncMeta.mod={}; };

/* A backup taken before the reset: old dates throughout, which is the whole problem. */
const TOPIC = '2.1 Solving quadratic equations';
const backup = {
  sr: { [TOPIC]: { D:5, S:30, last:'2026-06-10', reps:4, lapses:0,
                   log:[{id:'a',date:'2026-05-01',grade:3},{id:'b',date:'2026-06-10',grade:4}] } },
  mistakes: [{ id:'m1', topic:TOPIC, date:'2026-06-01', cat:'Concept gap' }],
  paperLog: [{ id:'p1', date:'2026-06-05', module:'alevel' }],
  favourites: ['res-7'],
  notes: { [TOPIC]: 'watch the discriminant' },
  logbooks: [{ id:'lb1', name:'UKMT practice', date:'2026-05-20', modified: 1 }],
};
// The other device's copy — it never heard about the reset and still holds everything.
const remote = {
  sr: backup.sr, mistakes: backup.mistakes, paperLog: backup.paperLog,
  favs: backup.favourites, notes: backup.notes, logbooks: backup.logbooks,
};

/* ---- 1. the hazard is real: a tombstone alone kills the restored record ---- */
{
  reset();
  A.mhTombstone('sr', TOPIC);
  const meta = A.mergeMeta(ctx.syncMeta, {});
  const out = A.mergeSr(backup.sr, remote.sr, meta);
  check(!out[TOPIC],
    'baseline: without an add stamp the merge must drop the restored record (if this fails the trap is gone and this suite is moot)');
}

/* ---- 2. restoring a backup revives every kind the export carries ---------- */
{
  reset();
  ['sr'].forEach(k => A.mhTombstone(k, TOPIC));
  A.mhTombstone('notes', TOPIC);
  A.mhTombstone('favs', 'res-7');
  A.mhTombstone('mistakes', 'm1');
  A.mhTombstone('papers', 'p1');
  A.mhTombstone('logbooks', 'lb1');

  const n = A.mhRestoreFromBackup(backup);
  check(n === 6, `restore must revive all six kinds, revived ${n}`);

  const meta = A.mergeMeta(ctx.syncMeta, {});
  check(!!A.mergeSr(backup.sr, remote.sr, meta)[TOPIC],
    'sr: the restored topic must survive the merge');
  check(A.mergeList(backup.mistakes, remote.mistakes, meta, 'mistakes').length === 1,
    'mistakes: the restored mistake must survive the merge');
  check(A.mergeList(backup.paperLog, remote.paperLog, meta, 'papers').length === 1,
    'papers: the restored paper must survive the merge');
  check(A.mergeSet(backup.favourites, remote.favs, meta, 'favs').length === 1,
    'favs: the restored favourite must survive the merge');
  /* A logbook is the sixth kind, and the one whose loss is worst: the entries pointing at it
     survive the merge on their own but have nothing left to name them. */
  check(A.mergeList(backup.logbooks, remote.logbooks, meta, 'logbooks').length === 1,
    'logbooks: the restored logbook must survive the merge');
}

/* ---- 3. it must beat the tombstone on the OTHER device too ----------------- */
/* The device that pressed Reset still holds the del stamp and has not seen the import. Its
   ledger merges with ours, so the add stamp has to out-rank it rather than merely be absent
   locally — which is exactly why erasing the tombstone would not have been enough. */
{
  reset();
  A.mhTombstone('sr', TOPIC);
  const theirLedger = JSON.parse(JSON.stringify(ctx.syncMeta));   // the resetting device
  A.mhRestoreFromBackup(backup);                                   // we then import
  const meta = A.mergeMeta(ctx.syncMeta, theirLedger);
  check(!!A.mergeSr(backup.sr, remote.sr, meta)[TOPIC],
    'the add stamp must out-rank the other device\'s surviving tombstone');
  check(!!A.mergeSr(backup.sr, remote.sr, A.mergeMeta(theirLedger, ctx.syncMeta))[TOPIC],
    'and in the other merge order — the ledger merge is commutative');
}

/* ---- 4. a restore does not resurrect what the backup does not contain ------ */
{
  reset();
  A.mhTombstone('sr', TOPIC);
  A.mhTombstone('sr', 'A topic the backup never had');
  A.mhRestoreFromBackup(backup);
  const meta = A.mergeMeta(ctx.syncMeta, {});
  const other = { 'A topic the backup never had': backup.sr[TOPIC] };
  check(!A.mergeSr({}, other, meta)['A topic the backup never had'],
    'a topic absent from the backup must stay deleted — restore is not "undelete everything"');
}

/* ---- 5. harmless on a clean ledger and on junk input ---------------------- */
{
  reset();
  const n = A.mhRestoreFromBackup(backup);
  check(n === 6, 'restoring with nothing tombstoned is still well-defined');
  const meta = A.mergeMeta(ctx.syncMeta, {});
  check(!!A.mergeSr(backup.sr, remote.sr, meta)[TOPIC], 'and changes nothing about the outcome');
  reset();
  let threw = false;
  try { A.mhRestoreFromBackup(null); A.mhRestoreFromBackup({}); A.mhRestoreFromBackup({sr:null,mistakes:'x'}); }
  catch(e){ threw = true; }
  check(!threw, 'a malformed or partial backup must not throw — import already has its own catch');
}

/* ---- report --------------------------------------------------------------- */
console.log(`\nBackup-restore vs tombstones\n`);
if(fail===0){
  console.log('  ok  the trap is real: a tombstone alone drops a restored record');
  console.log('  ok  restoring revives all six kinds the export carries');
  console.log('  ok  the add stamp beats the tombstone on the other device, in both merge orders');
  console.log('  ok  a restore does not resurrect what the backup never had');
  console.log('  ok  harmless on a clean ledger, and on partial or malformed input');
  console.log(`\n  ${pass} assertions passed.\n`);
} else {
  console.error(`  FAILED ${fail} of ${pass+fail} assertions:\n`);
  for(const f of fails.slice(0,12)) console.error('    - '+f);
  process.exit(1);
}
