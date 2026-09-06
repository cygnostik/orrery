import test from 'node:test';
import assert from 'node:assert/strict';
import {existsSync, mkdirSync, appendFileSync, readFileSync, writeFileSync} from 'node:fs';
import {MOONS} from '../src/moons.js';
import {SCIENCE} from '../src/science.js';
import {createBrowserHarness, recordRendererConsole} from './browser-harness.js';

const folder = 'evidence/lunar-mechanism';
test('real WebGL lunar mounts survive crank, reversal, date bounds, modes and narrow family inspection', {timeout: 180000}, async t => {
  const harness = createBrowserHarness(t);
  const {chromium} = await import('@playwright/test');
  const {createServer} = await import('vite');
  const server = await harness.vite(createServer, {server: {host: '127.0.0.1', port: 0}, logLevel: 'error'});
  mkdirSync(folder, {recursive: true}); writeFileSync(`${folder}/batches.jsonl`, '');
  let browser;
  try {
    browser = await harness.launch(chromium, {executablePath: [process.env.ORRERY_BROWSER, '/Applications/Microsoft Edge.app/Contents/MacOS/Microsoft Edge', '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'].filter(Boolean).find(existsSync), args: ['--enable-unsafe-swiftshader']});
    const page = harness.page(await harness.run('browser.newPage', () => browser.newPage({viewport: {width: 1440, height: 1000}}))), errors = [], driverNotices = [];
    page.on('pageerror', e => errors.push(e.message)); page.on('console', m => recordRendererConsole(m, errors, driverNotices));
    await page.route('**/lunar-proof', route => route.fulfill({contentType: 'text/html', body: '<html><head><link rel="stylesheet" href="/assets/tokens.css"><link rel="stylesheet" href="/src/style.css"></head><body><div id="fixture" style="position:fixed;inset:0;width:100vw;height:100vh;background:var(--pd-field)"></div></body></html>'}));
    await page.goto(`${server.resolvedUrls.local[0]}lunar-proof`);
    await page.evaluate(async () => {
      const {createOrrery} = await import('/src/scene.js');
      const state = {date: new Date('2000-01-01T12:00:00Z'), mode: 'mechanical', pluto: true, moons: true, playing: false, labels: false};
      const scene = await createOrrery({container: document.querySelector('#fixture'), onManualTurn: delta => {state.date = new Date(+state.date + delta * 30 * 86400000); scene.update(state); scene.render();}});
      scene.update(state); scene.render(); window.lunarProof = {scene, state};
    });
    const diag = () => page.evaluate(() => lunarProof.scene.diagnostics());
    const set = next => page.evaluate(next => {Object.assign(lunarProof.state, next); lunarProof.state.date = new Date(lunarProof.state.date); lunarProof.scene.update(lunarProof.state); lunarProof.scene.render();}, next);
    const save = (kind, d) => appendFileSync(`${folder}/batches.jsonl`, `${JSON.stringify({kind, ...d})}\n`);
    const initial = await diag();
    assert.equal(initial.lunarMechanism?.outputCount, 10, 'live scene must instantiate the physical lunar transmission');
    const verify = d => {
      assert.equal(d.moonOutputs.length, 10);
      for (const moon of d.moonOutputs) {
        assert.equal(moon.mountParent, `moon-mount-${moon.id}`);
        assert.deepEqual(moon.localPosition, [0, 0, 0]);
        assert.deepEqual(moon.position, moon.mountPosition);
        assert.equal(moon.supportVisible, moon.visible);
        assert.ok(moon.position.every(Number.isFinite));
      }
      return d.moonOutputs;
    };
    verify(initial); save('initial', initial);
    for (const date of [SCIENCE.range.start, SCIENCE.range.end, '2049-06-01', '1800-01-01', '2000-01-01T12:00:00Z']) {await set({date}); const d = await diag(); verify(d); save('date', {date, outputs: d.moonOutputs});}
    assert.deepEqual((await diag()).moonOutputs, initial.moonOutputs);
    async function crank(direction) {
      const before = await diag(), grip = before.controlPoints.crankGrip, center = before.controlPoints.crankAxle;
      await page.mouse.move(grip.x, grip.y); await page.mouse.down(); assert.equal((await diag()).draggingCrank, true);
      const r = Math.hypot(grip.x - center.x, grip.y - center.y), a = Math.atan2(grip.y - center.y, grip.x - center.x);
      for (let i = 1; i <= 12; i++) await page.mouse.move(center.x + Math.cos(a + direction * i / 12 * Math.PI / 3) * r, center.y + Math.sin(a + direction * i / 12 * Math.PI / 3) * r);
      await page.mouse.up(); const after = await diag(); verify(after); assert.deepEqual(after.camera, before.camera);
      assert.equal(Math.sign(after.mechanism.crankTurns - before.mechanism.crankTurns), direction);
      for (const moon of after.moonOutputs) assert.notDeepEqual(moon.position, before.moonOutputs.find(m => m.id === moon.id).position);
      save(direction > 0 ? 'crank-forward' : 'crank-reverse', after);
    }
    await crank(1); await crank(-1);
    await set({date: '2000-01-01T12:00:00Z'});
    await page.screenshot({path: `${folder}/mechanical-home.png`});
    const conjunction = await page.evaluate(async () => {
      const {createDriveTrain} = await import('/src/drive-train.js'), drive = createDriveTrain();
      const e = new Date('2000-01-01T12:00:00Z'), outputs = drive.atDate(e).outputs;
      const j = outputs.find(o => o.id === 'jupiter'), s = outputs.find(o => o.id === 'saturn');
      const rate = Math.PI * 2 * (1 / j.periodDays - 1 / s.periodDays), days = (s.angle - j.angle) / rate;
      return new Date(+e + days * 86400000).toISOString();
    });
    await set({date: conjunction, selected: 'jupiter', labels: true});
    for (const id of ['jupiter', 'saturn']) {await set({selected: id}); await page.evaluate(id => {lunarProof.scene.focusBody(id); lunarProof.scene.render();}, id); await page.screenshot({path: `${folder}/conjunction-${id}.png`});}
    save('conjunction', {date: conjunction, outputs: (await diag()).moonOutputs});
    const inspections = [];
    for (const viewport of [{width: 390, height: 844}, {width: 700, height: 850}]) {
      await page.setViewportSize(viewport); await page.evaluate(() => lunarProof.scene.resize());
      for (const moon of MOONS) {
        await set({selected: moon.parentId});
        assert.equal(await page.evaluate(id => {const ok = lunarProof.scene.focusMoon(id); lunarProof.scene.render(); return ok;}, moon.id), true);
        inspections.push({id: moon.id, width: viewport.width});
      }
      await set({selected: 'saturn'}); await page.evaluate(() => {lunarProof.scene.focusBody('saturn'); lunarProof.scene.render();});
      await page.screenshot({path: `${folder}/saturn-${viewport.width}.png`});
    }
    assert.equal(inspections.length, 20); save('inspections', {inspections});
    await set({moons: false}); const hidden = await diag(); assert.equal(hidden.moonCount, 0); assert.ok(hidden.moonOutputs.every(m => !m.supportVisible));
    assert.equal(await page.evaluate(() => lunarProof.scene.focusMoon('moon')), false);
    await set({moons: true, pluto: false}); assert.equal((await diag()).moonCount, 9);
    await set({pluto: true, mode: 'observatory', scale: 'display'}); const obs = await diag(); assert.ok(obs.moonOutputs.every(m => m.mountParent === 'illustrated-moon-companions' && !m.supportVisible)); save('observatory', obs);
    // Warm every family label and both science scales before stability checking.
    await page.setViewportSize({width: 1440, height: 1000});
    for (const id of new Set(MOONS.map(m => m.parentId))) await set({mode: 'mechanical', selected: id, labels: true});
    for (const scale of ['display', 'distance']) await set({mode: 'observatory', scale});
    await set({mode: 'mechanical', scale: 'display', labels: false}); await page.evaluate(() => {lunarProof.scene.resetView(); lunarProof.scene.render();});
    const warm = await diag();
    for (let i = 0; i < 12; i++) await set({mode: i % 2 ? 'mechanical' : 'observatory', moons: i % 3 !== 0, pluto: true, selected: 'saturn'});
    await set({mode: 'mechanical', moons: true}); const stable = await diag();
    assert.equal(stable.geometries, warm.geometries); assert.equal(stable.textures, warm.textures); save('gpu-stability', {warm: {geometries: warm.geometries, textures: warm.textures}, stable: {geometries: stable.geometries, textures: stable.textures}});
    save('browser-diagnostics', {errors, driverNotices});
    assert.deepEqual(errors, []); await page.evaluate(() => lunarProof.scene.dispose());
    assert.equal(await page.locator('#fixture canvas').count(), 0);
    const rows = readFileSync(`${folder}/batches.jsonl`, 'utf8').trim().split('\n').map(JSON.parse);
    const moons = new Set(rows.find(r => r.kind === 'initial').moonOutputs.map(m => m.id)); assert.equal(moons.size, 10);
    const sources = ['src/lunar-layout.js', 'src/lunar-drive.js', 'src/lunar-mechanism.js', 'src/satellite-scene.js', 'src/scene.js', 'src/scene-assets.js', 'src/mechanism.js'];
    writeFileSync(`${folder}/summary.json`, JSON.stringify({passed: true, batchCount: rows.length, moonCount: moons.size, inspectionCount: inspections.length, backend: 'real Chromium WebGL2', errors, driverNotices, sources}, null, 2));
  } finally {await harness.close();}
});
