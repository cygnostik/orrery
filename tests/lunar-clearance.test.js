import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import {MOONS} from '../src/moons.js';
import {BODIES} from '../src/science.js';
import {createInstrument, createPlanet, BODY_HEIGHT, BODY_RADII} from '../src/scene-assets.js';
import {createSatellites} from '../src/satellite-scene.js';

function resources(...groups) {
  const result = new Set();
  for (const group of groups) group.traverse(o => {
    if (o.geometry) result.add(o.geometry);
    for (const m of [o.material].flat().filter(Boolean)) {result.add(m); for (const v of Object.values(m)) if (v?.isTexture) result.add(v);}
  });
  return result;
}
function fixture() {
  const instrument = createInstrument(), satellites = createSatellites({instrument});
  const parents = new Map(BODIES.map(body => [body.id, new THREE.Group()]));
  instrument.mechanism.update(new Date('2000-01-01T12:00:00Z'));
  satellites.update(new Date('2000-01-01T12:00:00Z'), parents, {mode: 'mechanical'});
  return {instrument, satellites, parents};
}
function cleanup(instrument, satellites, ...extra) {
  for (const resource of resources(instrument.group, satellites.group, ...extra)) resource.dispose();
  instrument.disposeFinishes();
}

test('continuous local sweeps clear real tilted Saturn rings, parent globes, sibling pins and hubs', () => {
  const {instrument, satellites} = fixture();
  instrument.group.updateMatrixWorld(true);
  const saturn = createPlanet(BODIES.find(b => b.id === 'saturn'), 64); saturn.position.y = BODY_HEIGHT; saturn.updateMatrixWorld(true);
  try {
    const ring = saturn.getObjectByName('saturn-rings'), position = ring.geometry.attributes.position, p = new THREE.Vector3();
    let ringMinY = Infinity, ringOuter = 0;
    for (let i = 0; i < position.count; i++) {
      p.fromBufferAttribute(position, i).applyMatrix4(ring.matrixWorld);
      ringMinY = Math.min(ringMinY, p.y); ringOuter = Math.max(ringOuter, Math.hypot(p.x, p.z));
    }
    const d = satellites.mechanism.diagnostics();
    for (const family of d.clearance.actualFamilies) {
      const moons = MOONS.filter(m => m.parentId === family.id), barBottoms = [];
      for (const moon of moons) {
        const rotor = satellites.mechanism.rotors.get(moon.id), bar = rotor.getObjectByName(`lunar-arm-${moon.id}`), pin = rotor.getObjectByName(`lunar-pin-${moon.id}`);
        const box = new THREE.Box3().setFromObject(bar); barBottoms.push(box.min.y);
        assert.ok(BODY_HEIGHT - BODY_RADII[family.id] - box.max.y > 0.1, `${moon.id}: arm enters its parent globe`);
        if (family.id === 'saturn') {
          assert.ok(ringMinY - box.max.y > 0.2, `${moon.id}: bar enters the actual tilted ring's continuous height envelope`);
          assert.ok(satellites.display[moon.id].orbit - pin.geometry.parameters.radiusBottom - ringOuter > 0.15, `${moon.id}: pin enters the ring's full radial envelope`);
          assert.ok(satellites.display[moon.id].orbit - satellites.display[moon.id].radius - ringOuter > 0.15);
        }
      }
      const lowestBar = Math.min(...barBottoms);
      for (const part of family.components.filter(c => !/^lunar-(arm|tube|pin)-/.test(c.name) && !c.name.startsWith('satellite-') && !c.name.startsWith('lunar-journal-'))) {
        assert.ok(part.maxY < lowestBar - 0.1, `${part.name}: fixed hub enters a lunar arm's swept plane`);
      }
      for (const [i, inner] of moons.entries()) for (const outer of moons.slice(i + 1)) {
        const innerDisplay = satellites.display[inner.id], outerDisplay = satellites.display[outer.id];
        assert.ok(outerDisplay.orbit - innerDisplay.orbit - innerDisplay.radius - outerDisplay.radius > 0.05, 'moon sphere sweeps overlap');
        const innerPin = satellites.mechanism.rotors.get(inner.id).getObjectByName(`lunar-pin-${inner.id}`);
        const outerBar = satellites.mechanism.rotors.get(outer.id).getObjectByName(`lunar-arm-${outer.id}`);
        assert.ok(new THREE.Box3().setFromObject(innerPin).min.y - new THREE.Box3().setFromObject(outerBar).max.y > 0.15, 'outer arm intersects inner moon pin');
        const a = d.outputs.find(o => o.id === inner.id), b = d.outputs.find(o => o.id === outer.id);
        assert.ok(b.innerRadius - a.outerRadius > 0.006, 'independent output tubes share solid volume');
      }
    }
  } finally {cleanup(instrument, satellites, saturn);}
});

test('lunar resources retain identity across modes and dispose exactly once through their owner trees', () => {
  const {instrument, satellites, parents} = fixture();
  const groups = [...satellites.mechanism.families.values(), satellites.group], initial = resources(...groups), disposed = new Map();
  for (const r of initial) r.addEventListener('dispose', () => disposed.set(r, (disposed.get(r) || 0) + 1));
  try {
    for (let i = 0; i < 120; i++) {
      const date = new Date(Date.UTC(2000, 0, i - 50)); instrument.mechanism.update(date);
      parents.get('pluto').visible = i % 3 !== 0;
      satellites.update(date, parents, {mode: i % 2 ? 'mechanical' : 'observatory', moons: i % 4 !== 0, selected: BODIES[i % BODIES.length].id});
      assert.deepEqual(resources(...groups), initial);
    }
  } finally {cleanup(instrument, satellites);}
  assert.equal(disposed.size, initial.size);
  assert.ok([...disposed.values()].every(count => count === 1));
});
