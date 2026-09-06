import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import {MOONS} from '../src/moons.js';
import {createInstrument, BODY_HEIGHT} from '../src/scene-assets.js';
import {createSatellites} from '../src/satellite-scene.js';

const date = new Date('2000-01-01T12:00:00Z');

test('shaft-fed local compound graph drives all lunar outputs from the crank', async () => {
  const module = await import('../src/lunar-drive.js').catch(() => ({}));
  assert.equal(typeof module.createLunarDrive, 'function', 'transmission topology required, not per-moon angle animation');
  const drive = module.createLunarDrive(), {nodes, edges} = drive.topology;
  const byId = new Map(nodes.map(n => [n.id, n]));
  const reached = new Set(['crank-spindle']);
  for (const edge of edges) {assert.ok(reached.has(edge.driver), edge.driver); if (edge.carrier) assert.ok(reached.has(edge.carrier)); reached.add(edge.driven);}
  assert.equal(drive.outputs.length, 10);
  for (const output of drive.outputs) {
    assert.ok(reached.has(output.node));
    assert.ok(Math.abs(output.periodErrorDays / output.referencePeriodDays) < 0.001, `${output.id}: finite train within 0.1% period error`);
  }
  for (const edge of edges.filter(e => e.type === 'mesh' && e.lunar)) {
    const a = byId.get(edge.driver), b = byId.get(edge.driven);
    assert.equal(a.y, b.y); assert.equal(a.module, b.module);
    assert.ok(Math.abs(Math.hypot(a.x - b.x, a.z - b.z) - a.pitchRadius - b.pitchRadius) < 1e-10);
  }
  for (const angle of [-1000, 0, 0.1, 1000]) {
    const state = drive.propagate(angle);
    for (const edge of edges.filter(e => e.lunar)) {
      const a = byId.get(edge.driver), b = byId.get(edge.driven);
      const expected = edge.type === 'mesh' ? -state[a.id] * a.teeth / b.teeth : edge.type === 'right-angle' ? -state[a.id] : edge.carrier ? state[a.id] - state[edge.carrier] : state[a.id];
      assert.ok(Math.abs(state[b.id] - expected) < 1e-8);
    }
  }
});
test('the retained lunar ratio-study layout has consistent bores and reserved extents', async () => {
  const {createLunarDrive} = await import('../src/lunar-drive.js');
  const {MECHANICAL_RADII, FAMILY_ENVELOPES} = await import('../src/lunar-layout.js');
  const drive = createLunarDrive();
  for (const n of drive.topology.nodes.filter(n => n.lunar && n.kind === 'gear')) {
    const d = Math.hypot(n.x - MECHANICAL_RADII[n.parentId], n.z);
    if (d < 1e-10) assert.ok(n.bore >= 0.061, `${n.id}: bore must clear the planet post`);
    else assert.ok(d - n.pitchRadius - n.module > 0.06, `${n.id}: gear cuts through parent support post`);
    if (!n.id.includes('takeoff') && !n.id.includes('idler-')) assert.ok(d + n.pitchRadius + n.module <= FAMILY_ENVELOPES[n.parentId], `${n.id}: beyond reserved family envelope`);
  }
});

