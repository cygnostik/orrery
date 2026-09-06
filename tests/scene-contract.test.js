import test from 'node:test';
import assert from 'node:assert/strict';
import {MOONS} from '../src/moons.js';
import {createBrowserHarness, recordRendererConsole} from './browser-harness.js';
import {MECHANICAL_RADII} from '../src/lunar-layout.js';

const assets = await import('../src/scene-assets.js').catch(() => ({}));
const near = (actual, expected) => assert.ok(Math.abs(actual - expected) < 1e-10, `${actual} ≠ ${expected}`);

test('observatory display transforms the entire orbit uniformly, preserving inclination and eccentricity', () => {
  assert.equal(typeof assets.mapPosition, 'function', 'renderer mapping must exist');
  // Geometric fixture, deliberately not an astronomical ephemeris.
  const body = {id: 'earth', aAU: 1};
  const first = assets.mapPosition(body, {x: 1, y: 2, z: 0.5}, 'observatory', 'display');
  const second = assets.mapPosition(body, {x: 2, y: -1, z: 0.25}, 'observatory', 'display');
  near(first.x, 4.4);
  near(first.y, 2.2);
  near(first.z, -8.8);
  near(second.x, first.x * 2);
  near(second.y, first.y / 2);
  near(second.z, -first.z / 2);
});

test('mechanical arms and planet mounts inherit their transmitted output sleeve, not an ephemeris map', () => {
  assert.throws(() => assets.mapPosition({id: 'mars'}, {x: 3, y: 4, z: 7}, 'mechanical'), /output|mechanical/i);
  const {group, arms, mechanism} = assets.createInstrument();
  const initial = mechanism.diagnostics();
  for (const date of ['2000-01-31T12:00:00Z', '1800-01-01T00:00:00Z', '2049-01-01T00:00:00Z', '2000-01-01T12:00:00Z']) {
    mechanism.update(new Date(date)); group.updateMatrixWorld(true);
    for (const output of mechanism.diagnostics().outputs) {
      const arm = arms.get(output.id);
      assert.equal(arm.parent, mechanism.outputMounts.get(output.id));
      near(arm.rotation.y, initial.outputs.find(o => o.id === output.id).mountingAngle);
      const mount = arm.getObjectByName(`planet-mount-${output.id}`);
      assert.ok(mount, 'physical arm endpoint must own the planet position');
      const p = mount.getWorldPosition(mount.position.clone());
      near(p.x, Math.cos(output.angle) * MECHANICAL_RADII[output.id]);
      near(p.z, -Math.sin(output.angle) * MECHANICAL_RADII[output.id]);
      near(p.y, assets.BODY_HEIGHT);
    }
  }
});

test('precision instrument has a machined base, independent arms and open meshing gears', () => {
  assert.equal(typeof assets.createInstrument, 'function', 'instrument builder must exist');
  const {group, arms} = assets.createInstrument();
  assert.equal(arms.size, 9);
  assert.ok(group.getObjectByName('index-rail'));
  assert.ok(group.getObjectByName('plinth'));
  const drive = group.getObjectByName('wheel-mercury-driver');
  assert.ok(drive?.isMesh, 'the retained central reductions are actual open toothed wheels, not decorative disks');
  assert.ok(drive.geometry.parameters.shapes.holes.length > 5);
  for (const name of ['skeleton-lower', 'skeleton-middle', 'skeleton-upper']) {
    const tier = group.getObjectByName(name);
    assert.ok(tier?.isMesh, 'three raised open skeleton tiers');
    assert.ok(tier.position.y > -1);
    assert.ok(tier.geometry.parameters.shapes.holes.length > 0);
  }
  for (const [id, arm] of arms) {
    assert.equal(arm.userData.orbitRadius, MECHANICAL_RADII[id]);
    assert.ok(arm.children.length > 2);
  }
  group.traverse(object => {
    if (object.geometry) {
      for (const value of object.geometry.attributes.position.array) assert.ok(Number.isFinite(value));
    }
  });
});

