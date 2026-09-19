import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import {createInstrument} from '../src/scene-assets.js';
import {createMechanism} from '../src/mechanism.js';
import {createPivotInlays} from '../src/pivot-inlays.js';
import {SCIENCE} from '../src/science.js';

function dispose(group) {
  const resources = new Set();
  group.traverse(object => {
    if (object.isInstancedMesh) resources.add(object);
    if (object.isReflector) resources.add(object.getRenderTarget());
    if (object.geometry) resources.add(object.geometry);
    for (const material of [object.material].flat().filter(Boolean)) {
      resources.add(material);
      for (const value of Object.values(material)) if (value?.isTexture) resources.add(value);
    }
  });
  resources.forEach(resource => resource.dispose());
}

function fixture(t) {
  const instrument = createInstrument();
  t.after(() => {instrument.disposeFinishes(); dispose(instrument.group);});
  return instrument;
}

function batches(group) {
  return [group.getObjectByName('pivot-opal-cabochons'), group.getObjectByName('pivot-opal-bezels')];
}

function instancePoints(mesh, index) {
  const matrix = new THREE.Matrix4(); mesh.getMatrixAt(index, matrix); matrix.premultiply(mesh.matrixWorld);
  const positions = mesh.geometry.attributes.position;
  return Array.from({length: positions.count}, (_, i) => new THREE.Vector3().fromBufferAttribute(positions, i).applyMatrix4(matrix));
}

function originals(group) {
  const result = [];
  function visit(object) {
    if (object.name === 'pivot-opal-inlays' || object.name.startsWith('arm-')) return;
    if (object.isMesh) result.push(object);
    object.children.forEach(visit);
  }
  visit(group); return result;
}

function sameGeometry(actual, expected, name) {
  assert.deepEqual(Object.keys(actual.attributes), Object.keys(expected.attributes), name);
  for (const key of Object.keys(expected.attributes)) {
    assert.equal(actual.attributes[key].itemSize, expected.attributes[key].itemSize, `${name}/${key}`);
    assert.deepEqual(actual.attributes[key].array, expected.attributes[key].array, `${name}/${key}`);
  }
  assert.deepEqual(actual.index?.array, expected.index?.array, `${name}/index`);
  assert.deepEqual(actual.groups, expected.groups, `${name}/groups`);
}

test('all original mechanism meshes, materials, world transforms and rates match the undecorated mechanism', t => {
  const {group, mechanism} = fixture(t), bare = createMechanism();
  t.after(() => dispose(bare.group));
  const actual = originals(mechanism.group), expected = originals(bare.group);
  assert.equal(actual.length, expected.length);
  const properties = material => {const result = material.toJSON(); delete result.uuid; return result;};
  actual.forEach((object, i) => {
    assert.equal(object.name, expected[i].name);
    sameGeometry(object.geometry, expected[i].geometry, object.name);
    assert.deepEqual(properties(object.material), properties(expected[i].material), object.name);
  });
  for (const date of [SCIENCE.range.start, '2000-01-01T12:00:00Z', '2026-09-19T12:34:56Z', SCIENCE.range.end]) {
    mechanism.update(new Date(date)); bare.update(new Date(date));
    group.updateMatrixWorld(true); bare.group.updateMatrixWorld(true);
    assert.deepEqual(mechanism.diagnostics(), bare.diagnostics(), 'transmission state/topology unchanged');
    actual.forEach((object, i) => {
      for (const property of ['position', 'quaternion', 'scale', 'matrixWorld']) {
        assert.deepEqual(object[property].toArray(), expected[i][property].toArray(), `${object.name}/${property}`);
      }
    });
  }
});

test('the additive builder does not mutate any original instrument mesh or allocate shared finishes', t => {
  const {group, mechanism} = fixture(t), originals = [];
  group.traverse(object => {
    if (object.isMesh) originals.push({object, geometry: object.geometry, material: object.material,
      attributes: Object.fromEntries(Object.entries(object.geometry.attributes).map(([name, a]) => [name, a.array.slice()])),
      position: object.position.toArray(), quaternion: object.quaternion.toArray(), scale: object.scale.toArray()});
  });
  const [stone, bezel] = batches(group);
  const extra = createPivotInlays({parent: mechanism.group,
    pivots: mechanism.diagnostics().topology.nodes.filter(n => n.id.endsWith('-wheel')),
    crank: mechanism.crank, stoneMaterial: stone.material, bezelMaterial: bezel.material});
  extra.update();
  for (const old of originals) {
    assert.equal(old.object.geometry, old.geometry); assert.equal(old.object.material, old.material);
    for (const [name, array] of Object.entries(old.attributes)) assert.deepEqual(old.object.geometry.attributes[name].array, array);
    for (const property of ['position', 'quaternion', 'scale']) assert.deepEqual(old.object[property].toArray(), old[property]);
  }
  assert.equal(extra.group.children.length, 2);
  assert.equal(extra.group.children[0].material, stone.material);
  assert.equal(extra.group.children[1].material, bezel.material);
});

