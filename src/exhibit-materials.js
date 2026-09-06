import * as THREE from 'three';

// Specimen albedos, not UI color roles. These are exhibit approximations of
// coated metal finishes, not measured optical constants for a named process.
export function createBlackDlcMaterial() {
  return new THREE.MeshPhysicalMaterial({
    name: 'black-dlc-hard-carbon', color: 0x191a1b,
    metalness: 0.35, roughness: 0.285, ior: 2.1,
    clearcoat: 0.65, clearcoatRoughness: 0.105,
    envMapIntensity: 1.05,
  });
}

function opalMaps() {
  const size = 512, color = new Uint8Array(size * size * 4), normals = new Uint8Array(color.length);
  let seed = 0x0b1ac0a1;
  const random = () => { seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0; return seed / 4294967296; };
  for (let i = 0; i < color.length; i += 4) {
    const grain = random() * 4;
    color.set([5 + grain, 7 + grain, 10 + grain, 255], i);
    normals.set([128, 128, 255, 255], i);
  }
  // Original overlapping splinters, not a photographic asset. Separate layers
  // leave charcoal channels between cobalt/azure flashes and finer cyan pinfire.
  const palette = [[8, 35, 114], [8, 69, 181], [13, 112, 216], [20, 157, 214], [36, 188, 224], [27, 43, 119]];
  for (const [count, scale, brightness] of [[2400, 7, 0.68], [5300, 2.8, 1], [9000, 0.95, 1]]) {
    for (let flake = 0; flake < count; flake++) {
      const cx = random() * size, cy = random() * size;
      const domain = .5 + .26 * Math.sin(cx * .019 + Math.sin(cy * .023) * 1.7)
        + .24 * Math.cos(cy * .027 - cx * .008);
      if (random() > .08 + .92 * domain ** 1.4) continue;
      const rx = (0.4 + random()) * scale, ry = rx * (0.25 + random() * 0.7);
      const angle = random() * Math.PI * 2, ca = Math.cos(angle), sa = Math.sin(angle);
      const hueField = .5 + .5 * Math.sin(cx * .023 + cy * .008 + Math.sin(cy * .036));
      const tint = palette[Math.min(5, Math.floor(hueField * 4 + random() * 1.4))];
      const brilliance = brightness * (0.7 + random() * 0.3);
      const nx = (random() - 0.5) * 1.25, ny = (random() - 0.5) * 1.25;
      const nz = Math.sqrt(1 - nx * nx - ny * ny);
      const encoded = [128 + nx * 127, 128 + ny * 127, 128 + nz * 127, 255];
      for (let y = Math.floor(cy - rx - 1); y <= cy + rx + 1; y++) {
        for (let x = Math.floor(cx - rx - 1); x <= cx + rx + 1; x++) {
          const dx = x - cx, dy = y - cy;
          const u = (dx * ca + dy * sa) / rx, v = (-dx * sa + dy * ca) / ry;
          // An asymmetric clipped diamond reads as buried shards, not dots.
          if (Math.abs(u) + Math.abs(v) > 1 || u + v * 0.5 < -0.72) continue;
          const at = (((y + size) % size) * size + (x + size) % size) * 4;
          color.set([...tint.map(value => value * brilliance), 255], at);
          normals.set(encoded, at);
        }
      }
    }
  }
  const texture = (data, name, colorSpace) => {
    const map = new THREE.DataTexture(data, size, size, THREE.RGBAFormat);
    map.name = name; map.colorSpace = colorSpace;
    map.wrapS = map.wrapT = THREE.RepeatWrapping;
    map.generateMipmaps = true; map.minFilter = THREE.LinearMipmapLinearFilter;
    map.magFilter = THREE.LinearFilter; map.anisotropy = 4; map.needsUpdate = true;
    return map;
  };
  return {map: texture(color, 'original-blue-opal-pinfire', THREE.SRGBColorSpace),
    normalMap: texture(normals, 'original-opal-subcoat-facet-normals', THREE.NoColorSpace)};
}

