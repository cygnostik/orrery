# Sunlight and Earth orientation

**Lights out** is an optional checkbox in the display controls. It works in both presentations and distance mappings, supports keyboard input, and defaults off on a new page. Unchecking it restores the existing exhibit lighting. Camera reset keeps the chosen lighting; reloading resets the session. The control is disabled if the renderer fails.

With Lights out enabled, the environment intensity and night fill are zero and the museum key/fill are hidden. The existing Sun point light still illuminates the planetary layer. The mechanism becomes a silhouette; it is not added to the Sun's six-face shadow pass. The ten existing moon meshes cast and receive ordinary shadows. Their original flags and the original Sun shadow settings return when Lights out is disabled.

Earth's globe follows the selected date in both lighting states. Only its existing surface tilt group is rotated. This is a free visual attitude, not a new mechanical transmission: supports, housings, mounting positions, gear keying, rates, moon motion, Saturn's rings and opal construction are unchanged.

## Approximate solar geography, 1800–2250

The supported interval is **1800-01-01 00:00:00 through 2250-01-01 00:00:00**, inclusive. The date picker selects noon, so its last selectable date remains 2249-12-31. The underlying calculation rejects dates outside this interval.

The original sunlight experiment used the USNO short solar formula. The current [USNO page](https://aa.usno.navy.mil/faq/sun_approx) states “about 1 arcminute within two centuries of 2000,” which is approximately 1800–2200, not 1800–2050. That quoted interval still does not cover 2250. Production therefore uses the lightweight Meeus-based equations in NOAA's **web** calculator rather than extrapolating the spike formula.

Sources:

- [NOAA calculation details](https://gml.noaa.gov/grad/solcalc/calcdetails.html): the web calculator can report years −2000 to +3000; its approximations are described as very good for 1800–2100 and sufficiently accurate for −1000 to +3000. NOAA also says the calculator is no longer actively maintained. These statements are not a quantified whole-scene error bound.
- [NOAA web implementation](https://gml.noaa.gov/grad/solcalc/main.js): mean solar longitude/anomaly, equation of center, eccentricity, apparent longitude, corrected obliquity, declination and equation of time. Orrery implements those equations without a new library or network request.
- NOAA's spreadsheet limit of 1901–2099 comes from its approximate Julian-day conversion. Orrery does not use that conversion: elapsed Gregorian milliseconds from J2000 give Julian centuries directly.

`src/earth-orientation.js` uses solar declination and equation of time to obtain approximate subsolar latitude and longitude. Longitude is east-positive and includes the full UTC time of day. UTC substitutes for UT1 and TT; historical timestamps are proleptic UTC, and future changes to leap seconds/Earth rotation are not predicted. The simplified apparent-longitude and obliquity corrections are retained, but this is not full nutation, polar motion, precession or precise time-scale conversion.

The orientation basis is adapted to the **actual displayed Earth-to-Sun direction**, including its height in Observatory. It therefore preserves approximate solar-relative geography despite the exhibit's geared/compressed orbits. It is not an inertial pole solution. No navigation, eclipse or observation-planning accuracy is claimed, including at the future endpoint.

The existing Earth image is north-up, with Greenwich at texture `u=.5`. In Three's sphere UV convention that is local +X; east 90° is −Z and north is +Y. The globe quaternion respects those axes. The procedural fallback is not georeferenced; the renderer diagnostics mark this if the Earth image fails to load. The inspector portrait remains an independent illustrative surface study.

## Shadow filtering and budget

The installed Three.js **0.185.1** point-light PCF implementation was inspected in `node_modules/three/src/renderers/shaders/ShaderChunk/shadowmap_pars_fragment.glsl.js`. `getPointShadow` uses five Vogel-disk samples, screen-space interleaved gradient noise and hardware linear comparison filtering. Its angular sample footprint is `shadowRadius / shadowMapSize.x`.

Lights out uses the close-body settings established by the sunlight experiment, with a small increase to the existing PCF footprint:

| Setting | Exhibit default | Lights out |
|---|---:|---:|
| Sun cube-map face | 512 × 512 | 512 × 512 |
| Sun depth bias | −0.0004 | 0 |
| Sun normal bias | 0.009 | 0.001 |
| PCF radius | 1 | 1.5 |
| Shadow camera near / far | 0.025 / 60 | 0.025 / 60 |

No shader replacement, extra samples, postprocessing, new shadow map, geometry, image, dependency or engine is added. Radius 1.5 slightly softens the coarse boundary but retains a dark shadow. This remains low-resolution point-light shadowing, not a physical solar penumbra. Enlarged globes, independent moon spacing and illustrative orbital planes make these model shadows unsuitable for eclipse timing, paths or lunar reddening.

## Verification

```sh
node --test tests/earth-orientation.test.js tests/state.test.js
node --test tests/sunlight.browser.js
```

The unit tests cover NOAA reference reconstruction at 1800, 2000, 2050, 2200 and 2250, range guards, UTC day/night, seasons, actual sphere UV axes, and inverse quaternion geography at different Sun bearings/heights. The numeric references were evaluated from NOAA's unmodified functions, not generated by Orrery's implementation. These are implementation comparisons, not independent high-precision ephemeris accuracy tests.

The browser check builds the normal production app and PWA into a temporary directory, then builds a separate instrumented fixture. It never overwrites shared `dist/`. Fixture source lives in `tests/fixtures/sunlight/`; no ignored evidence file is required on a clean checkout. Only that test build exposes scene handles and staged positions. The normal build is checked for the absence of those handles and controls.

Executed in Chromium 153.0.8010.12, WebGL2, ANGLE Metal on Apple M2 Max:

- Keyboard checkbox operation; both presentations; True distance; future date; moon visibility; camera reset; off/on restoration; 390px and 700px layouts; real WebGL context loss; disabled controls after selecting another body; reload recovery.
- Unchanged actual machinery transforms and geometry/material identities across the lighting toggle; unchanged drive and moon outputs.
- Staged shadow comparisons: radius 1 → 1.5 changed 2,332 pixels; Moon casting still changed 10,382 pixels; Moon receiving Earth's shadow changed 4,979 pixels. Threshold: RGB absolute-difference sum greater than 8.
- An additional date search uses untouched geared positions. Its ordinary Moon shadow changed 10,074 pixels. This is a demonstration of the display model, not an astronomical eclipse event.
- No browser errors/warnings. Vite retains its existing large-chunk advisory.

Local 1100 × 820, DPR 1 overview observations, 24 synchronous render + `gl.finish()` samples after 6 warm-up frames:

| State | Median / p95 ms | Draw calls | Triangles | Textures / geometries |
|---|---:|---:|---:|---:|
| Exhibit | 4.1 / 4.6 | 996 | 1,488,452 | 31 / 349 |
| Lights out | 3.4 / 3.9 | 690 | 1,105,288 | 31 / 349 |
| Exhibit restored | 3.9 / 4.4 | 996 | 1,488,452 | 31 / 349 |

These are short local draw-latency observations, not FPS guarantees or older-device results. Disabling the key-shadow pass offsets the additional moon casting, so this comparison does not isolate filtering cost. The PCF sample count stays unchanged. Safari, physical mobile hardware, long-duration thermal behavior and all possible date/view combinations are not established by this focused check.

Local visual evidence is written to `evidence/sunlight/`: `01-exhibit.png`, `02-lights-out.png`, the `03-narrow-*` views, `04-shadow-before-radius-1.png`, `05-shadow-after-radius-1.5.png`, `06-shadow-off.png`, `07-earth-shadow-on-moon.png`, `08-ordinary-geared-shadow.png`, and `observations.json`.