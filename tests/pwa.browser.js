import {after, before, test} from 'node:test';
import assert from 'node:assert/strict';
import {existsSync} from 'node:fs';
import {mkdtemp, readFile, readdir, rm, writeFile} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {createServer} from 'node:http';
import {build, createServer as createViteServer} from 'vite';
import {chromium, expect} from '@playwright/test';

const root = fileURLToPath(new URL('../', import.meta.url));
const builderPath = path.join(root, 'scripts/build-pwa.mjs');
let temporary, output, browser, server, origin, buildPwa;
const faults = new Map();
const mime = {'.html':'text/html', '.js':'text/javascript', '.css':'text/css', '.json':'application/json', '.webmanifest':'application/manifest+json', '.png':'image/png', '.jpg':'image/jpeg', '.woff2':'font/woff2', '.txt':'text/plain'};

async function files(directory, prefix = '') {
  const entries = await readdir(directory, {withFileTypes:true});
  const results = await Promise.all(entries.map(entry => entry.isDirectory() ? files(path.join(directory, entry.name), `${prefix}${entry.name}/`) : [`${prefix}${entry.name}`]));
  return results.flat().sort();
}

before(async () => {
  temporary = await mkdtemp(path.join(tmpdir(), 'orrery-pwa-'));
  output = path.join(temporary, 'dist');
  // A private production build: never touches dist/, preview, or browser config.
  await build({root, configFile:false, cacheDir:path.join(temporary, 'vite-build-cache'), logLevel:'error', plugins:[{name:'pwa-test-integration', transform(code, id) { if (id === path.join(root, 'src/main.js') && existsSync(path.join(root, 'src/pwa.js'))) return `import './pwa.js';\n${code}`; }}], build:{outDir:output, emptyOutDir:true, sourcemap:false, rollupOptions:{output:{entryFileNames:'assets/[name].js', chunkFileNames:'assets/[name].js', assetFileNames:'assets/[name][extname]'}}}});
  server = createServer(async (request, response) => {
    const pathname = new URL(request.url, 'http://localhost').pathname;
    const fault = faults.get(pathname);
    if (fault) return fault(request, response);
    try {
      const relative = decodeURIComponent(pathname === '/' ? '/index.html' : pathname);
      const target = path.resolve(output, `.${relative}`);
      if (!target.startsWith(`${output}${path.sep}`)) throw new Error('Invalid path');
      const body = await readFile(target);
      response.writeHead(200, {'Content-Type':mime[path.extname(target)] || 'application/octet-stream', 'Cache-Control':'no-store'});
      response.end(body);
    } catch {
      response.writeHead(404, {'Content-Type':'text/plain'});
      response.end('Not found');
    }
  });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  origin = `http://127.0.0.1:${server.address().port}`;
  const executablePath = [process.env.ORRERY_BROWSER, '/Applications/Microsoft Edge.app/Contents/MacOS/Microsoft Edge', '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'].filter(Boolean).find(existsSync);
  browser = await chromium.launch({executablePath, args:['--enable-unsafe-swiftshader']});
});

after(async () => {
  await browser?.close();
  if (server) {server.closeAllConnections(); await new Promise(resolve => server.close(resolve));}
  if (temporary) await rm(temporary, {recursive:true, force:true});
});

async function release(releaseId) {
  assert.ok(existsSync(builderPath), 'Production PWA builder must exist');
  ({buildPwa} = await import(builderPath));
  return buildPwa({outDir:output, version:'0.5.0-beta.1', releaseId});
}

async function contextFor(t) {
  const context = await browser.newContext({serviceWorkers:'allow', reducedMotion:'reduce'});
  t.after(() => context.close());
  return context;
}

async function register(page) {
  return page.evaluate(async () => {
    const registration = await navigator.serviceWorker.register('/sw.js', {scope:'/', updateViaCache:'none'});
    await navigator.serviceWorker.ready;
    if (!navigator.serviceWorker.controller) await new Promise(resolve => navigator.serviceWorker.addEventListener('controllerchange', resolve, {once:true}));
    return registration.scope;
  });
}