/**
 * Two instanced batches. [x,y,z] is the stone's girdle/waist datum; the bezel
 * extends 0.05 below it and the polished dome 0.125 above it. Fits a 0.28 collar.
 * Host traversal owns geometries, materials, map and normalMap (dedupe by Set).
 * No global GPU resources, callbacks, ticking uniforms or separate clear shell.
 */
export function createOpalInlays(positions) {
  if (!Array.isArray(positions) || positions.some(p => !Array.isArray(p) || p.length !== 3 || !p.every(Number.isFinite))) {
    throw new TypeError('Opal positions must be arrays of three finite coordinates');
  }
  const group = new THREE.Group(); group.name = 'pillar-black-opal-inlays';
  if (!positions.length) return group;
  const profile = [new THREE.Vector2(0, -0.04), new THREE.Vector2(0.173, -0.04), new THREE.Vector2(0.184, -0.012)];
  for (let i = 0; i <= 32; i++) {
    const angle = i / 32 * Math.PI / 2;
    profile.push(new THREE.Vector2(0.184 * Math.cos(angle), 0.125 * Math.sin(angle)));
  }
  const geometry = new THREE.LatheGeometry(profile, 96); geometry.name = 'smooth-domed-opal-cabochon';
  // Planar map projection prevents a lathe's pinched UVs at the polished apex.
  const vertices = geometry.attributes.position, uv = geometry.attributes.uv;
  for (let i = 0; i < vertices.count; i++) uv.setXY(i, vertices.getX(i) / 0.368 + 0.5, vertices.getZ(i) / 0.368 + 0.5);
  const material = new THREE.MeshPhysicalMaterial({
    name: 'black-opal-blue-fire', ...opalMaps(), color: 0xffffff,
    metalness: 0.38, roughness: 0.20, ior: 1.46,
    normalScale: new THREE.Vector2(0.72, 0.72),
    clearcoat: 1, clearcoatRoughness: 0.028, envMapIntensity: 1.15,
  });
  const stones = new THREE.InstancedMesh(geometry, material, positions.length);
  stones.name = 'black-opal-cabochons';
  const bezelProfile = [[0.174, -0.05], [0.206, -0.05], [0.208, -0.024], [0.204, -0.008], [0.187, 0.007], [0.18, -0.012], [0.174, -0.05]].map(p => new THREE.Vector2(...p));
  const bezelGeometry = new THREE.LatheGeometry(bezelProfile, 96); bezelGeometry.name = 'rolled-opal-bezel';
  const bezels = new THREE.InstancedMesh(bezelGeometry, new THREE.MeshPhysicalMaterial({
    name: 'opal-polished-platinum-bezel', color: 0x85898c, metalness: 0.96, roughness: 0.18,
    clearcoat: 0.3, clearcoatRoughness: 0.09,
  }), positions.length);
  bezels.name = 'black-opal-bezels';
  const matrix = new THREE.Matrix4(), rotation = new THREE.Quaternion(), axis = new THREE.Vector3(0, 1, 0), scale = new THREE.Vector3(1, 1, 1);
  for (let i = 0; i < positions.length; i++) {
    rotation.setFromAxisAngle(axis, i * 2.3999632297);
    matrix.compose(new THREE.Vector3(...positions[i]), rotation, scale);
    stones.setMatrixAt(i, matrix); bezels.setMatrixAt(i, matrix);
  }
  for (const mesh of [stones, bezels]) {
    mesh.instanceMatrix.needsUpdate = true;
    mesh.castShadow = mesh.receiveShadow = true;
    mesh.computeBoundingBox(); mesh.computeBoundingSphere(); group.add(mesh);
  }
  return group;
}

export function createBlackPvdMaterial() {
  return new THREE.MeshPhysicalMaterial({
    name: 'black-pvd-polished-metal', color: 0x303132,
    metalness: 0.96, roughness: 0.155,
    clearcoat: 0.4, clearcoatRoughness: 0.075,
    envMapIntensity: 1.15,
  });
}
