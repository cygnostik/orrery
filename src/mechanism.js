import * as THREE from 'three';
import {createDriveTrain, CRANK_LAYOUT, DRIVE_EPOCH, INPUT_DAYS_PER_TURN} from './drive-train.js';
import {createBlackDlcMaterial} from './exhibit-materials.js';
import {createPivotInlays} from './pivot-inlays.js';

const TAU = Math.PI * 2;
export function crankDeltaTurns(previousAngle, nextAngle) {
  if (!Number.isFinite(previousAngle) || !Number.isFinite(nextAngle)) return 0;
  const delta = Math.atan2(Math.sin(nextAngle - previousAngle), Math.cos(nextAngle - previousAngle));
  return THREE.MathUtils.clamp(-delta / TAU, -1 / 12, 1 / 12);
}

// Exhibition spur flank, not a manufacturing involute. Graph pitch circles,
// tooth counts and indexed phases constrain motion; mesh contact is not proven.
function wheelGeometry(teeth, module, boreRadius, depth = 0.11, spokes = 6) {
  const pitch = teeth * module / 2, root = pitch - module * 1.2, tip = pitch + module;
  const shape = new THREE.Shape();
  for (let i = 0; i < teeth; i++) for (const [fraction, radius] of [[-0.5, root], [-0.32, root], [-0.19, tip], [0.19, tip], [0.32, root], [0.5, root]]) {
    const a = (i + fraction) / teeth * TAU, x = Math.cos(a) * radius, y = Math.sin(a) * radius;
    if (!i && fraction === -0.5) shape.moveTo(x, y); else shape.lineTo(x, y);
  }
  shape.closePath();
  const inner = Math.max(boreRadius + 0.10, pitch * 0.3), outer = root - module * 1.6;
  for (let i = 0; i < spokes; i++) {
    const start = (i + 0.13) / spokes * TAU, end = (i + 0.87) / spokes * TAU;
    const hole = new THREE.Path();
    hole.moveTo(Math.cos(start) * inner, Math.sin(start) * inner);
    hole.absarc(0, 0, inner, start, end, false);
    hole.lineTo(Math.cos(end) * outer, Math.sin(end) * outer);
    hole.absarc(0, 0, outer, end, start, true); hole.closePath(); shape.holes.push(hole);
  }
  const bore = new THREE.Path(); bore.absarc(0, 0, boreRadius, 0, TAU, true); shape.holes.push(bore);
  const geometry = new THREE.ExtrudeGeometry(shape, {depth, bevelEnabled: true, bevelSegments: 1, steps: 1, bevelSize: 0.007, bevelThickness: 0.007, curveSegments: 8});
  geometry.translate(0, 0, -depth / 2); geometry.rotateX(-Math.PI / 2); return geometry;
}

// Straight miter exhibition approximation: annular toothed frustum, not a
// generated octoid/conjugate flank. Local +Y points away from the pitch apex.
function miterGeometry({teeth, module, pitchRadius, bore, depth}) {
  const outline = [];
  for (let i = 0; i < teeth; i++) for (const [fraction, radius] of [[-0.5, pitchRadius - 1.2 * module], [-0.30, pitchRadius - 1.2 * module], [-0.18, pitchRadius + module], [0.18, pitchRadius + module], [0.30, pitchRadius - 1.2 * module]]) {
    outline.push({angle: (i + fraction) / teeth * TAU, radius});
  }
  const positions = [], indices = [], count = outline.length;
  // Large end, small end, then the two constant-radius bore loops. Teeth
  // narrow with the 45-degree cone while the machined-style bore stays open.
  for (const [y, scale, inner] of [[0, 1, false], [-depth, 1 - depth / pitchRadius, false], [0, 1, true], [-depth, 1, true]]) {
    for (const {angle, radius} of outline) {
      const r = inner ? bore : radius * scale;
      positions.push(Math.cos(angle) * r, y, -Math.sin(angle) * r);
    }
  }
  const quad = (a, b, c, d) => indices.push(a, b, c, a, c, d);
  for (let i = 0; i < count; i++) {
    const j = (i + 1) % count;
    quad(i, i + count, j + count, j); // outer tapered flank
    quad(i, j, j + 2 * count, i + 2 * count); // large annular end
    quad(i + count, i + 3 * count, j + 3 * count, j + count); // small end
    quad(i + 2 * count, j + 2 * count, j + 3 * count, i + 3 * count); // bore
  }
  const indexed = new THREE.BufferGeometry();
  indexed.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3)); indexed.setIndex(indices);
  const geometry = indexed.toNonIndexed(); indexed.dispose(); geometry.computeVertexNormals();
  geometry.parameters = {gearForm: 'miter', teeth, module, pitchRadius, bore, depth};
  return geometry;
}