test('production worker precaches every local build file for a cold offline navigation', async t => {
  await release('offline-a');
  const expected = (await files(output)).filter(name => !name.startsWith('.') && !['sw.js', 'pwa-release.json'].includes(name));
  const context = await contextFor(t);
  const page = await context.newPage();
  await page.goto(origin);
  await register(page);
  const cacheNames = await page.evaluate(() => caches.keys());
  assert.equal(cacheNames.filter(name => name.startsWith('orrery-pwa-v1-')).length, 1);
  await context.setOffline(true);
  await page.close();
  const cold = await context.newPage();
  const errors = [];
  cold.on('pageerror', error => errors.push(error.message));
  await cold.goto(`${origin}/?offline=cold`);
  await cold.waitForFunction(() => window.__orrery?.diagnostics().ready);
  await expect(cold.locator('#pwa-status')).toHaveAttribute('data-state', 'ready');
  assert.deepEqual(errors, []);
  for (const name of expected) {
    const actual = await cold.evaluate(async url => {
      const response = await fetch(url);
      return {ok:response.ok, bytes:[...new Uint8Array(await response.arrayBuffer())]};
    }, `/${name}`);
    assert.equal(actual.ok, true, name);
    assert.deepEqual(Buffer.from(actual.bytes), await readFile(path.join(output, name)), name);
  }
  await expect(cold.locator('#body-name')).toHaveText('Earth');
});

test('footer claims offline readiness only after the complete precache is confirmed', async t => {
  assert.ok(existsSync(path.join(root, 'src/pwa.js')), 'PWA footer module must exist');
  await release('status-a');
  const context = await contextFor(t);
  const page = await context.newPage();
  let unblock;
  const gate = new Promise(resolve => {unblock = resolve;});
  const asset = '/textures/2k_neptune.jpg';
  faults.set(asset, async (request, response) => {
    await gate;
    response.writeHead(200, {'Content-Type':'image/jpeg'});
    response.end(await readFile(path.join(output, asset)));
  });
  t.after(() => {unblock(); faults.delete(asset);});
  await page.goto(origin, {waitUntil:'domcontentloaded'});
  await expect(page.locator('#pwa-status')).toHaveAttribute('data-state', 'preparing');
  await expect(page.locator('#pwa-status')).toHaveAttribute('role', 'status');
  assert.equal(await page.evaluate(() => navigator.serviceWorker.controller), null);
  unblock();
  await expect(page.locator('#pwa-status')).toHaveAttribute('data-state', 'ready', {timeout:20000});
  await expect(page.locator('#pwa-status')).toHaveText('Available offline');
  await context.setOffline(true);
  await expect(page.locator('#pwa-status')).toHaveText('Offline · using saved Orrery');
});

test('a failed precache removes its partial cache and never claims offline readiness', async t => {
  const metadata = await release('failed-a');
  const asset = '/textures/2k_neptune.jpg';
  faults.set(asset, (request, response) => {response.writeHead(404); response.end('missing');});
  t.after(() => faults.delete(asset));
  const context = await contextFor(t);
  const page = await context.newPage();
  await page.goto(origin);
  await expect(page.locator('#pwa-status')).toHaveAttribute('data-state', 'unavailable');
  assert.equal(await page.evaluate(() => navigator.serviceWorker.controller), null);
  assert.ok(!(await page.evaluate(() => caches.keys())).includes(metadata.cacheName));
});

test('invalid successful responses cannot turn a broken deployment into an offline-ready app', async t => {
  const asset = '/textures/2k_neptune.jpg';
  for (const mode of ['html-fallback', 'truncated', 'redirect']) await t.test(mode, async t => {
    const metadata = await release(`invalid-${mode}`);
    const bytes = await readFile(path.join(output, asset));
    faults.set(asset, (request, response) => {
      if (mode === 'redirect') {response.writeHead(302, {Location:'/textures/2k_mars.jpg'}); return response.end();}
      response.writeHead(200, {'Content-Type':mode === 'html-fallback' ? 'text/html' : 'image/jpeg'});
      response.end(mode === 'html-fallback' ? Buffer.alloc(bytes.length, 32) : bytes.subarray(0, 100));
    });
    t.after(() => faults.delete(asset));
    const context = await contextFor(t);
    const page = await context.newPage();
    await page.goto(origin);
    await expect(page.locator('#pwa-status')).toHaveAttribute('data-state', 'unavailable');
    assert.ok(!(await page.evaluate(() => caches.keys())).includes(metadata.cacheName));
  });
});

