#!/usr/bin/env node
/* Render smoke test — open every Mistakes tab in a real browser and fail on any error.

   Why this exists: from 2026-08-23 to 2026-11-14 the Leaks report threw a ReferenceError
   whenever marks had been lost, because d97a582 deleted gbModulesForTrack() and left this one
   caller behind. Every other suite here extracts functions and runs them in node:vm, so none
   of them ever *rendered* the report, and plain JS has no compile step to notice a missing
   function. The page just kept its old contents. Only running the code finds that class of
   bug, so this runs it: the real index.html, in headless Chrome, driven by clicks.

   What it does, for each seed (empty → the empty states; heavy → every chart with data) and
   each course (A-Level only; A-Level + Further):
     - opens every logbook chip — A-Level Maths, Further Maths, and a custom one it creates —
     - clicks every visible breakdown tab (Log, Topics, Reasons, Trend, Leaks) and every
       visible group-by button, and checks each panel drew something,
     - opens and closes the edit dialog on the first entry, switching its Logbook select
       through every option, since that rebuilds the topic list.
   Any uncaught exception, unhandled rejection or console.error fails it, with the stack.

   Everything happens inside test mode (mshTestStart), so storage is namespaced and the cloud
   is never reached. No dependencies: Chrome is driven over the DevTools protocol with Node's
   built-in WebSocket (Node 22+). Chrome is found at $CHROME_PATH, the usual macOS path, or
   google-chrome / chromium on PATH. If none is found it FAILS rather than skipping, since a
   test that quietly skips is a test that quietly passes; set SKIP_RENDER=1 to skip on purpose.

   Point it at a modified copy to check an assertion really fails:
     node scripts/render-smoke-test.mjs /tmp/broken.html                                   */
import { spawn, execFileSync } from 'node:child_process';
import { createServer } from 'node:http';
import { readFile, mkdtemp, rm } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, extname, normalize, dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const TARGET = process.argv[2] ? resolve(process.argv[2]) : join(ROOT, 'index.html');
const TITLE = '\nRender smoke test — every Mistakes tab, in a real browser\n';

if (process.env.SKIP_RENDER === '1') { console.log(TITLE + '\n  SKIPPED (SKIP_RENDER=1)\n'); process.exit(0); }
if (typeof WebSocket !== 'function') {
  console.log(TITLE + '\n  FAIL  needs Node 22+ for the built-in WebSocket (this is ' + process.version + ')\n');
  process.exit(1);
}

function findChrome() {
  const cands = [process.env.CHROME_PATH,
    '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
    '/Applications/Chromium.app/Contents/MacOS/Chromium'].filter(Boolean);
  for (const c of cands) if (existsSync(c)) return c;
  for (const n of ['google-chrome', 'google-chrome-stable', 'chromium', 'chromium-browser']) {
    try { return execFileSync('which', [n], { encoding: 'utf8' }).trim(); } catch {}
  }
  return null;
}
const CHROME = findChrome();
if (!CHROME) {
  console.log(TITLE + '\n  FAIL  no Chrome found — set CHROME_PATH, or SKIP_RENDER=1 to skip on purpose\n');
  process.exit(1);
}

/* ---- a static server for the repo, with index.html swapped for TARGET ------------------ */
const TYPES = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8', '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml', '.png': 'image/png', '.woff2': 'font/woff2' };
const server = createServer(async (req, res) => {
  try {
    let rel = decodeURIComponent((req.url || '/').split('?')[0]);
    if (rel.endsWith('/')) rel += 'index.html';
    const path = rel === '/index.html' ? TARGET : join(ROOT, normalize(rel).replace(/^(\.\.[\/\\])+/, ''));
    const body = await readFile(path);
    res.writeHead(200, { 'Content-Type': TYPES[extname(path).toLowerCase()] || 'application/octet-stream', 'Cache-Control': 'no-store' });
    res.end(body);
  } catch { res.writeHead(404); res.end('404'); }
});
await new Promise(r => server.listen(0, '127.0.0.1', r));
const ORIGIN = 'http://127.0.0.1:' + server.address().port;

/* ---- Chrome, over the DevTools protocol ------------------------------------------------ */
const profile = await mkdtemp(join(tmpdir(), 'msh-render-'));
const chrome = spawn(CHROME, ['--headless=new', '--disable-gpu', '--no-first-run',
  '--no-default-browser-check', '--disable-extensions', '--remote-debugging-port=0',
  '--user-data-dir=' + profile, '--window-size=1280,900',
  ...(process.platform === 'linux' ? ['--no-sandbox'] : []), 'about:blank'],
  { stdio: ['ignore', 'ignore', 'pipe'] });
