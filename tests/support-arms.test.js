import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import {createInstrument} from '../src/scene-assets.js';
import {createSatellites} from '../src/satellite-scene.js';

test('vertical planet supports have slender sleeves, not external moon-drive gear towers', () => {
  const instrument = createInstrument(), satellites = createSatellites({instrument});
  try {
    const d = satellites.mechanism.diagnostics(), wheels = [];
    for (const group of satellites.mechanism.families.values()) group.traverse(object => {
      // Traverse hidden objects too: the rejected geometry must not be built.
      if (object.geometry?.type === 'ExtrudeGeometry' || object.userData.teeth || object.name.startsWith('wheel-')) wheels.push(object.name);
    });
    assert.deepEqual(wheels, [], 'no toothed wheels anywhere on a planetary support');
    assert.deepEqual(d.drawnGears, []);
    for (const family of d.clearance.actualFamilies) {
      const mast = family.components.filter(c => !/^(lunar-(arm|pin)-|satellite-)/.test(c.name));
      assert.ok(mast.length > 0, `${family.id}: physical support retained`);
      // Fixed fittings use conservative AABB-corner radii, not tube radii.
      for (const part of mast) assert.ok(part.radius < 0.26, `${part.name}: oversized machinery on a slender rod`);
    }
    assert.ok(instrument.mechanism.diagnostics().gears.length > 0, 'keep the central planetary clockwork');
    assert.equal(satellites.mechanism.outputMounts.size, 10, 'keep every attached moon output');
  } finally {
    const resources = new Set();
    for (const group of [instrument.group, satellites.group]) group.traverse(o => {
      if (o.geometry) resources.add(o.geometry);
      for (const m of [o.material].flat().filter(Boolean)) {
        resources.add(m); for (const v of Object.values(m)) if (v?.isTexture) resources.add(v);
      }
    });
    instrument.disposeFinishes(); for (const resource of resources) resource.dispose();
  }
});

test('planet support spans are uninterrupted rigid PVD rails, never rows of gears', () => {
  const instrument = createInstrument(), satellites = createSatellites({instrument});
  try {
    const d = satellites.mechanism.diagnostics();
    for (const family of d.families) {
      const arm = instrument.arms.get(family.parentId), radius = arm.userData.orbitRadius;
      const rails = arm.children.filter(o => o.isMesh && o.geometry.type === 'BoxGeometry');
      assert.equal(rails.length, 2);
      for (const rail of rails) {
        assert.match(rail.material.name, /pvd/i);
        assert.ok(rail.geometry.parameters.width > radius - 1);
      }
      const alongArm = d.topology.nodes.filter(n => n.lunar && n.parentId === family.parentId && n.kind === 'gear' && n.x < radius - 0.001);
      assert.deepEqual(alongArm.map(n => n.id), [], `${family.parentId}: no exposed or hidden spur chain along a support arm`);
      const shaft = arm.getObjectByName(`lunar-transfer-shaft-${family.parentId}`);
      assert.ok(shaft?.isMesh, `${family.parentId}: separate slender shaft, not a gear chain`);
      assert.equal(shaft.geometry.type, 'CylinderGeometry');
      assert.ok(shaft.geometry.parameters.radiusTop < 0.02);
      assert.equal(shaft.parent.userData.axis, 'x');
      const before = shaft.parent.rotation.x;
      instrument.mechanism.update(new Date('2000-01-02T12:00:00Z')); satellites.mechanism.update();
      assert.notEqual(shaft.parent.rotation.x, before);
      // Rail geometry remains rigid when the transmission rotates within it.
      assert.ok(rails.every(rail => rail.rotation.equals(new THREE.Euler())));
      instrument.mechanism.update(new Date('2000-01-01T12:00:00Z')); satellites.mechanism.update();
    }
  } finally {
    const resources = new Set();
    for (const group of [instrument.group, satellites.group]) group.traverse(o => {
      if (o.geometry) resources.add(o.geometry);
      for (const m of [o.material].flat().filter(Boolean)) {
        resources.add(m); for (const v of Object.values(m)) if (v?.isTexture) resources.add(v);
      }
    });
    instrument.disposeFinishes(); for (const resource of resources) resource.dispose();
  }
});