test('updates wait for consent, reload only the consenting tab once, and clean only owned caches', async t => {
  const originalHTML = await readFile(path.join(output, 'index.html'), 'utf8');
  t.after(() => writeFile(path.join(output, 'index.html'), originalHTML));
  await writeFile(path.join(output, 'index.html'), originalHTML.replace('</head>', '<meta name="pwa-test-release" content="A"></head>'));
  const first = await release('update-a');
  const context = await contextFor(t);
  const page = await context.newPage();
  await page.goto(origin);
  await expect(page.locator('#pwa-status')).toHaveAttribute('data-state', 'ready');
  await page.waitForFunction(() => window.__orrery?.diagnostics().ready);
  await page.locator('[data-body="jupiter"]').click();
  await page.locator('[data-focus-moon="europa"]').click();
  const peer = await context.newPage();
  await peer.goto(origin);
  await expect(peer.locator('#pwa-status')).toHaveAttribute('data-state', 'ready');
  await peer.evaluate(() => {window.pwaUnchangedTab = 'still inspecting';});
  await page.evaluate(() => caches.open('another-app-cache').then(cache => cache.put('/foreign-proof', new Response('keep'))));
  let reloads = 0;
  page.on('framenavigated', frame => {if (frame === page.mainFrame()) reloads++;});
  await writeFile(path.join(output, 'index.html'), originalHTML.replace('</head>', '<meta name="pwa-test-release" content="B"></head>'));
  const second = await release('update-b');
  await page.evaluate(async () => (await navigator.serviceWorker.getRegistration()).update());
  await expect(page.locator('#pwa-update')).toBeVisible({timeout:20000});
  assert.equal(reloads, 0);
  assert.equal(await page.evaluate(() => window.__orrery.diagnostics().inspectedMoon), 'europa');
  assert.equal(await page.locator('meta[name="pwa-test-release"]').getAttribute('content'), 'A');
  await expect(page.locator('#pwa-update')).toHaveAccessibleName('Update & reload');
  await page.locator('#pwa-update').click();
  await expect(page.locator('meta[name="pwa-test-release"]')).toHaveAttribute('content', 'B');
  await expect(page.locator('#pwa-status')).toHaveAttribute('data-state', 'ready');
  assert.equal(reloads, 1);
  assert.equal(await peer.evaluate(() => window.pwaUnchangedTab), 'still inspecting');
  const names = await page.evaluate(() => caches.keys());
  assert.ok(names.includes(second.cacheName));
  assert.ok(!names.includes(first.cacheName));
  assert.ok(names.includes('another-app-cache'));
});

test('install is offered only by browser capability and only prompts on an explicit click', async t => {
  await release('install-a');
  const context = await contextFor(t);
  const page = await context.newPage();
  await page.goto(origin);
  await expect(page.locator('#pwa-install')).toBeHidden();
  await page.evaluate(() => {
    window.installPrompts = 0;
    const event = new Event('beforeinstallprompt', {cancelable:true});
    event.prompt = async () => {window.installPrompts++;};
    event.userChoice = Promise.resolve({outcome:'dismissed'});
    window.dispatchEvent(event);
    window.installPrevented = event.defaultPrevented;
  });
  await expect(page.locator('#pwa-install')).toBeVisible();
  assert.equal(await page.evaluate(() => window.installPrevented), true);
  assert.equal(await page.evaluate(() => window.installPrompts), 0);
  await page.locator('#pwa-install').click();
  await expect(page.locator('#pwa-install')).toBeHidden();
  assert.equal(await page.evaluate(() => window.installPrompts), 1);
  await page.getByRole('button', {name:'Install & offline help'}).click();
  await expect(page.locator('#science-dialog')).toBeVisible();
  await expect(page.locator('#pwa-help')).toContainText('Add to Home Screen');
  await expect(page.locator('#pwa-help')).toContainText('Add to Dock');
  await expect(page.locator('#pwa-help')).toContainText('separate browser capabilities');
  await page.keyboard.press('Escape');
  await expect(page.locator('#science-dialog')).not.toBeVisible();
});

