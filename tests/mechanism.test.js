import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';

const mechanism = await import('../src/mechanism.js').catch(() => ({}));
const near = (a, b, message) => assert.ok(Math.abs(a - b) < 1e-8, message || `${a} != ${b}`);

test('clockwork date drive reverses exactly and meshing wheels obey their tooth counts', () => {
  assert.equal(typeof mechanism.createMechanism, 'function', 'a date-driven physical mechanism must exist');
  const model = mechanism.createMechanism();
  const epoch = new Date('2000-01-01T12:00:00Z');
  model.update(epoch, false);
  const first = model.diagnostics();
  model.update(new Date(+epoch + 7.5 * 86400000), true);
  const quarter = model.diagnostics();
  near(quarter.crankTurns - first.crankTurns, 0.25);
  assert.ok(quarter.gears.length >= 8, 'open chassis must carry substantial actual gearing');
  for (const pair of quarter.pairs) {
    const a = quarter.gears.find(g => g.id === pair.driver);
    const b = quarter.gears.find(g => g.id === pair.driven);
    const a0 = first.gears.find(g => g.id === pair.driver);
    const b0 = first.gears.find(g => g.id === pair.driven);
    near((a.angle - a0.angle) * a.teeth + (b.angle - b0.angle) * b.teeth, 0, 'toothed neighbors must counter-rotate coherently');
    near(Math.hypot(a.x - b.x, a.z - b.z), a.pitchRadius + b.pitchRadius, 'pitch circles must meet');
    near(a.y, b.y, 'meshing wheels share a plane');
  }
  model.update(epoch, false);
  assert.deepEqual(model.diagnostics().gears, first.gears, 'reverse date restores wheel transforms');
  assert.equal(model.diagnostics().playing, false);
  assert.ok(model.group.getObjectByName('crank-handle'));
  assert.ok(model.group.getObjectByName('auto-lever'));
  // The removed input disc is no longer the spoke reference; retain the
  // real negative-space check on the unchanged first central reduction.
  const geometry = model.group.getObjectByName('wheel-mercury-driver').geometry;
  assert.ok(geometry.parameters.shapes.holes.length >= 5, 'wheel spokes must have real negative space');
});

test('one crank drives every planet through a single reachable tooth-and-shaft graph', () => {
  const model = mechanism.createMechanism();
  const first = model.diagnostics();
  assert.ok(first.topology, 'gear trains must form one real input-to-output topology');
  const {nodes, edges, root} = first.topology;
  const reachable = new Set([root]);
  for (let step = 0; step < nodes.length; step++) for (const edge of edges) if (reachable.has(edge.driver)) reachable.add(edge.driven);
  assert.equal(reachable.size, nodes.length, 'no disconnected independently animated root');
  assert.equal(first.outputs.length, 9);
  model.update(new Date('2000-01-31T12:00:00Z'));
  const next = model.diagnostics();
  const rates = new Map([[root, -1]]);
  for (const edge of edges) {
    assert.ok(rates.has(edge.driver), 'edges are explicitly ordered for propagation');
    const a = nodes.find(n => n.id === edge.driver), b = nodes.find(n => n.id === edge.driven);
    const ratio = edge.type === 'mesh' ? -a.teeth / b.teeth : edge.type === 'right-angle' ? -1 : 1;
    rates.set(edge.driven, rates.get(edge.driver) * ratio);
    if (edge.type === 'rigid') {
      const axis = new THREE.Vector3(...a.axisVector), other = new THREE.Vector3(...b.axisVector);
      near(axis.dot(other), 1, 'rigid shaft axes agree');
      near(new THREE.Vector3(b.x - a.x, b.y - a.y, b.z - a.z).cross(axis).length(), 0, 'rigid endpoints are coaxial in 3D');
    } else if (edge.type === 'mesh') {
      near(Math.hypot(a.x - b.x, a.z - b.z), a.pitchRadius + b.pitchRadius);
      near(a.y, b.y); near(a.module, b.module);
    } else {
      assert.equal(edge.type, 'right-angle', 'no untested transmission edge type');
      const axisA = new THREE.Vector3(...a.axisVector), axisB = new THREE.Vector3(...b.axisVector);
      near(axisA.dot(axisB), 0, 'miter shafts are perpendicular');
      const apexA = new THREE.Vector3(a.x, a.y, a.z).addScaledVector(axisA, -a.pitchRadius);
      const apexB = new THREE.Vector3(b.x, b.y, b.z).addScaledVector(axisB, -b.pitchRadius);
      near(apexA.distanceTo(apexB), 0, 'miter pitch apices coincide');
      near(a.teeth, b.teeth); near(a.module, b.module);
    }
    const get = (d, id) => d.nodeAngles[id];
    near(get(next, b.id) - get(first, b.id), ratio * (get(next, a.id) - get(first, a.id)));
  }
  for (const output of next.outputs) {
    const old = first.outputs.find(o => o.id === output.id);
    assert.equal(output.path[0], root); assert.equal(output.path.at(-1), output.node);
    near(output.angle - old.angle, Math.PI * 2 * rates.get(output.node));
    near(output.ratio, rates.get(output.node));
    assert.ok(output.ratio > 0 && Math.abs(output.periodErrorDays / output.referencePeriodDays) < 0.00001);
  }
});

