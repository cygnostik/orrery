# Schematic moons

`src/moons.js` contains ten companions: Earth's Moon, the four Galilean satellites, Enceladus, Titan, Miranda, Triton and Charon. It is **not a calibrated satellite ephemeris**. JPL explicitly warns that its mean satellite elements are not intended for ephemeris computation and directs accurate-position users to Horizons.[2]

## API and integration contract

```js
import { MOONS, MOON_MODEL, moonPositionAt } from './src/moons.js';
const offsetKm = moonPositionAt('europa', '2024-02-29T12:00:00Z');
// { x, y, z }; parent-centric physical km, arbitrary XY plane, z = 0.
```

- `MOONS` is a frozen array of frozen records, ordered `moon, io, europa, ganymede, callisto, enceladus, titan, miranda, triton, charon`. Fields: `id`, `parentId`, `name`, `radiusKm`, `orbitRadiusKm`, `periodDays`, `sourceUrl`, `fact`, `retrograde`.
- Parent families are Earth (Moon), Jupiter (Io, Europa, Ganymede, Callisto), Saturn (Enceladus, Titan), Uranus (Miranda), Neptune (Triton), Pluto (Charon). `sourceUrl` is the NASA page supporting the display fact; numerical provenance is separate below and in `moon-sources.json`.
- `retrograde` is true for Triton and reverses its **schematic** direction. NASA describes its real orbit as opposite Neptune's rotation; this flag does not implement the real plane or Neptune's spin axis.[13] False for the other records selects the demonstration's default positive rotation, not an inertial-frame orientation or spin-axis claim.
- `MOON_MODEL` and its nested range, phase map and limitations are frozen. The sole import is the local `SCIENCE` metadata; no third-party or browser dependencies are required.
- `MOON_MODEL.range` directly shares `SCIENCE.range`: **1800-01-01T00:00:00Z through 2050-01-01T00:00:00Z, inclusive**. This is an application guardrail, **not an accuracy interval for these schematic moons**.
- Inputs accept a finite `Date`, a `YYYY-MM-DD` string interpreted at UTC midnight, or a UTC ISO timestamp (`Z` or `+00:00`, optional seconds and one to three fractional-second digits). Numbers, missing dates and other types throw `TypeError`; unknown/case-mismatched IDs, invalid calendar dates, local/offset timestamps and out-of-range instants throw `RangeError`. No silent calendar normalization or clamping occurs.
- The position call is stateless and does not mutate its `Date`. Scrubbing forward and backward gives the same coordinates for the same instant; each call returns a fresh ordinary `{x,y,z}` object.

### Demonstration motion, not observed sky geometry

For stored radius `a`, stored period `P` in days and elapsed milliseconds `t` from `2000-01-01T12:00:00Z`, the module evaluates:

```text
turns = (t remainder (P × 86400000)) / (P × 86400000)
direction = retrograde ? -1 : 1
angle = illustrative initial phase + direction × 2π × turns
x = a × cos(angle); y = a × sin(angle); z = 0
```

Initial phases are **invented display choices**, not measurements: Moon 0°, Io 0°, Europa 90°, Ganymede 180°, Callisto 270°, Enceladus 45°, Titan 225°, Miranda 135°, Triton 45°, Charon 315°. Increasing time rotates from positive X toward positive Y except for Triton, which reverses that schematic direction. Negative elapsed times are supported. The epoch is merely a deterministic reference clock; these phases do not describe the real J2000 configuration or the actual configuration at any selected date.

We deliberately do **not** use the source's mean anomaly, node, argument of periapsis, eccentricity, inclination, frame orientation or precession terms. JPL's adopted rows include ecliptic, Laplace and equatorial frames; flattening this model must not be described as using those real orientations.[2]

There is no claim of actual sky position, ecliptic inclination, calibrated orbital resonance, surface rotation, lunar phase, eclipse, transit, occultation or libration prediction. Uniform motion omits eccentricity, precession and gravitational perturbations. The clock uses JavaScript UTC milliseconds and fixed-length days without UTC/TDB or light-time corrections. A precise mode would require separately retrieved, calibrated satellite ephemerides, not a more elaborate label on this demonstration. Saved Horizons calls use `MAKE_EPHEM=NO`: they retrieve descriptive object headers, not position vectors.

### Renderer integration

The returned distance units are **km**, not AU or world/display units. Keep real descriptors unchanged. A renderer may normalize this vector by `orbitRadiusKm` and apply explicitly exaggerated local display spacing around the rendered parent. Moon sphere sizes also require their own disclosed display scale. These local exhibition orbits are not to scale with planetary distances or physical sphere sizes.

