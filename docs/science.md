# Orrery science module

**Presentation boundary:** this astronomical module drives Observatory and the clearly labeled astronomical reference readout. Mechanical planet positions instead come from the connected transmission described in [mechanical-drive.md](mechanical-drive.md): uniform mean motion, finite rational tooth ratios, constant J2000 indexing and compressed fixed arm lengths. It is not an alternate drawing of the same ephemeris. Moon overlays are separately schematic; see [moons.md](moons.md).

## Contract and scope

`src/science.js` is dependency-free browser ESM. It exports `BODIES`, `positionAt(id, date)`, `orbitPoints(id, date, count = 180)`, and `SCIENCE`. There is no runtime network request, renderer scale, simulation clock, texture, or UI dependency.

`SCIENCE.range` is `{start: '1800-01-01', end: '2250-01-01'}`. Endpoints mean **UTC midnight, inclusive**. This is an application interval inside JPL's published **3000 BC–3000 AD** long-range fit, not an extrapolation of the 1800–2050 short-range fit.[18][19] The calendar input selects noon, so its last full selectable date is 2249-12-31; playback and the crank can reach 2250-01-01T00:00:00Z. There is no date-dependent model switch.

- `BODIES`: nine frozen records, Mercury through optional Pluto; eight `planet` records and one `dwarf-planet`. Descriptors are reference values, not evolving orbital elements. `sourceUrl` supports the **fact**; numerical field provenance is below.
- `positionAt`: `{x,y,z,radiusAU,longitudeDeg}`. Distances are AU; longitude is normalized to `[0,360)`. The frame is heliocentric, mean ecliptic/equinox J2000: x toward the equinox, y in the ecliptic, z north.[1]
- **Earth means the Earth–Moon barycenter**, not the geocenter, even though the inspector's physical radius and fact describe Earth.[1] Optional Pluto uses the original chapter’s long-range fit and quadratic mean-anomaly term.[18]
- Inputs are a finite `Date`, `YYYY-MM-DD`, or a four-digit-year UTC ISO timestamp ending in `Z` or `+00:00`; seconds are optional, fractional seconds support one to three digits. Non-UTC offsets, local-time strings, impossible dates, unknown/case-mismatched IDs, and out-of-range dates throw. Input `Date` objects are not mutated. A `Date` already normalized by its caller cannot reveal its original invalid text.
- `orbitPoints` returns exactly `count + 1` `{x,y,z}` objects, with a copied closing endpoint. Integer counts must be 3–10,000. Sampling is uniform in **eccentric anomaly**, not elapsed time. It is an ellipse at the requested date's fitted elements, not a future integrated trajectory.

## Model and numerical implementation

The eight planets use JPL's current **Tables 2a and 2b** throughout the supported interval.[19] The original JPL-hosted chapter, **Tables 8.10.3 and 8.10.4, printed page 28**, supplies the identical eight rows plus Pluto.[18] The current HTML explicitly says, “The former planet Pluto has also been removed.”[1] `tests/fixtures/science/long-range-elements.json` retains all nine base/rate pairs and the additional mean-anomaly terms. The eight planetary pairs and four HTML correction rows were cross-checked against the chapter. Bounded literal rows from both sources accompany the numeric fixtures.

The model advances six elements linearly with `T = (JD - 2451545.0) / 36525`, then computes mean anomaly in degrees:

```text
M = L - longitudeOfPerihelion + b*T*T + c*cos(f*T) + s*sin(f*T)
```

Here `f*T` is in **degrees**, converted to radians before calling JavaScript trigonometric functions. The inner four bodies have no additional terms. Jupiter through Neptune use all four Table 2b values. Pluto has `b = -0.01262724` degrees/century²; the chapter's blank `c`, `s`, and `f` entries contribute zero.[18] These terms modify the position along the ellipse, not the sampled ellipse's orientation or shape.

The solver wraps mean anomaly, solves `M = E - e sin(E)`, constructs the orbital-plane ellipse, and rotates into J2000 ecliptic coordinates.[1] The source's eccentricity column has a misleading “rad” label; eccentricity is dimensionless in the equations and is **not converted to radians**.[18][19] Tests reconstruct positions from the source fixture using bisection and a polar-coordinate transform, independently of the production Newton/cartesian implementation.

Production Newton iteration uses a `1e-13` radian correction threshold and a 20-iteration guard. Numerical convergence is much tighter than the astronomical approximation; it is not an accuracy claim about the sky.

**Time-scale simplification:** JPL requires a dynamical Julian date (JDTDB), not UTC.[1] This module uses JavaScript UTC milliseconds as an approximate dynamical epoch. It omits leap seconds, UTC→TT/TDB conversion, light travel time, apparent-position corrections, and Earth–Moon geocenter displacement. The independent fixtures intentionally query **the same numerical Julian date in TDB**; they validate the orbit implementation, not the omitted UTC→TDB conversion. Historical UTC dates are proleptic calendar labels, not a reconstruction of historical timekeeping.

