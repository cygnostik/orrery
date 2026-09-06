import {test} from 'node:test';
import {existsSync} from 'node:fs';
import assert from 'node:assert/strict';
import {mkdtemp, readFile, rm, writeFile} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import path from 'node:path';
import {execFileSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
import {buildPwa} from '../scripts/build-pwa.mjs';

test('each build gets a unique explicit release ID even at the same version', async t => {
  const outDir = await mkdtemp(path.join(tmpdir(), 'orrery-pwa-build-'));
  t.after(() => rm(outDir, {recursive:true, force:true}));
  await writeFile(path.join(outDir, 'index.html'), '<!doctype html><title>Orrery</title>');
  const first = await buildPwa({outDir});
  const second = await buildPwa({outDir});
  assert.equal(first.version, '0.5.0-beta.1');
  assert.notEqual(first.releaseId, second.releaseId);
  assert.notEqual(first.cacheName, second.cacheName);
  assert.deepEqual(second.assets, ['/index.html']);
  const builder = fileURLToPath(new URL('../scripts/build-pwa.mjs', import.meta.url));
  execFileSync(process.execPath, [builder, outDir]);
  const third = JSON.parse(await readFile(path.join(outDir, 'pwa-release.json'), 'utf8'));
  assert.notEqual(second.releaseId, third.releaseId);
});

test('precache excludes server configuration and generated metadata', async t => {
  const outDir = await mkdtemp(path.join(tmpdir(), 'orrery-pwa-build-'));
  t.after(() => rm(outDir, {recursive:true, force:true}));
  for (const name of ['index.html', '.htaccess', 'debug.js.map', 'sw.js', 'pwa-release.json']) await writeFile(path.join(outDir, name), name);
  const result = await buildPwa({outDir});
  assert.deepEqual(result.assets, ['/index.html']);
});

test('an incomplete distribution or invalid release identifier fails the build instead of producing a ready worker', async t => {
  const outDir = await mkdtemp(path.join(tmpdir(), 'orrery-pwa-build-'));
  t.after(() => rm(outDir, {recursive:true, force:true}));
  await assert.rejects(buildPwa({outDir}), /index\.html/);
  await writeFile(path.join(outDir, 'index.html'), '<title>Orrery</title>');
  await assert.rejects(buildPwa({outDir, releaseId:'bad/id'}), /releaseId/);
  await writeFile(path.join(outDir, 'manifest.webmanifest'), JSON.stringify({icons:[{src:'/icons/missing.png'}]}));
  await assert.rejects(buildPwa({outDir}), /missing.png/);
});

test('the install manifest uses the production identity and real dimensioned icons and screenshots', async () => {
  const publicDir = fileURLToPath(new URL('../public/', import.meta.url));
  const filename = path.join(publicDir, 'manifest.webmanifest');
  assert.ok(existsSync(filename), 'Install manifest must exist');
  const manifest = JSON.parse(await readFile(filename, 'utf8'));
  for (const name of ['id', 'start_url', 'scope']) assert.equal(manifest[name], '/');
  assert.equal(manifest.name, 'Orrery');
  assert.equal(manifest.short_name, 'Orrery');
  assert.equal(manifest.display, 'standalone');
  assert.equal(manifest.orientation, 'any');
  assert.equal(manifest.theme_color, '#050A0F');
  assert.equal(manifest.background_color, '#050A0F');
  assert.deepEqual(manifest.categories, ['education', 'science']);
  assert.match(manifest.description, /educational/i);
  assert.deepEqual(manifest.icons.map(icon => [icon.src, icon.purpose]), [['/icons/icon-192.png','any'], ['/icons/icon-512.png','any'], ['/icons/maskable-512.png','maskable']]);
  assert.deepEqual(manifest.screenshots.map(image => [image.src, image.sizes, image.form_factor]), [['/screenshots/desktop.png', '1440x1000', 'wide'], ['/screenshots/mobile.png', '390x844', 'narrow']]);
  for (const image of [...manifest.icons, ...manifest.screenshots]) {
    const bytes = await readFile(path.join(publicDir, image.src));
    assert.equal(`${bytes.readUInt32BE(16)}x${bytes.readUInt32BE(20)}`, image.sizes, image.src);
    assert.equal(image.type, 'image/png');
  }
});