test('every drawn lunar transfer shaft and sleeve follows the shared crank graph in either time direction', () => {
  const {instrument, satellites, parents} = fixture();
  try {
    assert.equal(typeof satellites.mechanism.diagnostics, 'function', 'drawn transmission diagnostics required');
    const dates = ['1800-01-01', '2000-01-01T12:00:00Z', '2049-12-31', '2000-01-01T12:00:00Z'];
    const records = [];
    for (const instant of dates) {
      instrument.mechanism.update(new Date(instant)); satellites.update(new Date(instant), parents, {mode: 'mechanical'});
      const d = satellites.mechanism.diagnostics();
      assert.equal(d.outputCount, 10);
      assert.deepEqual(d.drawnGears, [], 'internal ratio-study wheels are not rendered on the supports');
      assert.match(d.model, /internal lunar gearing is schematic/i);
      for (const family of d.families) {
        const shaft = instrument.arms.get(family.parentId).getObjectByName(`lunar-transfer-rotor-${family.parentId}`);
        assert.ok(Math.abs(shaft.rotation.x - d.nodeAngles[family.transfer]) < 1e-10);
      }
      for (const o of d.outputs) {
        assert.ok(Math.abs(satellites.mechanism.rotors.get(o.id).rotation.y - d.nodeAngles[o.node] - o.mountingAngle) < 1e-8);
        const globe = satellites.bodies.get(o.id), p = globe.getWorldPosition(new THREE.Vector3());
        const carrier = instrument.mechanism.diagnostics().outputs.find(x => x.id === o.parentId);
        const radial = instrument.arms.get(o.parentId).userData.orbitRadius;
        const moonRadius = satellites.display[o.id].orbit, theta = d.nodeAngles[o.node] + o.mountingAngle + carrier.angle;
        assert.ok(Math.abs(p.x - (Math.cos(carrier.angle) * radial + Math.cos(theta) * moonRadius)) < 1e-8);
        assert.ok(Math.abs(p.z - (-Math.sin(carrier.angle) * radial - Math.sin(theta) * moonRadius)) < 1e-8);
        assert.ok(Math.abs(p.y - BODY_HEIGHT) < 1e-10);
        assert.ok(d.shafts.some(s => s.driven.includes(o.node)), `${o.id}: physical final shaft required`);
      }
      records.push([...satellites.bodies.values()].map(m => m.getWorldPosition(new THREE.Vector3()).toArray()));
    }
    assert.deepEqual(records[1], records[3]); assert.notDeepEqual(records[0], records[2]);
  } finally {dispose(instrument.group, satellites.group); instrument.disposeFinishes();}
});

test('compact support hubs and existing caps remain below the independently moving sleeves', () => {
  const {instrument, satellites} = fixture();
  try {
    const d = satellites.mechanism.diagnostics();
    assert.ok(d.supportEnvelopes, 'measure bounds of actual fittings before batching');
    for (const family of d.families) {
      const supports = d.supportEnvelopes.filter(s => s.parentId === family.parentId);
      assert.ok(supports.every(s => !s.name.startsWith('lunar-frame-')), 'remove the external gear tower frame too');
      const hub = supports.find(s => s.name === `lunar-hub-${family.parentId}`);
      const housing = supports.find(s => s.name === `lunar-transfer-output-housing-${family.parentId}`);
      const sleeveBottom = Math.min(...d.shafts.filter(s => s.driven.some(id => d.outputs.some(o => o.parentId === family.parentId && o.node === id))).map(s => s.bottom - family.armHeight));
      for (const fitting of [hub, housing]) {
        assert.ok(fitting.max[1] < sleeveBottom, `${fitting.name}: fixed fitting intersects rotating sleeve`);
      }
      const arm = instrument.arms.get(family.parentId), cap = arm.getObjectByName(`cap-${family.parentId}`), bearing = arm.getObjectByName(`bearing-${family.parentId}`);
      for (const object of [cap, bearing]) {
        object.geometry.computeBoundingBox();
        assert.ok(object.position.y + object.geometry.boundingBox.max.y < sleeveBottom, `${object.name}: existing support cap cuts rotating sleeve`);
      }
    }
  } finally {dispose(instrument.group, satellites.group); instrument.disposeFinishes();}
});

test('actual pillar crowns clear every supported main-arm sweep', () => {
  const {instrument, satellites} = fixture();
  try {
    instrument.group.updateMatrixWorld(true);
    const crowns = instrument.group.getObjectByName('pillar-black-opal-inlays');
    const highest = new THREE.Box3().setFromObject(crowns).max.y;
    for (const [id, arm] of instrument.arms) {
      const beam = arm.children.find(o => o.isMesh && o.geometry.parameters.height === 0.095);
      const lowest = new THREE.Box3().setFromObject(beam).min.y;
      assert.ok(lowest - highest > 0.02, `${id}: cabochon intersects arm sweep; clearance ${lowest - highest}`);
    }
  } finally {dispose(instrument.group, satellites.group); instrument.disposeFinishes();}
});

