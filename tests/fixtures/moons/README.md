# Moon source fixtures

These fixtures preserve the catalog's literal source rows, fact quotations and adopted period decisions. They contain selected NASA/JPL numerical data and short excerpts, not complete articles or API responses. [moon-sources.json](../../../docs/moon-sources.json) maps stable source identifiers to official URLs and quotations; [moons.md](../../../docs/moons.md) explains the model and unresolved source discrepancies.

- `parameters.json` retains Moon, Io, Europa, Ganymede and Callisto descriptors and literal table rows.
- `expansion-parameters.json` retains Enceladus, Titan, Miranda, Triton and Charon descriptors, fact/surface quotations and period cross-check chains. Its `sources` array maps supporting sources to bounded excerpt files.
- `adopted-periods.json` records the rounded Io/Europa Horizons-header periods separately from the conflicting mean-element table values. Neither source row is silently rewritten.
- `sources.json` maps the four supporting sources for the original catalog to excerpt files.
- `jpl-*.txt`, `nasa-*.txt` and `*-horizons-header.txt` retain only the cited passages and necessary numeric/column context. Header calls use `MAKE_EPHEM=NO`; they are not satellite position vectors.

Run `node --test tests/moons.test.js` and `node scripts/public-fixtures.mjs` from the repository root. Tests retain exact row/quote membership, numeric parsing, period rounding, immutability, date rejection and reversible schematic-motion assertions. These are not observed-position or lunar-phase accuracy checks.

Quotations and source data retain their publisher attribution. Complete documents remain at the linked sources; the project's code license does not override third-party rights or imply publisher endorsement.
