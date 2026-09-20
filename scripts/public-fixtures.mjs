import assert from 'node:assert/strict';
import {readFileSync, readdirSync} from 'node:fs';

import {BODIES, positionAt} from '../src/science.js';

// Offline provenance checks. Expected scientific values come from the source
// fixtures, never from the production solver. No source downloads are needed.
const root = new URL('../', import.meta.url);
const text = path => readFileSync(new URL(path, root), 'utf8');
const json = path => JSON.parse(text(path));
const normalizeSpace = value => value.replace(/\s+/g, ' ').trim();
const numbers = value => (value.match(/[-+]?(?:\d+\.?\d*|\.\d+)(?:e[-+]?\d+)?/gi) || []).map(Number);
const allowedSourceKeys = new Set(['id', 'url', 'title', 'quotes', 'evidencePath']);
const catalogs = ['science', 'moon', 'construction', 'material', 'asset'];
let quoteCount = 0;
for (const catalog of catalogs) {
  const {sources} = json(`docs/${catalog}-sources.json`);
  assert.equal(new Set(sources.map(source => source.id)).size, sources.length);
  for (const source of sources) {
    assert.ok(Object.keys(source).every(key => allowedSourceKeys.has(key)));
    assert.equal(new URL(source.url).protocol, 'https:');
    assert.ok(source.quotes.length > 0);
    for (const quote of source.quotes) {
      assert.deepEqual(Object.keys(quote), ['text']);
      assert.ok(quote.text.length > 0 && quote.text.length <= 1024);
      quoteCount++;
    }
  }
}

const science = json('docs/science-sources.json');
const byId = new Map(science.sources.map(source => [source.id, source]));
for (const source of science.sources) {
  assert.match(source.evidencePath, /^tests\/fixtures\/science\/source-\d{2}\.txt$/);
  const excerpt = text(source.evidencePath);
  assert.ok(excerpt.startsWith(`Source: ${source.url}\n`));
  for (const quote of source.quotes) assert.ok(excerpt.includes(quote.text));
}
for (const claim of science.claims) {
  const source = byId.get(claim.sourceId);
  assert.ok(source && Number.isInteger(claim.quoteIndex));
  assert.ok(source.quotes[claim.quoteIndex], claim.claim);
}

const elements = json('tests/fixtures/science/elements.json');
const physical = json('tests/fixtures/science/physical.json');
assert.deepEqual(Object.keys(elements), BODIES.map(body => body.id));
assert.deepEqual(Object.keys(physical), Object.keys(elements));
for (const [index, id] of Object.keys(elements).entries()) {
  const row = byId.get(12).quotes[index].text.split('\n');
  assert.deepEqual(elements[id].base, numbers(row[0]));
  assert.deepEqual(elements[id].rate, numbers(row[1]));
  assert.ok(text(byId.get(2).evidencePath).includes(physical[id].sourceRow));
  const cells = physical[id].sourceRow.split('|');
  assert.equal(physical[id].radiusKm, numbers(cells[2])[0]);
  assert.equal(physical[id].periodYears, numbers(cells[6])[0]);
}


// Active long-range tables, independently quoted from the chapter and current HTML.
const longElements = json('tests/fixtures/science/long-range-elements.json');
assert.deepEqual(Object.keys(longElements), Object.keys(elements));
for (const [index, id] of Object.keys(longElements).entries()) {
  const rows = byId.get(18).quotes[index].text.split('\n');
  assert.deepEqual(longElements[id].base, numbers(rows[0]));
  assert.deepEqual(longElements[id].rate, numbers(rows[1]));
  if (index < 8) assert.deepEqual(numbers(byId.get(19).quotes[index].text), numbers(rows.join(' ')));
  const correction = index < 4 ? [] : numbers(byId.get(18).quotes[index + 5].text);
  while (correction.length < 4) correction.push(0); // blank Pluto c/s/f terms
  assert.deepEqual(longElements[id].correction, correction);
  if (index >= 4 && index < 8) assert.deepEqual(numbers(byId.get(19).quotes[index + 4].text), correction);
}
const mechanical = json('tests/fixtures/science/mechanical-j2000.json');
assert.deepEqual(mechanical.map(row => row.id), Object.keys(elements));
for (const [index, body] of BODIES.entries()) {
  for (const [key, column] of [['aAU', 0], ['eccentricity', 1], ['inclinationDeg', 2]]) {
    assert.equal(body[key], elements[body.id].base[column]);
    assert.equal(mechanical[index][key], body[key]);
  }
}

