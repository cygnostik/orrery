// Original, static solar granulation. Sample a seeded 3D cellular field on the
// unit sphere: no UV-space waves, longitude tiles or pinched polar grain.
const permutation = new Uint8Array(256);
for (let i = 0; i < 256; i++) permutation[i] = i;
let seed = 7319;
for (let i = 255; i > 0; i--) {
  seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
  const j = seed % (i + 1);
  [permutation[i], permutation[j]] = [permutation[j], permutation[i]];
}
const lattice = (x, y, z) => permutation[(x + permutation[(y + permutation[z & 255]) & 255]) & 255];
const fade = t => t * t * (3 - 2 * t);
const mix = (a, b, t) => a + (b - a) * t;

function softNoise(x, y, z) {
  const ix = Math.floor(x), iy = Math.floor(y), iz = Math.floor(z);
  const u = fade(x - ix), v = fade(y - iy), w = fade(z - iz);
  const plane = dz => mix(
    mix(lattice(ix, iy, iz + dz), lattice(ix + 1, iy, iz + dz), u),
    mix(lattice(ix, iy + 1, iz + dz), lattice(ix + 1, iy + 1, iz + dz), u), v);
  return mix(plane(0), plane(1), w) / 255 - 0.5;
}

function granule(x, y, z) {
  const ix = Math.floor(x), iy = Math.floor(y), iz = Math.floor(z);
  let first = Infinity, second = Infinity;
  // Independently jittered feature points remove the directional repetition of
  // the old trigonometric grain. F2-F1 gives soft bright cells and darker lanes.
  for (let dz = -1; dz <= 1; dz++) for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
    const cx = ix + dx, cy = iy + dy, cz = iz + dz;
    const n = lattice(cx, cy, cz);
    const px = cx + 0.1 + permutation[n] / 255 * 0.8 - x;
    const py = cy + 0.1 + permutation[(n + 83) & 255] / 255 * 0.8 - y;
    const pz = cz + 0.1 + permutation[(n + 167) & 255] / 255 * 0.8 - z;
    const distance = px * px + py * py + pz * pz;
    if (distance < first) {second = first; first = distance;}
    else if (distance < second) second = distance;
  }
  return fade(Math.min(1, (Math.sqrt(second) - Math.sqrt(first)) * 2.8));
}

export function createSunSurfaceData(width, height) {
  const data = new Uint8Array(width * height * 4);
  for (let y = 0; y < height; y++) {
    const latitude = (y / (height - 1) - 0.5) * Math.PI;
    // Exact pole coordinates and a shared seam endpoint also make bytes agree.
    const radial = y === 0 || y === height - 1 ? 0 : Math.cos(latitude);
    const sy = Math.sin(latitude);
    // The existing 40-ring sphere interpolates UVs through a triangle fan at
    // each pole. Fade only microdetail inside that small cap, otherwise even
    // continuous spherical noise stretches into spokes in a pole-on view.
    const detailWeight = fade(Math.min(1, Math.max(0, (radial - 0.08) / 0.12)));
    for (let x = 0; x < width; x++) {
      const longitude = (x === width - 1 ? 0 : x / (width - 1)) * Math.PI * 2;
      const sx = Math.cos(longitude) * radial, sz = Math.sin(longitude) * radial;
      const cells = granule(sx * 30 + 11.3, sy * 30 + 23.7, sz * 30 + 41.1);
      const broad = softNoise(sx * 3.3 + 71, sy * 3.3 + 19, sz * 3.3 + 53);
      const fine = softNoise(sx * 39 + 7, sy * 39 + 37, sz * 39 + 97);
      const polar = detailWeight < 1 ? softNoise(sx * 6 + 31, sy * 6 + 11, sz * 6 + 59) : 0;
      const amount = 0.705 + ((cells - 0.5) * 0.13 + fine * 0.025) * detailWeight +
        polar * 0.09 * (1 - detailWeight) + broad * 0.04;
      const i = (y * width + x) * 4;
      // Retain the warm specimen palette with similarly restrained luminance.
      data[i] = 221 + 34 * amount;
      data[i + 1] = 163 + 74 * amount;
      data[i + 2] = 83 + 106 * amount;
      data[i + 3] = 255;
    }
  }
  return data;
}
