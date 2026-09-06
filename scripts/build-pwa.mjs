import {readFile, readdir, stat, writeFile} from 'node:fs/promises';
import path from 'node:path';
import {randomUUID} from 'node:crypto';
import {fileURLToPath} from 'node:url';

const CACHE_PREFIX = 'orrery-pwa-v1-';

async function collect(directory, prefix = '') {
  const entries = (await readdir(directory, {withFileTypes:true})).filter(entry => !entry.name.startsWith('.') && !['private', 'node_modules'].includes(entry.name));
  const results = await Promise.all(entries.map(entry => entry.isDirectory()
    ? collect(path.join(directory, entry.name), `${prefix}${entry.name}/`)
    : [`${prefix}${entry.name}`]));
  return results.flat().filter(name => !['sw.js', 'pwa-release.json'].includes(name) && /\.(html|js|mjs|css|woff2?|ttf|otf|png|jpe?g|webp|avif|svg|ico|webmanifest|json|txt|xml|wasm)$/i.test(name)).sort();
}

export async function buildPwa({outDir = 'dist', version = '0.5.0-beta.1', releaseId = `${Date.now()}-${randomUUID()}`} = {}) {
  for (const [name, value] of Object.entries({version, releaseId})) {
    if (typeof value !== 'string' || !/^[A-Za-z0-9][A-Za-z0-9._+-]{0,159}$/.test(value)) throw new Error(`Invalid ${name}`);
  }
  const files = await collect(outDir);
  if (!files.includes('index.html')) throw new Error('PWA requires a completed Vite distribution with index.html');
  const assets = files.map(name => `/${name.split('/').map(encodeURIComponent).join('/')}`);
  if (files.includes('manifest.webmanifest')) {
    const manifest = JSON.parse(await readFile(path.join(outDir, 'manifest.webmanifest'), 'utf8'));
    for (const image of [...(manifest.icons || []), ...(manifest.screenshots || [])]) {
      if (!assets.includes(image.src)) throw new Error(`Manifest asset is not in the local distribution: ${image.src}`);
    }
  }
  const sizes = Object.fromEntries(await Promise.all(files.map(async (name, index) => [assets[index], (await stat(path.join(outDir, name))).size])));
  const cacheName = `${CACHE_PREFIX}${version}-${releaseId}`;
  const metadata = {version, releaseId, cacheName, assets, sizes};
  const worker = `/* Orrery production offline worker. Generated after Vite. */
const CACHE_NAME = ${JSON.stringify(cacheName)};
const CACHE_PREFIX = ${JSON.stringify(CACHE_PREFIX)};
const ASSETS = ${JSON.stringify(assets)};
const SIZES = ${JSON.stringify(sizes)};
const COMPLETE = '/__orrery_pwa_complete__';
self.addEventListener('install', event => {
  event.waitUntil(caches.open(CACHE_NAME).then(async cache => {
    // Bounded parallel fetches. No marker is written until every byte arrived.
    for (let offset = 0; offset < ASSETS.length; offset += 4) {
      const results = await Promise.allSettled(ASSETS.slice(offset, offset + 4).map(async url => {
        const response = await fetch(url, {cache:'reload', credentials:'same-origin', redirect:'error'});
        const isHTML = (response.headers.get('content-type') || '').includes('text/html');
        if (!response.ok || (isHTML && !url.endsWith('.html'))) throw new Error('Invalid precache response: ' + url);
        if ((await response.clone().arrayBuffer()).byteLength !== SIZES[url]) throw new Error('Incomplete precache response: ' + url);
        await cache.put(url, response);
      }));
      const failure = results.find(result => result.status === 'rejected');
      if (failure) throw failure.reason;
    }
    await cache.put(COMPLETE, new Response('complete'));
  }).catch(async error => {
    await caches.delete(CACHE_NAME);
    throw error;
  }));
});
self.addEventListener('activate', event => {
  event.waitUntil((async () => {
    const names = await caches.keys();
    await Promise.all(names.filter(name => name.startsWith(CACHE_PREFIX) && name !== CACHE_NAME).map(name => caches.delete(name)));
    await self.clients.claim();
  })());
});
self.addEventListener('message', event => {
  if (event.data?.type === 'ORRERY_APPLY_UPDATE') {
    event.waitUntil(self.skipWaiting());
    return;
  }
  if (event.data?.type !== 'ORRERY_STATUS' || !event.ports[0]) return;
  event.waitUntil((async () => {
    let complete = false;
    try {
      if (await caches.has(CACHE_NAME)) {
        const cache = await caches.open(CACHE_NAME);
        const keys = new Set((await cache.keys()).map(request => new URL(request.url).pathname));
        complete = keys.has(COMPLETE) && ASSETS.every(url => keys.has(url));
      }
    } catch { /* Storage may be denied or evicted after activation. */ }
    event.ports[0].postMessage({type:'ORRERY_STATUS', complete, cacheName:CACHE_NAME});
  })());
});
self.addEventListener('fetch', event => {
  const request = event.request;
  const url = new URL(request.url);
  if (request.method !== 'GET' || url.origin !== self.location.origin) return;
  const key = request.mode === 'navigate' && url.pathname === '/' ? '/index.html' : url.pathname;
  if (!ASSETS.includes(key)) return;
  event.respondWith((async () => {
    try {
      const cache = await caches.open(CACHE_NAME);
      const saved = await cache.match(key);
      if (saved) return saved;
    } catch { /* Browser policy must not break an otherwise-online app. */ }
    return fetch(request);
  })());
});
`;
  await writeFile(path.join(outDir, 'sw.js'), worker);
  await writeFile(path.join(outDir, 'pwa-release.json'), `${JSON.stringify(metadata, null, 2)}\n`);
  return metadata;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const result = await buildPwa({outDir:process.argv[2] || 'dist'});
  console.log(`Orrery PWA ${result.version} / ${result.releaseId}: ${result.assets.length} local files precached`);
}
