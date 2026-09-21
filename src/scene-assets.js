import * as THREE from 'three';
import {mergeGeometries} from 'three/addons/utils/BufferGeometryUtils.js';
import {createMechanism} from './mechanism.js';
import {Reflector} from 'three/addons/objects/Reflector.js';
import {createBlackPvdMaterial, createOpalInlays} from './exhibit-materials.js';
import {createSaturnRingTexture, SATURN_RING_EXTENT} from './saturn-rings.js';
import {createSunSurfaceData} from './sun-surface.js';

// Exhibition dimensions, never astronomical measurements. AU geometry is
// transformed as a whole in observatory mode, not normalized point-by-point.
import {MECHANICAL_RADII, MECHANICAL_HEIGHT, MAIN_ARM_LIFT} from './lunar-layout.js';
export const DISPLAY_RADII = Object.freeze({mercury: 2.2, venus: 3.25, earth: 4.4, mars: 5.55, jupiter: 7.35, saturn: 9.35, uranus: 11.1, neptune: 12.6, pluto: 14.05});
export const DISTANCE_FACTOR = 0.34;
export const BODY_HEIGHT = MECHANICAL_HEIGHT;
export const BODY_RADII = Object.freeze({sun: 0.88, mercury: 0.17, venus: 0.29, earth: 0.32, mars: 0.235, jupiter: 0.77, saturn: 0.64, uranus: 0.44, neptune: 0.425, pluto: 0.14});

