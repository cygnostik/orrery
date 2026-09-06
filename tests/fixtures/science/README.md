# Planetary source fixtures

These fixtures contain selected NASA/JPL numeric data and short attributed excerpts, not complete downloaded pages or the full *Orbital Ephemerides* chapter. Source identifiers and quotations are indexed in [science-sources.json](../../../docs/science-sources.json); model limits and interpretation are in [science.md](../../../docs/science.md).

- `elements.json`: nine parsed coefficient/rate pairs, including the original short-interval Pluto fit. Array columns are a, eccentricity, inclination, mean longitude, longitude of perihelion and longitude of ascending node. `provenance.json` records units and table identity.
- `physical.json`: volume-equivalent mean radii, sidereal periods in Julian years and literal source rows retaining uncertainty/reference columns.
- `horizons-vectors.json`: six independent Sun-centered geometric J2000-ecliptic positions each for Earth–Moon and Pluto-system barycenters. These are parsed Horizons outputs, not expected values synthesized by the production solver.
- `provenance.json`: source URLs, units, reference frame and exact Horizons query parameters. The fixture dates use the same numerical Julian date in TDB as the simplified model's UTC input; this is not a UTC-to-TDB conversion test.
- `source-*.txt`: bounded verbatim excerpts, including table rows and selected target/center/frame lines.

Run `node --test tests/science.test.js` and `node scripts/public-fixtures.mjs` from the repository root. The latter validates row-to-number provenance and prints the Earth/Pluto discrepancies without changing files or downloading sources. Sparse samples and regression tolerances do not establish full-interval astronomical accuracy.

Original documents remain available at their cited publisher URLs. Attribution here does not imply publisher endorsement or relicense third-party documents under the project's code license.
