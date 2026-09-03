import { readdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { createHash } from 'node:crypto';

async function walk(dir) {
  const entries = await readdir(dir, { withFileTypes: true });
  const nested = await Promise.all(entries.map(entry => entry.isDirectory() ? walk(path.join(dir, entry.name)) : path.join(dir, entry.name)));
  return nested.flat();
}
const output = path.resolve('out');
const files = await walk(path.join(output, '_next', 'static'));
const assets = files.filter(file => /\.(js|css|woff2?)$/.test(file)).map(file => '/' + path.relative(output, file).split(path.sep).join('/'));
const shell = await readFile(path.join(output, 'index.html'), 'utf8');
const version = createHash('sha256').update(shell + assets.join('\n')).digest('hex').slice(0, 14);
const precache = ['/', '/manifest.webmanifest', '/favicon.svg', '/icons/icon-192.png', '/icons/icon-512.png', '/icons/apple-touch-icon.png', ...assets];
const worker = `// Generated from this production build. Only the app shell is cached, never financial records.
const CACHE = 'paypay-shell-${version}';
const PRECACHE = ${JSON.stringify(precache)};
self.addEventListener('install', event => {
  event.waitUntil(caches.open(CACHE).then(cache => cache.addAll(PRECACHE)));
});
self.addEventListener('activate', event => {
  event.waitUntil(caches.keys().then(keys => Promise.all(keys.filter(key => key.startsWith('paypay-shell-') && key !== CACHE).map(key => caches.delete(key)))).then(() => self.clients.claim()));
});
self.addEventListener('fetch', event => {
  const url = new URL(event.request.url);
  if (event.request.method !== 'GET' || url.origin !== self.location.origin) return;
  if (event.request.mode === 'navigate' && (url.pathname === '/' || url.pathname === '/index.html')) {
    event.respondWith((async () => {
      const cache = await caches.open(CACHE);
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 3500);
      try {
        const response = await fetch(event.request, { signal: controller.signal });
        // Auth redirects and error responses are never saved as the app shell.
        if (response.ok && !response.redirected && new URL(response.url).pathname === '/') await cache.put('/', response.clone());
        return response;
      } catch {
        return (await cache.match('/')) || new Response('Open Paypay online once to prepare offline access.', { status: 503, headers: { 'Content-Type': 'text/plain' } });
      } finally { clearTimeout(timeout); }
    })());
    return;
  }
  if (PRECACHE.includes(url.pathname)) {
    event.respondWith(caches.open(CACHE).then(async cache => (await cache.match(url.pathname)) || fetch(event.request)));
  }
});
`;
await writeFile(path.join(output, 'sw.js'), worker);
await writeFile(path.join(output, '_headers'), '/sw.js\n  Cache-Control: no-cache\n  Service-Worker-Allowed: /\n/manifest.webmanifest\n  Content-Type: application/manifest+json\n');
console.log(`Offline shell prepared: ${precache.length} local assets, cache ${version}.`);
