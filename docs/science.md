# Orrery science module

**Presentation boundary:** this astronomical module drives Observatory and the clearly labeled astronomical reference readout. Mechanical planet positions instead come from the connected transmission described in [mechanical-drive.md](mechanical-drive.md): uniform mean motion, finite rational tooth ratios, constant J2000 indexing and compressed fixed arm lengths. It is not an alternate drawing of the same ephemeris. Moon overlays are separately schematic; see [moons.md](moons.md).

## Contract and scope

`src/science.js` is dependency-free browser ESM. It exports `BODIES`, `positionAt(id, date)`, `orbitPoints(id, date, count = 180)`, and `SCIENCE`. There is no runtime network request, renderer scale, simulation clock, texture, or UI dependency.

`SCIENCE.range` is `{start: '1800-01-01', end: '2050-01-01'}`. Endpoints mean **UTC midnight, inclusive**. JPL publishes an interval named “1800 AD - 2050 AD,” but does not define an inclusive December 31 boundary; it explicitly says the fitted elements are invalid outside their interval.[1] Ending at the start of 2050 is a conservative application policy, not a claim that JPL specified this exact civil timestamp.

- `BODIES`: nine frozen records, Mercury through optional Pluto; eight `planet` records and one `dwarf-planet`. Descriptors are reference values, not evolving orbital elements. `sourceUrl` supports the **fact**; numerical field provenance is below.
- `positionAt`: `{x,y,z,radiusAU,longitudeDeg}`. Distances are AU; longitude is normalized to `[0,360)`. The frame is heliocentric, mean ecliptic/equinox J2000: x toward the equinox, y in the ecliptic, z north.[1]
- **Earth means the Earth–Moon barycenter**, not the geocenter, even though the inspector's physical radius and fact describe Earth.[1] Optional Pluto uses the original short-interval fit.[12]
- Inputs are a finite `Date`, `YYYY-MM-DD`, or a four-digit-year UTC ISO timestamp ending in `Z` or `+00:00`; seconds are optional, fractional seconds support one to three digits. Non-UTC offsets, local-time strings, impossible dates, unknown/case-mismatched IDs, and out-of-range dates throw. Input `Date` objects are not mutated. A `Date` already normalized by its caller cannot reveal its original invalid text.
- `orbitPoints` returns exactly `count + 1` `{x,y,z}` objects, with a copied closing endpoint. Integer counts must be 3–10,000. Sampling is uniform in **eccentric anomaly**, not elapsed time. It is an ellipse at the requested date's fitted elements, not a future integrated trajectory.

## Model and numerical implementation

The eight planets use JPL's current Table 1. The original JPL-hosted chapter, Table 8.10.2 on printed pages 27–28, supplies the identical eight rows **plus Pluto**.[1][12] The current HTML explicitly says, “The former planet Pluto has also been removed.”[1] `tests/fixtures/science/elements.json` retains all nine coefficient/rate pairs parsed from the chapter, with the eight planetary rows cross-checked against Table 1. Bounded quoted rows and source URLs accompany the numeric fixtures. Tests independently reconstruct positions using bisection and a polar-coordinate transform, rather than the production Newton/cartesian implementation.

The model linearly advances six elements with `T = (JD - 2451545.0) / 36525`, wraps mean anomaly, solves `M = E - e sin(E)`, constructs the orbital-plane ellipse, and rotates into J2000 ecliptic coordinates.[1]
The source's eccentricity column has a misleading “rad” label; eccentricity is used as the dimensionless ratio in its equations, **not converted to radians**.[1][12]
Angular elements are converted from degrees; the short-interval model does **not** use the long-interval Table 2b correction terms.[1][12]

Production Newton iteration uses a `1e-13` radian correction threshold and a 20-iteration guard. Numerical convergence is much tighter than the astronomical approximation; it is not an accuracy claim about the sky.

**Time-scale simplification:** JPL requires a dynamical Julian date (JDTDB), not UTC.[1] This module uses JavaScript UTC milliseconds as an approximate dynamical epoch. It omits leap seconds, UTC→TT/TDB conversion, light travel time, apparent-position corrections, and Earth–Moon geocenter displacement. The independent fixtures intentionally query **the same numerical Julian date in TDB**; they validate the orbit implementation, not the omitted UTC→TDB conversion. Historical UTC dates are proleptic calendar labels, not a reconstruction of historical timekeeping.

## Physical descriptors

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

JPL lists the following **nominal historical model errors**, not guarantees for every date or a confidence interval.[1][12]

| Body | Longitude, arcsec | Latitude, arcsec | Distance, 1000 km |
|---|---:|---:|---:|
| Mercury | 15 | 1 | 1 |
| Venus | 20 | 1 | 4 |
| Earth–Moon barycenter | 20 | 8 | 6 |
| Mars | 40 | 2 | 25 |
| Jupiter | 400 | 10 | 600 |
| Saturn | 600 | 25 | 1500 |
| Uranus | 50 | 2 | 1000 |
| Neptune | 10 | 1 | 200 |
| Pluto (original chapter only) | 5 | 2 | 300 |

**Independent checks:** six real Horizons epochs per body were fetched for target `3` (Earth–Moon barycenter) and target `9` (Pluto-system barycenter), centered on `500@10` (Sun), `REF_PLANE=ECLIPTIC`, `REF_SYSTEM=ICRF`, `VEC_CORR=NONE`, `TIME_TYPE=TDB`, and AU/day units.[16][17] Dates are 1800-01-01, 1900-01-01, J2000 noon, 2026-09-05, 2049-12-31, and 2050-01-01. Selected target/center/frame lines, literal vector rows, exact query URLs and parsed numeric fixtures are retained under `tests/fixtures/science/`. These are independently integrated Horizons outputs, not generated expected values from the implemented formula.

Discrepancies against those fixtures (recompute with `node scripts/public-fixtures.mjs`):

| Body | Samples | Largest 3D discrepancy, AU | Largest radial discrepancy, AU | Largest angular separation, arcsec |
|---|---:|---:|---:|---:|
| Earth–Moon barycenter | 6 | 0.00005423562105 | 0.00002470411752 | 9.87635 |
| Pluto-system barycenter | 6 | 0.00908188037216 | 0.00708555061972 | 38.76768 |

**Important contradictory evidence:** Pluto's discrepancy against modern Horizons is appreciably larger than the old chapter's nominal 5-arcsecond/300,000-km figures.[12][17] The old fit is retained faithfully rather than adjusted ad hoc to sparse fixtures. Treat Pluto as a lower-accuracy educational orbit; the measured maximum is **not** a full-interval bound. Test tolerances are 0.0002 AU for Earth and 0.012 AU for Pluto, regression checks rather than advertised accuracy. Other planets' coefficients, rate propagation, solver, and geometry are tested against an independent mathematical reconstruction, **not** independent modern ephemerides. This is not a precision ephemeris or navigation tool.

## Verification and reproducibility

Run from the repository root; these commands need only Node.js:

```sh
node --test tests/science.test.js
node scripts/public-fixtures.mjs
```

The science tests cover all exports, all nine coefficient/rate sets at five epochs, sourced mean radii/periods, both independent Horizons fixture sets, orbital closure/perihelion/aphelion/orientation, date input rejection, validity boundaries, immutable records and bounded sampling.

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
