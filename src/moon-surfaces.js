import * as THREE from 'three';

// Original albedo illustrations, not imagery, elevation, or measured reflectance.
// Low DataTexture v is south. All feature distances are evaluated on a unit sphere.
const WIDTH = 512, HEIGHT = 256, TAU = Math.PI * 2;
// Preserve the specimen pigments; these are not additional DSM brand roles.
const PALETTES = {
  moon: [172, 172, 169], io: [201, 175, 102], europa: [199, 191, 160],
  ganymede: [127, 129, 125], callisto: [99, 102, 98], enceladus: [234, 240, 239],
  titan: [212, 160, 77], miranda: [165, 166, 162], triton: [202, 194, 194], charon: [154, 151, 149],
};
const SEEDS = {moon: 1931, io: 5021, europa: 6311, ganymede: 7219, callisto: 8369, enceladus: 9029, titan: 10037, miranda: 11027, triton: 12007, charon: 13001};
const clamp = value => Math.max(0, Math.min(1, value));
const smooth = (lo, hi, value) => { const t = clamp((value - lo) / (hi - lo)); return t * t * (3 - 2 * t); };
const mix = (a, b, t) => a + (b - a) * t;

function randomSource(seed) {
  return () => { seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0; return seed / 4294967296; };
}

// Seeded random lattice + smooth interpolation, not a periodic sine grain overlay.
function sphericalNoise(random) {
  const size = 32, lattice = Float32Array.from({length: size ** 3}, () => random() * 2 - 1);
  const at = (x, y, z) => lattice[((z & 31) * size + (y & 31)) * size + (x & 31)];
  return (x, y, z, frequency) => {
    x = x * frequency + 17.3; y = y * frequency + 11.7; z = z * frequency + 23.9;
    const ix = Math.floor(x), iy = Math.floor(y), iz = Math.floor(z);
    const u = smooth(0, 1, x - ix), v = smooth(0, 1, y - iy), w = smooth(0, 1, z - iz);
    return mix(mix(mix(at(ix, iy, iz), at(ix + 1, iy, iz), u), mix(at(ix, iy + 1, iz), at(ix + 1, iy + 1, iz), u), v),
      mix(mix(at(ix, iy, iz + 1), at(ix + 1, iy, iz + 1), u), mix(at(ix, iy + 1, iz + 1), at(ix + 1, iy + 1, iz + 1), u), v), w);
  };
}

function direction(random) {
  const y = random() * 2 - 1, longitude = random() * TAU, radial = Math.sqrt(1 - y * y);
  return [radial * Math.cos(longitude), y, radial * Math.sin(longitude)];
}
const dot = (a, x, y, z) => a[0] * x + a[1] * y + a[2] * z;

function fractureArcs(random, count) {
  return Array.from({length: count}, () => {
    const normal = direction(random), trial = direction(random);
    const tangent = [normal[1] * trial[2] - normal[2] * trial[1], normal[2] * trial[0] - normal[0] * trial[2], normal[0] * trial[1] - normal[1] * trial[0]];
    const length = Math.hypot(...tangent);
    return {normal, center: tangent.map(value => value / length), end: Math.cos(0.45 + random() * 1.15), width: 0.006 + random() * 0.007};
  });
}

