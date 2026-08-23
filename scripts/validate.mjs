#!/usr/bin/env node
/* Pre-deploy validator for Maths Study Hub.
 *
 * Deploying this app is `git push` — main goes straight to GitHub Pages. That means a stray
 * typo in an inline <script>, or a paper whose marks no longer add up, ships to the live site
 * you actually revise from. This script is the guard rail: it syntax-checks every piece of
 * JS in the repo and asserts the invariants the app's logic quietly depends on.
 *
 * Run locally with `npm test` or `node scripts/validate.mjs`; CI runs it on every push.
 * Exits non-zero on the first category of failure so a bad commit can't publish.
 */
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = p => fs.readFileSync(path.join(ROOT, p), 'utf8');
const exists = p => fs.existsSync(path.join(ROOT, p));

const errors = [];
const notes = [];
const fail = m => errors.push(m);
const ok = m => notes.push('  ok  ' + m);

/* ---------------------------------------------------------------- 1. JS syntax ---- */

const DATA_FILES = [
  'data/clusters.js', 'data/paper-questions.js', 'data/glossary.js',
  'data/formulas.js', 'data/grade-boundaries.js'
];

for (const f of [...DATA_FILES, 'sw.js']) {
  if (!exists(f)) { fail(`missing file: ${f}`); continue; }
  try { new vm.Script(read(f), { filename: f }); }
  catch (e) { fail(`syntax error in ${f}: ${e.message}`); }
}
ok(`${DATA_FILES.length + 1} standalone JS files parse`);

const html = read('index.html');
let inlineCount = 0;
const scriptRe = /<script(?![^>]*\bsrc=)[^>]*>([\s\S]*?)<\/script>/gi;
for (let m; (m = scriptRe.exec(html)); ) {
  inlineCount++;
  const startLine = html.slice(0, m.index).split('\n').length;
  try { new vm.Script(m[1], { filename: `index.html:inline#${inlineCount}` }); }
  catch (e) { fail(`syntax error in inline <script> #${inlineCount} (line ~${startLine}): ${e.message}`); }
}
if (!inlineCount) fail('no inline <script> blocks found in index.html — did the parser break?');
ok(`${inlineCount} inline <script> blocks in index.html parse`);

/* --------------------------------------------------- 2. referenced files exist ---- */

for (let m, re = /<script[^>]*\bsrc="(?!https?:)([^"]+)"/gi; (m = re.exec(html)); )
  if (!exists(m[1])) fail(`index.html references a missing script: ${m[1]}`);
for (let m, re = /<link[^>]*\bhref="(?!https?:|data:)([^"]+)"/gi; (m = re.exec(html)); )
  if (!exists(m[1])) fail(`index.html references a missing stylesheet/asset: ${m[1]}`);
ok('every local file referenced by index.html exists');

/* ------------------------------------------------------ 3. load the datasets ---- */

const ctx = { console };
vm.createContext(ctx);
try {
  vm.runInContext(
    DATA_FILES.map(f => read(f)).join('\n') +
    '\n;globalThis.__data = { clusters, PAPER_QUESTIONS, GRADE_BOUNDARIES, FORMULAS, GLOSSARY };',
    ctx
  );
} catch (e) {
  fail(`data files failed to evaluate together: ${e.message}`);
  report();
}
const { clusters, PAPER_QUESTIONS, GRADE_BOUNDARIES, GLOSSARY } = ctx.__data;

/* ------------------------------------------------------- 4. topic taxonomy ---- */

const studyable = clusters.filter(c => c.qual);
const topics = studyable.flatMap(c => c.topics);
const canonical = new Set(topics);

if (!studyable.length) fail('no studyable clusters found');
for (const c of studyable) {
  if (!Array.isArray(c.topics) || !c.topics.length) fail(`cluster ${c.id} has no topics`);
  // The app indexes lvls[i]/diff[i] by topic position, so a length mismatch silently yields
  // undefined difficulty and a topic that seeds its FSRS state wrong.
  if (c.lvls && c.lvls.length !== c.topics.length)
    fail(`cluster ${c.id}: lvls has ${c.lvls.length} entries for ${c.topics.length} topics`);
  if (c.diff && c.diff.length !== c.topics.length)
    fail(`cluster ${c.id}: diff has ${c.diff.length} entries for ${c.topics.length} topics`);
  for (const d of (c.diff || []))
    if (![1, 2, 3].includes(d)) fail(`cluster ${c.id}: difficulty ${JSON.stringify(d)} is not 1, 2 or 3`);
}
// Topic names are the primary key for sr[name], notes, favourites and every paper tag.
// A duplicate means two spec topics share one memory record.
const dupes = [...new Set(topics.filter((t, i) => topics.indexOf(t) !== i))];
if (dupes.length) fail(`duplicate topic names: ${dupes.join(' | ')}`);
ok(`${studyable.length} studyable clusters, ${topics.length} unique topic names`);