test('journals clear rotating shafts, sleeves nest without fusion, and tooth phases meet gaps', () => {
  const model = mechanism.createMechanism();
  const {topology} = model.diagnostics();
  const sleeves = topology.nodes.filter(n => n.kind === 'sleeve');
  for (let i = 0; i < sleeves.length; i++) {
    const sleeve = sleeves[i];
    assert.ok(sleeve.outerRadius > sleeve.innerRadius);
    if (i) {
      assert.ok(sleeve.innerRadius > sleeves[i - 1].outerRadius, 'air gap between independently rotating tubes');
      assert.ok(sleeve.y < sleeves[i - 1].y, 'outer sleeves end below inner arms');
    }
    assert.ok(model.group.getObjectByName(`sleeve-journal-top-${sleeve.bodyId}`), 'sleeves need bearing surfaces, not floating tubes');
  }
  for (const node of topology.nodes.filter(n => n.id.endsWith('-wheel'))) {
    for (const y of [node.y - 0.115, node.y + 0.315]) {
      const beam = model.group.getObjectByName(`bridge-${node.id}-${y}`);
      const startRadius = Math.hypot(beam.position.x, beam.position.z) - beam.geometry.parameters.width / 2;
      assert.ok(startRadius > Math.hypot(node.x, node.z) + 0.095, 'fixed bridge cannot occupy rotating shaft');
    }
  }
  for (const date of ['2000-01-01T12:00:00Z', '1800-01-01T00:00:00Z', '2050-01-01T00:00:00Z']) {
    model.update(new Date(date)); const d = model.diagnostics();
    for (const edge of d.pairs) {
      const a = d.gears.find(g => g.id === edge.driver), b = d.gears.find(g => g.id === edge.driven);
      const beta = Math.atan2(-(b.z - a.z), b.x - a.x);
      const phase = (a.teeth + b.teeth) * beta + b.teeth * Math.PI - a.teeth * a.angle - b.teeth * b.angle;
      assert.ok(Math.abs(Math.cos(phase) + 1) < 1e-9, 'contact tooth faces the opposing tooth gap');
    }
  }
});

test('crank angles unwrap clockwise-positive turns with bounded increments and finite rejection', () => {
  assert.equal(typeof mechanism.crankDeltaTurns, 'function');
  near(mechanism.crankDeltaTurns(0, -Math.PI / 8), 1 / 16);
  near(mechanism.crankDeltaTurns(-Math.PI / 8, 0), -1 / 16);
  near(mechanism.crankDeltaTurns(-Math.PI + 0.1, Math.PI - 0.1), 0.2 / (Math.PI * 2));
  near(mechanism.crankDeltaTurns(0, -Math.PI / 2), 1 / 12);
  assert.equal(mechanism.crankDeltaTurns(NaN, 1), 0);
});