## Physical descriptors

`aAU`, `eccentricity`, and `inclinationDeg` remain the original Table 1 / chapter 8.10.2 J2000 reference descriptors.[1][12] They are deliberately separate from the long-range solver: renderer scale, framing, and inspector values must not change with a coefficient refit. `elements.json` and source excerpts 01/12 remain as **historical descriptor/keying provenance**, not active orbital coefficients. Only three fixed descriptor values per body remain at runtime; there is no second propagated model.

The mechanical train retains its original signed `atan2(y,x)` mounting constants captured from the former `positionAt` at J2000 noon. `drive-train.js` now stores those constants explicitly rather than re-keying arms from the active astronomy model. `mechanical-j2000.json` records the pre-change longitudes, angles and descriptors; the unchanged `crank-layout.test.js` numeric fixtures protect all planetary/lunar rates and sampled motion. Tooth counts, periods, crank calibration and lunar keying are unchanged.

`radiusKm` is JPL's **volume-equivalent mean radius**, not equatorial radius; the source defines it as “Radius of a sphere with the equivalent volume of the planet.”[2] `periodDays` is the source's sidereal orbital period in years multiplied by **365.25 days per Julian year** as an explicit application unit convention.[2] These fixed periods describe the body; the solver advances the fitted longitude rates instead of using `periodDays`.

| Body | Mean radius, km | Sidereal period, days (display rounding) | Tilt, degrees | Radius / period source | Tilt source |
|---|---:|---:|---:|---|---|
| Mercury | 2439.4 | 87.96926 | 0.03517 | [2] | [13] |
| Venus | 6051.8 | 224.70080 | 177.3 | [2] | [14] |
| Earth | 6371.0084 | 365.25636 | 23.4 | [2] | [5] |
| Mars | 3389.50 | 686.97959 | 25 | [2] | [6] |
| Jupiter | 69911 | 4332.82013 | 3 | [2] | [7] |
| Saturn | 58232 | 10755.69864 | 26.73 | [2] | [8] |
| Uranus | 25362 | 30687.15300 | 97.77 | [2] | [9] |
| Neptune | 24622 | 60190.02963 | 28 | [2] | [10] |
| Pluto | 1188.3 | 90553.01741 | approximately 123 | [2] | [11] |

Digits retained from a source do not imply those quantities are known exactly. Radius uncertainties remain in `tests/fixtures/science/physical.json`'s source rows; a renderer should not present all decimal places as measurement precision.

### Conflicting or simplified source statements

- **Mercury:** NASA's popular page says “tilted just 2 degrees”; the JPL Horizons physical header says `Obliquity to orbit[1] = 2.11' +/- 0.1'`.[3][13] The module uses the latter's arcminutes, converted as `2.11 / 60` degrees. It does not silently propagate the popular page's degree/arcminute discrepancy.
- **Venus:** NASA's popular page calls its tilt “only three degrees”; the Horizons header gives `177.3 deg`.[4][14] The module uses the latter, preserving retrograde obliquity rather than a small unsigned departure from an upright axis.
- **Pluto:** NASA gives “tilted 57 degrees” and states retrograde rotation.[11] The descriptor uses the explicitly derived, coarse retrograde convention `180 - 57 = 123` degrees. This is not an independently fitted spin pole or precision obliquity, and the popular page's plane/axis wording is imprecise. Do not use it to claim a quantitatively accurate spin-axis orientation.
- **Pluto period:** the JPL physical table gives `247.92065` years, while the current Horizons physical header gives `249.58932 yr`.[2][15] The module consistently uses the physical table for all fixed period descriptors; these reference periods must not be conflated with an exact repeat time or the fitted longitude-rate period. The discrepancy is retained, not averaged away.

## Short facts and their atomic support

Each runtime record links to its NASA fact page; these paraphrases avoid changing moon counts and other rapidly changing descriptors.

- Mercury is the smallest planet and nearest the Sun.[3]
- Venus is the hottest planet in the solar system.[4]
- Earth is the only place known to be inhabited by living things.[5]
- Mars hosts Olympus Mons, the largest volcano in the solar system.[6]
- Jupiter is the largest planet.[7]
- Saturn is the only planet with an average density less than water.[8]
- Uranus appears to spin sideways, with its equator nearly perpendicular to its orbit.[9]
- Neptune was first located through mathematical predictions rather than regular sky observations.[10]
- Charon hovers over the same spot on Pluto's surface.[11]

`science-sources.json` contains source identities, short quotations and claim mappings. Each `quoteIndex` is a zero-based index into its source's `quotes` array. Evidence paths identify bounded excerpts under `tests/fixtures/science/`. A matching quotation establishes wording, not that every popular source is error-free.

