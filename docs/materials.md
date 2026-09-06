# Exhibit materials and Saturn rings

## Integration API

```js
import {createBlackDlcMaterial, createBlackPvdMaterial, createOpalInlays} from './exhibit-materials.js';
import {createSaturnRingTexture, SATURN_RING_EXTENT} from './saturn-rings.js';
```

- `createBlackDlcMaterial()` → caller-owned `MeshPhysicalMaterial`, `black-dlc-hard-carbon`. Neutral near-black albedo; satin substrate roughness 0.285, high-index dielectric/metallic approximation, tighter clearcoat lobe. Use on the lower gear bank, not as a global platinum replacement.
- `createBlackPvdMaterial()` → caller-owned `MeshPhysicalMaterial`, `black-pvd-polished-metal`. Neutral near-black metal, metalness 0.96, roughness 0.155. Use on arm bars/pins. Existing geometry needs bevels/rounded edges to resolve a highlight; material alone cannot round a sharp box.
- `createOpalInlays(positions)` → `Group` named `pillar-black-opal-inlays`, containing exactly two `InstancedMesh` batches for any nonempty array: `black-opal-cabochons`, `black-opal-bezels`. Empty input returns an empty group. Input is `[[x,y,z],…]`, finite coordinates only. Every position is a **girdle datum**, not the dome apex: stone radius 0.184, dome apex +0.125, stone underside −0.04; rolled bezel radius 0.208 and underside −0.05. Fits a 0.28 collar. The integrating scene owns mechanical clearance for the dome.
- `createSaturnRingTexture(width = 2048)` → original 1D RGBA `DataTexture`, sRGB, mipmapped, caller-owned. Width must be a power of two 256–8192. Keep radial `u = (r-inner)/(outer-inner)`, `v=.5`; extent is `{inner:1.35, outer:2.3}` times the display Saturn radius. Existing `DoubleSide`, `transparent:true`, `opacity:.92`, `alphaTest:.05`, `roughness:.94`, `envMapIntensity:.18`, `depthWrite:true` material contract is supported.

## Surface construction and ownership

All textures are original deterministic typed arrays. No photographic materials are copied, no network requests occur, no additional dependency is needed. RGB values are physical specimen albedos, not new interface roles.

Black opal uses three overlapping shard/pinfire scales with low-frequency **clustered fire domains**, predominately cobalt/azure/cyan, and charcoal interstices. Planar dome UVs avoid the pinched apex of ordinary lathe UVs. Per-flake substrate normal directions alter the real PBR reflection as the view and environment change; a separate unperturbed clearcoat normal keeps the dome smoothly polished. There is no emission, transmission pass, transparent outer shell, GLSL injection, time uniform, animation callback or blink loop. Built-in Three.js physical shading is intentionally retained for shader compatibility and host material disposal.

This is an art-directed PBR approximation of play-of-color, **not spectral diffraction, volumetric ray tracing, measured opal optical constants or a guarantee of natural-stone photorealism**. The mixed-metalness subcoat is an appearance approximation for colored microfacet reflections, not a claim that opal is metallic. DLC/PVD are likewise finish approximations, not a laboratory BRDF or a specified commercial coating chemistry. Blue-black highlights may reflect the exhibit's cool studio; the metal albedos themselves are near neutral.

Each inlay group shares one stone geometry, one bezel geometry, two materials and two maps across all instances. Maps are normal `material.map` and `material.normalMap` properties, so the existing host traversal can discover them. No module-global GPU cache is retained. Dispose once per unique geometry/material/texture using Sets; also release instance buffers via the host's `InstancedMesh.dispose()` where supported. Separate calls own independent resources. Never dispose a cloned/shared material's maps while another live group still uses them.

## Saturn evidence and boundary

NASA identifies **A Full Sweep of Saturn's Rings** (PIA11142) as a natural-color mosaic, and describes the radial ordering C → B → Cassini division → A, with smaller gaps and an outer F ring.[1]

NASA's **Ringscape In Color** (PIA05421) is also described as natural color and specifically notes pronounced sandy bands in the B ring.[2]

These are natural-color references, **not a false-color compositional map**.[1][2]

The helper interprets those sources with independently varying smoky-grey, muted brown/sand and ivory bands, a comparatively translucent C zone, dense brighter B zone, a mostly open Cassini region with faint ringlets, and more neutral A zone. NASA explicitly cautions that the B ring's relative brightness changes when viewed from the unlit side.[1] Our standard opaque-lit PBR ring material does **not** model that transmission/backlighting inversion, ice-particle phase functions or multiple scattering.

The existing exhibit annulus is preserved rather than recalibrated. Numerical band positions, widths, gaps and albedos are authored display approximations; do not treat them as measured astronomical boundaries, calibrated photometry or a pixel-for-pixel NASA reconstruction. Narrow gaps are expanded enough to survive normal display sampling. D and F rings are omitted from this helper. `alpha=0` creates real visibility openings, not dark painted stripes; sparse Cassini ringlets have low nonzero alpha. Normal minification will soften subpixel bands.

`material-sources.json` retains source URLs and short quoted passages describing the natural-color references. The source images are reference-only and are not redistributed as runtime textures. The generated ring bands are original illustrations.

## Focused checks

```sh
node --test tests/exhibit-materials.test.js tests/saturn-rings.test.js
```

These tests check material parameter ranges, neutrality, batching, instance transforms, dome bounds, deterministic maps, blue/black coverage, domain variance, invalid input, independent ring chromaticities and true alpha gaps. Parameter and pixel checks do not certify integrated lighting, all mechanical clearances, visual quality or physical-device performance. The material maps remain discoverable through ordinary scene traversal for disposal.

## Sources

[1] https://science.nasa.gov/photojournal/a-full-sweep-of-saturns-rings — A Full Sweep of Saturn's Rings - NASA Science
[2] https://science.nasa.gov/photojournal/ringscape-in-color — Ringscape In Color - NASA Science