test('every moon support sleeve reaches the lower hub and has annular journals at both ends', () => {
  const {instrument, satellites} = fixture();
  try {
    const d = satellites.mechanism.diagnostics();
    for (const output of d.outputs) {
      const family = d.families.find(f => f.parentId === output.parentId);
      const shaft = d.shafts.find(s => s.driven.includes(output.node));
      const tube = satellites.mechanism.rotors.get(output.id).getObjectByName(shaft.mesh);
      assert.ok(Math.abs(shaft.bottom - family.armHeight - 0.11) < 1e-10);
      assert.ok(Math.abs(tube.userData.top - tube.userData.bottom - (shaft.top - shaft.bottom + 0.023)) < 1e-10);
      const journals = d.supportEnvelopes.filter(s => s.name.startsWith(`lunar-journal-${output.id}-`));
      assert.equal(journals.length, 2, `${output.id}: both ends need a journal`);
      for (const journal of journals) {
        assert.ok(journal.min[1] + family.armHeight > shaft.bottom);
        assert.ok(journal.max[1] + family.armHeight < shaft.top + 0.023);
      }
    }
  } finally {dispose(instrument.group, satellites.group); instrument.disposeFinishes();}
});

test('continuous certificate measures actual hubs, journals, sleeves, arms and pins without phantom gear towers', async () => {
  const {FAMILY_ENVELOPES, MECHANICAL_RADII} = await import('../src/lunar-layout.js');
  const {instrument, satellites} = fixture();
  try {
    const d = satellites.mechanism.diagnostics();
    assert.equal(d.clearance.actualFamilies?.length, 6, 'six geometry-derived family envelopes required');
    for (const family of d.clearance.actualFamilies) {
      assert.ok(family.radius <= FAMILY_ENVELOPES[family.id] + 1e-7, `${family.id}: real mesh extends outside its reservation`);
      assert.ok(family.components.some(c => c.name === `lunar-hub-${family.id}`));
      assert.ok(family.components.every(c => !c.name.startsWith('wheel-') && !c.name.startsWith('lunar-frame-')));
      for (const moon of MOONS.filter(m => m.parentId === family.id)) {
        for (const kind of ['lunar-tube', 'lunar-arm', 'lunar-pin', 'satellite']) assert.ok(family.components.some(c => c.name === `${kind}-${moon.id}`));
        assert.equal(satellites.bodies.get(moon.id).geometry.parameters.radius, satellites.display[moon.id].radius);
      }
      for (const support of d.supportEnvelopes.filter(s => s.parentId === family.id && !s.name.startsWith('lunar-transfer-'))) {
        for (const x of [support.min[0], support.max[0]]) for (const z of [support.min[2], support.max[2]]) {
          assert.ok(Math.hypot(x - MECHANICAL_RADII[family.id], z) <= family.radius + 1e-7, support.name);
        }
      }
    }
    for (const pair of d.clearance.familyPairs) assert.ok(pair.clearance > 0.04, `${pair.a}/${pair.b}`);
  } finally {dispose(instrument.group, satellites.group); instrument.disposeFinishes();}
});

test('mechanical moon motion is represented by its physical arm, not a floating orbit overlay', () => {
  const {instrument, satellites, parents} = fixture();
  try {
    satellites.update(date, parents, {mode: 'mechanical', selected: 'jupiter'});
    assert.ok([...satellites.group.children].filter(o => o.name.startsWith('illustrative-track-')).every(o => !o.visible));
    satellites.update(date, parents, {mode: 'observatory', selected: 'jupiter'});
    assert.equal([...satellites.group.children].filter(o => o.name.startsWith('illustrative-track-') && o.visible).length, 4);
  } finally {dispose(instrument.group, satellites.group); instrument.disposeFinishes();}
});