test('all fixed annular bridges clear the full sweep of the lowest output arm', () => {
  const {group, arms} = assets.createInstrument();
  const lowestArm = Math.min(...[...arms.values()].map(arm => arm.parent.position.y - 0.095 / 2));
  for (const name of ['skeleton-lower', 'skeleton-middle', 'skeleton-upper', 'batched-platinum-trim-columns', 'batched-blackened-steel-columns']) {
    const object = group.getObjectByName(name);
    object.geometry.computeBoundingBox();
    assert.ok(object.position.y + object.geometry.boundingBox.max.y < lowestArm, `${name} intersects a rotating arm sweep`);
  }
});

test('base is a bevelled solid object with non-color machining roughness data', () => {
  const {group} = assets.createInstrument();
  const plinth = group.getObjectByName('plinth');
  plinth.geometry.computeBoundingBox();
  assert.ok(plinth.geometry.boundingBox.max.y - plinth.geometry.boundingBox.min.y > 0.9, 'the base must have readable mass');
  assert.ok(group.getObjectByName('dial-face').material.roughnessMap, 'machining roughness map must exist');
  assert.equal(group.getObjectByName('dial-face').material.roughnessMap.colorSpace, '');
  assert.ok(group.getObjectByName('glass-reflection')?.isReflector, 'black-glass top reflects actual mechanical detail');
});

test('base switches between two reusable gloss-glass finishes without allocating scene resources', () => {
  const instrument = assets.createInstrument();
  assert.equal(typeof instrument.setBaseStyle, 'function');
  const face = instrument.group.getObjectByName('dial-face');
  assert.ok(face.material.isMeshPhysicalMaterial);
  assert.ok(face.material.clearcoat > 0.9 && face.material.roughness < 0.2);
  const nebula = face.material.map;
  assert.ok(nebula?.isDataTexture, 'default finish contains a subtle blue nebula ribbon');
  instrument.setBaseStyle('obsidian'); const obsidian = face.material.map;
  assert.notEqual(nebula, obsidian);
  for (let i = 0; i < 12; i++) {
    instrument.setBaseStyle('nebula'); assert.equal(face.material.map, nebula);
    instrument.setBaseStyle('obsidian'); assert.equal(face.material.map, obsidian);
  }
  assert.throws(() => instrument.setBaseStyle('brass'), /finish/i);
  const disposed = [];
  nebula.addEventListener('dispose', () => disposed.push('nebula'));
  obsidian.addEventListener('dispose', () => disposed.push('obsidian'));
  instrument.disposeFinishes(); assert.deepEqual(disposed.sort(), ['nebula', 'obsidian']);
});

test('planet surfaces are deterministic original textures with non-flat luminance', () => {
  assert.equal(typeof assets.createSurfaceData, 'function', 'surface generation must exist');
  for (const id of ['sun', ...Object.keys(assets.DISPLAY_RADII)]) {
    const a = assets.createSurfaceData(id, 64, 32);
    const b = assets.createSurfaceData(id, 64, 32);
    assert.deepEqual(a, b);
    assert.equal(a.length, 64 * 32 * 4);
    const levels = new Set();
    for (let i = 0; i < a.length; i += 4) { levels.add(a[i]); assert.equal(a[i + 3], 255); }
    assert.ok(levels.size > 5, `${id} must have an actual surface`);
  }
});

test('Saturn has shaded, tilted rings and a selectable body identity', () => {
  assert.equal(typeof assets.createPlanet, 'function', 'planet builder must exist');
  const group = assets.createPlanet({id: 'saturn', tiltDeg: 26.7}, 64);
  const ring = group.getObjectByName('saturn-rings');
  assert.ok(ring?.isMesh);
  assert.equal(ring.userData.bodyId, 'saturn');
  assert.equal(group.userData.bodyId, 'saturn');
  assert.ok(ring.receiveShadow);
  near(group.children[0].rotation.z, -26.7 * Math.PI / 180);
  assert.equal(group.getObjectByName('saturn-surface').material.map.colorSpace, 'srgb');
});

