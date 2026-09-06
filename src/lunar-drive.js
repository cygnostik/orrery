import {createDriveTrain, INPUT_DAYS_PER_TURN} from './drive-train.js';
import {MOONS, MOON_MODEL} from './moons.js';
import {MECHANICAL_RADII, MAIN_ARM_LIFT} from './lunar-layout.js';

export const LUNAR_CENTERS = Object.freeze({earth: 0.33, jupiter: 0.62, saturn: 0.65, uranus: 0.4, neptune: 0.4, pluto: 0.4});
const TAU = Math.PI * 2;
function toothOptions(distance, driverBore, drivenBore) {
  const options = [];
  for (let a = 16; a <= 96; a++) for (let b = 16; b <= 96; b++) {
    const module = 2 * distance / (a + b);
    if ((a / 2 - 1.2) * module <= driverBore + 0.016 || (b / 2 - 1.2) * module <= drivenBore + 0.016) continue;
    options.push({a, b, ratio: a / b});
  }
  return options.sort((a, b) => a.ratio - b.ratio);
}
function nearest(options, ratio) {
  let lo = 0, hi = options.length;
  while (lo < hi) {const mid = (lo + hi) >> 1; if (options[mid].ratio < ratio) lo = mid + 1; else hi = mid;}
  return [options[Math.max(0, lo - 1)], options[Math.min(lo, options.length - 1)]]
    .reduce((best, candidate) => Math.abs(Math.log(candidate.ratio / ratio)) < Math.abs(Math.log(best.ratio / ratio)) ? candidate : best);
}
function chooseTeeth(target, distance, inner) {
  const options = Array.from({length: 9}, (_, i) => toothOptions(distance, i % 2 ? inner : i ? 0.042 : 0.025, i % 2 ? 0.042 : inner));
  const power = Math.log(target) / options.reduce((sum, list) => sum + Math.log(list[list.length - 1].ratio), 0);
  const chosen = [], first = options.slice(0, 7);
  let product = 1;
  for (const list of first) {const pair = nearest(list, list[list.length - 1].ratio ** power); chosen.push(pair); product *= pair.ratio;}
  let best, error = Infinity;
  for (const a of options[7]) {
    const b = nearest(options[8], target / product / a.ratio);
    const e = Math.abs(Math.log(product * a.ratio * b.ratio / target));
    if (e < error) {best = [a, b]; error = e;}
  }
  return [...chosen, ...best];
}

/**
 * A moving-frame drive: previous solar sleeve -> enclosed right-angle takeoff
 * -> slender radial shaft -> enclosed reduction -> nested moon-support sleeves.
 * Lunar gear coordinates retain the ratio-study layout, not fitted hardware.
 * Internal reductions and ideal 1:1 right-angle pairs are not rendered or
 * claimed as engineering-validated geometry. Support bars remain rigid.
 * Carrier-relative subtraction is the kinematic constraint at the takeoff,
 * not a local motor. All subsequent angular rates follow integer tooth ratios.
 */