// Small stamps are uniform in spherical area, with many small and few large features.
// They have soft albedo rims, never a fixed painted light/shadow direction.
function stampFeatures(id, data, points, random) {
  const count = {moon: 460, io: 125, europa: 12, ganymede: 330, callisto: 780, enceladus: 150, titan: 0, miranda: 220, triton: 65, charon: 320}[id];
  for (let feature = 0; feature < count; feature++) {
    const center = direction(random), volcanic = id === 'io';
    if (id === 'enceladus' && center[1] < -0.5) continue;
    const radius = volcanic ? 0.012 + random() ** 3 * 0.09 : 0.012 + random() ** 2.8 * (id === 'callisto' ? 0.10 : 0.13);
    const extent = radius * (volcanic ? 2.6 : 1.35), threshold = 2 * (1 - Math.cos(extent));
    const latitude = Math.asin(center[1]);
    const first = Math.max(0, Math.floor((latitude - extent + Math.PI / 2) / Math.PI * (HEIGHT - 1)));
    const last = Math.min(HEIGHT - 1, Math.ceil((latitude + extent + Math.PI / 2) / Math.PI * (HEIGHT - 1)));
    const strength = 0.7 + random() * 0.3;
    for (let row = first; row <= last; row++) for (let column = 0; column < WIDTH; column++) {
      const index = row * WIDTH + column, p = index * 3;
      const distanceSquared = Math.max(0, 2 * (1 - dot(center, points[p], points[p + 1], points[p + 2])));
      if (distanceSquared > threshold) continue;
      const d = Math.sqrt(distanceSquared) / radius;
      const at = index * 4;
      if (volcanic) {
        // Diffuse sulfur deposits surrounding small volcanic centers, not impact rings.
        const deposit = (1 - smooth(0.75, 2.6, d)) * 0.25 * strength;
        const core = (1 - smooth(0.16, 0.65, d)) * 0.52 * strength;
        for (let k = 0; k < 3; k++) data[at + k] = mix(mix(data[at + k], [181, 125, 62][k], deposit), [75, 66, 47][k], core);
      } else {
        const floor = (1 - smooth(0.45, 0.88, d)) * strength;
        const rim = smooth(0.66, 0.91, d) * (1 - smooth(0.96, 1.35, d)) * strength;
        const subtle = id === 'enceladus' || id === 'europa' || id === 'triton';
        const darkening = subtle ? 0.028 : 0.085;
        const brightening = subtle ? 6 : id === 'callisto' ? 23 : 19;
        for (let k = 0; k < 3; k++) data[at + k] = Math.min(255, data[at + k] * (1 - floor * darkening) + rim * brightening);
      }
    }
  }
}