// Albedos describe physical specimen materials, never additional UI roles.
export function createInstrument() {
  const group = new THREE.Group(); group.name = 'mechanical-instrument';
  const platinum = new THREE.MeshStandardMaterial({name: 'platinum-trim', color: 0xbac9d5, metalness: 0.97, roughness: 0.22});
  const titanium = new THREE.MeshStandardMaterial({name: 'brushed-titanium', color: 0x526575, metalness: 0.93, roughness: 0.32});
  const dark = new THREE.MeshStandardMaterial({name: 'blackened-steel', color: 0x111c25, metalness: 0.92, roughness: 0.26});
  const pvd = createBlackPvdMaterial();
  const machining = new Uint8Array(256 * 256 * 4);
  for (let y = 0; y < 256; y++) for (let x = 0; x < 256; x++) {
    const r = Math.hypot(x - 128, y - 128), value = 218 + Math.sin(r * 3.2) * 7;
    const i = (y * 256 + x) * 4;
    machining[i] = machining[i + 1] = machining[i + 2] = value; machining[i + 3] = 255;
  }
  const roughnessMap = new THREE.DataTexture(machining, 256, 256, THREE.RGBAFormat);
  roughnessMap.generateMipmaps = true; roughnessMap.minFilter = THREE.LinearMipmapLinearFilter;
  roughnessMap.magFilter = THREE.LinearFilter; roughnessMap.needsUpdate = true;
  const enamel = new THREE.MeshPhysicalMaterial({name: 'black-gloss-glass', color: 0x090e14, metalness: 0.28, roughness: 0.13, roughnessMap, clearcoat: 1, clearcoatRoughness: 0.09});
  const glass = new THREE.MeshPhysicalMaterial({name: 'smoked-glass-edge', color: 0x466e87, metalness: 0.22, roughness: 0.1, clearcoat: 1, transparent: true, opacity: 0.4, depthWrite: false});
  const mesh = (geometry, material, parent = group, name = '') => {
    const object = new THREE.Mesh(geometry, material); object.name = name;
    object.castShadow = object.receiveShadow = true; parent.add(object); return object;
  };
  const disk = (r, h, y, material, name = '', parent = group) => {
    const object = mesh(new THREE.CylinderGeometry(r, r, h, 128), material, parent, name); object.position.y = y; return object;
  };
  const torus = (r, tube, y, material, parent = group, name = '') => {
    const object = mesh(new THREE.TorusGeometry(r, tube, 6, 144), material, parent, name);
    object.rotation.x = Math.PI / 2; object.position.y = y; return object;
  };
  const profile = [[0, -3.48], [14.4, -3.48], [14.85, -3.32], [15.12, -3.05], [15.12, -2.25], [14.98, -1.99], [0, -1.99]].map(([x, y]) => new THREE.Vector2(x, y));
  mesh(new THREE.LatheGeometry(profile, 192), dark, group, 'plinth');
  disk(14.98, 0.075, -1.9675, enamel, 'dial-face');
  const reflectionShader = {...Reflector.ReflectorShader, fragmentShader: Reflector.ReflectorShader.fragmentShader.replace('vec4( blendOverlay( base.rgb, color ), 1.0 )', 'vec4( base.rgb * 0.72, base.a * 0.38 )')};
  const reflection = new Reflector(new THREE.CircleGeometry(14.96, 128), {textureWidth: 1024, textureHeight: 1024, multisample: 0, clipBias: 0.003, shader: reflectionShader});
  reflection.name = 'glass-reflection'; reflection.rotation.x = -Math.PI / 2; reflection.position.y = -1.923;
  reflection.material.transparent = true; reflection.material.depthWrite = false; group.add(reflection);
  disk(14.75, 0.11, -3.43, platinum, 'lower-bezel');
  disk(15.14, 0.5, -2.63, glass, 'glass-edge');
  torus(15.03, 0.07, -1.96, platinum, group, 'index-rail');
  torus(14.35, 0.018, -1.918, titanium);
  for (const y of [-2.18, -2.98, -3.2]) torus(15.11, 0.038, y, platinum);

  const dummy = new THREE.Object3D();
  const ticks = new THREE.InstancedMesh(new THREE.BoxGeometry(1, 1, 1), platinum, 360);
  for (let i = 0; i < 360; i++) {
    const a = i * Math.PI / 180, length = i % 30 === 0 ? 0.42 : i % 5 === 0 ? 0.24 : 0.1;
    dummy.position.set(Math.cos(a) * (14.84 - length / 2), -1.916, Math.sin(a) * (14.84 - length / 2));
    dummy.rotation.set(0, -a, 0); dummy.scale.set(length, 0.008, i % 30 === 0 ? 0.018 : 0.011);
    dummy.updateMatrix(); ticks.setMatrixAt(i, dummy.matrix);
  }
  ticks.name = 'engraved-degree-index'; group.add(ticks);

  // Raised annular bridges: open windows reveal the trains beneath, rather
  // than concealing them under solid plates or towers of ornamental rings.
  function annulus(radius, width, y, name, material) {
    const shape = new THREE.Shape(); shape.absarc(0, 0, radius, 0, Math.PI * 2, false);
    const hole = new THREE.Path(); hole.absarc(0, 0, radius - width, 0, Math.PI * 2, true); shape.holes.push(hole);
    const geometry = new THREE.ExtrudeGeometry(shape, {depth: 0.16, bevelEnabled: true, bevelSize: 0.035, bevelThickness: 0.025, bevelSegments: 1, steps: 1, curveSegments: 96});
    geometry.rotateX(-Math.PI / 2);
    const ring = mesh(geometry, material, group, name); ring.position.y = y; return ring;
  }
  annulus(11.9, 0.3, 0.65, 'skeleton-lower', titanium);
  annulus(8.6, 0.28, 1.4, 'skeleton-middle', platinum);
  annulus(6.5, 0.27, 2.4, 'skeleton-upper', titanium);
  const ornament = new THREE.Group(); group.add(ornament);
  // Turned columns with polished black-opal crowns; base fasteners stay functional.
  const boltPositions = [], opalPositions = [];
  for (const [radius, top, count] of [[11.75, 0.72, 8], [8.46, 1.5, 6], [6.35, 2.5, 6]]) {
    for (let i = 0; i < count; i++) {
      const a = (i + 0.5) / count * Math.PI * 2 + Math.PI / 9, x = Math.cos(a) * radius, z = Math.sin(a) * radius;
      const length = top + 1.9;
      const points = [[0.23, -length / 2], [0.23, -length / 2 + 0.16], [0.13, -length / 2 + 0.25], [0.09, -0.25], [0.09, 0.25], [0.13, length / 2 - 0.16], [0.23, length / 2 - 0.16], [0.23, length / 2]].map(([r, y]) => new THREE.Vector2(r, y));
      const post = mesh(new THREE.LatheGeometry(points, 16), platinum, ornament); post.position.set(x, (top - 1.9) / 2, z);
      for (const y of [-1.85, top - 0.17, top + 0.14]) {
        const collar = disk(0.28, 0.1, y, dark, '', ornament); collar.position.x = x; collar.position.z = z;
      }
      opalPositions.push([x, top + 0.24, z]);
    }
  }
  for (let i = 0; i < 48; i++) {
    const a = i / 48 * Math.PI * 2;
    boltPositions.push([14.08 * Math.cos(a), -1.91, 14.08 * Math.sin(a)]);
  }
  const screws = new THREE.InstancedMesh(new THREE.CylinderGeometry(0.075, 0.085, 0.047, 6), platinum, boltPositions.length);
  const slots = new THREE.InstancedMesh(new THREE.BoxGeometry(0.1, 0.009, 0.022), dark, boltPositions.length);
  for (let i = 0; i < boltPositions.length; i++) {
    dummy.position.set(...boltPositions[i]); dummy.rotation.set(0, i * 0.9, 0); dummy.scale.set(1, 1, 1); dummy.updateMatrix(); screws.setMatrixAt(i, dummy.matrix);
    dummy.position.y += 0.025; dummy.updateMatrix(); slots.setMatrixAt(i, dummy.matrix);
  }
  const pillarInlays = createOpalInlays(opalPositions);
  screws.name = 'inlaid-fasteners'; group.add(screws, slots, pillarInlays);
  // Graduated radial piercing on the outer structural bridge, batched in one draw.
  const fret = new THREE.InstancedMesh(new THREE.BoxGeometry(0.11, 0.012, 0.025), platinum, 120);
  for (let i = 0; i < 120; i++) {
    const a = i / 120 * Math.PI * 2;
    dummy.position.set(11.74 * Math.cos(a), 0.845, 11.74 * Math.sin(a)); dummy.rotation.set(0, -a, 0); dummy.updateMatrix(); fret.setMatrixAt(i, dummy.matrix);
  }
  fret.name = 'bridge-graduations'; group.add(fret);
  // Merge only immobile ornament, retaining named semantic meshes and motion groups.
  ornament.updateMatrixWorld(true);
  for (const material of [platinum, dark]) {
    const parts = ornament.children.filter(o => o.material === material), geometries = parts.map(o => o.geometry.clone().applyMatrix4(o.matrix));
    if (geometries.length) mesh(mergeGeometries(geometries), material, group, `batched-${material.name}-columns`);
    geometries.forEach(g => g.dispose());
    parts.forEach(o => {o.geometry.dispose(); ornament.remove(o);});
  }
  group.remove(ornament);

  const mechanism = createMechanism({
    stoneMaterial: pillarInlays.getObjectByName('black-opal-cabochons').material,
    bezelMaterial: pillarInlays.getObjectByName('black-opal-bezels').material,
  }); group.add(mechanism.group);
  const solarSeat = BODY_HEIGHT - BODY_RADII.sun * 0.65;
  disk(0.115, solarSeat + 1.95, (solarSeat - 1.95) / 2, platinum, 'solar-axle');
  const arms = new Map();
  Object.entries(MECHANICAL_RADII).forEach(([id, radius], i) => {
    const arm = new THREE.Group(); arm.name = `arm-${id}`; arm.userData.orbitRadius = radius;
    arm.position.y = MAIN_ARM_LIFT;
    const output = mechanism.diagnostics().outputs.find(o => o.id === id);
    const y = 0, start = output.outerRadius + 0.04;
    arm.rotation.y = output.mountingAngle;
    for (const z of [-0.09, 0.09]) {
      const bar = mesh(new THREE.BoxGeometry(radius - start, 0.095, 0.055), pvd, arm);
      bar.position.set((radius + start) / 2, y, z);
    }
    const end = disk(0.19, 0.10, y, titanium, `bearing-${id}`, arm); end.position.x = radius;
    const cap = disk(0.075, 0.025, y + 0.045, platinum, `cap-${id}`, arm); cap.position.x = radius;
    const top = BODY_HEIGHT - output.armHeight - MAIN_ARM_LIFT - BODY_RADII[id] * 0.65;
    const post = mesh(new THREE.CylinderGeometry(0.042, 0.06, top - y, 12), pvd, arm); post.position.set(radius, (top + y) / 2, 0);
    const joint = mesh(new THREE.SphereGeometry(0.08, 12, 8), dark, arm); joint.position.set(radius, top, 0);
    const mount = new THREE.Object3D(); mount.name = `planet-mount-${id}`;
    mount.position.set(radius, BODY_HEIGHT - output.armHeight - MAIN_ARM_LIFT, 0); arm.add(mount);
    mechanism.outputMounts.get(id).add(arm); arms.set(id, arm);
    const track = torus(radius, 0.009, -1.91, titanium, group, `track-${id}`);
    track.userData.withinDial = radius < 14.9;
    track.visible = track.userData.withinDial;
  });
  const finishes = new Map();
  for (const style of ['nebula', 'obsidian']) {
    const size = 512, data = new Uint8Array(size * size * 4);
    for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) {
      const u = x / size * 2 - 1, v = y / size * 2 - 1;
      const wisps = Math.sin(u * 17 + Math.sin(v * 19)) * 0.022 + Math.sin(u * 47 - v * 31) * 0.009;
      const axis = v - u * 0.43 - Math.sin(u * 4.3) * 0.19;
      const ribbon = style === 'nebula' ? Math.exp(-(((axis + wisps) / 0.115) ** 2)) * (0.35 + 0.65 * Math.sin(u * 11 + v * 5) ** 2) : 0;
      const at = (y * size + x) * 4;
      data[at] = 7 + ribbon * 18; data[at + 1] = 11 + ribbon * 55; data[at + 2] = 17 + ribbon * 78; data[at + 3] = 255;
    }
    const texture = new THREE.DataTexture(data, size, size, THREE.RGBAFormat);
    texture.colorSpace = THREE.SRGBColorSpace; texture.generateMipmaps = true;
    texture.minFilter = THREE.LinearMipmapLinearFilter; texture.magFilter = THREE.LinearFilter; texture.needsUpdate = true;
    finishes.set(style, texture);
  }
  enamel.color.set(0xffffff);
  function setBaseStyle(style = 'nebula') {
    if (!finishes.has(style)) throw new RangeError(`Unknown base finish: ${style}`);
    enamel.map = finishes.get(style);
  }
  function disposeFinishes() { enamel.map = null; for (const texture of finishes.values()) texture.dispose(); finishes.clear(); }
  setBaseStyle('nebula');
  return {group, arms, mechanism, setBaseStyle, disposeFinishes};
}

