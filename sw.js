/* Maths Study Hub — service worker.
 *
 * Purpose: make the app genuinely usable with no signal. All study state already lives in
 * localStorage, so the only thing standing between you and revising on a train was the
 * shell itself failing to load. This caches the shell + all five data files up front.
 *
 * Bump CACHE_VERSION whenever index.html, styles.css or data/ changes shape. Old caches are
 * deleted on activate, so a bump is the clean way to force every device onto a new build.
 */
const CACHE_VERSION = 'v32';
const SHELL_CACHE   = 'msh-shell-' + CACHE_VERSION;
const VENDOR_CACHE  = 'msh-vendor-' + CACHE_VERSION;

/* Everything the app needs to boot with zero network. Relative paths so this works both at
   a domain root and under a GitHub Pages project path (/mathsALevel/). */
const SHELL = [
  './',
  './index.html',
  './styles.css',
  './exam-dates.json',
  './data/clusters.js',
  './data/paper-questions.js',
  './data/glossary.js',
  './data/formulas.js',
  './data/grade-boundaries.js'
];

/* Third-party origins worth keeping a copy of: MathJax renders every formula in the app, and
   the fonts are the difference between "offline" and "offline and ugly". Deliberately does
   NOT include Firebase or Gemini — see the fetch handler. */
const VENDOR_HOSTS = [
  'cdn.jsdelivr.net',
  'fonts.googleapis.com',
  'fonts.gstatic.com',
  /* The Firebase SDK. Without it cached, going offline meant the three <script> tags failed,
     `firebase` was undefined, and the whole sync block bailed out early — taking the
     localStorage hook with it. Offline edits were then never queued for the cloud at all, and
     could be overwritten wholesale by another device on reconnect. Caching it is what makes
     Firestore's offline write queue — the thing that actually makes revision on a train safe
     — reachable in the first place. */
  'www.gstatic.com'
];

/* Never intercept these. Firestore holds its own long-lived streams and does its own offline
   persistence via IndexedDB; a service worker sitting in the middle only breaks realtime
   sync. Gemini calls are user-specific and must never be served from a cache. */
const BYPASS_HOSTS = [
  'firestore.googleapis.com',
  'firebase.googleapis.com',
  'identitytoolkit.googleapis.com',
  'securetoken.googleapis.com',
  'generativelanguage.googleapis.com'
];

self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(SHELL_CACHE)
      // addAll is all-or-nothing; a single 404 would leave the app with no worker at all.
      // Cache each file independently so one bad path can't sink the whole install.
      .then(cache => Promise.all(SHELL.map(url =>
        cache.add(new Request(url, { cache: 'reload' })).catch(() => null)
      )))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys()
      .then(names => Promise.all(
        names.filter(n => n !== SHELL_CACHE && n !== VENDOR_CACHE).map(n => caches.delete(n))
      ))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', event => {
  const req = event.request;
  if (req.method !== 'GET') return;

  let url;
  try { url = new URL(req.url); } catch (e) { return; }
  if (BYPASS_HOSTS.indexOf(url.hostname) >= 0) return;

  /* Navigations: try the network so a fresh push reaches you the moment you're online,
     but fall back to the cached shell rather than the browser's offline page. */
  if (req.mode === 'navigate') {
    event.respondWith(
      fetch(req)
        .then(res => {
          const copy = res.clone();
          caches.open(SHELL_CACHE).then(c => c.put('./index.html', copy)).catch(() => {});
          return res;
        })
        .catch(() => caches.match('./index.html', { ignoreSearch: true })
          .then(hit => hit || caches.match('./')))
    );
    return;
  }

  /* Own files: network-first, cache fallback. Same reasoning as navigations — deploy is a
     git push, so the newest version should always win when the network is there. */
  if (url.origin === self.location.origin) {
    event.respondWith(
      fetch(req)
        .then(res => {
          if (res && res.ok) {
            const copy = res.clone();
            caches.open(SHELL_CACHE).then(c => c.put(req, copy)).catch(() => {});
          }
          return res;
        })
        .catch(() => caches.match(req, { ignoreSearch: true }))
    );
    return;
  }

  /* MathJax and fonts: cache-first with a background refresh. These are effectively
     immutable and large, so serving them from disk makes every cold start faster, online
     or not. Opaque cross-origin responses are cached too — they still replay fine. */
  if (VENDOR_HOSTS.indexOf(url.hostname) >= 0) {
    event.respondWith(
      caches.match(req).then(hit => {
        const network = fetch(req).then(res => {
          if (res && (res.ok || res.type === 'opaque')) {
            const copy = res.clone();
            caches.open(VENDOR_CACHE).then(c => c.put(req, copy)).catch(() => {});
          }
          return res;
        }).catch(() => hit);
        return hit || network;
      })
    );
  }
});
