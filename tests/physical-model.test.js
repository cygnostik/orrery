import test from 'node:test';
import assert from 'node:assert/strict';
import {existsSync, mkdirSync, writeFileSync} from 'node:fs';
import {BODIES, positionAt} from '../src/science.js';
import {MOONS} from '../src/moons.js';
import {createBrowserHarness, recordRendererConsole} from './browser-harness.js';
import {DISPLAY_RADII, BODY_RADII, BODY_HEIGHT, mapPosition} from '../src/scene-assets.js';
import {SATELLITE_DISPLAY} from '../src/satellite-scene.js';
import {MECHANICAL_RADII} from '../src/lunar-layout.js';
const near = (a, b, message) => assert.ok(Math.abs(a - b) < 1e-8, message || `${a} != ${b}`);

test('real WebGL outputs are inherited from the crank; Observatory alone follows JPL', {timeout: 120000}, async t => {
  const harness = createBrowserHarness(t);
  const {chromium} = await import('@playwright/test');
  const {createServer} = await import('vite');
  const server = await harness.vite(createServer, {server: {host: '127.0.0.1', port: 0}, logLevel: 'error'});
  const path = 'evidence/connected-drive'; mkdirSync(path, {recursive: true});
  let browser;
  try {
    browser = await harness.launch(chromium, {executablePath: [process.env.ORRERY_BROWSER, '/Applications/Microsoft Edge.app/Contents/MacOS/Microsoft Edge', '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'].filter(Boolean).find(existsSync), args: ['--enable-unsafe-swiftshader']});
    const page = harness.page(await harness.run('browser.newPage', () => browser.newPage({viewport: {width: 1440, height: 1000}}))), errors = [], driverNotices = [];
    page.on('pageerror', e => errors.push(e.message));
    page.on('console', e => recordRendererConsole(e, errors, driverNotices));
    await page.route('**/drive-proof', route => route.fulfill({contentType: 'text/html', body: '<html><head><link rel="stylesheet" href="/assets/tokens.css"><link rel="stylesheet" href="/src/style.css"></head><body><div id="drive-fixture" style="width:100vw;height:100vh;position:fixed;inset:0;background:var(--pd-field)"></div></body></html>'}));
    await page.goto(`${server.resolvedUrls.local[0]}drive-proof`);
    await page.evaluate(async () => {
      const {createOrrery} = await import('/src/scene.js');
      const state = {date: new Date('2000-01-01T12:00:00Z'), playing: false, mode: 'mechanical', selected: 'earth', moons: true, pluto: true, labels: true};
      const turns = [];
      const scene = await createOrrery({container: document.querySelector('#drive-fixture'), onManualTurn: delta => {turns.push(delta); state.playing = false; state.date = new Date(+state.date + delta * 30 * 86400000); scene.update(state); scene.render();}, onAutoToggle: () => {state.playing = !state.playing; scene.update(state); scene.render();}});
      scene.update(state); scene.render(); window.proof = {scene, state, turns};
    });
    const diag = () => page.evaluate(() => proof.scene.diagnostics());
    const set = async next => page.evaluate(next => {Object.assign(proof.state, next); proof.state.date = new Date(proof.state.date); proof.scene.update(proof.state); proof.scene.render();}, next);
    const initial = await diag();
    assert.ok(initial.driveOutputs, 'scene must expose measured arm and actual planet transforms');
    const verify = d => {for (const output of d.driveOutputs) {
      near(output.armAngle, output.outputAngle, `${output.id}: sleeve and arm must be rigidly coupled`);
      near(output.planetPosition[0], Math.cos(output.outputAngle) * MECHANICAL_RADII[output.id]);
      near(output.planetPosition[1], BODY_HEIGHT);
      near(output.planetPosition[2], -Math.sin(output.outputAngle) * MECHANICAL_RADII[output.id]);
    }};
    verify(initial);
    for (const date of ['2000-01-31T12:00:00Z', '2049-01-01T00:00:00Z', '1800-01-01T00:00:00Z']) {await set({date}); verify(await diag());}
    const future = await diag();
    assert.ok(future.driveOutputs.some(o => {const jpl = positionAt(o.id, new Date('1800-01-01T00:00:00Z')); return Math.abs(Math.atan2(jpl.y, jpl.x) - Math.atan2(-o.planetPosition[2], o.planetPosition[0])) > 0.01;}), 'mechanical mean angles must NOT be overwritten by scientific ephemeris');
    await set({date: '2000-01-01T12:00:00Z'}); assert.deepEqual((await diag()).driveOutputs, initial.driveOutputs);
    const {crankGrip: grip, crankAxle: center} = initial.controlPoints;
    await page.mouse.move(grip.x, grip.y); await page.mouse.down();
    assert.equal((await diag()).draggingCrank, true);
    const radius = Math.hypot(grip.x - center.x, grip.y - center.y), angle = Math.atan2(grip.y - center.y, grip.x - center.x);
    for (let i = 1; i <= 16; i++) await page.mouse.move(center.x + Math.cos(angle + i / 16 * Math.PI / 2) * radius, center.y + Math.sin(angle + i / 16 * Math.PI / 2) * radius);
    await page.mouse.up(); const dragged = await diag();
    assert.ok(dragged.mechanism.crankTurns > 0.02); assert.deepEqual(dragged.camera, initial.camera); verify(dragged);
    assert.ok(dragged.driveOutputs.every((o, i) => Math.abs(o.outputAngle - initial.driveOutputs[i].outputAngle) > 0), 'every planet output moves even at slow ratios');
    for (const o of dragged.driveOutputs) {
      const first = initial.driveOutputs.find(x => x.id === o.id), ratio = dragged.mechanism.outputs.find(x => x.id === o.id).ratio;
      near(o.outputAngle - first.outputAngle, dragged.mechanism.crankTurns * Math.PI * 2 * ratio);
    }
    await page.evaluate(() => {for(let i=0;i<10;i++) proof.scene.render(0.1);});
    assert.deepEqual((await diag()).driveOutputs, dragged.driveOutputs);
    const reverseGrip = dragged.controlPoints.crankGrip, reverseCenter = dragged.controlPoints.crankAxle;
    await page.mouse.move(reverseGrip.x, reverseGrip.y); await page.mouse.down();
    const reverseRadius = Math.hypot(reverseGrip.x - reverseCenter.x, reverseGrip.y - reverseCenter.y), reverseAngle = Math.atan2(reverseGrip.y - reverseCenter.y, reverseGrip.x - reverseCenter.x);
    for (let i = 1; i <= 16; i++) await page.mouse.move(reverseCenter.x + Math.cos(reverseAngle - i / 16 * Math.PI / 2) * reverseRadius, reverseCenter.y + Math.sin(reverseAngle - i / 16 * Math.PI / 2) * reverseRadius);
    await page.mouse.up(); const reversed = await diag();
    assert.ok(reversed.mechanism.crankTurns < dragged.mechanism.crankTurns);
    assert.deepEqual(reversed.camera, initial.camera); verify(reversed);
    for (const o of reversed.driveOutputs) assert.ok(o.outputAngle < dragged.driveOutputs.find(x => x.id === o.id).outputAngle, 'reverse crank reverses every transmitted output');
    await set({date: '2000-01-01T12:00:00Z'});
    await page.screenshot({path: `${path}/mechanical.png`});
    await page.evaluate(() => {proof.scene.resetView('top'); proof.scene.render();});
    await page.screenshot({path: `${path}/mechanical-top.png`});
    await set({mode: 'observatory', date: '2025-03-08T00:00:00Z'});
    const observatory = await diag();
    for (const o of observatory.driveOutputs) {
      const body = BODIES.find(b => b.id === o.id), expected = mapPosition(body, positionAt(o.id, new Date('2025-03-08T00:00:00Z')));
      o.planetPosition.forEach((v, i) => near(v, expected.toArray()[i]));
    }
    assert.equal(observatory.moonCount, MOONS.length);
    await set({mode: 'mechanical', pluto: false});
    assert.equal((await diag()).moonCount, MOONS.filter(m => m.parentId !== 'pluto').length);
    await set({pluto: true, date: '2000-01-01T12:00:00Z'});
    for (const id of [...new Set(MOONS.map(m => m.parentId))]) {
      await set({selected: id});
      assert.equal(await page.evaluate(id => {const success = proof.scene.focusBody(id); proof.scene.render(); return success;}, id), true);
      await page.screenshot({path: `${path}/family-${id}.png`});
    }
    for (const moon of MOONS) {
      assert.equal(await page.evaluate(id => {const success = proof.scene.focusMoon(id); proof.scene.render(); return success;}, moon.id), true);
      assert.ok((await diag()).moonLabels.every(label => !label.visible), 'individual Inspect uses the host badge, not oversized 3D moon labels');
      if (moon.id === 'enceladus' || moon.id === 'charon') {
        const d = await diag();
        if (moon.id === 'enceladus') assert.ok(d.camera.position[1] < d.camera.target[1], 'first Enceladus inspection must show its authored south-polar fractures');
        else assert.ok(d.camera.position[1] > d.camera.target[1], 'first Charon inspection must show its authored north cap');
        await page.screenshot({path: `${path}/inspect-${moon.id}.png`});
      }
    }
    await set({date: '2000-01-01T12:00:00Z'});
    assert.ok((await diag()).moonLabels.every(label => !label.visible), 'ordinary same-selection updates retain individual inspection');
    await page.evaluate(() => {proof.scene.focusBody('pluto'); proof.scene.render();});
    assert.equal((await diag()).moonLabels.filter(l => l.visible).length, MOONS.filter(m => m.parentId === 'pluto').length);
    await set({labels: false});
    await page.evaluate(() => {proof.scene.resetView(); proof.scene.render();});
    assert.ok((await diag()).moonLabels.every(label => !label.visible), 'reset cannot override Show labels off');
    await set({labels: true});
    await page.evaluate(() => {proof.scene.focusMoon('charon'); proof.scene.render(); proof.scene.resetView(); proof.scene.render();});
    assert.equal((await diag()).moonLabels.filter(l => l.visible).length, MOONS.filter(m => m.parentId === 'pluto').length);
    await page.evaluate(() => {proof.scene.focusMoon('charon'); proof.scene.render();});
    await set({selected: 'saturn'});
    assert.equal((await diag()).moonLabels.filter(l => l.visible).length, MOONS.filter(m => m.parentId === 'saturn').length);
    await page.evaluate(() => {proof.scene.focusMoon('enceladus'); proof.scene.render();});
    await set({mode: 'observatory'});
    assert.equal((await diag()).moonLabels.filter(l => l.visible).length, MOONS.filter(m => m.parentId === 'saturn').length);
    await set({mode: 'mechanical'});
    const familyFits = [];
    for (const viewport of [{width: 390, height: 844}, {width: 700, height: 850}]) {
      await page.setViewportSize(viewport);
      await page.evaluate(() => proof.scene.resize());
      for (const id of [...new Set(MOONS.map(m => m.parentId))]) {
        await set({selected: id});
        await page.evaluate(id => {proof.scene.focusBody(id); proof.scene.render();}, id);
        const d = await diag(), radius = Math.max(BODY_RADII[id] * (id === 'saturn' ? 2.3 : 1), ...MOONS.filter(m => m.parentId === id).map(m => SATELLITE_DISPLAY[m.id].orbit + SATELLITE_DISPLAY[m.id].radius));
        const distance = Math.hypot(...d.camera.position.map((v, i) => v - d.camera.target[i]));
        const halfFov = Math.min(35 * Math.PI / 360, Math.atan(Math.tan(35 * Math.PI / 360) * viewport.width / viewport.height));
        assert.ok(radius / distance < Math.sin(halfFov), `${id} family must fit the actual narrow viewport`);
        d.camera.target.forEach((v, i) => near(v, d.driveOutputs.find(o => o.id === id).planetPosition[i]));
        familyFits.push({id, viewport, radius, distance});
        if (id === 'saturn') await page.screenshot({path: `${path}/family-saturn-${viewport.width}.png`});
      }
    }
    await set({moons: false});
    assert.equal(await page.evaluate(() => proof.scene.focusMoon('moon')), false);
    await set({moons: true, pluto: false});
    assert.equal(await page.evaluate(() => proof.scene.focusMoon('charon')), false);
    assert.deepEqual(errors, []);
    writeFileSync(`${path}/browser-proof.json`, JSON.stringify({initial, dragged, reversed, future, observatory, familyFits, errors, driverNotices, passed: true}, null, 2));
    await page.evaluate(() => proof.scene.dispose());
  } finally {await harness.close();}
});
