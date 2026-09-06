# Authored moon surface detail

`src/moon-surfaces.js` generates original **512 × 256 RGBA albedo illustrations** for the ten companions. Source-backed specimen palettes and feature cues are described in [moons.md](moons.md). These are not photographic maps, measured reflectance, elevation data, georeferenced terrain, or calibrated body-fixed orientations. The existing mesh disclosure still says “Authored illustration” and “not a calibrated map or orientation.”

## Recipe

- Sample a seeded, smoothly interpolated three-dimensional random lattice at several scales on a unit sphere. The smaller scales contribute new spatial detail rather than interpolating a lower-resolution image.
- Distribute crater/deposit centers uniformly in spherical area. Use spherical chord distances and a radius distribution favoring small features. Soft rims change albedo without painting a directional highlight or shadow into the map.
- Generate finite, tapered, gently warped fracture arcs instead of thresholded, repeating black lines.
- Keep exact matching longitude endpoints and single-valued poles. Native `DataTexture` low-v rows are south; high-v rows are north. These are texture-space directions only.

| Specimen | Treatment |
|---|---|
| Io | Ochre/sulfur mottling at several scales, diffuse warm deposits, small dark volcanic centers; no impact-crater rims. |
| Europa | Pale warm ice with thin paired, muted brown fracture lines inside softer bands; very sparse subtle craters. |
| Ganymede | Dark/light terrain patches, pale groove lanes, and a population of small soft-rimmed craters. |
| Callisto | Dark gray ground with denser fine cratering; rim brightness is restrained rather than high-contrast white rings. |
| Enceladus | Bright ice, faint small craters outside the south-polar terrain, and four softened blue-gray southern fracture cues. Their placement and exaggerated width remain authored. |
| Titan | Smooth opaque golden haze with broad wisps/latitude shading. No craters, fine ground grain, visible surface, transparency, or scattering simulation. |
| Moon, Miranda, Triton, Charon | Retain maria/craters, angular scarred patches, muted frost, and the dark reddish north cap respectively, using the new spherical detail recipe. |

## Rendering and ownership

`createMoonSurface(id)` returns a fresh `THREE.DataTexture` with an independent pixel buffer. Non-string IDs throw `TypeError`; unsupported strings throw `RangeError`. There is no shared mutable texture cache, network request, canvas dependency, image download, or new package.

Maps use sRGB, linear magnification, trilinear mipmap minification, longitude repeat, and latitude clamp. Each moon still has one map on its existing rough, nonmetallic `MeshStandardMaterial`. This is an albedo-only pass: no bump/normal maps, relief displacement, extra material layers, or claims of terrain-scale light response.

The generated lattice and spherical sample arrays are temporary CPU construction data. Only the final map remains attached to the material. Existing scene traversal owns disposal of the maps, materials, and geometry; date/selection/visibility updates do not regenerate textures. Each sphere uses 64 × 48 segments for a smoother close-up silhouette without changing its radius, identifiers, parent attachment, motion, picking, or visibility logic.

## Focused verification

```sh
node --test tests/moon-surfaces.test.js tests/satellite-expansion.test.js
```

The focused suite checks direct byte equality across repeat construction, independent buffers, traversal disposal events, sampler configuration, opaque pixels, exact seams/poles, fine-scale residual bounds, smooth Titan haze, retained feature contrasts and polar placement, bounded tessellation, unchanged display radii/IDs, family extents, and resource stability through existing update cycles. It compares pixel buffers directly.

The 4 × 4-block residual and adjacent-pixel bounds guard against a resolution-only change, high-contrast grit, and hard black cracks. They do **not** certify visual quality or scientific accuracy. Production lighting, close-up appearance, GPU cleanup, browser behavior and device performance require separate integrated checks.