test('unsupported and insecure environments retain help without registering or breaking the instrument', async t => {
  await release('unsupported-a');
  for (const mode of ['unsupported', 'insecure', 'denied']) await t.test(mode, async t => {
    const context = await contextFor(t);
    await context.addInitScript(mode => {
      window.pwaRegistrationCalls = 0;
      if (mode === 'unsupported') Object.defineProperty(navigator, 'serviceWorker', {value:undefined});
      else {
        navigator.serviceWorker.register = async () => {window.pwaRegistrationCalls++; throw new DOMException('Policy denied', 'SecurityError');};
        if (mode === 'insecure') Object.defineProperty(window, 'isSecureContext', {value:false});
      }
    }, mode);
    const page = await context.newPage();
    const errors = [];
    page.on('pageerror', error => errors.push(error.message));
    await page.goto(origin);
    await expect(page.locator('#pwa-status')).toHaveAttribute('data-state', 'unavailable');
    await page.waitForFunction(() => Boolean(window.__orrery));
    await expect(page.locator('#pwa-help-open')).toBeVisible();
    assert.equal(await page.evaluate(() => window.pwaRegistrationCalls), mode === 'denied' ? 1 : 0);
    assert.deepEqual(errors, []);
  });
});

test('Vite development never registers a production worker', async t => {
  const nodeEnv = process.env.NODE_ENV;
  process.env.NODE_ENV = 'development';
  t.after(() => {process.env.NODE_ENV = nodeEnv;});
  const dev = await createViteServer({root, configFile:false, cacheDir:path.join(temporary, 'vite-dev-cache'), logLevel:'error', server:{host:'127.0.0.1', port:0}, plugins:[{name:'pwa-dev-test', transform(code, id) {if (id === path.join(root, 'src/main.js')) return `import './pwa.js';\n${code}`;}}]});
  t.after(() => dev.close());
  await dev.listen();
  const context = await contextFor(t);
  const page = await context.newPage();
  await page.goto(`http://127.0.0.1:${dev.httpServer.address().port}`);
  await expect(page.locator('#pwa-status')).toHaveText('Offline support is disabled in development');
  assert.equal((await page.evaluate(() => navigator.serviceWorker.getRegistrations())).length, 0);
});

test('a partially evicted cache is no longer reported as available offline', async t => {
  const metadata = await release('evicted-a');
  const context = await contextFor(t);
  const page = await context.newPage();
  await page.goto(origin);
  await expect(page.locator('#pwa-status')).toHaveAttribute('data-state', 'ready');
  await page.evaluate(async name => {
    await (await caches.open(name)).delete('/textures/2k_neptune.jpg');
    window.dispatchEvent(new Event('pageshow'));
  }, metadata.cacheName);
  await expect(page.locator('#pwa-status')).toHaveAttribute('data-state', 'unavailable');
  // The unchanged worker can fetch online, but does not recache a missing entry.
  await page.reload();
  await expect(page.locator('#pwa-status')).toHaveAttribute('data-state', 'unavailable');
  assert.equal(await page.evaluate(async name => Boolean(await (await caches.open(name)).match('/textures/2k_neptune.jpg')), metadata.cacheName), false);
  await expect(page.locator('#pwa-status')).toHaveText('Offline copy unavailable · see Install & offline help');
  await page.getByRole('button', {name:'Install & offline help'}).click();
  await expect(page.locator('#science-dialog')).toBeVisible();
  for (const guidance of [
    'If the offline copy is partly deleted or browser storage fails, reconnect and reload.',
    'Reconnecting or reloading alone may not repair a partly deleted copy.',
    'Check that your browser allows site storage and has free space.',
    'While online, close all Orrery tabs and app windows, clear only this site’s data in browser settings, then reopen Orrery online and wait for Available offline.',
    'Clearing site data removes the offline copy and may require reinstalling the app.',
    'Do not clear site data while offline.'
  ]) await expect(page.locator('#pwa-help')).toContainText(guidance);
});

test('reconnecting retries a failed install without reloading the inspection', async t => {
  await release('retry-a');
  const asset = '/textures/2k_neptune.jpg';
  faults.set(asset, (request, response) => {response.writeHead(503); response.end('offline');});
  t.after(() => faults.delete(asset));
  const context = await contextFor(t);
  const page = await context.newPage();
  await page.goto(origin);
  await expect(page.locator('#pwa-status')).toHaveAttribute('data-state', 'unavailable');
  await page.evaluate(() => {window.pwaNoReload = true;});
  faults.delete(asset);
  await page.evaluate(() => window.dispatchEvent(new Event('online')));
  await expect(page.locator('#pwa-status')).toHaveAttribute('data-state', 'ready');
  assert.equal(await page.evaluate(() => window.pwaNoReload), true);
});