test('an imagery replacement releases its generated fallback and retains Saturn rings', () => {
  assert.equal(typeof assets.replaceSurfaceTexture, 'function');
  const group = assets.createPlanet({id: 'saturn', tiltDeg: 26.7}, 64);
  const surface = group.getObjectByName('saturn-surface');
  let disposed = false;
  surface.material.map.addEventListener('dispose', () => { disposed = true; });
  const replacement = surface.material.map.clone();
  assets.replaceSurfaceTexture(group, replacement);
  assert.equal(surface.material.map, replacement);
  assert.ok(disposed);
  assert.equal(replacement.colorSpace, 'srgb');
  assert.ok(group.getObjectByName('saturn-rings'));
});

test('renderer exposes the asynchronous lifecycle entry and rejects a missing host clearly', async () => {
  const module = await import('../src/scene.js').catch(() => ({}));
  assert.equal(typeof module.createOrrery, 'function', 'renderer entry must exist');
  await assert.rejects(module.createOrrery({}), /container/);
});

test('all illustrated moon companions follow their parent with stable geometry and selective labels', async () => {
  const satellite = await import('../src/satellite-scene.js').catch(() => ({}));
  assert.equal(typeof satellite.createSatellites, 'function');
  const {Vector3} = await import('three');
  const parent = Object.fromEntries([...new Set(MOONS.map(m => m.parentId))].map((id, i) => [id, {position: new Vector3(i * 2, 6, 7), scale: new Vector3(1, 1, 1), visible: true}]));
  const model = satellite.createSatellites();
  const date = new Date('2000-01-01T12:00:00Z');
  model.update(date, new Map(Object.entries(parent)), {moons: true, selected: 'earth', labels: true});
  assert.equal(model.bodies.size, MOONS.length);
  const ids = [...model.bodies.keys()].sort(); assert.deepEqual(ids, MOONS.map(m => m.id).sort());
  const before = [];
  for (const [id, mesh] of model.bodies) {
    const parentId = mesh.userData.parentId;
    assert.equal(mesh.name, `satellite-${id}`);
    assert.equal(mesh.userData.bodyId, parentId, 'moon picking maps to its parent');
    near(mesh.position.distanceTo(parent[parentId].position), satellite.SATELLITE_DISPLAY[id].orbit);
    assert.ok(mesh.material.map.isDataTexture);
    assert.ok(mesh.layers.isEnabled(1));
    before.push(mesh.position.clone());
  }
  model.update(new Date(+date + 86400000), new Map(Object.entries(parent)), {moons: true});
  assert.ok([...model.bodies.values()].every((m, i) => m.position.distanceTo(before[i]) > 0.01));
  model.update(date, new Map(Object.entries(parent)), {moons: false});
  assert.ok([...model.bodies.values()].every(m => !m.visible));
  model.update(date, new Map(Object.entries(parent)), {moons: true});
  assert.ok([...model.bodies.values()].every((m, i) => m.position.distanceTo(before[i]) < 1e-9));
});

test('distance mode applies one common AU factor to every body', () => {
  for (const id of ['mercury', 'earth', 'neptune', 'pluto']) {
    const point = assets.mapPosition({id, aAU: 99}, {x: 1, y: 2, z: 3}, 'observatory', 'distance');
    near(point.x, assets.DISTANCE_FACTOR);
    near(point.y, assets.DISTANCE_FACTOR * 3);
    near(point.z, -assets.DISTANCE_FACTOR * 2);
  }
});