test('mechanical engraved tracks never float beyond the physical dial', () => {
  const {instrument, satellites} = fixture();
  try {
    instrument.group.getObjectByName('dial-face').geometry.computeBoundingBox();
    const outer = instrument.group.getObjectByName('dial-face').geometry.boundingBox.max.x;
    for (const [id, arm] of instrument.arms) {
      const track = instrument.group.getObjectByName(`track-${id}`);
      if (arm.userData.orbitRadius > outer) assert.equal(track.visible, false, `${id}: track floats outside the dial`);
    }
  } finally {dispose(instrument.group, satellites.group); instrument.disposeFinishes();}
});

function fixture() {
  const instrument = createInstrument(), satellites = createSatellites({instrument});
  const parents = new Map([...instrument.arms].map(([id, arm]) => {
    const parent = new THREE.Group(); arm.getObjectByName(`planet-mount-${id}`).getWorldPosition(parent.position); return [id, parent];
  }));
  return {instrument, satellites, parents};
}
function dispose(...groups) {
  const resources = new Set();
  for (const group of groups) group.traverse(o => {if (o.geometry) resources.add(o.geometry); for (const m of [o.material].flat().filter(Boolean)) {resources.add(m); for (const v of Object.values(m)) if (v?.isTexture) resources.add(v);}});
  for (const r of resources) r.dispose();
}

test('all ten mechanical moons are children of actual keyed sleeve output mounts', () => {
  const {instrument, satellites, parents} = fixture();
  try {
    satellites.update(date, parents, {mode: 'mechanical'});
    assert.equal(satellites.mechanism?.outputMounts.size, MOONS.length, 'ten connected lunar output mounts required');
    for (const moon of MOONS) {
      const globe = satellites.bodies.get(moon.id), mount = satellites.mechanism.outputMounts.get(moon.id);
      assert.equal(globe.parent, mount, `${moon.id}: globe must inherit its physical output, not an independently computed position`);
      assert.deepEqual(globe.position.toArray(), [0, 0, 0]);
      const before = globe.getWorldPosition(new THREE.Vector3());
      mount.parent.rotation.y += 0.3;
      assert.ok(globe.getWorldPosition(new THREE.Vector3()).distanceTo(before) > 0.01, 'turning sleeve itself moves the mounted globe');
    }
  } finally {dispose(instrument.group, satellites.group); instrument.disposeFinishes();}
});

test('continuous mechanical family annuli are separated from every neighboring globe and mast', async () => {
  const layout = await import('../src/lunar-layout.js').catch(() => ({}));
  assert.equal(typeof layout.lunarClearanceCertificate, 'function', 'continuous swept-envelope certificate required');
  const certificate = layout.lunarClearanceCertificate();
  assert.equal(certificate.familyPairs.length, 36);
  for (const row of certificate.familyPairs) assert.ok(row.clearance > 0.04, `${row.a}/${row.b}: full family sweeps overlap`);
  const {instrument, satellites} = fixture();
  try {
    for (const [id, arm] of instrument.arms) assert.equal(arm.userData.orbitRadius, layout.MECHANICAL_RADII[id]);
    assert.ok(BODY_HEIGHT >= 9, 'retain the approved globe and lunar-arm heights');
    for (const moon of MOONS) {
      const mount = satellites.mechanism.outputMounts.get(moon.id);
      const bar = mount.parent.getObjectByName(`lunar-arm-${moon.id}`);
      const p = bar.getWorldPosition(new THREE.Vector3());
      assert.ok(p.y > 7, 'carriers above every main arm and fixed pillar');
      assert.ok(p.y + 0.045 / 2 < BODY_HEIGHT - (moon.parentId === 'saturn' ? 1.472 * Math.sin(26.7 * Math.PI / 180) : 0.77));
    }
  } finally {dispose(instrument.group, satellites.group); instrument.disposeFinishes();}
});