## Accuracy: source claims versus observed verification

JPL lists the following **nominal long-range model errors** (the 3000 BC–3000 AD columns), not guarantees for every date or a confidence interval.[1][12]

| Body | Longitude, arcsec | Latitude, arcsec | Distance, 1000 km |
|---|---:|---:|---:|
| Mercury | 20 | 15 | 1 |
| Venus | 40 | 30 | 8 |
| Earth–Moon barycenter | 40 | 15 | 15 |
| Mars | 100 | 40 | 30 |
| Jupiter | 600 | 100 | 1000 |
| Saturn | 1000 | 100 | 4000 |
| Uranus | 2000 | 30 | 8000 |
| Neptune | 400 | 15 | 4000 |
| Pluto (original chapter only) | 400 | 100 | 2500 |

**Independent checks:** ten real Horizons epochs per body were fetched for target `3` (Earth–Moon barycenter) and target `9` (Pluto-system barycenter), centered on `500@10` (Sun), `REF_PLANE=ECLIPTIC`, `REF_SYSTEM=ICRF`, `VEC_CORR=NONE`, `TIME_TYPE=TDB`, and AU/day units; the responses identify DE441.[16][17][20][21] Dates are 1800-01-01, 1900-01-01, J2000 noon, 2026-09-05, 2049-12-31, 2050-01-01, 2100-01-01, 2200-01-01, 2249-12-31, and 2250-01-01. The six historical rows per body were re-fetched and matched the retained fixtures exactly; four extended-range epochs per body are in `horizons-extended-vectors.json`. Selected target/center/frame lines, literal vector rows and exact query URLs are retained under `tests/fixtures/science/`. These are independently integrated Horizons outputs, not generated expected values from the implemented formula.

Discrepancies against those fixtures (recompute with `node scripts/public-fixtures.mjs`):

| Body | Samples | Largest 3D discrepancy, AU | Largest radial discrepancy, AU | Largest angular separation, arcsec |
|---|---:|---:|---:|---:|
| Earth–Moon barycenter | 10 | 0.00011360585570 | 0.00005389359573 | 20.98069 |
| Pluto-system barycenter | 10 | 0.03095776706672 | 0.01834470022215 | 200.38656 |

At **2250-01-01T00:00:00Z**, Earth differs by **0.00011360585570 AU** (20.98069 arcsec angular separation); Pluto differs by **0.03095391451703 AU** (200.35729 arcsec). Pluto's largest sampled 3D error is on 2249-12-31, one day before the endpoint.

**Accuracy trade-off:** the single long-range model is less accurate on these old-range samples than the former short-range fit. Across the original six epochs, the maximum 3D discrepancies increase from 0.00005423562105 to 0.00008870887420 AU for Earth and from 0.00908188037216 to 0.02629760840553 AU for Pluto. This is the published broader fit, not an ad hoc adjustment to the samples. Earth retains its 0.0002-AU regression ceiling; Pluto's former 0.012-AU short-fit ceiling cannot hold for the requested model, so its measured long-fit ceiling is 0.032 AU. Coefficient/solver reconstruction tolerances remain unchanged (2e-12 AU), and no source vectors were altered to fit the model.

Treat Pluto as a lower-accuracy educational orbit. Sampled maxima and regression ceilings are **not full-interval bounds**. Other planets' coefficients, correction terms, solver, and geometry are tested against an independent mathematical reconstruction, **not** independent modern ephemerides. This is not a precision ephemeris or navigation tool.

## Verification and reproducibility

Run from the repository root; these commands need only Node.js:

```sh
node --test tests/science.test.js tests/state.test.js tests/mechanism.test.js tests/crank-layout.test.js
node scripts/public-fixtures.mjs
```

The science tests cover all exports, all nine coefficient/rate/correction sets at eight epochs, sourced mean radii/periods, both old- and extended-range Horizons fixture sets, orbital closure/perihelion/aphelion/orientation, date input rejection, validity boundaries, immutable records, bounded sampling, preserved mechanical keying/descriptors and extended state boundaries.

The fixture checker compares numeric records with the preserved coefficient and vector rows, verifies quoted-source links and prints Earth/Pluto discrepancy summaries. `tests/fixtures/science/provenance.json` records units, reference frame, target/center identifiers and exact Horizons query parameters. The fixed samples do not require network access. Refreshing them requires comparing new official source data and reviewing any changed values or model assumptions.

The repository includes selected NASA/JPL numerical data and short attributed excerpts, not complete downloaded pages or the full chapter. Source documents remain available at the URLs below. These references are attribution and scientific provenance, not a claim of publisher endorsement or a replacement for third-party rights notices.

## Sources