const wsUrl = await new Promise((res, rej) => {
  let buf = ''; const t = setTimeout(() => rej(new Error('Chrome did not start: ' + buf.slice(-400))), 20000);
  chrome.stderr.on('data', d => { buf += d; const m = buf.match(/DevTools listening on (ws:\/\/\S+)/); if (m) { clearTimeout(t); res(m[1]); } });
  chrome.on('exit', c => rej(new Error('Chrome exited with ' + c + ': ' + buf.slice(-400))));
});

const ws = new WebSocket(wsUrl);
await new Promise((r, j) => { ws.onopen = r; ws.onerror = j; });
let nextId = 0; const pending = new Map(); const listeners = [];
ws.onmessage = ev => {
  const msg = JSON.parse(ev.data);
  if (msg.id && pending.has(msg.id)) { const p = pending.get(msg.id); pending.delete(msg.id); msg.error ? p.rej(new Error(msg.error.message)) : p.res(msg.result); }
  else if (msg.method) listeners.forEach(f => f(msg));
};
const send = (method, params = {}, sessionId) => new Promise((res, rej) => {
  const id = ++nextId; pending.set(id, { res, rej }); ws.send(JSON.stringify({ id, method, params, sessionId }));
});

const { targetId } = await send('Target.createTarget', { url: 'about:blank' });
const { sessionId } = await send('Target.attachToTarget', { targetId, flatten: true });
const S = (m, p) => send(m, p, sessionId);
await S('Runtime.enable'); await S('Page.enable');

/* Every way an error can surface. Uncaught exceptions from load, timers and click handlers
   arrive as Runtime.exceptionThrown; console.error as consoleAPICalled. */
const errors = [];
let phase = 'loading';
listeners.push(msg => {
  if (msg.sessionId !== sessionId) return;
  if (msg.method === 'Runtime.exceptionThrown') {
    const d = msg.params.exceptionDetails;
    const desc = (d.exception && (d.exception.description || d.exception.value)) || d.text;
    errors.push(phase + ': uncaught ' + String(desc).split('\n').slice(0, 3).join(' | '));
  }
  if (msg.method === 'Runtime.consoleAPICalled' && msg.params.type === 'error') {
    errors.push(phase + ': console.error ' + msg.params.args.map(a => a.value ?? a.description ?? '').join(' ').slice(0, 300));
  }
});

async function evaluate(expr) {
  const r = await S('Runtime.evaluate', { expression: expr, awaitPromise: true, returnByValue: true });
  if (r.exceptionDetails) throw new Error((r.exceptionDetails.exception && r.exceptionDetails.exception.description) || r.exceptionDetails.text);
  return r.result.value;
}
const sleep = ms => new Promise(r => setTimeout(r, ms));
async function waitFor(expr, ms = 20000) {
  const end = Date.now() + ms;
  while (Date.now() < end) { try { if (await evaluate(expr)) return true; } catch {} await sleep(150); }
  throw new Error('timed out waiting for: ' + expr);
}

let pass = 0, fail = 0; const fails = [];
const check = (ok, label) => { ok ? pass++ : (fail++, fails.push(label)); };

/* The in-page driver. Returns what it saw so the node side can assert on it; errors are
   collected by the listeners above as well as caught here, so nothing is reported twice as
   "fine". */