/* ----------------------------------------------- 5. past-paper marks & tags ---- */

// Real Edexcel totals. AS paper 2 (Statistics & Mechanics) is 60; everything legacy/Further
// is 75; modern A-Level papers and AS paper 1 are 100.
const expectedTotal = (moduleId, paperN) => {
  if (moduleId === 'alevel') return 100;
  if (moduleId === 'as') return String(paperN) === '2' ? 60 : 100;
  return 75;
};

let papers = 0, questions = 0;
const unknownTags = new Map();
for (const mod in PAPER_QUESTIONS)
  for (const year in PAPER_QUESTIONS[mod])
    for (const paperN in PAPER_QUESTIONS[mod][year]) {
      const qs = PAPER_QUESTIONS[mod][year][paperN];
      const where = `${mod}/${year}/paper ${paperN}`;
      papers++; questions += qs.length;
      let sum = 0;
      for (const q of qs) {
        if (!Number.isFinite(q.marks) || q.marks <= 0) fail(`${where} q${q.q}: bad marks ${JSON.stringify(q.marks)}`);
        sum += q.marks;
        if (!Array.isArray(q.topics) || !q.topics.length) fail(`${where} q${q.q}: no topics tagged`);
        for (const t of (q.topics || []))
          if (!canonical.has(t)) unknownTags.set(t, (unknownTags.get(t) || 0) + 1);
      }
      const want = expectedTotal(mod, paperN);
      if (sum !== want) fail(`${where}: marks sum to ${sum}, expected ${want}`);
    }

if (unknownTags.size) {
  fail(`${unknownTags.size} past-paper tag(s) do not match any canonical topic name:`);
  for (const [t, n] of [...unknownTags].sort((a, b) => b[1] - a[1]).slice(0, 20))
    fail(`    x${n}  ${JSON.stringify(t)}`);
}
ok(`${papers} papers, ${questions} questions, all marks sum correctly, all tags canonical`);

/* --------------------------------------- 6. chapter-rename map is idempotent ---- */

// The remap runs on every load and after every cloud pull, so it MUST be a no-op the second
// time. That holds only while no renamed-to name is itself a rename-from name.
const mapMatch = html.match(/var CHAPTER_RENAMES = (\{[\s\S]*?\});\s*\nfunction applyChapterRenames/);
if (!mapMatch) {
  fail('CHAPTER_RENAMES map not found in index.html (has the remap been renamed or removed?)');
} else {
  let MAP;
  try { MAP = JSON.parse(mapMatch[1]); } catch (e) { fail(`CHAPTER_RENAMES is not valid JSON: ${e.message}`); }
  if (MAP) {
    const keys = new Set(Object.keys(MAP));
    const chained = Object.entries(MAP).filter(([, v]) => keys.has(v));
    if (chained.length)
      fail(`CHAPTER_RENAMES is not idempotent — these targets are themselves rename sources: ${chained.map(([k, v]) => `${k} -> ${v}`).join('; ')}`);
    const missing = Object.values(MAP).filter(v => !canonical.has(v));
    if (missing.length)
      fail(`CHAPTER_RENAMES points at ${missing.length} name(s) that no longer exist: ${missing.slice(0, 5).join(' | ')}`);
    ok(`chapter-rename map: ${keys.size} entries, idempotent, all targets canonical`);
  }
}

/* ----------------------------------------------- 7. service worker precache ---- */

