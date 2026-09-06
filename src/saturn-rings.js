import * as THREE from 'three';

// Display compatibility, not a calibrated radius solution. The omitted inner D
// and outer F rings are outside this exhibit annulus; see docs/materials.md.
export const SATURN_RING_EXTENT = Object.freeze({inner: 1.35, outer: 2.3});

// Authored natural-color interpretation: independent RGB/optical-density stops,
// rather than one brown swatch multiplied by sine waves. Radial u is [0,1].
const BANDS = [
  [0, 65, 64, 61, 0], [.012, 85, 81, 76, 85],
  [.06, 113, 108, 101, 102], [.11, 83, 83, 80, 76], [.16, 133, 121, 106, 122],
  [.187, 120, 115, 107, 108], [.194, 189, 176, 151, 236],
  [.24, 214, 198, 170, 250], [.30, 174, 155, 130, 244],
  [.35, 224, 202, 163, 255], [.41, 200, 183, 159, 249],
  [.46, 232, 220, 193, 255], [.51, 207, 199, 181, 251],
  [.56, 241, 232, 211, 255], [.60, 232, 226, 214, 255],
  [.645, 235, 226, 207, 250], [.650, 159, 150, 135, 145],
  [.660, 87, 85, 80, 16], [.716, 116, 113, 105, 22],
  [.724, 183, 177, 163, 222], [.77, 196, 189, 173, 233],
  [.81, 170, 166, 156, 224], [.855, 197, 190, 174, 237],
  [.90, 178, 175, 166, 229], [.95, 194, 188, 174, 230],
  [.976, 167, 165, 157, 217], [.993, 190, 185, 174, 218], [1, 156, 154, 146, 100],
];
const GAPS = [[.077, .080], [.145, .148], [.653, .661], [.684, .702], [.918, .926], [.9815, .9845]];

/** Original, deterministic 1D RGBA texture. u runs inner→outer, v stays .5.
 * Transparent gaps require transparent:true and alphaTest≈.05 on the host.
 * Texture is caller-owned. No image fetches, browser APIs or global cache.
 */
export function createSaturnRingTexture(width = 2048) {
  if (!Number.isInteger(width) || width < 256 || width > 8192 || (width & (width - 1)) !== 0) {
    throw new RangeError('Ring texture width must be a power of two between 256 and 8192');
  }
  const data = new Uint8Array(width * 4);
  let band = 0;
  for (let i = 0; i < width; i++) {
    const t = i / (width - 1);
    while (band < BANDS.length - 2 && t > BANDS[band + 1][0]) band++;
    const a = BANDS[band], b = BANDS[band + 1], blend = (t - a[0]) / (b[0] - a[0]);
    // Fine density waves supplement, never replace, separately colored bands.
    const grain = Math.sin(t * 1753 + Math.sin(t * 173) * 2.8) * 0.026
      + Math.sin(t * 4319 + 1.7) * 0.014;
    const ringlets = Math.sin(t * 387 + Math.sin(t * 43) * 3.1) * 0.045;
    const intensity = 1 + grain + ringlets;
    for (let k = 0; k < 3; k++) data[i * 4 + k] = Math.min(255, (a[k + 1] + (b[k + 1] - a[k + 1]) * blend) * intensity);
    let alpha = (a[4] + (b[4] - a[4]) * blend) * (1 + grain * 1.8);
    if (t > .662 && t < .715) {
      alpha = 5 + 15 * Math.max(0, Math.sin(t * 2300)) ** 12;
      if ((t > .674 && t < .678) || (t > .705 && t < .709)) alpha = 44;
    }
    if (t < .007 || GAPS.some(([start, end]) => t > start && t < end)) alpha = 0;
    data[i * 4 + 3] = Math.min(255, Math.max(0, alpha));
  }
  const texture = new THREE.DataTexture(data, width, 1, THREE.RGBAFormat);
  texture.name = 'saturn-natural-color-radial-bands'; texture.colorSpace = THREE.SRGBColorSpace;
  texture.generateMipmaps = true; texture.minFilter = THREE.LinearMipmapLinearFilter;
  texture.magFilter = THREE.LinearFilter; texture.needsUpdate = true;
  return texture;
}