const DRIVE = `(async () => {
  const W = ms => new Promise(r => setTimeout(r, ms));
  const vis = el => !!el && getComputedStyle(el).display !== 'none';
  const out = { books: [], caught: [] };
  const guard = (where, f) => { try { return f(); } catch (e) { out.caught.push(where + ': ' + (e && e.stack || e).toString().split('\\n').slice(0,3).join(' | ')); } };
  switchTab('mistakes'); await W(150);
  // A custom logbook, made through the app's own path so the third kind of chip is covered.
  if (!mkLogbooks.some(b => b.name === 'Smoke')) {
    guard('create logbook', () => { mkOpenEdit('new'); document.getElementById('mk-book-name').value = 'Smoke'; mkCommitEdit(); });
    await W(100);
  }
  const chips = () => [...document.querySelectorAll('#mk-book-chips .mk-book-chip')];
  const names = chips().map(c => c.firstChild.textContent);
  for (const name of names) {
    const chip = chips().find(c => c.firstChild.textContent === name);
    guard('chip ' + name, () => chip.click()); await W(120);
    const book = { name, active: mkActive, tabs: {}, groups: [] };
    for (const btn of [...document.querySelectorAll('#mv-tabs .mv-tab')].filter(vis)) {
      const v = btn.id.replace(/^mv-|-btn$/g, '');
      guard(name + ' / ' + v, () => btn.click()); await W(150);
      const panel = document.getElementById('mv-' + v);
      book.tabs[v] = { shown: vis(panel), drew: !!panel && (panel.innerText.trim().length > 0 || !!panel.querySelector('canvas,svg')) };
    }
    guard(name + ' / back to log', () => document.getElementById('mv-log-btn').click()); await W(80);
    for (const g of [...document.querySelectorAll('.mk-filter-btn[data-group]')].filter(vis)) {
      guard(name + ' / group ' + g.dataset.group, () => g.click()); await W(80); book.groups.push(g.dataset.group);
    }
    const first = mkEntries()[0];
    if (first) {
      guard(name + ' / edit open', () => openEditMistake(first.id)); await W(120);
      const sel = document.getElementById('em-book-sel');
      for (const o of [...sel.options]) { guard(name + ' / edit → ' + o.value, () => { sel.value = o.value; sel.dispatchEvent(new Event('change')); }); await W(40); }
      guard(name + ' / edit close', () => closeEditMistake()); await W(60);
      book.edited = true;
    }
    out.books.push(book);
  }
  return out;
})()`;

async function runCase(seed, track) {
  phase = seed + '/' + track + ' load';
  await S('Page.navigate', { url: ORIGIN + '/' });
  await waitFor(`typeof mshTestStart === 'function'`);
  await evaluate(`mshTestStart({seed:${JSON.stringify(seed)}, go:'mistakes'}), true`);
  await sleep(300);
  // The seed reloads the page once more; wait for the seeded, test-mode page to settle.
  await waitFor(`window.MSH_TEST && typeof mkSetActive === 'function' && document.querySelector('#mk-book-chips .mk-book-chip') && ${seed === 'empty' ? 'true' : 'mistakes.length > 0'}`);
  await sleep(500);
  phase = seed + '/' + track;
  // Set every time: the sandbox's storage outlives a navigation, so the last case's track would leak in.
  await evaluate(`setTrack(${JSON.stringify(track)}); populateMistakeTopics(); renderMistakesTab(); true`);
  const r = await evaluate(DRIVE);
  const tag = `[${seed}, ${track === 'fm' ? 'Maths + Further' : 'Maths only'}]`;
  r.caught.forEach(c => errors.push(phase + ': ' + c));
  const names = r.books.map(b => b.name);
  check(names.includes('A-Level Maths') && names.includes('Smoke'), `${tag} the A-Level and custom chips render — saw ${names.join(', ')}`);
  // Further Maths shows on the FM track, or off it only while it holds entries.
  if (track === 'fm' || seed === 'heavy') check(names.includes('Further Maths'), `${tag} the Further Maths chip renders`);
  else check(!names.includes('Further Maths'), `${tag} no Further Maths chip on a Maths-only course with no FM entries`);
  for (const b of r.books) {
    const tabs = Object.keys(b.tabs);
    const syllabus = b.name !== 'Smoke';
    check(syllabus ? tabs.length === 5 : tabs.length === 3, `${tag} ${b.name}: ${syllabus ? 5 : 3} tabs visible — saw ${tabs.join(', ')}`);
    for (const t of tabs) check(b.tabs[t].shown && b.tabs[t].drew, `${tag} ${b.name} / ${t}: panel shown and drew something`);
    if (seed === 'heavy' && syllabus) check(b.edited, `${tag} ${b.name}: the edit dialog was exercised`);
  }
}

let crashed = null;
try {
  for (const seed of ['empty', 'heavy']) for (const track of ['alevel', 'fm']) await runCase(seed, track);
} catch (e) { crashed = e; }

const before = errors.length;
check(errors.length === 0, 'no uncaught errors, rejections or console.error anywhere' +
  (before ? ':\n        ' + errors.slice(0, 12).join('\n        ') : ''));
if (crashed) { fail++; fails.push('the run itself failed: ' + crashed.message); }

try { ws.close(); } catch {}
chrome.kill('SIGKILL'); server.close();
await rm(profile, { recursive: true, force: true }).catch(() => {});

console.log(TITLE);
fails.forEach(f => console.log('  FAIL  ' + f));
if (!fail) console.log('  ok   all ' + pass + ' assertions passed\n');
else { console.log('\n  ' + fail + ' of ' + (pass + fail) + ' failed\n'); process.exit(1); }