if (exists('sw.js')) {
  const sw = read('sw.js');
  const shell = sw.match(/const SHELL = \[([\s\S]*?)\];/);
  if (!shell) fail('sw.js: SHELL precache list not found');
  else {
    const files = [...shell[1].matchAll(/'([^']+)'/g)].map(m => m[1]).filter(p => p !== './' && p !== './index.html');
    for (const f of files)
      if (!exists(f.replace(/^\.\//, ''))) fail(`sw.js precaches a file that does not exist: ${f}`);
    ok(`service worker precache lists ${files.length + 2} entries, all present`);
  }
}

/* ---------------------------------------------------------- 8. misc datasets ---- */

/* Grade boundaries. These are real published figures about someone's exam results, so the
   checks are about *internal consistency* — a transcription slip shows up as a boundary that
   is out of order, above the paper maximum, or attached to a paper the app does not have.
   It cannot check a number against Pearson; only the extractor's provenance does that. */
{
  const GB = GRADE_BOUNDARIES;
  const ORDER = ['A*', 'A', 'B', 'C', 'D', 'E'];
  if (!GB || !GB.modules || !GB.components || !GB.overall) {
    fail('GRADE_BOUNDARIES is missing modules/components/overall — grade lookup will break');
  } else {
    let rows = 0, bad = 0;
    const checkRow = (where, b, expectMax) => {
      rows++;
      if (typeof b.max !== 'number') { fail(`${where}: no max`); bad++; return; }
      if (expectMax != null && b.max !== expectMax) {
        fail(`${where}: max ${b.max} but the app's paper is out of ${expectMax}`); bad++;
      }
      const present = ORDER.filter(g => b[g] != null);
      if (!present.length) { fail(`${where}: no grades at all`); bad++; return; }
      for (const g of present) {
        if (b[g] < 0 || b[g] > b.max) { fail(`${where}: ${g}=${b[g]} outside 0..${b.max}`); bad++; }
      }
      for (let i = 1; i < present.length; i++) {
        if (b[present[i - 1]] <= b[present[i]]) {
          fail(`${where}: ${present[i - 1]} (${b[present[i - 1]]}) not above ${present[i]} (${b[present[i]]})`);
          bad++;
        }
      }
    };
    // component rows, cross-checked against the paper maxima the app already knows
    const maxOf = (mod, pn) => {
      const yrs = PAPER_QUESTIONS[mod]; if (!yrs) return null;
      for (const y of Object.keys(yrs)) {
        const qs = yrs[y][pn];
        if (Array.isArray(qs) && qs.length) return qs.reduce((s, q) => s + q.marks, 0);
      }
      return null;
    };
    for (const year of Object.keys(GB.components))
      for (const mod of Object.keys(GB.components[year])) {
        if (!GB.modules[mod]) { fail(`components ${year}: unknown module "${mod}"`); bad++; continue; }
        for (const pn of Object.keys(GB.components[year][mod]))
          checkRow(`${mod} ${year} paper ${pn}`, GB.components[year][mod][pn], maxOf(mod, pn));
      }
    for (const year of Object.keys(GB.overall))
      for (const spec of Object.keys(GB.overall[year])) {
        const t = GB.overall[year][spec];
        if (t.max != null) checkRow(`overall ${spec} ${year}`, t);
        else for (const combo of Object.keys(t)) checkRow(`overall ${spec} ${year} ${combo}`, t[combo]);
      }
    for (const year of Object.keys(GB.legacy || {}))
      for (const mod of Object.keys(GB.legacy[year])) checkRow(`legacy ${mod} ${year}`, GB.legacy[year][mod]);
    // every option a student can pick must resolve to a published aggregate row
    const opts = Object.values(GB.optionPaper).sort();
    for (const year of Object.keys(GB.overall)) {
      const fm = GB.overall[year]['9FM0'];
      if (!fm || fm.max != null) continue;
      for (let i = 0; i < opts.length; i++) for (let j = i + 1; j < opts.length; j++) {
        const key = [opts[i], opts[j]].sort().join('+');
        if (!fm[key]) { fail(`overall 9FM0 ${year}: no row for option pair ${key}`); bad++; }
      }
    }
    if (!bad) ok(`grade boundaries: ${rows} rows, all ordered, in range and matching paper maxima`);
  }
}
let terms = 0;
for (const g of GLOSSARY) {
  if (!Array.isArray(g.items)) { fail(`glossary group ${g.topic || g.n} has no items array`); continue; }
  terms += g.items.length;
  for (const it of g.items) if (!it.term || !it.def) fail(`glossary group ${g.topic}: entry missing term or def`);
}
ok(`glossary: ${GLOSSARY.length} groups, ${terms} terms`);

/* ------------------------------------------------------------- coverage info ---- */

const tagged = new Set();
for (const mod in PAPER_QUESTIONS)
  for (const year in PAPER_QUESTIONS[mod])
    for (const paperN in PAPER_QUESTIONS[mod][year])
      for (const q of PAPER_QUESTIONS[mod][year][paperN])
        for (const t of (q.topics || [])) tagged.add(t);
const uncovered = topics.filter(t => !tagged.has(t)).length;

report();

function report() {
  console.log('\nMaths Study Hub — pre-deploy validation\n');
  for (const n of notes) console.log(n);
  console.log(`\n  info  ${uncovered ?? '?'} of ${topics?.length ?? '?'} topics have no past-paper questions tagged`);
  console.log('        (not a failure — the Leaks report simply can\'t rank those topics yet)\n');
  if (errors.length) {
    console.error(`FAILED — ${errors.length} problem(s):\n`);
    for (const e of errors) console.error('  ' + e);
    console.error('');
    process.exit(1);
  }
  console.log('All checks passed.\n');
}
