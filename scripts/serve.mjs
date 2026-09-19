#!/usr/bin/env node
/* Static file server for previewing the app.
   `npm start` runs `python3 -m http.server`, which is fine from a terminal but has bitten this
   project twice: it fails with a getcwd PermissionError under some launchers, and on this Mac
   `/usr/bin/python3` is the Xcode shim, which refuses to run until its licence is accepted.
   This has no such dependency, and — the point — it lives *in the repo*, so a launcher config
   can point at a path that cannot go stale. Both .claude/launch.json files previously named a
   serve.js inside a deleted session scratchpad.
     node scripts/serve.mjs [port]                                                            */
import { createServer } from 'node:http';
import { readFile, stat } from 'node:fs/promises';
import { join, extname, normalize, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const PORT = +(process.argv[2] || process.env.PORT || 8125);
const TYPES = {
  '.html':'text/html; charset=utf-8', '.js':'text/javascript; charset=utf-8',
  '.mjs':'text/javascript; charset=utf-8', '.css':'text/css; charset=utf-8',
  '.json':'application/json; charset=utf-8', '.svg':'image/svg+xml',
  '.png':'image/png', '.jpg':'image/jpeg', '.jpeg':'image/jpeg', '.webp':'image/webp',
  '.ico':'image/x-icon', '.woff2':'font/woff2', '.map':'application/json; charset=utf-8',
};

createServer(async (req, res) => {
  try {
    let rel = decodeURIComponent((req.url || '/').split('?')[0]);
    if (rel.endsWith('/')) rel += 'index.html';
    // Normalise before joining so ../ cannot climb out of the repo.
    const path = join(ROOT, normalize(rel).replace(/^(\.\.[\/\\])+/, ''));
    const info = await stat(path);
    if (info.isDirectory()) throw new Error('directory');
    const body = await readFile(path);
    res.writeHead(200, {
      'Content-Type': TYPES[extname(path).toLowerCase()] || 'application/octet-stream',
      // No caching: the whole point of a preview is to see the edit you just made.
      'Cache-Control': 'no-store',
    });
    res.end(body);
  } catch {
    res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
    res.end('404');
  }
}).listen(PORT, () => console.log(`serving ${ROOT} on http://localhost:${PORT}`));
