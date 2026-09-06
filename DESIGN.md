# Orrery design

Interface foundation: ProDyn DSM 2.2. Semantic color, spacing and typography roles come from `public/assets/tokens.css`.

## Experience
Orrery is an interactive exhibition instrument for exploring planetary motion. Titanium/platinum/steel clockwork, exposed toothed gears, glass, turned pillars and an engraved black-gloss plinth frame the specimen. Planet supports are continuous slender black-PVD twin bars; the lower central gear cluster remains visible. A horizontal shaft connects the rim crank to a compact 1:1 miter pair. Obsidian and restrained blue Nebula glass are selectable finishes. The Orrery heading and ProDyn.ai logo sit in a slender masthead; controls operate the shared simulation rather than decorative telemetry.

Two modes share the same date and selection, but deliberately use different motion models:
- Mechanical: the crank drives a connected compound gear train, hollow output sleeves and their attached planet arms. Actual arm-end world transforms position the planets. Uniform mean motion uses finite tooth-count ratios and J2000 indexing, not independent ephemeris animation. Kinematic construction is tested; this is not manufacturing-validated CAD.
- Observatory: mechanism disappears. View real orbital geometry with a clearly labeled compressed display and optional true distance mapping. Body sizes enlarged for visibility; planetary surfaces illustrative when not sourced imagery.

Astronomical surface/material colors are representational scene data, separate from brand UI roles. The Three.js experience has an informative static fallback. Footer atmosphere follows playback, visibility and reduced-motion preferences; selection uses a finite SVG response. The Observatory star field is decorative, not a live catalogue.

## Interaction
Select a planet → inspect its sourced properties and position; drag/zoom to explore; play/pause and change simulation speed/date; toggle Pluto; switch physical/scientific presentation; reset view. Simulation and camera motion have separate ownership. Reduced preference pauses simulation and removes camera interpolation. No sound.

Actual side crank plus accessible DOM dial, keyboard and quarter-turn alternatives drive that same date (30 days/revolution), disengaging auto on winding. The physical and DOM flip switches share the Play state. Ten optional moon companions expose sourced descriptors and individual Inspect actions: Moon, Io, Europa, Ganymede, Callisto, Enceladus, Titan, Miranda, Triton and Charon. In Mechanical, all ten inherit crank-driven local sleeve/arm mounts. Separate shafts and enclosed lunar reductions are kinematic constraints; internal gears are not rendered or fitted inside the smooth supports. Observatory uses separate circular schematic positions. Initial phases/planes, local spacing and body sizes are illustrative in both presentations. Charon follows Pluto visibility. Inspect pauses before framing; hiding inspected moons returns to the parent. See `docs/moons.md`, `docs/mechanical-drive.md` and `docs/renderer.md` for the contracts and limits.

Selection changes an actual surface/cloud specimen portrait, with Saturn ring framing, Uranus axis framing and an explicitly illustrated Pluto, replacing the shared wireframe. Reference obliquity/eccentricity and a selected transmission path provide meaningful detail. Desktop inspector content scrolls within the stage height; narrow layouts retain an ordinary document flow. Planet portraits and moon descriptions remain useful without WebGL.

## Asset rights
Oxanium and Departure Mono retain their OFL notices. Planetary texture attribution, the ProDyn logo and third-party rights are documented in [docs/assets.md](docs/assets.md). Scientific references retain source URLs, short quotations and numeric fixtures; complete downloaded articles are not bundled. A code license does not override third-party asset rights.

## Integration contract
Science module src/science.js exports:
- BODIES: array ordered Mercury through Pluto, objects {id,name,kind,aAU,eccentricity,inclinationDeg,radiusKm,periodDays,tiltDeg,fact,sourceUrl}. IDs lowercase. Pluto kind dwarf-planet. Eight major planets kind planet.
- positionAt(id, date): {x,y,z,radiusAU,longitudeDeg} in J2000 ecliptic heliocentric AU. Date JS Date or UTC ISO; x toward equinox, y in ecliptic plane, z north. Supported 1800-01-01 through 2050-01-01 at UTC midnight inclusive; last full date selectable at noon is 2049-12-31. This conservative application boundary follows SCIENCE.range. Invalid inputs throw.
- orbitPoints(id,date,count=180): array of {x,y,z} AU, same frame; one full orbit at date's elements, count+1 points closed.
- SCIENCE: {model,range,sourceUrl,limitations} metadata.

Renderer module src/scene.js exports async createOrrery({container,onSelect,onError,onManualTurn,onAutoToggle}) returning:
- update({date:Date,mode:'mechanical'|'observatory',selected:string,pluto:boolean,moons:boolean,baseStyle:'nebula'|'obsidian',playing:boolean,scale:'display'|'distance',labels:boolean}) updates semantic scene state, no independent simulation clock.
- render(dtSeconds) render current scene; controls.update if applicable.
- resize(); resetView(view='home'|'top'); focusBody(id); focusMoon(id); dispose(); diagnostics() returns at least {ready,revision,backend,mode,bodyCount,moonCount,drawCalls,triangles,geometries,textures}.
- optionally projectLabels() → [{id,x,y,visible}] CSS container coordinates (main owns label DOM).
Renderer owns camera/OrbitControls/resources but not rAF. Main owns exactly one rAF loop and pauses simulation when hidden/reduced. Container #universe; scene canvas exclusively within it. Main imports science for inspector; scene imports science for transforms. No imports from main.
