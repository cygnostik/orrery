import {BODIES, SCIENCE} from './science.js';

export const DRIVE_EPOCH = Date.parse('2000-01-01T12:00:00Z');
export const INPUT_DAYS_PER_TURN = 30;
// Outward along the front/right rim; the crank winds in a vertical plane.
const radialLength = Math.hypot(0.22, 1);
export const CRANK_LAYOUT = Object.freeze({
  rimRadius: 15.12, radius: 15.72, height: -1.57,
  axis: Object.freeze([0.22 / radialLength, 0, 1 / radialLength]),
  miterRadius: 0.30, miterFace: 0.09, shaftRadius: 0.095,
});
const TAU = Math.PI * 2;
// Permanent arm keying: pre-refit Table 1 / 8.10.2 positionAt at J2000,
// atan2(y,x) in radians. Captured in fixtures/science/mechanical-j2000.json.
// An Observatory ephemeris update must not re-index this existing instrument.
const MOUNTING_ANGLES = Object.freeze({
  mercury: -1.8538245298241223,
  venus: -3.096091688751235,
  earth: 1.7519646486652485,
  mars: -0.009628935682899594,
  jupiter: 0.6349586014471034,
  saturn: 0.7954964631436026,
  uranus: -0.7609802844141714,
  neptune: -0.9788442274730486,
  pluto: -1.9105189948001848,
});

// Fixed integer teeth, searched once against cumulative period, never refitted
// at runtime. Each row is a reverted compound reduction A:B — C:D.
const TEETH = [[89,100,41,107], [59,100,71,107], [39,47,43,58],
  [25,32,49,72], [67,87,21,102], [28,59,73,86], [24,40,59,101],
  [89,55,23,73], [41,58,63,67]];

export function createDriveTrain() {
  const nodes = [], edges = [], outputs = [], byId = new Map();
  function node(spec) {
    const value = {axis: 'y', axisVector: [0, 1, 0], phase: 0, ...spec};
    nodes.push(value); byId.set(value.id, value); return value;
  }
  function link(a, b, type) {
    edges.push({driver: a.id, driven: b.id, type});
    if (type === 'mesh') {
      const beta = Math.atan2(-(b.z - a.z), b.x - a.x);
      b.phase = ((a.teeth + b.teeth) * beta + b.teeth * Math.PI + Math.PI - a.teeth * a.phase) / b.teeth;
    }
    return b;
  }
  const gear = (id, teeth, module, x, y, z, bore = 0.095) => node({id, kind: 'gear', teeth, module, pitchRadius: teeth * module / 2, x, y, z, bore, depth: 0.11});
  const {axis, radius, height, miterRadius, miterFace} = CRANK_LAYOUT;
  const root = node({id: 'crank-spindle', kind: 'input', axis: 'radial', axisVector: axis,
    x: axis[0] * radius, y: height, z: axis[2] * radius});
  const miter = {kind: 'gear', gearForm: 'miter', teeth: 20, module: 2 * miterRadius / 20,
    pitchRadius: miterRadius, depth: miterFace, pitchConeAngle: Math.PI / 4,
    pitchApex: [0, height, 0]};
  const pinion = link(root, node({...miter, id: 'crank-miter', axis: 'radial', axisVector: axis,
    x: axis[0] * miterRadius, y: height, z: axis[2] * miterRadius, bore: 0.095,
    phase: Math.PI / 2}), 'rigid');
  // One equal-tooth bevel pair replaces three reversing spur meshes: same -1
  // input sign and no new reduction. The lunar graph already supports this type.
  let previous = link(pinion, node({...miter, id: 'central-miter', x: 0, y: height + miterRadius,
    z: 0, bore: 0.145, phase: Math.atan2(-axis[2], axis[0]) + Math.PI / miter.teeth}), 'right-angle');
  BODIES.forEach((body, i) => {
    const [a, b, c, d] = TEETH[i], radius = 3.4;
    const beta = (120 + i * 40) * Math.PI / 180;
    const x = radius * Math.cos(beta), z = -radius * Math.sin(beta), y = -1.04 + i * 0.4;
    const innerRadius = 0.20 + i * 0.06, outerRadius = innerRadius + 0.045;
    const input = link(previous, gear(`${body.id}-driver`, a, radius * 2 / (a + b), 0, y, 0, i ? innerRadius - 0.06 : 0.145), 'rigid');
    const wheel = link(input, gear(`${body.id}-wheel`, b, input.module, x, y, z), 'mesh');
    const pinion = link(wheel, gear(`${body.id}-pinion`, c, radius * 2 / (c + d), x, y + 0.20, z), 'rigid');
    const outputGear = link(pinion, gear(`${body.id}-output`, d, pinion.module, 0, y + 0.20, 0, innerRadius), 'mesh');
    const sleeve = link(outputGear, node({id: `${body.id}-sleeve`, kind: 'sleeve', x: 0, y: 4.5 - i * 0.20, z: 0,
      bottom: outputGear.y, innerRadius, outerRadius, bodyId: body.id}), 'rigid');
    // Fixed historical J2000 keying; no live ephemeris enters the train.
    outputs.push({id: body.id, node: sleeve.id, referencePeriodDays: body.periodDays,
      mountingAngle: MOUNTING_ANGLES[body.id], armHeight: sleeve.y, innerRadius, outerRadius});
    previous = sleeve;
  });
  const topology = {root: root.id, nodes, edges};
  function propagate(inputAngle) {
    if (!Number.isFinite(inputAngle)) throw new RangeError('Finite input angle required');
    const angles = {[root.id]: inputAngle};
    for (const edge of edges) {
      const a = byId.get(edge.driver), b = byId.get(edge.driven);
      angles[b.id] = angles[a.id] * (edge.type === 'mesh' ? -a.teeth / b.teeth : edge.type === 'right-angle' ? -1 : 1);
    }
    return angles;
  }
  const rates = propagate(-1);
  for (const output of outputs) {
    output.ratio = rates[output.node];
    output.periodDays = INPUT_DAYS_PER_TURN / output.ratio;
    output.periodErrorDays = output.periodDays - output.referencePeriodDays;
    output.driftDegreesPerCentury = 360 * 36525 * (1 / output.periodDays - 1 / output.referencePeriodDays);
    let at = output.node; output.path = [at];
    while (at !== root.id) {at = edges.find(e => e.driven === at).driver; output.path.unshift(at);}
  }
  function atDate(date) {
    const ms = +date;
    if (!Number.isFinite(ms) || ms < Date.parse(SCIENCE.range.start) || ms > Date.parse(SCIENCE.range.end)) throw new RangeError('Mechanism requires a valid date within the science date range');
    const elapsedDays = (ms - DRIVE_EPOCH) / 86400000;
    const crankTurns = elapsedDays / INPUT_DAYS_PER_TURN;
    const nodeAngles = propagate(-crankTurns * TAU);
    return {crankTurns, elapsedDays, nodeAngles, outputs: outputs.map(output => ({...output,
      shaftAngle: nodeAngles[output.node], angle: nodeAngles[output.node] + output.mountingAngle,
      accumulatedErrorDeg: elapsedDays / 36525 * output.driftDegreesPerCentury}))};
  }
  return {topology, outputs, atDate, propagate};
}