export function createLunarDrive() {
  const main = createDriveTrain(), nodes = main.topology.nodes.map(n => ({...n})), edges = main.topology.edges.map(e => ({...e}));
  const byId = new Map(nodes.map(n => [n.id, n])), families = [], outputs = [];
  const rate = main.propagate(-1);
  const add = spec => {const n = {axis: 'y', z: 0, depth: 0.038, phase: 0, lunar: true, ...spec}; nodes.push(n); byId.set(n.id, n); return n;};
  const edge = (a, b, type, carrier) => {
    edges.push({driver: a.id, driven: b.id, type, lunar: true, ...(carrier ? {carrier} : {})});
    if (type === 'mesh') {
      const beta = Math.atan2(-(b.z - a.z), b.x - a.x);
      b.phase = ((a.teeth + b.teeth) * beta + b.teeth * Math.PI + Math.PI - a.teeth * a.phase) / b.teeth;
    } else if (!carrier) b.phase = a.phase;
    return b;
  };
  const gear = (id, teeth, module, x, y, bore, parentId, z = 0) => add({id, kind: 'gear', teeth, module, pitchRadius: teeth * module / 2, x, y, z, bore, parentId});
  for (const parentId of new Set(MOONS.map(m => m.parentId))) {
    const index = main.outputs.findIndex(o => o.id === parentId), carrier = main.outputs[index], source = main.outputs[index - 1];
    const radius = MECHANICAL_RADII[parentId], distance = LUNAR_CENTERS[parentId], reach = radius + distance;
    const y = 0.015;
    let previous = add({id: `lunar-${parentId}-takeoff`, kind: 'coupling', x: 0, y, bore: source.outerRadius + 0.004, parentId});
    previous.phase = -carrier.mountingAngle;
    edge(byId.get(source.node), previous, 'relative', carrier.node);
    const start = previous.id;
    const transfer = edge(previous, add({id: `lunar-${parentId}-radial-shaft`, kind: 'shaft', axis: 'x', x: source.outerRadius + 0.085, endX: radius - 0.065, y, parentId}), 'right-angle');
    const pickup = edge(transfer, gear(`lunar-${parentId}-pickup`, 20, distance / 20, radius, 0.25, 0.061, parentId), 'right-angle');
    const feed = edge(pickup, gear(`lunar-${parentId}-feed`, 20, distance / 20, reach, 0.25, 0.025, parentId), 'mesh');
    families.push({parentId, source: source.node, carrier: carrier.node, input: start, transfer: transfer.id, pickup: pickup.id, feed: feed.id, reach, distance, armHeight: carrier.armHeight + MAIN_ARM_LIFT, mountingAngle: carrier.mountingAngle});
    const family = MOONS.filter(m => m.parentId === parentId);
    family.forEach((moon, i) => {
      const inner = 0.072 + i * 0.024, outer = inner + 0.017;
      const carrierRate = rate[carrier.node], relativeRate = rate[source.node] - carrierRate;
      const desired = ((moon.retrograde ? -1 : 1) * INPUT_DAYS_PER_TURN / moon.periodDays - carrierRate) / relativeRate;
      const pairs = chooseTeeth(Math.abs(desired), distance, inner);
      previous = feed;
      for (const [j, pair] of pairs.entries()) {
        const x = j % 2 ? radius : reach, otherX = j % 2 ? reach : radius;
        const plane = 0.39 + i * 0.80 + j * 0.075, m = 2 * distance / (pair.a + pair.b);
        const a = edge(previous, gear(`${moon.id}-lunar-driver-${j}`, pair.a, m, x, plane, j % 2 ? inner : j ? 0.042 : 0.025, parentId), 'rigid');
        const b = gear(`${moon.id}-lunar-driven-${j}`, pair.b, m, otherX, plane, j % 2 ? 0.042 : inner, parentId);
        if (moon.retrograde && j === 8) {
          // External reversing idler: circle-circle solution gives exact pitch
          // centers for all three gears, retaining the final central output.
          const teeth = 24, r = teeth * m / 2;
          const da = a.pitchRadius + r, db = b.pitchRadius + r;
          const along = (da * da - db * db + distance * distance) / (2 * distance);
          const z = Math.sqrt(Math.max(0, da * da - along * along));
          const middle = gear(`${moon.id}-reversing-idler`, teeth, m, x + Math.sign(otherX - x) * along, plane, 0.025, parentId, z);
          edge(a, middle, 'mesh'); edge(middle, b, 'mesh');
        } else edge(a, b, 'mesh');
        previous = b;
      }
      const sleeve = edge(previous, add({id: `${moon.id}-lunar-output`, kind: 'sleeve', x: radius, y: previous.y, innerRadius: inner, outerRadius: outer, parentId, moonId: moon.id}), 'rigid');
      outputs.push({id: moon.id, parentId, node: sleeve.id, finalGear: previous.id, innerRadius: inner, outerRadius: outer,
        mountingAngle: MOON_MODEL.initialPhaseDeg[moon.id] * Math.PI / 180 - carrier.mountingAngle,
        carrier: carrier.node, referencePeriodDays: moon.periodDays});
    });
  }
  function propagate(inputAngle) {
    if (!Number.isFinite(inputAngle)) throw new RangeError('Finite crank angle required');
    const angles = {[main.topology.root]: inputAngle};
    for (const e of edges) {
      const a = byId.get(e.driver), b = byId.get(e.driven);
      angles[b.id] = e.carrier ? angles[a.id] - angles[e.carrier] : e.type === 'mesh' ? -angles[a.id] * a.teeth / b.teeth : e.type === 'right-angle' ? -angles[a.id] : angles[a.id];
    }
    return angles;
  }
  const rates = propagate(-1);
  for (const output of outputs) {
    output.ratio = rates[output.node] + rates[output.carrier];
    output.periodDays = INPUT_DAYS_PER_TURN / Math.abs(output.ratio);
    output.periodErrorDays = output.periodDays - output.referencePeriodDays;
    output.driftDegreesPerCentury = 360 * 36525 * (1 / output.periodDays - 1 / output.referencePeriodDays);
  }
  function atDate(date) {
    const base = main.atDate(date), nodeAngles = propagate(-base.crankTurns * TAU);
    return {...base, nodeAngles, outputs: outputs.map(o => ({...o, angle: nodeAngles[o.node] + o.mountingAngle,
      worldAngle: nodeAngles[o.node] + nodeAngles[o.carrier] + MOON_MODEL.initialPhaseDeg[o.id] * Math.PI / 180}))};
  }
  return {topology: {root: main.topology.root, nodes, edges}, families, outputs, atDate, propagate};
}
