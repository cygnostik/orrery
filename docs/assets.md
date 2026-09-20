# Assets and licenses

## Original work
- Cool-metal mechanism, gears, base geometry, engraved surfaces, nebula band and ten moon surface illustrations are generated locally by the Orrery source. They are artistic materials, not photographs, calibrated star imagery or engineering drawings.
- `public/assets/portraits/{mercury,venus,earth,mars,jupiter,saturn,uranus,neptune}.png` are derived from the existing Solar System Scope maps, under the same CC BY 4.0 attribution. `scripts/generate-portraits.mjs` applies a static spherical projection and authored lighting. These are reference specimens, not date-specific views. Pluto's portrait is original illustrated SVG; no new external asset or private reference image is redistributed.
- Footer CSS and the selected-body signal are ProDyn design adaptations included in the MIT-licensed project source. Footer playback, visibility and reduced-motion behavior is managed by `src/footer-motion.js`; scoped layout rules are in `src/museum.css`.
- Original procedural geometry, materials and moon-surface code are covered by the project MIT License.
- The displayed Sun uses original, deterministic spherical granulation baked once into its existing 512×256 texture. It is an authored illustration, not a photograph or live solar observation. `src/sun-surface.js` adds no downloaded imagery or per-frame surface calculation. The bundled Solar System Scope Sun map retains its separate attribution even though it is not used on this globe.

## Third-party and brand assets
- ProDyn CSS included here is MIT licensed as part of Orrery. This is not a license to other design-system material. The ProDyn logo is retained for the project's attribution; names and marks do not confer endorsement or trademark rights.
- Oxanium and Departure Mono: self-hosted WOFF2 from canonical DSM; SIL OFL notices in `public/licenses/`. PP Neue Machina is excluded.
- Three.js 0.185.1: MIT; its complete notice accompanies the web build in `public/licenses/Threejs-MIT.txt`.
- Rendering materials: original procedural geometry/textures are illustrative and not scientific photographic maps. Additional renderer asset details live in `docs/renderer.md`.
- Science: official NASA/JPL provenance and limitations in `docs/science.md` and each runtime body's source link. Focused reference fixtures support regression tests; full downloaded research pages are not part of the release.

## Screenshots, social cards and app icons

`docs/media/`, `public/social/`, `public/screenshots/` and `public/icons/` are captures and compositions of the actual Orrery renderer, not photographs or a separate rendition of the machine. Their planet/Sun imagery derives from Solar System Scope maps, with spherical mapping, authored lighting, framing, cropping and typography. Retain the [CC BY 4.0 attribution](../public/licenses/SolarSystemScope.txt) when reusing imagery-derived portions. The original code license does not override those image rights.

See [complete credits](../public/licenses/NOTICE.txt), [MIT License](../LICENSE), and the separate font and texture notices in `public/licenses/`.