[1] https://ssd.jpl.nasa.gov/planets/approx_pos.html — JPL approximate planetary positions
[2] https://ssd.jpl.nasa.gov/planets/phys_par.html — jpl-physical
[3] https://science.nasa.gov/mercury/facts — mercury
[4] https://science.nasa.gov/venus/facts — venus
[5] https://science.nasa.gov/earth/facts — earth
[6] https://science.nasa.gov/mars/facts — mars
[7] https://science.nasa.gov/jupiter/facts — jupiter
[8] https://science.nasa.gov/saturn/facts — saturn
[9] https://science.nasa.gov/uranus/facts — uranus
[10] https://science.nasa.gov/neptune/facts — neptune
[11] https://science.nasa.gov/dwarf-planets/pluto/facts — dwarf-planets-pluto
[12] https://ssd.jpl.nasa.gov/ftp/eph/planets/ioms/ExplSupplChap8.pdf — Standish and Williams: Orbital Ephemerides, chapter 8, Tables 8.10.1–2
[13] https://ssd.jpl.nasa.gov/api/horizons.api?format=text&MAKE_EPHEM=NO&COMMAND=199
[14] https://ssd.jpl.nasa.gov/api/horizons.api?format=text&MAKE_EPHEM=NO&COMMAND=299
[15] https://ssd.jpl.nasa.gov/api/horizons.api?format=text&MAKE_EPHEM=NO&COMMAND=999
[16] https://ssd.jpl.nasa.gov/api/horizons.api?format=json&COMMAND=%273%27&CENTER=%27500%4010%27&MAKE_EPHEM=%27YES%27&EPHEM_TYPE=%27VECTORS%27&TLIST=%272378496.5%2C2415020.5%2C2451545.0%2C2461288.5%2C2469806.5%2C2469807.5%27&TIME_TYPE=%27TDB%27&OUT_UNITS=%27AU-D%27&REF_PLANE=%27ECLIPTIC%27&REF_SYSTEM=%27ICRF%27&VEC_CORR=%27NONE%27&VEC_TABLE=%272%27&CSV_FORMAT=%27YES%27&OBJ_DATA=%27YES%27 — Horizons earth barycenter geometric vectors, J2000 ecliptic
[17] https://ssd.jpl.nasa.gov/api/horizons.api?format=json&COMMAND=%279%27&CENTER=%27500%4010%27&MAKE_EPHEM=%27YES%27&EPHEM_TYPE=%27VECTORS%27&TLIST=%272378496.5%2C2415020.5%2C2451545.0%2C2461288.5%2C2469806.5%2C2469807.5%27&TIME_TYPE=%27TDB%27&OUT_UNITS=%27AU-D%27&REF_PLANE=%27ECLIPTIC%27&REF_SYSTEM=%27ICRF%27&VEC_CORR=%27NONE%27&VEC_TABLE=%272%27&CSV_FORMAT=%27YES%27&OBJ_DATA=%27YES%27 — Horizons pluto barycenter geometric vectors, J2000 ecliptic

[18] https://ssd.jpl.nasa.gov/ftp/eph/planets/ioms/ExplSupplChap8.pdf — Active long-range original chapter Tables 8.10.3 and 8.10.4
[19] https://ssd.jpl.nasa.gov/planets/approx_pos.html — Active Tables 2a and 2b, cross-check against original chapter (Pluto omitted from HTML)
[20] https://ssd.jpl.nasa.gov/api/horizons.api?format=json&COMMAND=%273%27&CENTER=%27500%4010%27&MAKE_EPHEM=%27YES%27&EPHEM_TYPE=%27VECTORS%27&TLIST=%272488069.5%2C2524593.5%2C2542854.5%2C2542855.5%27&TIME_TYPE=%27TDB%27&OUT_UNITS=%27AU-D%27&REF_PLANE=%27ECLIPTIC%27&REF_SYSTEM=%27ICRF%27&VEC_CORR=%27NONE%27&VEC_TABLE=%272%27&CSV_FORMAT=%27YES%27&OBJ_DATA=%27YES%27 — Horizons earth barycenter extended-range geometric vectors, J2000 ecliptic
[21] https://ssd.jpl.nasa.gov/api/horizons.api?format=json&COMMAND=%279%27&CENTER=%27500%4010%27&MAKE_EPHEM=%27YES%27&EPHEM_TYPE=%27VECTORS%27&TLIST=%272488069.5%2C2524593.5%2C2542854.5%2C2542855.5%27&TIME_TYPE=%27TDB%27&OUT_UNITS=%27AU-D%27&REF_PLANE=%27ECLIPTIC%27&REF_SYSTEM=%27ICRF%27&VEC_CORR=%27NONE%27&VEC_TABLE=%272%27&CSV_FORMAT=%27YES%27&OBJ_DATA=%27YES%27 — Horizons pluto barycenter extended-range geometric vectors, J2000 ecliptic