An XY-to-scene-axis transform is purely a renderer convention, not an astronomical reference-frame transform. `science.js` uses the Earth–Moon barycenter for its Earth position; attaching this Earth-centered schematic Moon offset there does not turn the pair into a geocentric/heliocentric ephemeris. Do not add km directly to the planetary AU vectors.

**Pluto–Charon boundary:** both real bodies move around their shared barycenter.[20] Here Charon simply circles the rendered Pluto. This is **not actual Pluto–Charon barycentric dynamics**, and it does not render the mutual tidal locking described by the catalog fact. Charon is hidden when Pluto is hidden. Mechanical-mode moons inherit physical sleeve/arm mounts driven by the shared crank graph; see [lunar-mechanism.md](lunar-mechanism.md). Observatory retains the separate schematic circular calculation.

`createSatellites()` returns the existing `group`, `bodies`, `labels`, `update`, `addLabels`, `model` and `display` members, plus:

- `inspectionRadius(parentId)`: maximum `display.orbit + display.radius` for that family, in **local, unscaled display units**. Returns zero for absent families. Independent of current scale, phase or visibility; the renderer chooses whether moons are included and applies parent scale once. Parent-body/ring extent is combined by the renderer, not this function.
- `inspectionTarget(moonId)`: a fresh `{position: THREE.Vector3, radius}` in **world space**, using the moon mesh's `getWorldPosition` and `getWorldScale`. Radius includes the largest absolute world-scale component (a conservative sphere if nonuniformly scaled). Returns null before the first update, for unknown IDs, or when the moon, parent, or their ancestors are hidden or the parent is absent. The parent visibility is rechecked when queried, not just at update time.

`update(date, planets, state)` uses the application's shared date, with no second animation clock. Each moon follows its displayed parent's position and uniform local scale; guide circles and labels appear only for the selected parent family. `moons: false` hides every moon, guide and label. The existing scene places parents and the companion group in the same untransformed scene coordinate space; this is not a general nested-parent orbital transform API. All geometries, materials and textures remain reachable by scene traversal for disposal. Nothing is allocated on date/selection/toggle cycles beyond temporary coordinate objects.

## Adopted physical descriptors

`radiusKm` means **volume-equivalent mean radius**: JPL defines it as the radius of a sphere having the satellite's volume, not equatorial radius or diameter.[1] `orbitRadiusKm` takes JPL's semi-major axis `a` in km and reuses it as the *constant* radius of a model circle.[2] `periodDays` uses the table's `P (days)`, defined there as sidereal period, subject to the cross-check/rounding decisions below.[2]

| ID | Parent | Mean radius (km) | Semi-major axis / model radius (km) | Adopted P (days) | Evidence |
|---|---|---:|---:|---:|---|
| moon | earth | 1737.4 | 384400 | 27.322 | [1][2] |
| io | jupiter | 1821.49 | 421800 | approximately 1.77 | [1][2][7] |
| europa | jupiter | 1560.80 | 671100 | approximately 3.55 | [1][2][8] |
| ganymede | jupiter | 2631.20 | 1070400 | 7.155588 | [1][2] |
| callisto | jupiter | 2410.30 | 1882700 | 16.690440 | [1][2] |
| enceladus | saturn | 252.10 | 238400 | 1.370218 | [1][2][14] |
| titan | saturn | 2574.76 | 1221900 | approximately 15.9454 | [1][2][15] |
| miranda | uranus | 235.8 | 129846 | approximately 1.413 | [1][2][16] |
| triton | neptune | 1352.60 | 354800 | 5.876994 | [1][2][17] |
| charon | pluto | 606.0 | 19600 | 6.387222 | [1][2][18] |

**Contradictory period evidence:** the retrieved JPL mean-element table labels Io `1.762732` and Europa `3.525463` as P, but the separately retrieved Horizons object headers give approximately `1.77 d` and `3.55 d`.[2][7][8] The demonstration deliberately adopts the rounded Horizons values for those two bodies rather than displaying unsupported fine precision. The discrepancy is unresolved; no cause is asserted. The literal table rows remain in `tests/fixtures/moons/parameters.json`; `tests/fixtures/moons/adopted-periods.json` records the chosen values and short header excerpts. Closure tests verify adopted demonstration rates, not calibrated ephemerides.