test('production installs nine pivot inlays and a crank cap in two shared-material batches', t => {
  const {group, mechanism} = fixture(t);
  const stones = group.getObjectByName('pivot-opal-cabochons');
  const bezels = group.getObjectByName('pivot-opal-bezels');
  assert.ok(stones?.isInstancedMesh, 'production pivot stones are installed');
  assert.ok(bezels?.isInstancedMesh, 'production bezels are installed');
  const pivots = mechanism.diagnostics().topology.nodes.filter(node => node.id.endsWith('-wheel'));
  assert.equal(pivots.length, 9);
  assert.equal(stones.count, 10); assert.equal(bezels.count, 10);
  assert.equal(stones.material, group.getObjectByName('black-opal-cabochons').material);
  assert.equal(bezels.material, group.getObjectByName('black-opal-bezels').material);
  for (const mesh of [stones, bezels]) {
    assert.equal(mesh.castShadow, false); assert.equal(mesh.receiveShadow, true);
    assert.equal(mesh.geometry.parameters.segments, 24);
    assert.ok(mesh.boundingBox && mesh.boundingSphere);
  }
  assert.equal(stones.geometry.parameters.points.length, 12);
  assert.deepEqual(bezels.geometry.parameters.points.map(p => p.toArray()), [[.174, -.05], [.206, -.05], [.208, -.024], [.204, -.008], [.187, .007], [.18, -.012], [.174, -.05]]);
  const p = stones.geometry.attributes.position, uv = stones.geometry.attributes.uv;
  for (let i = 0; i < p.count; i++) {
    assert.ok(Math.abs(uv.getX(i) - (p.getX(i) / .368 + .5)) < 1e-7);
    assert.ok(Math.abs(uv.getY(i) - (p.getZ(i) / .368 + .5)) < 1e-7);
  }
  const matrix = new THREE.Matrix4(), expected = new THREE.Matrix4();
  pivots.forEach((node, index) => {
    expected.compose(new THREE.Vector3(node.x, node.y + .325, node.z),
      new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), index * 2.3999632297),
      new THREE.Vector3(.46, .10, .46));
    for (const mesh of [stones, bezels]) {
      mesh.getMatrixAt(index, matrix);
      matrix.elements.forEach((value, i) => assert.ok(Math.abs(value - expected.elements[i]) < 1e-6));
    }
  });
});

test('all nine inlays clear original bores, support arms, shaft ends and every gear sweep', t => {
  const {group, mechanism} = fixture(t); group.updateMatrixWorld(true);
  const nodes = mechanism.diagnostics().topology.nodes;
  const pivots = nodes.filter(n => n.id.endsWith('-wheel'));
  const gears = nodes.filter(n => n.kind === 'gear').map(node => {
    const mesh = group.getObjectByName(`wheel-${node.id}`), p = mesh.geometry.attributes.position;
    let radius = 0;
    for (let i = 0; i < p.count; i++) radius = Math.max(radius, Math.hypot(p.getX(i), p.getZ(i)));
    return {node, radius, bounds: new THREE.Box3().setFromObject(mesh)};
  });
  const findings = [];
  pivots.forEach((node, index) => {
    const points = batches(group).flatMap(mesh => instancePoints(mesh, index));
    const bounds = new THREE.Box3().setFromPoints(points);
    const radius = Math.max(...points.map(p => Math.hypot(p.x - node.x, p.z - node.z)));
    const bridge = group.getObjectByName(`bridge-${node.id}-${node.y + .315}`);
    const housing = group.getObjectByName(`bearing-${node.id}-${node.y + .315}`);
    const shaft = group.getObjectByName(`journal-${node.id}`);
    const bore = Math.min(...housing.geometry.parameters.points.map(p => p.x));
    assert.equal(bore, .102, 'original bore is not counterbored');
    assert.ok(Math.abs(radius - .09568) < 1e-6);
    assert.ok(bore - radius > .0063);
    const local = bridge.worldToLocal(new THREE.Vector3(node.x, node.y + .325, node.z));
    bridge.geometry.computeBoundingBox(); const b = bridge.geometry.boundingBox;
    const armGap = Math.hypot(Math.max(b.min.x - local.x, 0, local.x - b.max.x), Math.max(b.min.z - local.z, 0, local.z - b.max.z)) - radius;
    const shaftGap = bounds.min.y - new THREE.Box3().setFromObject(shaft).max.y;
    const housingBounds = new THREE.Box3().setFromObject(housing);
    assert.ok(armGap > .005, `${node.id}: support arm clearance`);
    assert.ok(shaftGap > .0049, `${node.id}: shaft clearance`);
    assert.ok(Math.abs(housingBounds.max.y - (node.y + .35)) < 2e-6);
    assert.ok(housingBounds.max.y - bounds.max.y > .0124);
    assert.ok(Math.abs(bounds.max.y - (node.y + .3375)) < 2e-6);
    assert.ok(Math.abs(bounds.min.y - (node.y + .32)) < 2e-6);
    let gearGap = Infinity;
    for (const gear of gears) {
      const axial = Math.max(bounds.min.y - gear.bounds.max.y, gear.bounds.min.y - bounds.max.y);
      const radial = gear.node.axis === 'y' ? Math.hypot(node.x - gear.node.x, node.z - gear.node.z) - radius - gear.radius : -Infinity;
      const margin = Math.max(axial, radial);
      assert.ok(margin > 1e-6, `${node.id}/${gear.node.id}: swept teeth clearance`);
      gearGap = Math.min(gearGap, margin);
    }
    findings.push({pivot: node.id, armGap, shaftGap, gearGap});
  });
  assert.equal(findings.length, 9);
  t.diagnostic(JSON.stringify({pivots: findings.length, gears: gears.length,
    minArmGap: Math.min(...findings.map(f => f.armGap)), minShaftGap: Math.min(...findings.map(f => f.shaftGap)), minGearGap: Math.min(...findings.map(f => f.gearGap))}));
});