const provenance = json('tests/fixtures/science/provenance.json');
assert.equal(provenance.elements.sourceUrl, byId.get(12).url);
assert.equal(provenance.elements.crosscheckUrl, byId.get(1).url);
assert.equal(provenance.physical.sourceUrl, byId.get(2).url);
assert.equal(provenance.longRangeElements.sourceUrl, byId.get(18).url);
assert.equal(provenance.longRangeElements.crosscheckUrl, byId.get(19).url);
const historicalVectors = json('tests/fixtures/science/horizons-vectors.json');
const extendedVectors = json('tests/fixtures/science/horizons-extended-vectors.json');
assert.equal(historicalVectors.length, 12);
assert.equal(extendedVectors.length, 8);
const vectors = [...historicalVectors, ...extendedVectors];
assert.equal(new Set(vectors.map(row => `${row.body}:${row.date}`)).size, 20);
const discrepancies = [];
for (const [body, sourceId, target, fixtureRows, queryGroup, count] of [
  ['earth', 16, '3', historicalVectors, provenance.horizons, 6],
  ['pluto', 17, '9', historicalVectors, provenance.horizons, 6],
  ['earth', 20, '3', extendedVectors, provenance.extendedHorizons, 4],
  ['pluto', 21, '9', extendedVectors, provenance.extendedHorizons, 4],
]) {
  const source = byId.get(sourceId);
  const query = queryGroup.queries[body];
  assert.equal(query.url, source.url);
  for (const [key, value] of Object.entries(query.params)) {
    assert.equal(new URL(query.url).searchParams.get(key), value);
  }
  assert.equal(query.params.COMMAND, `'${target}'`);
  assert.equal(query.params.CENTER, "'500@10'");
  assert.equal(query.params.TIME_TYPE, "'TDB'");
  assert.equal(query.params.REF_PLANE, "'ECLIPTIC'");
  assert.equal(query.params.REF_SYSTEM, "'ICRF'");
  assert.equal(query.params.VEC_CORR, "'NONE'");
  assert.equal(query.params.OUT_UNITS, "'AU-D'");
  const rows = source.quotes.filter(quote => /^\d+\.\d+,/.test(quote.text));
  const samples = fixtureRows.filter(sample => sample.body === body);
  assert.equal(samples.length, count);
  assert.equal(rows.length, samples.length);
  assert.deepEqual(query.params.TLIST.slice(1, -1).split(',').map(Number), samples.map(sample => sample.jdTDB));
  for (const [index, sample] of samples.entries()) {
    const cells = rows[index].text.split(',');
    assert.equal(sample.target, target);
    assert.deepEqual([sample.jdTDB, sample.x, sample.y, sample.z], [cells[0], ...cells.slice(2, 5)].map(Number));
    assert.equal(Date.parse(sample.date) / 86400000 + 2440587.5, sample.jdTDB);
    const actual = positionAt(body, sample.date);
    const radius = Math.hypot(sample.x, sample.y, sample.z);
    const dot = actual.x * sample.x + actual.y * sample.y + actual.z * sample.z;
    discrepancies.push({body, date: sample.date,
      errorAU: Math.hypot(actual.x - sample.x, actual.y - sample.y, actual.z - sample.z),
      radialErrorAU: Math.abs(actual.radiusAU - radius),
      angularErrorArcsec: Math.acos(Math.min(1, Math.max(-1, dot / (radius * actual.radiusAU)))) * 180 / Math.PI * 3600,
    });
  }
}

const moonSources = json('docs/moon-sources.json').sources;
const moonTexts = readdirSync(new URL('tests/fixtures/moons/', root)).filter(name => name.endsWith('.txt')).map(name => text(`tests/fixtures/moons/${name}`));
for (const source of moonSources) {
  const excerpts = moonTexts.filter(value => value.startsWith(`Source: ${source.url}\n`));
  assert.ok(excerpts.length > 0, source.url);
  for (const quote of source.quotes) {
    assert.ok(excerpts.some(value => normalizeSpace(value).includes(normalizeSpace(quote.text))), quote.text);
  }
}

let fixtureCount = 0, maxExcerptBytes = 0;
for (const family of ['science', 'moons']) {
  for (const entry of readdirSync(new URL(`tests/fixtures/${family}/`, root), {withFileTypes: true})) {
    assert.ok(entry.isFile(), `Unexpected nested fixture: ${entry.name}`);
    assert.match(entry.name, /\.(?:json|txt|md)$/);
    const value = text(`tests/fixtures/${family}/${entry.name}`);
    assert.doesNotMatch(value, /<!doctype|<html|\/Users\/|\/home\/|savedAtUtc|sha256|web_extract|\"accessed\"|\"added\"/i);
    if (entry.name.endsWith('.txt')) {
      const size = Buffer.byteLength(value);
      assert.ok(size <= 8192, `Unbounded excerpt: ${entry.name}`);
      assert.match(value, /^Source: https:\/\//);
      maxExcerptBytes = Math.max(maxExcerptBytes, size);
    }
    fixtureCount++;
  }
}
const maxima = ['earth', 'pluto'].map(body => {
  const rows = discrepancies.filter(row => row.body === body);
  return {body, samples: rows.length,
    maxErrorAU: Math.max(...rows.map(row => row.errorAU)),
    maxRadialErrorAU: Math.max(...rows.map(row => row.radialErrorAU)),
    maxAngularErrorArcsec: Math.max(...rows.map(row => row.angularErrorArcsec)),
  };
});
console.log(JSON.stringify({fixtureCount, quoteCount, maxExcerptBytes, planetRecords: Object.keys(elements).length,
  moonRecords: json('tests/fixtures/moons/parameters.json').records.length + json('tests/fixtures/moons/expansion-parameters.json').records.length,
  horizonsSamples: vectors.length, maxima, endpoint: discrepancies.filter(row => row.date === '2250-01-01T00:00:00Z')}, null, 2));