**Period cross-checks:** Enceladus, Triton and Charon have header values `1.370218`, `5.876994`, and `6.387222` days respectively.[14][17][18]

Their table rows agree; matching digits are descriptive source values, not an accuracy certification.[2]

Titan's table gives `15.945448` days; its Horizons header gives `15.945421` days.[2][15] We adopt **15.9454**, the common value rounded to four decimal places, rather than choosing conflicting final digits. NASA's educational “15 days and 22 hours” is a coarser presentation, not support for those fine digits.[11]

Miranda's table gives `1.413479` days and its header `1.413 d`; we adopt **1.413** days, the common three-decimal rounding.[2][16]

NASA also gives Enceladus as 32.9 hours and Charon as 6.4 Earth days; those educational values are retained as coarse checks, not substituted into the matching JPL descriptors.[9][10]

**Other source differences, not silently merged:** the Enceladus header has mean radius `252.3 ± 0.6 km` and axis `238.04(10^3) km`, while the adopted tables have `252.10 ± 0.20 km` and `238400 km`.[1][2][14]

Titan's header has `2575.5 ± 2.0 km` and `1221.87 (10^3) km`, while the tables have `2574.76 ± 0.02 km` and `1221900 km`.[1][2][15]

The radius ranges overlap, but the axis descriptions differ; we retain the table central values and assert no cause for the differences.

Miranda's header reports three shape radii (`240x234.2x232.9 km`), not the adopted volume-equivalent mean radius, and an IAU-pole equatorial inclination of `175.78°`; the table lists `4.4°`.[1][2][16] We do not substitute one radius definition for the other or infer an orbital-plane transform from these angles. Only Triton's explicitly sourced retrograde classification controls a reversed schematic direction.[13]

**Units and radius-definition check:** the two numerical source tables explicitly label radii/axes in km and periods in days; no mile conversion or radius/diameter substitution is applied.[1][2]
NASA's general Moon article instead rounds the radius to “about” 1,740 kilometers; it is a rounded educational value, not the adopted JPL mean-radius precision.[4]
The Moon article's rounded orbital timing is not substituted for the JPL sidereal-period field.[2][4]
No contradictory units or radius definitions were found in the adopted table columns. The quoted source rows retain the published radius uncertainties and reference columns; the runtime records use central values only.[1]

## Display facts

- **Moon:** The Moon rotates at the same rate that it revolves around Earth, keeping the same hemisphere facing Earth.[4]
- **Io:** Io is the most volcanically active world in our solar system.[3]
- **Europa:** Europa is about 90% the size of Earth's Moon.[3]
- **Ganymede:** Ganymede is the largest moon in our solar system, even bigger than Mercury.[3]
- **Callisto:** Callisto is Jupiter's second largest moon and the third largest moon in our solar system.[3]
- **Enceladus:** Enceladus sprays water vapor and ice particles into space from its icy surface.[9]
- **Titan:** Titan's surface is completely obscured by a golden hazy atmosphere.[11]
- **Miranda:** Miranda has lightly cratered ridges and valleys beside more heavily cratered terrain.[12]
- **Triton:** Triton orbits Neptune in the opposite direction to the planet's rotation—a retrograde orbit.[13]
- **Charon:** Charon and Pluto always show the same surfaces to each other: mutual tidal locking.[10]

The catalog avoids changing total moon counts. The adopted Io/Europa periods are supported by descriptive Horizons header excerpts, not by satellite position vectors or a calibrated resonance model.[7][8]

## Authored surfaces and exhibition scales

Each moon has a deterministic original procedural texture; pixels, hues, feature dimensions and placement are artistic choices, not calibrated maps or true-color measurements. Surface palettes describe specimens, not new ProDyn brand roles. Labels use the OFL-licensed Departure Mono font.

| Body | Evidenced inspiration | Authored treatment and boundary |
|---|---|---|
| Enceladus | Bright reflective ice; long linear fractures near the south pole.[9][19] | Bright ice with four exaggerated curving fracture cues in texture south. No measured fracture coordinates, plume geometry or activity clock. |
| Titan | Golden haze completely obscuring the surface.[11] | Smooth golden sphere depicts the opaque haze envelope, not exposed ground; no calibrated atmosphere thickness or scattering. |
| Miranda | Contrasting cratered terrain, ridges and valleys with sharp boundaries.[12] | Scarred gray terrain with angular ridge patches; deliberately emblematic, not a georeferenced corona map. |
| Triton | Nitrogen condensed as surface frost.[13] | Low-contrast, muted pale frost illustration; no seasonal frost extent or plume prediction. |
| Charon | Reddish north polar region.[10] | Dark reddish cap; darkness, boundary and color are authored, not measured reflectance or real viewing orientation. |