// Hollow, closed-ended tube: independent output sleeves never share solid volume.
function tubeGeometry(inner, outer, height) {
  const points = [[inner, -height / 2], [outer, -height / 2], [outer, height / 2], [inner, height / 2], [inner, -height / 2]].map(p => new THREE.Vector2(...p));
  return new THREE.LatheGeometry(points, 40);
}

export function createMechanism({stoneMaterial, bezelMaterial} = {}) {
  const drive = createDriveTrain(), {nodes, edges} = drive.topology;
  const group = new THREE.Group(); group.name = 'exhibition-clockwork';
  const platinum = new THREE.MeshStandardMaterial({name: 'polished-platinum', color: 0xc3ced7, metalness: 0.96, roughness: 0.23});
  const steel = new THREE.MeshStandardMaterial({name: 'satin-titanium', color: 0x647785, metalness: 0.94, roughness: 0.32});
  const dark = new THREE.MeshStandardMaterial({name: 'blued-steel', color: 0x15212c, metalness: 0.9, roughness: 0.24});
  const gripMaterial = new THREE.MeshPhysicalMaterial({name: 'obsidian-grip', color: 0x080c10, metalness: 0.25, roughness: 0.13, clearcoat: 1});
  const add = (geometry, material, parent = group, name = '') => {
    const mesh = new THREE.Mesh(geometry, material); mesh.name = name; mesh.castShadow = mesh.receiveShadow = true; parent.add(mesh); return mesh;
  };
  const cylinder = (radius, length, parent = group, material = platinum, name = '') => add(new THREE.CylinderGeometry(radius, radius, length, 20), material, parent, name);
  const hollow = (inner, outer, length, parent, material, name) => add(tubeGeometry(inner, outer, length), material, parent, name);
  const moving = new Map(), outputMounts = new Map(), highlights = new Map();
  nodes.forEach((node, i) => {
    const rotor = new THREE.Group(); rotor.name = node.kind === 'gear' ? `gear-${node.id}` : node.id;
    rotor.userData.driveNode = node.id;
    if (node.axis === 'radial') {
      // Static basis: +Y points outward along the horizontal shaft, +X is
      // tangent to the rim, +Z points down. Only the child's local Y spins.
      const frame = new THREE.Group(), axis = new THREE.Vector3(...node.axisVector);
      frame.name = node.kind === 'input' ? 'crank-mount' : `axis-${node.id}`;
      frame.position.set(node.x, node.y, node.z);
      frame.quaternion.setFromRotationMatrix(new THREE.Matrix4().makeBasis(
        new THREE.Vector3(axis.z, 0, -axis.x), axis, new THREE.Vector3(0, -1, 0)));
      group.add(frame); frame.add(rotor);
    } else {rotor.position.set(node.x, node.y, node.z); group.add(rotor);}
    moving.set(node.id, rotor);
    if (node.kind === 'gear') {
      // Two miters replaced four input discs; keep the existing central
      // platinum/titanium cadence instead of recoloring the remaining wheels.
      const finishIndex = node.gearForm === 'miter' ? i : i + 2;
      const material = node.y < 0 ? createBlackDlcMaterial() : (finishIndex % 3 ? platinum : steel).clone(); highlights.set(node.id, material);
      const isMiter = node.gearForm === 'miter';
      const wheel = add(isMiter ? miterGeometry(node) : wheelGeometry(node.teeth, node.module, node.bore, node.depth), material, rotor, `wheel-${node.id}`);
      wheel.rotation.y = node.phase; rotor.userData.teeth = node.teeth; rotor.userData.pitchRadius = node.pitchRadius;
      const hub = hollow(node.bore, node.bore + 0.07, isMiter ? 0.10 : 0.15, rotor, dark, `hub-${node.id}`);
      if (isMiter) hub.position.y = 0.05;
      hub.userData.bore = node.bore;
    } else if (node.kind === 'sleeve') {
      const tube = hollow(node.innerRadius, node.outerRadius, node.y - node.bottom, rotor, i % 2 ? steel : platinum, `tube-${node.bodyId}`);
      tube.position.y = (node.bottom - node.y) / 2;
      // Hollow keyed flange rotates with the sleeve. Arms mount on this rotor,
      // never on the fixed scene group or an independently computed ephemeris.
      hollow(node.innerRadius, node.outerRadius + 0.075, 0.09, rotor, platinum, `output-collar-${node.bodyId}`);
      const mark = add(new THREE.BoxGeometry(0.045, 0.012, 0.12), dark, rotor, `key-${node.bodyId}`); mark.position.set(node.outerRadius, 0.051, 0);
      outputMounts.set(node.bodyId, rotor);
    }
  });
  const sleeves = nodes.filter(n => n.kind === 'sleeve');
  sleeves.forEach((node, i) => {
    const support = i ? moving.get(sleeves[i - 1].id) : group;
    const inner = i ? sleeves[i - 1].outerRadius : 0.115;
    for (const [end, y] of [['top', node.y - 0.14], ['bottom', node.bottom + 0.14]]) {
      const journal = hollow(inner, node.innerRadius - 0.003, 0.06, support, dark, `sleeve-journal-${end}-${node.bodyId}`);
      journal.position.y = y - (i ? sleeves[i - 1].y : 0);
    }
  });
  // Every rigid connection is an actual coaxial length of steel. Central
  // connections use nested hollow shafts; peripheral compounds are solid.
  const shafts = [];
  for (const edge of edges.filter(e => e.type === 'rigid')) {
    const a = nodes.find(n => n.id === edge.driver), b = nodes.find(n => n.id === edge.driven);
    if (b.kind === 'sleeve' || a.kind === 'sleeve') continue; // the continuous sleeve already spans these endpoints
    const inner = a.axis === 'y' && a.x === 0 && a.z === 0 ? 0.13 : 0;
    const outer = inner ? 0.145 : CRANK_LAYOUT.shaftRadius;
    const delta = new THREE.Vector3(b.x - a.x, b.y - a.y, b.z - a.z);
    const signedLength = delta.dot(new THREE.Vector3(...a.axisVector));
    const length = Math.abs(signedLength), rotor = moving.get(a.id);
    const shaft = inner ? hollow(inner, outer, length, rotor, platinum, `shaft-${a.id}-${b.id}`) : cylinder(outer, length, rotor, platinum, `shaft-${a.id}-${b.id}`);
    shaft.position.y = signedLength / 2;
    shafts.push({driver: a.id, driven: b.id, innerRadius: inner, outerRadius: outer, length, axis: a.axisVector, mesh: shaft.name});
  }
  // The instrument's existing fixed solar axle is radius 0.115. These two
  // annular journals support the input tube from inside, not a new gear tower.
  const centralMiter = nodes.find(n => n.id === 'central-miter');
  const firstDriver = nodes.find(n => n.id === 'mercury-driver');
  for (const [end, y] of [['lower', centralMiter.y + 0.035], ['upper', firstDriver.y - 0.035]]) {
    const journal = hollow(0.115, 0.127, 0.04, group, dark, `central-input-journal-${end}`);
    journal.position.y = y;
  }
  // A short compound shaft floats in two FIXED journals, carried by a radial
  // bridge at its own level and an outboard post clear of all rotating teeth.
  for (const node of nodes.filter(n => n.id.endsWith('-wheel'))) {
    const radial = new THREE.Vector3(node.x, 0, node.z).normalize();
    for (const y of [node.y - 0.115, node.y + 0.315]) {
      const bearing = hollow(0.102, 0.22, 0.07, group, dark, `bearing-${node.id}-${y}`); bearing.position.set(node.x, y, node.z);
      const beam = add(new THREE.BoxGeometry(2.8, 0.045, 0.16), steel, group, `bridge-${node.id}-${y}`);
      beam.position.copy(radial).multiplyScalar(4.95); beam.position.y = y; beam.rotation.y = Math.atan2(-radial.z, radial.x);
    }
    const post = cylinder(0.065, node.y + 0.315 + 1.85, group, platinum, `support-${node.id}`);
    post.position.copy(radial).multiplyScalar(6.35); post.position.y = (node.y + 0.315 - 1.85) / 2;
    const shaft = cylinder(0.095, 0.43, moving.get(node.id), platinum, `journal-${node.id}`); shaft.position.y = 0.10;
  }
  const input = nodes[0], crank = moving.get(input.id), inputMount = crank.parent;
  const crankCenter = new THREE.Object3D(); crankCenter.name = 'crank-axis-reference'; crankCenter.position.y = 0.42; inputMount.add(crankCenter);
  // Two low fixed journal blocks support the single line shaft. +Z in this
  // frame points down: each foot lands on the existing deck at world Y=-1.92.
  for (const [radius, bearingName, footName] of [[14.9, 'crank-bearing', 'crank-rim-foot'], [0.70, 'input-journal-inboard', 'input-inboard-foot']]) {
    const along = radius - CRANK_LAYOUT.radius;
    const bearing = hollow(0.105, 0.21, 0.25, inputMount, dark, bearingName); bearing.position.y = along;
    const foot = add(new THREE.BoxGeometry(0.62, 0.50, 0.07), steel, inputMount, footName);
    foot.position.set(0, along, 0.315);
    const web = add(new THREE.BoxGeometry(0.12, 0.18, 0.145), steel, inputMount, `${footName}-web`);
    web.position.set(0, along, 0.23);
    for (const x of [-0.23, 0.23]) {
      const bolt = cylinder(0.035, 0.025, inputMount, platinum, `${footName}-bolt-${x}`);
      bolt.rotation.x = Math.PI / 2; bolt.position.set(x, along, 0.2725);
    }
  }
  crank.name = 'hand-crank';
  for (const [end, offset] of [['inboard', -0.16], ['outboard', 0.16]]) {
    const collar = cylinder(0.14, 0.05, crank, platinum, `crank-thrust-${end}`);
    collar.position.y = 14.9 - CRANK_LAYOUT.radius + offset;
  }
  cylinder(0.23, 0.18, crank);
  const bar = add(new THREE.BoxGeometry(1.24, 0.14, 0.19), platinum, crank, 'crank-arm'); bar.position.x = 0.52;
  const counterweight = cylinder(0.22, 0.16, crank, steel); counterweight.position.x = -0.28;
  const handle = add(new THREE.CapsuleGeometry(0.18, 0.52, 6, 16), gripMaterial, crank, 'crank-handle');
  handle.position.set(1.12, 0.42, 0); handle.userData.control = 'crank';
  const handlePin = cylinder(0.075, 0.72, crank); handlePin.position.set(1.12, 0.34, 0);
  for (const y of [0.15, 0.73]) {const collar = cylinder(0.2, 0.055, crank); collar.position.set(1.12, y, 0);}
  const switchMount = new THREE.Group(); switchMount.position.set(7.6, -1.58, 10.6); switchMount.name = 'automatic-switch'; group.add(switchMount);
  const switchBase = add(new THREE.BoxGeometry(1.15, 0.24, 1.42), steel, switchMount, 'switch-plate'); switchBase.userData.control = 'auto';
  const boot = cylinder(0.3, 0.27, switchMount, dark); boot.position.y = 0.2;
  const lever = new THREE.Group(); lever.name = 'auto-lever'; lever.position.y = 0.27; switchMount.add(lever);
  const stem = cylinder(0.075, 0.9, lever); stem.position.y = 0.42; stem.userData.control = 'auto';
  const tip = add(new THREE.CapsuleGeometry(0.19, 0.24, 4, 12), gripMaterial, lever, 'auto-lever-grip'); tip.position.y = 0.94; tip.userData.control = 'auto';
  const switchHit = add(new THREE.BoxGeometry(1.25, 1.6, 1.5), new THREE.MeshBasicMaterial({visible: false}), switchMount, 'switch-hit-volume'); switchHit.position.y = 0.55; switchHit.userData.control = 'auto';
  // Bare mechanisms need no decorative resources; the full instrument shares
  // its existing pillar finishes. Geometry and motion remain unchanged.
  const inlays = stoneMaterial && bezelMaterial ? createPivotInlays({
    parent: group, pivots: nodes.filter(node => node.id.endsWith('-wheel')),
    crank, stoneMaterial, bezelMaterial,
  }) : null;
  let state, playing = false;
  function update(date, isPlaying = false) {
    state = drive.atDate(date); playing = Boolean(isPlaying);
    for (const [id, rotor] of moving) rotor.rotation.y = state.nodeAngles[id];
    lever.rotation.x = playing ? -0.48 : 0.48;
    inlays?.update();
    return state.outputs;
  }
  function select(id, color, lightsOut = false) {
    const selected = drive.outputs.find(o => o.id === id), path = new Set(selected?.path || []);
    for (const [node, material] of highlights) {
      material.emissive.set(color || 0); material.emissiveIntensity = !lightsOut && path.has(node) ? (material.name.includes('dlc') ? 0.006 : 0.025) : 0;
    }
  }
  function diagnostics() {
    return {...state, playing, inputDaysPerTurn: INPUT_DAYS_PER_TURN, topology: drive.topology, shafts,
      pairs: edges.filter(e => e.type === 'mesh'), rightAnglePairs: edges.filter(e => e.type === 'right-angle'),
      gears: nodes.filter(n => n.kind === 'gear').map(n => ({...n, angle: moving.get(n.id).rotation.y + n.phase})),
      model: 'Edge crank, 1:1 miter input and connected compound spur reductions: rational mean motion, not an ephemeris; keyed J2000 alignment only. Exhibition tooth flanks, not manufacturing-validated contact'};
  }
  update(new Date(DRIVE_EPOCH));
  return {group, update, diagnostics, outputMounts, select, crank, crankFrame: inputMount, crankHandle: handle, crankCenter, lever, switchTip: tip, hitTargets: [handle, switchHit, stem, tip, switchBase]};
}
