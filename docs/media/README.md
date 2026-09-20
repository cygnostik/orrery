# Orrery release media

These images show the actual Orrery renderer, paused at **2026-09-05, 12:00 UTC**. The instrument geometry, lighting, materials, planetary maps and reflection come from the application. Social layouts add type around a captured frame; icons use a circular crop of the real top-down mechanism.

## Regenerate

Install the project's dependencies and start a production preview. Then run from the repository root:

```sh
ORRERY_URL=http://127.0.0.1:5198/ node scripts/release-media.mjs
```

`ORRERY_BROWSER` optionally supplies an absolute path to a Chromium-family executable. Without it, the script looks for Playwright Chromium and common Chrome/Edge installations. No image-processing package, font service or external design checkout is needed. The exporter uses the existing local Oxanium and Departure Mono WOFF2 files and `public/assets/tokens.css`.

The script does not build, deploy, or modify the source application. It overwrites only the image files listed below and `evidence/release-media.json`. The browser receives temporary capture-only DOM styling for isolated views; the UI screenshots retain the application's layout. Selection and camera changes use the real application controls. Browser/GPU differences can affect rasterization, so reproducibility means the same scene, date, framing and export dimensions, not byte-identical output across machines.

## Files

| File | Pixels | Use |
|---|---:|---|
| `public/social/orrery-card.jpg` | 1200 × 630 | Primary Open Graph / social preview |
| `public/social/orrery-card.png` | 1200 × 630 | Lossless version |
| `public/social/orrery-square.png` | 1080 × 1080 | Square release card |
| `public/icons/icon-192.png` | 192 × 192 | PWA icon |
| `public/icons/icon-512.png` | 512 × 512 | PWA icon |
| `public/icons/maskable-512.png` | 512 × 512 | Android maskable icon |
| `public/icons/apple-touch-icon.png` | 180 × 180 | Apple touch icon |
| `public/icons/favicon-32.png` | 32 × 32 | Browser favicon |
| `public/icons/favicon-16.png` | 16 × 16 | Small browser favicon |
| `public/screenshots/desktop.png` | 1440 × 1000 | Desktop PWA screenshot, actual first viewport |
| `public/screenshots/mobile.png` | 390 × 844 | Mobile PWA screenshot, actual first viewport |
| `docs/media/hero.png` | 1600 × 1000 | README application overview |
| `docs/media/mechanism.png` | 1200 × 750 | Gear-bank close-up |
| `docs/media/saturn.png` | 1200 × 750 | Saturn, ring bands and moon supports |
| `docs/media/mobile.png` | 390 × 844 | README mobile view |

The maskable icon keeps all non-background pixels inside a centered circle with radius 40% of the image width. Its artwork radius is 37%, leaving room for antialiasing inside the standard safe area. Favicons apply mild exposure compensation before reduction; no replacement logo or synthetic machine geometry is drawn.

The macro views intentionally crop surrounding machinery. UI screenshots show the first viewport rather than the full scrolling application. Neither includes browser or operating-system chrome. The 16-pixel favicon preserves the circular hub silhouette, not individual gear teeth.

## Verification

```sh
node --test tests/release-media.test.js
```

Each export run also verifies actual WebGL2 rendering, nonzero draw calls and triangles, no texture fallback, a fixed paused date, no horizontal overflow, custom font glyph rendering, image decoding, exact dimensions, opaque pixels, nonblank content, and the maskable circular safe area. Social framing checks project the original instrument vertices and live-renderer planet/moon positions through the captured camera, enforcing at least 32 pixels of edge clearance. Source geometry is checked against the live planet mounts. Browser errors and failed requests cause failure. The ignored evidence report holds the measurements; visual-review status resets to pending on regeneration so an earlier review cannot approve new pixels silently.

## Credits and image rights

**Orrery v0.6.0-beta.1 by ProDyn.ai**

Made by **Promethean Dynamic Nerdiness**. Powered by **[TrustEdge.gt](https://TrustEdge.gt/)** Engineered Infrastructure.

Planet and Sun maps: **[Solar System Scope](https://www.solarsystemscope.com/textures/)**, licensed **[Creative Commons Attribution 4.0 International](https://creativecommons.org/licenses/by/4.0/)**. These release images are derivatives: Orrery applies spherical mapping, authored lighting, material rendering and perspective; this export adds framing, cropping, downsampling and, on social cards, typography. Source maps are artistic imagery-derived maps, not live or calibrated observations. Solar System Scope does not endorse Orrery. Preserve this attribution when redistributing these images. See [`public/licenses/SolarSystemScope.txt`](../../public/licenses/SolarSystemScope.txt).

Oxanium and Departure Mono are used under the SIL Open Font License 1.1; notices are in [`public/licenses/`](../../public/licenses/). PP Neue Machina is not used. Interface and card styling follow the ProDyn / Threadline DSM 2.2 roles. The application's MIT license does not replace the texture attribution or font-license requirements.