export function createSurfaceData(id, width = 512, height = 256) {
  if (id === 'sun') return createSunSurfaceData(width, height);
  const data = new Uint8Array(width * height * 4);
  const palettes = {
    mercury: [[71, 68, 64], [156, 148, 135]], venus: [[148, 127, 87], [228, 213, 173]],
    earth: [[15, 40, 62], [45, 87, 113]], mars: [[90, 51, 35], [185, 124, 86]],
    jupiter: [[116, 89, 71], [218, 205, 176]], saturn: [[150, 136, 108], [223, 213, 184]],
    uranus: [[99, 150, 155], [174, 205, 204]], neptune: [[36, 64, 111], [82, 121, 167]],
    pluto: [[94, 82, 70], [190, 178, 153]],
  };
  const palette = palettes[id];
  if (!palette) throw new RangeError(`Unknown surface: ${id}`);
  const noise = (x, y, z) => (
    Math.sin(x * 3.1 + Math.sin(z * 4.3) + y * 2.7) * 0.24 +
    Math.sin(y * 6.7 + Math.sin(x * 3.6) + z * 4.1) * 0.15 +
    Math.sin(z * 15.1 + Math.sin(y * 11.4) + x * 7.6) * 0.07 +
    Math.sin(x * 39.2 + y * 19.3 + z * 23.7) * 0.035
  );
  const gas = ['venus', 'jupiter', 'saturn', 'uranus', 'neptune'].includes(id);
  const mix = (a, b, t) => a.map((v, k) => v + (b[k] - v) * t);
  for (let y = 0; y < height; y++) {
    const latitude = (y / (height - 1) - 0.5) * Math.PI;
    const sy = Math.sin(latitude), c = Math.cos(latitude);
    for (let x = 0; x < width; x++) {
      const longitude = x / (width - 1) * Math.PI * 2;
      const sx = Math.cos(longitude) * c, sz = Math.sin(longitude) * c;
      const n = noise(sx * 2.3, sy * 2.3, sz * 2.3);
      const grain = noise(sx * 33, sy * 33, sz * 33);
      let amount = 0.5 + n * 0.7 + grain * 0.2;
      if (gas) {
        const latitudeWarp = latitude + n * (id === 'jupiter' ? 0.055 : 0.035);
        amount = 0.53 + 0.22 * Math.sin(latitudeWarp * 45) + 0.1 * Math.sin(latitudeWarp * 89) + n * 0.32;
        if (id === 'uranus') amount = 0.62 + 0.1 * Math.sin(latitudeWarp * 23) + n * 0.2;
      }
      let color = mix(palette[0], palette[1], THREE.MathUtils.clamp(amount, 0, 1));
      if (id === 'jupiter') {
        const storm = ((longitude - 4.3) / 0.22) ** 2 + ((latitude + 0.35) / 0.105) ** 2;
        if (storm < 1) color = mix(color, [165, 108, 75], (1 - storm) * 0.85);
      }
      if (id === 'earth') {
        // An original stylized land/cloud field; NOT a georeferenced map.
        const land = noise(sx * 1.3 + 0.3, sy * 1.5 - 0.6, sz * 1.3) + 0.13 * Math.sin(longitude * 5 + latitude * 3);
        if (land > 0.07) color = mix([53, 75, 59], [129, 131, 99], Math.min(1, land * 2 + Math.max(0, 0.5 - Math.abs(latitude))));
        const cloud = noise(sx * 6 + Math.sin(sy * 4), sy * 6, sz * 6);
        const cloudCover = THREE.MathUtils.clamp((cloud - 0.06) * 3.5, 0, 0.9);
        color = mix(color, [232, 234, 222], cloudCover);
        if (Math.abs(latitude) > 1.28 + n * 0.16) color = mix(color, [212, 222, 217], 0.9);
      }
      if (id === 'mars' && Math.abs(latitude) > 1.43 + n * 0.1) color = [209, 196, 174];
      const offset = (y * width + x) * 4;
      data[offset] = color[0]; data[offset + 1] = color[1]; data[offset + 2] = color[2]; data[offset + 3] = 255;
    }
  }
  // Original deterministic impact basins; no downloaded photographic textures.
  if (['mercury', 'mars', 'pluto'].includes(id)) {
    let seed = id.charCodeAt(0) * 173;
    const random = () => { seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0; return seed / 4294967296; };
    for (let i = 0; i < 85; i++) {
      const cx = random() * width, cy = (0.1 + random() * 0.8) * height;
      const r = (0.005 + random() ** 3 * 0.034) * width;
      for (let y = Math.max(0, Math.floor(cy - r)); y < Math.min(height, cy + r); y++) {
        for (let x = Math.floor(cx - r); x < cx + r; x++) {
          const d = Math.hypot((x - cx) * Math.cos((cy / height - 0.5) * Math.PI), y - cy) / r;
          if (d > 1) continue;
          const at = (y * width + (x + width) % width) * 4;
          const shade = d > 0.79 ? 1.14 : 0.82 + d * 0.12;
          for (let k = 0; k < 3; k++) data[at + k] = Math.min(255, data[at + k] * shade);
        }
      }
    }
  }
  return data;
}