export function createMoonSurface(id) {
  if (typeof id !== 'string') throw new TypeError('Moon surface ID must be a string');
  if (!Object.prototype.hasOwnProperty.call(PALETTES, id)) throw new RangeError(`Unknown moon surface: ${id}`);
  const base = PALETTES[id], random = randomSource(SEEDS[id]);
  const noise = sphericalNoise(random), arcs = fractureArcs(random, id === 'europa' ? 32 : id === 'ganymede' ? 16 : 0);
  const data = new Uint8Array(WIDTH * HEIGHT * 4), points = new Float64Array(WIDTH * HEIGHT * 3);
  for (let row = 0; row < HEIGHT; row++) for (let column = 0; column < WIDTH; column++) {
    const latitude = row / (HEIGHT - 1) * Math.PI - Math.PI / 2;
    const longitude = column / (WIDTH - 1) * TAU;
    const radial = row === 0 || row === HEIGHT - 1 ? 0 : Math.cos(latitude);
    const x = radial * Math.cos(longitude), y = Math.sin(latitude), z = radial * Math.sin(longitude);
    const index = row * WIDTH + column, at = index * 4;
    points[index * 3] = x; points[index * 3 + 1] = y; points[index * 3 + 2] = z;
    const broad = noise(x, y, z, 2.4), middle = noise(x, y, z, 9), small = noise(x, y, z, 30), grain = noise(x, y, z, 85);
    let value = 0.91 + broad * 0.20 + middle * 0.065 + small * 0.035 + grain * 0.022;
    let tint = base, stain = 0, stainColor = base;
    if (id === 'titan') {
      // Opaque golden haze only: broad wisps and latitude shading, no surface stamps/grain.
      value = 0.94 + broad * 0.022 + Math.sin(y * 5 + broad * 0.35) * 0.022;
    } else if (id === 'enceladus') {
      value = 0.975 + broad * 0.015 + middle * 0.012 + small * 0.012 + grain * 0.009;
      const stripe = x + 0.045 * Math.sin(z * 9) + middle * 0.018;
      const south = (1 - smooth(-0.78, -0.57, y)) * (1 - smooth(0.52, 0.7, Math.abs(z)));
      for (const offset of [-0.38, -0.13, 0.13, 0.38]) {
        const d = Math.abs(stripe - offset);
        stain = Math.max(stain, ((1 - smooth(0.005, 0.019, d)) * 0.42 + (1 - smooth(0.014, 0.042, d)) * 0.12) * south);
      }
      stainColor = [151, 176, 185];
    } else if (id === 'io') {
      value = 0.96 + broad * 0.13 + middle * 0.07 + small * 0.035 + grain * 0.022;
      stain = smooth(-0.2, 0.55, broad + middle * 0.6) * 0.37;
      stainColor = [193, 145, 81];
    } else if (id === 'europa') {
      value = 1.04 + broad * 0.075 + middle * 0.032 + small * 0.018 + grain * 0.016;
      stainColor = [145, 114, 85];
    } else if (id === 'ganymede') {
      const terrain = smooth(-0.15, 0.3, broad + middle * 0.28);
      value = 0.79 + terrain * 0.30 + middle * 0.065 + small * 0.05 + grain * 0.028;
      stainColor = [177, 170, 149];
    } else if (id === 'callisto') {
      value = 0.91 + broad * 0.14 + middle * 0.08 + small * 0.055 + grain * 0.04;
    } else if (id === 'triton') {
      value = 0.94 + broad * 0.055 + middle * 0.025 + small * 0.012 + grain * 0.008;
    }
    for (const arc of arcs) {
      const window = smooth(arc.end, arc.end + 0.2, dot(arc.center, x, y, z));
      if (window === 0) continue;
      const d = Math.abs(dot(arc.normal, x, y, z) + middle * 0.032 + small * 0.006);
      // Thin, tapered paired lineae inside a softer band. Ganymede uses paler groove lanes.
      const edges = 1 - smooth(arc.width * 0.25, arc.width, Math.abs(d - arc.width));
      const band = 1 - smooth(arc.width, arc.width * 3.5, d);
      stain = Math.max(stain, (edges * 0.20 + band * 0.10) * window);
    }
    if (id === 'moon') value *= 1 - (1 - smooth(-0.45, -0.13, broad + middle * 0.25)) * 0.28;
    if (id === 'miranda') {
      // Broken corona terrain: skewed, noise-warped scarps with intersecting
      // angular patches, never concentric square contours. Sphere-space keeps
      // the seams and deterministic resource contract of the other moons.
      const u = x + 0.32 * y + broad * 0.13;
      const v = y - 0.21 * x + middle * 0.06;
      const terrain = Math.min(0.48-u, u+0.68, 0.55-v, v+0.43, 0.65-u-v);
      const patch = smooth(-0.14, 0.10, z) * smooth(-0.035, 0.045, terrain);
      const scarp = Math.abs(v + 0.18 + 0.31 * Math.abs(u + 0.12) + middle * 0.045);
      const fractures = Math.abs(u - 0.24 * v + small * 0.025 - 0.13);
      value *= 1 - patch * (0.28 + middle * 0.16 + (1-smooth(0.008,0.034,scarp))*0.23);
      value *= 1 - (1-smooth(0.005,0.021,fractures))*patch*0.16;
      value *= 1 - (1-smooth(0.007,0.028,Math.abs(terrain + middle*0.025)))*smooth(-0.15,0.1,z)*0.17;
    }
    if (id === 'charon') {
      const cap = smooth(0.64, 0.79, y + middle * 0.06 + broad * 0.04);
      tint = base.map((value, k) => mix(value, [81, 51, 45][k], cap));
    }
    for (let k = 0; k < 3; k++) data[at + k] = Math.max(0, Math.min(255, mix(tint[k] * value, stainColor[k], stain)));
    data[at + 3] = 255;
  }
  stampFeatures(id, data, points, random);
  // Exact duplicate endpoint texels avoid quantization seams and keep both poles single-valued.
  for (let row = 0; row < HEIGHT; row++) {
    const first = row * WIDTH * 4;
    data.set(data.subarray(first, first + 4), first + (WIDTH - 1) * 4);
    if (row === 0 || row === HEIGHT - 1) for (let column = 1; column < WIDTH; column++) data.set(data.subarray(first, first + 4), first + column * 4);
  }
  const texture = new THREE.DataTexture(data, WIDTH, HEIGHT, THREE.RGBAFormat);
  texture.name = `authored-${id}-albedo`;
  texture.colorSpace = THREE.SRGBColorSpace; texture.generateMipmaps = true;
  texture.minFilter = THREE.LinearMipmapLinearFilter; texture.magFilter = THREE.LinearFilter;
  texture.wrapS = THREE.RepeatWrapping; texture.wrapT = THREE.ClampToEdgeWrapping;
  texture.needsUpdate = true;
  return texture;
}