test('an unresponsive or denied worker cannot leave a stale ready status', async t => {
  await release('unresponsive-a');
  for (const mode of ['silent', 'throw']) await t.test(mode, async t => {
    const context = await contextFor(t);
    const page = await context.newPage();
    const errors = [];
    page.on('pageerror', error => errors.push(error.message));
    await page.goto(origin);
    await expect(page.locator('#pwa-status')).toHaveAttribute('data-state', 'ready');
    await page.evaluate(mode => {
      navigator.serviceWorker.controller.postMessage = () => {if (mode === 'throw') throw new DOMException('Denied', 'SecurityError');};
      window.dispatchEvent(new Event('pageshow'));
    }, mode);
    await expect(page.locator('#pwa-status')).toHaveAttribute('data-state', 'unavailable', {timeout:10000});
    assert.deepEqual(errors, []);
  });
});

test('storage revoked after activation falls back to the network instead of breaking assets', async t => {
  await release('storage-revoked-a');
  const context = await contextFor(t);
  const page = await context.newPage();
  await page.goto(origin);
  await expect(page.locator('#pwa-status')).toHaveAttribute('data-state', 'ready');
  await context.serviceWorkers()[0].evaluate(() => {
    caches.open = async () => {throw new DOMException('Storage denied', 'SecurityError');};
  });
  const result = await page.evaluate(async () => {
    try {return (await fetch('/textures/2k_neptune.jpg')).ok;} catch {return false;}
  });
  assert.equal(result, true);
});

test('the worker never caches third-party, non-GET, or unknown runtime requests', async t => {
  const metadata = await release('boundaries-a');
  const context = await contextFor(t);
  const page = await context.newPage();
  const external = createServer((request, response) => {response.writeHead(200, {'Access-Control-Allow-Origin':'*'}); response.end('external-only');});
  await new Promise(resolve => external.listen(0, '127.0.0.1', resolve));
  t.after(() => {external.closeAllConnections(); return new Promise(resolve => external.close(resolve));});
  const externalURL = `http://127.0.0.1:${external.address().port}/third-party`;
  const runtime = '/network-only.txt';
  faults.set(runtime, (request, response) => {response.writeHead(200); response.end('runtime-only');});
  t.after(() => faults.delete(runtime));
  await page.goto(origin);
  await expect(page.locator('#pwa-status')).toHaveAttribute('data-state', 'ready');
  const asset = '/textures/2k_neptune.jpg';
  faults.set(asset, (request, response) => {response.writeHead(200); response.end(`${request.method}-network-only`);});
  t.after(() => faults.delete(asset));
  const bodies = await page.evaluate(async ({externalURL, asset, runtime}) => Promise.all([
    fetch(externalURL).then(response => response.text()),
    fetch(asset, {method:'POST', body:'test'}).then(response => response.text()),
    fetch(runtime).then(response => response.text())
  ]), {externalURL, asset, runtime});
  assert.deepEqual(bodies, ['external-only', 'POST-network-only', 'runtime-only']);
  const cached = await page.evaluate(async cacheName => (await (await caches.open(cacheName)).keys()).map(request => request.url).sort(), metadata.cacheName);
  assert.deepEqual(cached, [...metadata.assets, '/__orrery_pwa_complete__'].map(url => `${origin}${url}`).sort());
  await context.setOffline(true);
  assert.equal(await page.evaluate(async url => {try {await fetch(url); return true;} catch {return false;}}, externalURL), false);
  assert.equal(await page.evaluate(async url => {try {await fetch(url); return true;} catch {return false;}}, runtime), false);
});

test('real browser quota exhaustion rejects the entire offline install', async t => {
  const metadata = await release('quota-a');
  const context = await contextFor(t);
  const page = await context.newPage();
  const session = await context.newCDPSession(page);
  await session.send('Storage.overrideQuotaForOrigin', {origin, quotaSize:1024});
  await page.goto(origin);
  await expect(page.locator('#pwa-status')).toHaveAttribute('data-state', 'unavailable');
  assert.equal(await page.evaluate(() => navigator.serviceWorker.controller), null);
  assert.ok(!(await page.evaluate(() => caches.keys())).includes(metadata.cacheName));
});