export function createPlanet(body, textureWidth = 512) {
  const id = body.id;
  const group = new THREE.Group();
  group.name = id; group.userData.bodyId = id;
  const tilted = new THREE.Group();
  tilted.rotation.z = -(body.tiltDeg || 0) * Math.PI / 180;
  group.add(tilted);
  const data = createSurfaceData(id, textureWidth, textureWidth / 2);
  const texture = new THREE.DataTexture(data, textureWidth, textureWidth / 2, THREE.RGBAFormat);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.generateMipmaps = true; texture.minFilter = THREE.LinearMipmapLinearFilter; texture.magFilter = THREE.LinearFilter;
  texture.wrapS = THREE.RepeatWrapping; texture.needsUpdate = true;
  const material = id === 'sun'
    ? new THREE.MeshBasicMaterial({map: texture, color: 0xfff2d8, toneMapped: false})
    : new THREE.MeshStandardMaterial({map: texture, roughness: id === 'earth' ? 0.6 : 0.91, metalness: 0, envMapIntensity: 0.08});
  const surface = new THREE.Mesh(new THREE.SphereGeometry(BODY_RADII[id], 64, 40), material);
  surface.name = `${id}-surface`; surface.userData.bodyId = id;
  surface.castShadow = id !== 'sun'; surface.receiveShadow = id !== 'sun';
  surface.layers.set(1); tilted.add(surface);
  if (id === 'saturn') {
    const ringMap = createSaturnRingTexture();
    const inner = BODY_RADII.saturn * SATURN_RING_EXTENT.inner, outer = BODY_RADII.saturn * SATURN_RING_EXTENT.outer;
    const geometry = new THREE.RingGeometry(inner, outer, 160, 1);
    const positions = geometry.attributes.position, uv = geometry.attributes.uv;
    for (let i = 0; i < positions.count; i++) uv.setXY(i, (Math.hypot(positions.getX(i), positions.getY(i)) - inner) / (outer - inner), 0.5);
    const ring = new THREE.Mesh(geometry, new THREE.MeshStandardMaterial({map: ringMap, side: THREE.DoubleSide, transparent: true, opacity: 0.92, alphaTest: 0.05, roughness: 0.94, envMapIntensity: 0.18, depthWrite: true}));
    ring.name = 'saturn-rings'; ring.userData.bodyId = id;
    // Thin alpha-banded rings alias badly in the finite point-shadow map.
    // Keep their appearance and receiving shadows; omit ring-cast eclipses.
    ring.rotation.x = -Math.PI / 2; ring.castShadow = false; ring.receiveShadow = true;
    ring.layers.set(1); tilted.add(ring);
  }
  return group;
}

export function replaceSurfaceTexture(planet, texture) {
  const surface = planet.getObjectByName(`${planet.userData.bodyId}-surface`);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.needsUpdate = true;
  surface.material.map.dispose();
  surface.material.map = texture;
  surface.material.needsUpdate = true;
}

export function mapPosition(body, position, mode = 'observatory', scale = 'display') {
  if (mode === 'mechanical') throw new RangeError('Mechanical positions must come from transmitted output mounts');
  const factor = scale === 'distance' ? DISTANCE_FACTOR : DISPLAY_RADII[body.id] / body.aAU;
  return new THREE.Vector3(position.x * factor, position.z * factor, -position.y * factor);
}
