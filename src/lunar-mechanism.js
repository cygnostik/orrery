import * as THREE from 'three';
import {mergeGeometries} from 'three/addons/utils/BufferGeometryUtils.js';
import {MOONS} from './moons.js';
import {createBlackPvdMaterial} from './exhibit-materials.js';
import {createLunarDrive} from './lunar-drive.js';
import {lunarClearanceCertificate} from './lunar-layout.js';

export function lunarTubeGeometry(inner, outer, height) {
  return new THREE.LatheGeometry([[inner, 0], [outer, 0], [outer, height], [inner, height], [inner, 0]].map(p => new THREE.Vector2(...p)), 24);
}
/** Every geometry belongs to the host scene traversal; no global GPU caches. */
export function createLunarMechanism({instrument, display, bodyHeight}) {
  const drive = createLunarDrive(), byId = new Map(drive.topology.nodes.map(n => [n.id, n]));
  const outputMounts = new Map(), rotors = new Map(), families = new Map(), moving = new Map(), shafts = [], supportEnvelopes = [];
  const pvd = createBlackPvdMaterial();

  const mesh = (geometry, parent, name, material = pvd) => {
    const object = new THREE.Mesh(geometry, material); object.name = name;
    object.castShadow = object.receiveShadow = true; parent.add(object); return object;
  };
  const tube = (inner, outer, bottom, top, parent, name) => {
    const object = mesh(lunarTubeGeometry(inner, outer, top - bottom), parent, name); object.position.y = bottom;
    object.userData = {innerRadius: inner, outerRadius: outer, bottom, top}; return object;
  };
  for (const family of drive.families) {
    const group = new THREE.Group(); group.name = `lunar-family-${family.parentId}`;
    instrument.arms.get(family.parentId).add(group); families.set(family.parentId, group);
  }
  // Retain the crank-derived ratios, not the rejected external gear towers.
  // The enclosed lunar reduction is schematic: topology gear coordinates are
  // a ratio-study layout, not physical internals fitted inside these sleeves.
  for (const family of drive.families) {
    const group = families.get(family.parentId), radius = instrument.arms.get(family.parentId).userData.orbitRadius;
    const moons = MOONS.filter(m => m.parentId === family.parentId);
    for (const [index, moon] of moons.entries()) {
      const output = drive.outputs.find(o => o.id === moon.id);
      const top = bodyHeight - 1.2 - index * 0.22, bottom = family.armHeight + 0.11;
      const rotor = new THREE.Group(); rotor.name = `lunar-sleeve-${moon.id}`;
      rotor.position.set(radius, top - family.armHeight, 0); group.add(rotor); rotors.set(moon.id, rotor);
      const inner = output.innerRadius, outer = output.outerRadius;
      tube(inner, outer, bottom - top, 0.023, rotor, `lunar-tube-${moon.id}`);
      const start = outer, orbit = display[moon.id].orbit;
      const bar = mesh(new THREE.BoxGeometry(orbit - start, 0.045, 0.045), rotor, `lunar-arm-${moon.id}`);
      bar.position.x = (orbit + start) / 2;
      const pinHeight = bodyHeight - top;
      const pin = mesh(new THREE.CylinderGeometry(0.022, 0.027, pinHeight, 12), rotor, `lunar-pin-${moon.id}`);
      pin.position.set(orbit, pinHeight / 2, 0);
      const mount = new THREE.Object3D(); mount.name = `moon-mount-${moon.id}`;
      mount.position.set(orbit, pinHeight, 0); rotor.add(mount); outputMounts.set(moon.id, mount);
      shafts.push({driver: output.finalGear, driven: [output.node], mesh: `lunar-tube-${moon.id}`, innerRadius: inner, outerRadius: outer, bottom, top, enclosedReduction: 'Crank-derived ratio constraint; internal gearing not modeled'});
      // Load transfers inward across annular journals, never through solid
      // overlapping independently rotating tubes.
      for (const y of [bottom + 0.03, top - 0.035]) {
        const journal = tube(index ? inner - 0.007 : 0.043, inner - 0.001, y - family.armHeight - 0.012, y - family.armHeight + 0.012, group, `lunar-journal-${moon.id}-${y}`);
        journal.position.x = radius;
      }
    }
    // The support is the uninterrupted pair of rigid PVD rails. A separate
    // slender shaft runs between them, not a row of gears pretending to be an
    // arm. End housings represent enclosed 1:1 right-angle transfers; their
    // internal tooth geometry is deliberately not claimed as validated CAD.
    const transfer = byId.get(family.transfer), takeoff = byId.get(family.input);
    const shaftRotor = new THREE.Group(); shaftRotor.name = `lunar-transfer-rotor-${family.parentId}`;
    shaftRotor.userData = {driveNode: transfer.id, axis: 'x'};
    shaftRotor.position.set(transfer.x, transfer.y, 0); group.add(shaftRotor); moving.set(transfer.id, shaftRotor);
    const length = transfer.endX - transfer.x;
    const shaftGeometry = new THREE.CylinderGeometry(0.012, 0.012, length, 12);
    shaftGeometry.rotateZ(-Math.PI / 2); shaftGeometry.translate(length / 2, 0, 0);
    mesh(shaftGeometry, shaftRotor, `lunar-transfer-shaft-${family.parentId}`);
    tube(takeoff.bore, transfer.x + 0.014, -0.01, 0.105, group, `lunar-transfer-input-housing-${family.parentId}`);
    const outputHousing = tube(0.061, 0.092, -0.025, 0.075, group, `lunar-transfer-output-housing-${family.parentId}`); outputHousing.position.x = radius;
    const collarRadius = Math.max(...drive.outputs.filter(o => o.parentId === family.parentId).map(o => o.outerRadius)) + 0.014;
    const collar = tube(0.061, collarRadius, 0.075, 0.105, group, `lunar-hub-${family.parentId}`); collar.position.x = radius;
    for (const x of [transfer.x + 0.01, transfer.endX - 0.01]) {
      const saddle = mesh(new THREE.BoxGeometry(0.065, 0.018, 0.235), group, `lunar-transfer-saddle-${family.parentId}-${x}`); saddle.position.set(x, -0.035, 0);
      const seat = mesh(new THREE.BoxGeometry(0.038, 0.025, 0.034), group, `lunar-transfer-seat-${family.parentId}-${x}`); seat.position.set(x, -0.02, 0);
      const bearing = mesh(lunarTubeGeometry(0.013, 0.026, 0.038), group, `lunar-transfer-bearing-${family.parentId}-${x}`);
      bearing.rotation.z = -Math.PI / 2; bearing.position.set(x - 0.019, transfer.y, 0);
    }
    shafts.push({driver: family.input, driven: [transfer.id, family.pickup], mesh: `lunar-transfer-shaft-${family.parentId}`, innerRadius: 0, outerRadius: 0.012, axis: 'x', enclosedTransfer: 'Ideal 1:1 right-angle pairs; internal teeth not rendered'});
  }
  // Consolidate only fixed journals and fittings; moving output ownership survives.
  for (const [parentId, group] of families) {
    group.updateMatrix();
    const parts = group.children.filter(o => o.isMesh), geometries = parts.map(o => {o.updateMatrix(); return o.geometry.clone().applyMatrix4(o.matrix);});
    parts.forEach((object, i) => {geometries[i].computeBoundingBox(); const box = geometries[i].boundingBox;
      supportEnvelopes.push({parentId, name: object.name, min: box.min.toArray(), max: box.max.toArray()});});
    if (geometries.length) mesh(mergeGeometries(geometries), group, `fixed-${group.name}`);
    for (const g of geometries) g.dispose();
    for (const p of parts) {p.geometry.dispose(); group.remove(p);}
  }
  const actualFamilies = drive.families.map(family => {
    const radius = instrument.arms.get(family.parentId).userData.orbitRadius, components = [];
    const measureRotorMesh = (object, axisDistance, axisY) => {
      object.updateMatrix(); const vertices = object.geometry.attributes.position, point = new THREE.Vector3();
      let extent = 0, min = Infinity, max = -Infinity;
      for (let i = 0; i < vertices.count; i++) {
        point.fromBufferAttribute(vertices, i).applyMatrix4(object.matrix);
        extent = Math.max(extent, Math.hypot(point.x, point.z)); min = Math.min(min, point.y); max = Math.max(max, point.y);
      }
      components.push({name: object.name, radius: axisDistance + extent, minY: axisY + min, maxY: axisY + max});
    };

    for (const moon of MOONS.filter(m => m.parentId === family.parentId)) {
      const rotor = rotors.get(moon.id);
      for (const object of rotor.children.filter(o => o.isMesh)) measureRotorMesh(object, 0, family.armHeight + rotor.position.y);
      components.push({name: `satellite-${moon.id}`, radius: display[moon.id].orbit + display[moon.id].radius, minY: bodyHeight - display[moon.id].radius, maxY: bodyHeight + display[moon.id].radius});
    }
    for (const support of supportEnvelopes.filter(s => s.parentId === family.parentId && !s.name.startsWith('lunar-transfer-'))) {
      let extent = 0;
      for (const x of [support.min[0], support.max[0]]) for (const z of [support.min[2], support.max[2]]) extent = Math.max(extent, Math.hypot(x - radius, z));
      components.push({name: support.name, radius: extent, minY: family.armHeight + support.min[1], maxY: family.armHeight + support.max[1]});
    }
    return {id: family.parentId, radius: Math.max(...components.map(c => c.radius)), minY: Math.min(...components.map(c => c.minY)), maxY: Math.max(...components.map(c => c.maxY)), components};
  });
  const clearance = lunarClearanceCertificate(actualFamilies);
  let nodeAngles;
  function update() {
    const main = instrument.mechanism.diagnostics();
    nodeAngles = drive.propagate(main.nodeAngles[drive.topology.root]);
    for (const [id, rotor] of moving) rotor.rotation[byId.get(id).axis] = nodeAngles[id];
    for (const output of drive.outputs) rotors.get(output.id).rotation.y = nodeAngles[output.node] + output.mountingAngle;
  }
  function diagnostics() {
    return {model: 'Rigid PVD arms and slender nested moon-support sleeves. Separate shafts and enclosed reductions follow the shared crank ratios. Internal lunar gearing is schematic, not rendered or engineering-validated; topology gear coordinates are a ratio-study layout, not fitted hardware.', outputCount: outputMounts.size,
      topology: drive.topology, families: drive.families, outputs: drive.outputs, nodeAngles: {...nodeAngles}, shafts, supportEnvelopes,
      drawnGears: [], clearance};
  }
  update();
  return {outputMounts, rotors, families, update, diagnostics};
}