test('PWA footer controls fit mobile and desktop and expose adequate keyboard targets', async t => {
  await release('layout-a');
  const context = await contextFor(t);
  const page = await context.newPage();
  await page.goto(origin);
  await page.evaluate(() => {
    const event = new Event('beforeinstallprompt', {cancelable:true});
    event.prompt = async () => {};
    event.userChoice = Promise.resolve({outcome:'dismissed'});
    window.dispatchEvent(event);
  });
  for (const width of [390, 640, 767, 1440]) {
    await page.setViewportSize({width, height:1000});
    await page.locator('#pwa-help-open').scrollIntoViewIfNeeded();
    for (const id of ['pwa-install', 'pwa-help-open']) {
      const box = await page.locator(`#${id}`).boundingBox();
      assert.ok(box.x >= 0 && box.x + box.width <= width, `${id} fits at ${width}`);
      assert.ok(box.height >= 44, `${id} has a 44px target at ${width}`);
    }
    await page.locator('#pwa-help-open').focus();
    await expect(page.locator('#pwa-help-open')).toBeFocused();
  }
  await page.evaluate(() => document.fonts.ready);
  const session = await context.newCDPSession(page);
  await session.send('DOM.enable');
  await session.send('CSS.enable');
  const {root:documentNode} = await session.send('DOM.getDocument');
  const {nodeId} = await session.send('DOM.querySelector', {nodeId:documentNode.nodeId, selector:'#pwa-help-open'});
  const {fonts} = await session.send('CSS.getPlatformFontsForNode', {nodeId});
  assert.ok(fonts.some(font => font.isCustomFont && font.glyphCount > 0 && /Departure/i.test(font.familyName)), 'PWA HUD uses rendered local Departure Mono glyphs');
});

test('install help remains usable without the native dialog API', async t => {
  await release('dialog-a');
  const context = await contextFor(t);
  await context.addInitScript(() => {HTMLDialogElement.prototype.showModal = undefined; HTMLDialogElement.prototype.close = undefined;});
  const page = await context.newPage();
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  await page.goto(origin);
  await page.locator('#pwa-help-open').click();
  await expect(page.locator('#science-dialog')).toBeVisible();
  await expect(page.locator('#pwa-help-title')).toBeFocused();
  await page.keyboard.press('Escape');
  await expect(page.locator('#science-dialog')).not.toBeVisible();
  assert.deepEqual(errors, []);
});

test('a rejected update preserves the active offline release', async t => {
  const first = await release('retained-a');
  const context = await contextFor(t);
  const page = await context.newPage();
  await page.goto(origin);
  await expect(page.locator('#pwa-status')).toHaveAttribute('data-state', 'ready');
  const second = await release('retained-b');
  const asset = '/textures/2k_neptune.jpg';
  faults.set(asset, (request, response) => {response.writeHead(503); response.end('unavailable');});
  t.after(() => faults.delete(asset));
  await page.evaluate(async () => {
    const registration = await navigator.serviceWorker.getRegistration();
    window.pwaRejectedUpdate = false;
    registration.addEventListener('updatefound', () => {
      const worker = registration.installing;
      worker.addEventListener('statechange', () => {if (worker.state === 'redundant') window.pwaRejectedUpdate = true;});
    });
    await registration.update();
  });
  await page.waitForFunction(() => window.pwaRejectedUpdate);
  await expect(page.locator('#pwa-update')).toBeHidden();
  const names = await page.evaluate(() => caches.keys());
  assert.ok(names.includes(first.cacheName));
  assert.ok(!names.includes(second.cacheName));
  await context.setOffline(true);
  await page.reload();
  await page.waitForFunction(() => window.__orrery?.diagnostics().ready);
  await expect(page.locator('#pwa-status')).toHaveAttribute('data-state', 'ready');
});

test('an installed standalone app never offers another install prompt', async t => {
  await release('standalone-a');
  const context = await contextFor(t);
  await context.addInitScript(() => {navigator.standalone = true;});
  const page = await context.newPage();
  await page.goto(origin);
  await page.evaluate(() => {
    const event = new Event('beforeinstallprompt', {cancelable:true});
    event.prompt = async () => {};
    event.userChoice = Promise.resolve({outcome:'accepted'});
    window.dispatchEvent(event);
  });
  await expect(page.locator('#pwa-install')).toBeHidden();
  await page.evaluate(() => {
    navigator.standalone = false;
    const event = new Event('beforeinstallprompt', {cancelable:true});
    event.prompt = async () => {};
    event.userChoice = Promise.resolve({outcome:'accepted'});
    window.dispatchEvent(event);
  });
  await expect(page.locator('#pwa-install')).toBeVisible();
  await page.evaluate(() => window.dispatchEvent(new Event('appinstalled')));
  await expect(page.locator('#pwa-install')).toBeHidden();
});