test('crank cap follows the actual rotor through a full turn and transformed ancestors; pivots stay fixed', t => {
  const {group, mechanism} = fixture(t), meshes = batches(group);
  const fixed = meshes.map(mesh => mesh.instanceMatrix.array.slice(0, 9 * 16));
  const local = new THREE.Matrix4().compose(new THREE.Vector3(1.12, .867, 0), new THREE.Quaternion(), new THREE.Vector3(.90, .65, .90));
  const expected = new THREE.Matrix4(), actual = new THREE.Matrix4();
  const days = mechanism.diagnostics().inputDaysPerTurn;
  const epoch = Date.parse('2000-01-01T12:00:00Z');
  const gears = mechanism.diagnostics().topology.nodes.filter(n => n.kind === 'gear').map(node => {
    const p = group.getObjectByName(`wheel-${node.id}`).geometry.attributes.position;
    let radius = 0;
    for (let i = 0; i < p.count; i++) radius = Math.max(radius, Math.hypot(p.getX(i), p.getY(i), p.getZ(i)));
    return {node, radius};
  });
  for (const transformed of [false, true]) {
    if (transformed) {group.position.set(3, 2, -5); group.rotation.set(.17, -.6, .3); group.scale.set(1.3, .8, 1.1);}
    for (let step = 0; step <= 24; step++) {
      mechanism.update(new Date(epoch + step / 24 * days * 86400000), true);
      group.updateMatrixWorld(true);
      expected.multiplyMatrices(mechanism.crank.matrixWorld, local);
      if (!transformed) {
        const capBounds = new THREE.Box3().setFromPoints(meshes.flatMap(mesh => instancePoints(mesh, 9)));
        for (const {node, radius} of gears) assert.ok(capBounds.distanceToPoint(new THREE.Vector3(node.x, node.y, node.z)) > radius, `${node.id}: grip cap outside swept gear sphere`);
      }
      meshes.forEach((mesh, i) => {
        assert.deepEqual(mesh.instanceMatrix.array.slice(0, 9 * 16), fixed[i]);
        mesh.getMatrixAt(9, actual); actual.premultiply(mesh.matrixWorld);
        actual.elements.forEach((value, index) => assert.ok(Math.abs(value - expected.elements[index]) < 2e-6));
        const inverse = mesh.matrixWorld.clone().invert();
        for (const point of instancePoints(mesh, 9)) {
          point.applyMatrix4(inverse);
          assert.ok(mesh.boundingBox.clone().expandByScalar(1e-6).containsPoint(point), 'dynamic cap stays in culling bounds');
        }
      });
    }
  }
});

test('shared pillar materials and maps are disposed only once by host traversal', () => {
  const instrument = createInstrument(), [stone, bezel] = batches(instrument.group);
  const watched = [stone, bezel, stone.geometry, bezel.geometry, stone.material, bezel.material, stone.material.map, stone.material.normalMap];
  const counts = new Map(watched.map(resource => [resource, 0]));
  for (const resource of watched) resource.addEventListener('dispose', () => counts.set(resource, counts.get(resource) + 1));
  instrument.disposeFinishes(); dispose(instrument.group);
  for (const resource of watched) assert.equal(counts.get(resource), 1, resource.name || resource.type);
});