// Real browser contract. Starts its own loopback Vite server unless a caller
// supplies ORRERY_RENDERER_URL; no skipped placeholders or mocked WebGL.
test('physical crank captures the pointer; date, switch and finish have one owner', {timeout: 120000}, async t => {
  const harness = createBrowserHarness(t);
  const {chromium} = await import('@playwright/test');
  const {existsSync, mkdirSync, writeFileSync} = await import('node:fs');
  const executablePath = [process.env.ORRERY_BROWSER, '/Applications/Microsoft Edge.app/Contents/MacOS/Microsoft Edge', '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'].filter(Boolean).find(existsSync);
  let browser, server;
  try {
    let url = process.env.ORRERY_RENDERER_URL;
    if (!url) {
      const {createServer} = await import('vite');
      const {fileURLToPath} = await import('node:url');
      server = await harness.vite(createServer, {root: fileURLToPath(new URL('../', import.meta.url)), server: {host: '127.0.0.1', port: 0}, logLevel: 'error'});
      url = server.resolvedUrls.local[0];
    }
    browser = await harness.launch(chromium, {executablePath, args: ['--enable-unsafe-swiftshader']});
    const page = harness.page(await harness.run('browser.newPage', () => browser.newPage({viewport: {width: 1440, height: 1000}})));
    const errors = [], driverNotices = []; page.on('pageerror', e => errors.push(e.message));
    page.on('console', message => recordRendererConsole(message, errors, driverNotices));
    await page.goto(url);
    await page.waitForFunction(() => window.__orrery?.diagnostics().ready);
    await page.evaluate(async () => {
      window.__orrery.dispose();
      document.body.innerHTML = '<div id="renderer-fixture" style="width:100vw;height:100vh;background:var(--pd-field);position:fixed;inset:0"></div>';
      const {createOrrery} = await import('/src/scene.js');
      const state = {date: new Date('2000-01-01T12:00:00Z'), playing: false, mode: 'mechanical', moons: true, labels: true, baseStyle: 'nebula'};
      const turns = [];
      window.addEventListener('pointerdown', event => {window.fixturePointerId = event.pointerId;}, true);
      const renderer = await createOrrery({container: document.querySelector('#renderer-fixture'),
        onManualTurn: delta => {turns.push(delta); state.playing = false; state.date = new Date(+state.date + delta * 30 * 86400000); renderer.update(state); renderer.render();},
        onAutoToggle: () => {state.playing = !state.playing; renderer.update(state); renderer.render();}});
      renderer.update(state); renderer.render(); window.rendererFixture = {renderer, state, turns};
    });
    const diag = () => page.evaluate(() => window.rendererFixture.renderer.diagnostics());
    const initial = await diag();
    assert.ok(initial.controls?.crank?.visible, 'diagnostics must project the real physical crank');
    assert.equal(initial.mechanism.crankTurns, 0);
    assert.equal(initial.moonCount, MOONS.filter(m => m.parentId !== 'pluto').length); assert.equal(initial.bodyCount, 9);
    assert.ok(initial.controlPoints.crankGrip.visible);
    const crank = initial.controls.crank, center = initial.controls.crankCenter;
    await page.mouse.move(crank.x, crank.y); await page.mouse.down();
    assert.equal((await diag()).draggingCrank, true, 'must hit the actual handle');
    assert.equal(await page.evaluate(() => rendererFixture.turns[0]), 0, 'engagement pauses auto before motion');
    const radius = Math.hypot(crank.x - center.x, crank.y - center.y), angle = Math.atan2(crank.y - center.y, crank.x - center.x);
    for (let i = 1; i <= 12; i++) {
      const a = angle + Math.PI / 2 * i / 12;
      await page.mouse.move(center.x + Math.cos(a) * radius, center.y + Math.sin(a) * radius);
    }
    await page.mouse.up();
    const moved = await diag();
    const pointerEnd = {x: center.x + Math.cos(angle + Math.PI / 2) * radius, y: center.y + Math.sin(angle + Math.PI / 2) * radius};
    assert.ok(Math.hypot(moved.controls.crank.x - pointerEnd.x, moved.controls.crank.y - pointerEnd.y) < radius * 0.25, 'handle follows the hand rather than rotating in the opposite direction');
    assert.ok(moved.mechanism.crankTurns > 0.05, 'clockwise drag advances the date');
    assert.deepEqual(moved.camera, initial.camera, 'crank must not orbit camera');
    assert.equal(moved.draggingCrank, false);
    assert.ok(await page.evaluate(() => rendererFixture.turns.every(t => Math.abs(t) <= 1 / 12)));
    await page.evaluate(() => {for (let i = 0; i < 10; i++) rendererFixture.renderer.render(0.1);});
    assert.deepEqual((await diag()).mechanism, moved.mechanism, 'paused render time never advances gears');
    const auto = moved.controls.autoSwitch; await page.mouse.click(auto.x, auto.y);
    assert.equal((await diag()).mechanism.playing, true);
    await page.evaluate(() => {rendererFixture.state.date = new Date('2000-01-01T12:00:00Z'); rendererFixture.renderer.update(rendererFixture.state); rendererFixture.renderer.render();});
    assert.deepEqual((await diag()).mechanism.gears, initial.mechanism.gears);
    const cancelGrip = (await diag()).controls.crank;
    await page.mouse.move(cancelGrip.x, cancelGrip.y); await page.mouse.down();
    assert.equal((await diag()).draggingCrank, true);
    await page.evaluate(() => document.querySelector('#renderer-fixture canvas').dispatchEvent(new PointerEvent('pointercancel', {pointerId: window.fixturePointerId, bubbles: true})));
    assert.equal((await diag()).draggingCrank, false, 'pointercancel releases capture');
    await page.mouse.up();
    assert.deepEqual((await diag()).camera, initial.camera);
    mkdirSync('evidence/connected-drive', {recursive: true});
    await page.screenshot({path: 'evidence/connected-drive/contract-nebula.png'});
    await page.evaluate(() => {rendererFixture.renderer.update({baseStyle: 'obsidian'}); rendererFixture.renderer.render();});
    await page.screenshot({path: 'evidence/connected-drive/contract-obsidian.png'});
    await page.evaluate(() => {rendererFixture.renderer.update({mode: 'observatory', pluto: true}); rendererFixture.renderer.render(); rendererFixture.renderer.update({mode: 'mechanical', baseStyle: 'nebula', pluto: false}); rendererFixture.renderer.render();});
    const warm = await diag();
    await page.evaluate(() => {for (let i = 0; i < 8; i++) {rendererFixture.renderer.update({mode: i % 2 ? 'mechanical' : 'observatory', baseStyle: i % 2 ? 'nebula' : 'obsidian', moons: !!(i % 2)}); rendererFixture.renderer.render();}});
    const after = await diag();
    assert.equal(after.geometries, warm.geometries); assert.equal(after.textures, warm.textures);
    await page.evaluate(() => {rendererFixture.renderer.update({mode: 'observatory'}); rendererFixture.renderer.render();});
    assert.equal((await diag()).controls.crank.visible, false);
    await page.screenshot({path: 'evidence/connected-drive/contract-observatory.png'});
    await page.evaluate(() => {rendererFixture.renderer.update({selected: 'jupiter'}); rendererFixture.renderer.focusBody('jupiter'); rendererFixture.renderer.render();});
    assert.equal((await diag()).moonLabels.filter(l => l.visible && l.layer === 4).length, 4, 'selected moons have readable foreground labels');
    const inspected = (await diag()).camera;
    assert.ok(Math.hypot(...inspected.position.map((v, i) => v - inspected.target[i])) < 14, 'moon-system inspection must be a close view');
    await page.screenshot({path: 'evidence/connected-drive/contract-jupiter-moons.png'});
    await page.evaluate(() => {rendererFixture.renderer.update({selected: 'earth'}); rendererFixture.renderer.focusBody('earth'); rendererFixture.renderer.render();});
    await page.screenshot({path: 'evidence/connected-drive/contract-earth-moon.png'});
    await page.evaluate(() => {rendererFixture.renderer.update({moons: false}); rendererFixture.renderer.render();});
    assert.equal((await diag()).moonCount, 0);
    await page.evaluate(() => rendererFixture.renderer.dispose());
    const disposed = await diag(); assert.equal(disposed.disposed, true);
    assert.equal(await page.locator('#renderer-fixture canvas').count(), 0);
    writeFileSync('evidence/connected-drive/contract-contract-proof.json', JSON.stringify({crankTurnsAfterClockwiseDrag: moved.mechanism.crankTurns, cameraUnchanged: true, pointerCancelReleased: true, physicalAutoSwitched: true, initial, warm, after, disposed, errors, driverNotices}, null, 2));
    assert.deepEqual(errors, []);
  } finally {await harness.close();}
});