All ten authored maps use the spherical detail recipe in [moon-surfaces.md](moon-surfaces.md). Native DataTexture low-v rows are the sphere's south, high-v rows its north. These are **texture-space** poles, not an alignment with any actual rotation axis. Users can orbit the inspection camera to see the whole authored specimen.

Display `(orbit, sphere radius)` pairs: Enceladus `(1.78, 0.09)`, Titan `(2.26, 0.15)`, Miranda `(0.86, 0.09)`, Triton `(0.92, 0.12)`, Charon `(0.53, 0.10)`. These are unitless exhibition choices, independently exaggerated, and do not preserve physical ratios. Both Saturn companions clear the visible ring geometry even including their sphere radii. This clearance is a display choice: the real Enceladus completes its orbit within Saturn's E ring, not outside all Saturnian ring material.[9]

## Source fixtures and tests

- `docs/moon-sources.json`: stable source identifiers, official URLs and short verbatim quotations. Unused source-number gaps are intentional.
- `tests/fixtures/moons/jpl-physical.txt`, `jpl-elements.txt`, `jpl-elements-expansion.txt`: selected literal table rows, units, radius definition and the ephemeris warning.
- `tests/fixtures/moons/parameters.json`, `expansion-parameters.json`: all ten catalog records, exact fact/feature quotations, source references and period comparisons.
- `tests/fixtures/moons/adopted-periods.json`: the explicit Io/Europa period choices.
- The small `nasa-*.txt` and `*-horizons-header.txt` fixtures contain attributed excerpts only, not complete articles or API responses. `sources.json` maps the original catalog's four supporting sources to those excerpts.

```sh
node --test tests/moons.test.js tests/satellite-expansion.test.js
node scripts/public-fixtures.mjs
```

Tests cover ten-record immutability, exact quote/row/fact chains, adopted periods, input dates, reverse Triton motion, family visibility, individual world-space inspection targets, local family extents, ring clearance and resource ownership across repeated updates. Circular-motion assertions allow the angular travel in one millisecond plus floating-point noise because `Date` cannot represent fractional milliseconds. These are model-contract checks, **not comparisons against observed satellite positions**.

NASA/JPL numeric data and short quoted excerpts retain their source attribution. Complete source documents remain with their publishers at the URLs below; they are not bundled as public research captures.

## Sources

[1] https://ssd.jpl.nasa.gov/sats/phys_par — Planetary Satellite Physical Parameters
[2] https://ssd.jpl.nasa.gov/sats/elem — Planetary Satellite Mean Elements
[3] https://science.nasa.gov/jupiter/jupiter-moons — Jupiter Moons
[4] https://science.nasa.gov/moon/facts — Moon Facts - NASA Science
[7] https://ssd.jpl.nasa.gov/api/horizons.api?format=text&MAKE_EPHEM=NO&COMMAND=501
[8] https://ssd.jpl.nasa.gov/api/horizons.api?format=text&MAKE_EPHEM=NO&COMMAND=502
[9] https://science.nasa.gov/saturn/moons/enceladus
[10] https://science.nasa.gov/dwarf-planets/pluto/moons/charon
[11] https://science.nasa.gov/saturn/moons/titan/facts
[12] https://science.nasa.gov/uranus/moons/miranda
[13] https://science.nasa.gov/neptune/moons/triton
[14] https://ssd.jpl.nasa.gov/api/horizons.api?format=text&MAKE_EPHEM=NO&COMMAND=602
[15] https://ssd.jpl.nasa.gov/api/horizons.api?format=text&MAKE_EPHEM=NO&COMMAND=606
[16] https://ssd.jpl.nasa.gov/api/horizons.api?format=text&MAKE_EPHEM=NO&COMMAND=705
[17] https://ssd.jpl.nasa.gov/api/horizons.api?format=text&MAKE_EPHEM=NO&COMMAND=801
[18] https://ssd.jpl.nasa.gov/api/horizons.api?format=text&MAKE_EPHEM=NO&COMMAND=901
[19] https://science.nasa.gov/photojournal/tiger-stripes-on-enceladus-fracture-zones-and-plumes-sources
[20] https://science.nasa.gov/photojournal/pluto-and-charon-in-color-barycentric-view-animation
