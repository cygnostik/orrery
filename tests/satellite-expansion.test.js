import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { MOONS, MOON_MODEL, moonPositionAt } from '../src/moons.js';
import { createSatellites, SATELLITE_DISPLAY } from '../src/satellite-scene.js';
import { BODIES } from '../src/science.js';
import { createPlanet } from '../src/scene-assets.js';

const date = new Date(MOON_MODEL.epoch);
const parents = () => new Map(BODIES.map((body, i) => {
  const parent = new THREE.Group(); parent.position.set(i * 8, 5, -i * 3); return [body.id, parent];
}));
function resources(group) {
  const all = new Set();
  group.traverse(object => {
    if (object.geometry) all.add(object.geometry);
    for (const material of [object.material].flat().filter(Boolean)) {
      all.add(material);
      for (const value of Object.values(material)) if (value?.isTexture) all.add(value);
    }
  });
  return all;
}
function dispose(group) { for (const resource of resources(group)) resource.dispose(); }
function stats(texture, from = 0, to = 1) {
  const { data, width, height } = texture.image;
  const values = [];
  for (let y = Math.floor(from * height); y < Math.floor(to * height); y++) {
    for (let x = 0; x < width; x++) {
      const i = (y * width + x) * 4; values.push((data[i] + data[i + 1] + data[i + 2]) / 3);
    }
  }
  const mean = values.reduce((sum, v) => sum + v, 0) / values.length;
  return { mean, deviation: Math.sqrt(values.reduce((sum, v) => sum + (v - mean) ** 2, 0) / values.length) };
}

test('all ten companions have deterministic distinct authored surfaces with recognizable feature contrast', () => {
  const model = createSatellites(), repeat = createSatellites();
  try {
    assert.deepEqual([...model.bodies.keys()], MOONS.map(moon => moon.id));
    assert.deepEqual(Object.keys(SATELLITE_DISPLAY), MOONS.map(moon => moon.id));
    const textures = [...model.bodies.values()].map(mesh => mesh.material.map.image.data);
    assert.equal(textures.length, 10);
    for (let i = 0; i < textures.length; i++) {
      for (let j = i + 1; j < textures.length; j++) {
        assert.notDeepEqual(textures[i], textures[j], `${MOONS[i].id} and ${MOONS[j].id} have distinct surfaces`);
      }
    }
    for (const [id, mesh] of model.bodies) {
      assert.deepEqual(mesh.material.map.image.data, repeat.bodies.get(id).material.map.image.data, `${id} surface is deterministic`);
      assert.match(mesh.userData.surface, /authored|illustrat/i);
      assert.equal(mesh.userData.bodyId, MOONS.find(moon => moon.id === id).parentId);
      assert.equal(mesh.castShadow, false); assert.equal(mesh.receiveShadow, false);
      assert.ok(Object.isFrozen(SATELLITE_DISPLAY[id]));
    }
    const map = id => model.bodies.get(id).material.map;
    assert.ok(stats(map('enceladus')).mean > 210, 'bright ice');
    // DataTexture flipY=false: low v rows map to sphere south, high v to north.
    assert.ok(stats(map('enceladus'), 0, 0.3).deviation > stats(map('enceladus'), 0.7, 1).deviation * 2, 'south-polar fracture contrast');
    assert.ok(stats(map('titan')).deviation < 12, 'haze, not exposed cratered terrain');
    const titan = map('titan').image.data;
    assert.ok(titan[0] > titan[2] * 1.5, 'golden haze specimen color');
    assert.ok(stats(map('miranda')).deviation > 15, 'irregular scarred terrain retains contrast without the old nested-square ridges');
    assert.ok(stats(map('triton')).deviation < stats(map('miranda')).deviation, 'muted frost');
    assert.ok(stats(map('charon'), 0.75, 1).mean < stats(map('charon'), 0.35, 0.65).mean * 0.65, 'dark north cap');
  } finally { dispose(model.group); dispose(repeat.group); }
});

test('close-up moon shells use modest smoother geometry without changing their display radii', () => {
  const model = createSatellites();
  try {
    for (const [id, mesh] of model.bodies) {
      assert.equal(mesh.geometry.parameters.widthSegments, 64, `${id}: smoother close-up silhouette`);
      assert.equal(mesh.geometry.parameters.heightSegments, 48);
      assert.ok(mesh.geometry.index.count / 3 < 6500, `${id}: bounded triangle budget`);
      assert.equal(mesh.geometry.parameters.radius, SATELLITE_DISPLAY[id].radius);
      assert.equal(mesh.userData.moonId, id);
      assert.equal(mesh.userData.parentId, MOONS.find(moon => moon.id === id).parentId);
      assert.equal(mesh.userData.bodyId, mesh.userData.parentId);
    }
  } finally { dispose(model.group); }
});

test('inspectionRadius encloses each family in unscaled local units outside the parent and Saturn rings', () => {
  const model = createSatellites(), planets = parents();
  const saturn = createPlanet(BODIES.find(body => body.id === 'saturn'));
  try {
    assert.equal(typeof model.inspectionRadius, 'function');
    for (const parentId of ['earth', 'jupiter', 'saturn', 'uranus', 'neptune', 'pluto']) {
      const family = MOONS.filter(moon => moon.parentId === parentId);
      const expected = Math.max(...family.map(moon => SATELLITE_DISPLAY[moon.id].orbit + SATELLITE_DISPLAY[moon.id].radius));
      assert.equal(model.inspectionRadius(parentId), expected);
      for (const scale of [0.02, 1, 3.5]) {
        planets.get(parentId).scale.setScalar(scale);
        model.update(date, planets, {selected: parentId});
        assert.equal(model.inspectionRadius(parentId), expected, 'do not double-scale inspection extent');
        for (const moon of family) {
          const mesh = model.bodies.get(moon.id);
          assert.ok(mesh.position.distanceTo(planets.get(parentId).position) + SATELLITE_DISPLAY[moon.id].radius * scale <= expected * scale + 1e-10);
        }
      }
    }
    for (const id of ['sun', 'mars', 'missing', '__proto__', undefined]) assert.equal(model.inspectionRadius(id), 0);
    const ringRadius = saturn.getObjectByName('saturn-rings').geometry.parameters.outerRadius;
    for (const moon of MOONS.filter(moon => moon.parentId === 'saturn')) {
      const display = SATELLITE_DISPLAY[moon.id];
      assert.ok(display.orbit - display.radius > ringRadius, `${moon.id} outside visible Saturn rings`);
    }
  } finally { dispose(model.group); dispose(saturn); }
});

test('inspectionTarget returns a fresh world-space sphere only for a visible moon and parent', () => {
  const model = createSatellites(), planets = parents();
  try {
    assert.equal(typeof model.inspectionTarget, 'function');
    assert.equal(model.inspectionTarget('charon'), null, 'not inspectable before first update');
    model.update(date, planets, {selected: 'pluto'});
    const world = new THREE.Group(); world.position.set(9, 2, -7); world.scale.setScalar(3); world.add(model.group);
    model.group.rotation.y = 0.6;
    planets.get('pluto').scale.setScalar(2);
    model.update(date, planets, {selected: 'pluto'});
    const mesh = model.bodies.get('charon'), target = model.inspectionTarget('charon');
    assert.ok(target.position instanceof THREE.Vector3);
    assert.ok(target.position.distanceTo(mesh.getWorldPosition(new THREE.Vector3())) < 1e-12);
    assert.equal(target.radius, SATELLITE_DISPLAY.charon.radius * 6);
    target.position.set(NaN, NaN, NaN);
    assert.ok(Number.isFinite(model.inspectionTarget('charon').position.x));
    for (const id of ['pluto', 'unknown', '__proto__', undefined]) assert.equal(model.inspectionTarget(id), null);
    planets.get('pluto').visible = false;
    assert.equal(model.inspectionTarget('charon'), null, 'parent hidden since last update');
    planets.get('pluto').visible = true;
    mesh.visible = false; assert.equal(model.inspectionTarget('charon'), null); mesh.visible = true;
    world.visible = false; assert.equal(model.inspectionTarget('charon'), null); world.visible = true;
    const parentGroup = new THREE.Group(); parentGroup.add(planets.get('pluto')); parentGroup.visible = false;
    assert.equal(model.inspectionTarget('charon'), null, 'hidden parent ancestor');
    parentGroup.visible = true;
    model.update(date, planets, {moons: false});
    assert.equal(model.inspectionTarget('charon'), null);
    assert.ok([...model.bodies.values()].every(body => !body.visible));
    planets.delete('pluto');
    assert.doesNotThrow(() => model.update(date, planets));
    assert.equal(model.inspectionTarget('charon'), null, 'absent parent is hidden');
  } finally { dispose(model.group); }
});

test('shared dates, parent toggles and family guides reuse exactly the same traversable resources', () => {
  const model = createSatellites(), planets = parents(), initial = resources(model.group);
  const seenDisposals = new Set();
  for (const resource of initial) resource.addEventListener('dispose', () => seenDisposals.add(resource));
  const tracks = [...model.group.children].filter(object => object.name.startsWith('illustrative-track-'));
  try {
    assert.equal(tracks.length, 10);
    for (let cycle = 0; cycle < 120; cycle++) {
      const selected = BODIES[cycle % BODIES.length].id;
      const showMoons = cycle % 3 !== 0;
      planets.get('pluto').visible = cycle % 2 === 0;
      const instant = new Date(date.getTime() + (cycle - 60) * 86400000);
      const original = instant.getTime();
      model.update(instant, planets, {selected, moons: showMoons});
      assert.equal(instant.getTime(), original);
      for (const moon of MOONS) {
        const parent = planets.get(moon.parentId), body = model.bodies.get(moon.id);
        const show = showMoons && parent.visible;
        assert.equal(body.visible, show);
        assert.equal(model.group.getObjectByName(`illustrative-track-${moon.id}`).visible, show && moon.parentId === selected);
        const offset = moonPositionAt(moon.id, instant), factor = SATELLITE_DISPLAY[moon.id].orbit / moon.orbitRadiusKm;
        assert.ok(body.position.distanceTo(new THREE.Vector3(parent.position.x + offset.x * factor, parent.position.y, parent.position.z - offset.y * factor)) < 1e-10);
      }
      assert.deepEqual(resources(model.group), initial);
    }
  } finally { dispose(model.group); }
  assert.deepEqual(seenDisposals, initial, 'all maps, materials and geometries disposed through scene traversal');
});
