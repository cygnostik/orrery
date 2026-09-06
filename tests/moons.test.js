import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { SCIENCE } from '../src/science.js';

const moduleUrl = new URL('../src/moons.js', import.meta.url);
const originalIds = ['moon', 'io', 'europa', 'ganymede', 'callisto'];
const ids = [...originalIds, 'enceladus', 'titan', 'miranda', 'triton', 'charon'];
const parents = ['earth', 'jupiter', 'jupiter', 'jupiter', 'jupiter', 'saturn', 'saturn', 'uranus', 'neptune', 'pluto'];

test('invalid IDs and ambiguous, nonfinite or impossible dates are rejected explicitly', async () => {
  const { moonPositionAt } = await import(moduleUrl);
  for (const id of ['earth', 'Moon', '', '__proto__', 'constructor', null, undefined, 301, {}]) {
    assert.throws(() => moonPositionAt(id, '2000-01-01'), RangeError);
  }
  for (const date of [undefined, null, 0, NaN, Infinity, {}, [], true]) {
    assert.throws(() => moonPositionAt('moon', date), TypeError);
  }
  for (const date of [new Date(NaN), '', 'not-a-date', '2023-02-29', '2024-02-30', '2024-04-31',
    '2024-13-01', '2024-00-01', '2024-01-00', '2024-01-01T24:00:00Z', '2024-01-01T00:00:60Z',
    '2024-01-01T12:00:00', '2024-01-01T12:00:00-08:00', '01/02/2024', '2024-1-1']) {
    assert.throws(() => moonPositionAt('moon', date), RangeError, String(date));
  }
  const date = new Date('2024-02-29T12:34:56.123Z');
  const original = date.toISOString();
  assert.deepEqual(moonPositionAt('moon', date), moonPositionAt('moon', original));
  assert.deepEqual(moonPositionAt('moon', original), moonPositionAt('moon', original.replace('Z', '+00:00')));
  assert.deepEqual(moonPositionAt('moon', '2024-02-29'), moonPositionAt('moon', '2024-02-29T00:00:00Z'));
  assert.equal(date.toISOString(), original);
});

test('the shared supported interval includes its endpoints but no neighboring millisecond', async () => {
  const { moonPositionAt } = await import(moduleUrl);
  for (const id of ids) {
    for (const date of [SCIENCE.range.start, SCIENCE.range.end]) {
      const point = moonPositionAt(id, date);
      assert.ok(Object.values(point).every(Number.isFinite));
    }
    for (const date of [new Date(Date.parse(SCIENCE.range.start) - 1),
      new Date(Date.parse(SCIENCE.range.end) + 1), '2050-12-31', '1799-01-01']) {
      assert.throws(() => moonPositionAt(id, date), RangeError);
    }
  }
});

test('time scrubbing is deterministic and reversible without mutable state or caller-owned results', async () => {
  const { MOONS, moonPositionAt } = await import(moduleUrl);
  const dates = [SCIENCE.range.start, '1850-04-12T23:59:59.999Z', '1900-01-01',
    '2000-01-01T12:00:00Z', '2024-02-29T12:34:56.789Z', SCIENCE.range.end];
  for (const moon of MOONS) {
    const forward = dates.map(date => moonPositionAt(moon.id, date));
    const reverse = [...dates].reverse().map(date => moonPositionAt(moon.id, date)).reverse();
    assert.deepEqual(reverse, forward);
    for (const point of forward) {
      assert.ok(Object.values(point).every(Number.isFinite));
      assert.ok(Math.abs(Math.hypot(point.x, point.y, point.z) - moon.orbitRadiusKm) < 1e-8);
    }
    const point = moonPositionAt(moon.id, dates[0]);
    point.x = NaN;
    assert.deepEqual(moonPositionAt(moon.id, dates[0]), forward[0]);
  }
});

test('numerical descriptors and facts have saved official source evidence', async () => {
  const { MOONS } = await import(moduleUrl);
  const read = path => readFileSync(new URL(`./fixtures/moons/${path}`, import.meta.url), 'utf8');
  const { records } = JSON.parse(read('parameters.json'));
  assert.deepEqual(records.map(row => row.id), originalIds);
  const references = JSON.parse(read('sources.json'));
  const { sources } = JSON.parse(readFileSync(new URL('../docs/moon-sources.json', import.meta.url), 'utf8'));
  assert.equal(references.length, 4);
  assert.ok(sources.length >= references.length);
  const adoptedPeriods=JSON.parse(read('adopted-periods.json'));
  for (const source of references) {
    const saved = readFileSync(new URL(`./fixtures/moons/${source.evidencePath}`, import.meta.url));
    assert.ok(saved.length > 0, source.evidencePath);
    assert.match(source.url, /^https:\/\/[^/]*nasa\.gov\//);
    assert.ok(sources.find(item => item.id === source.sourceId).quotes.length > 0);
  }
  const physical = read('jpl-physical.txt');
  const orbital = read('jpl-elements.txt');
  assert.match(physical, /Mean Radius \(km\)/);
  assert.match(physical, /Radius of a sphere with the equivalent volume/);
  assert.match(orbital, /a \(km\)/);
  assert.match(orbital, /P \(days\)/);
  assert.match(orbital, /\| P \| sidereal period \|/);
  for (const [index, row] of records.entries()) {
    const moon = MOONS[index];
    assert.ok(physical.includes(row.radiusRow));
    assert.ok(orbital.includes(row.orbitRow));
    const radiusCells = row.radiusRow.split('|').slice(1, -1).map(cell => cell.trim());
    const orbitCells = row.orbitRow.split('|').slice(1, -1).map(cell => cell.trim());
    for (const key of ['id', 'name', 'parentId', 'radiusKm', 'orbitRadiusKm']) {
      assert.equal(moon[key], row[key]);
    }
    assert.equal(moon.radiusKm, Number(radiusCells[6]));
    assert.equal(moon.orbitRadiusKm, Number(orbitCells[6]));
    assert.equal(row.periodDays, Number(orbitCells[12])); // preserved literal source row
    const override=adoptedPeriods[moon.id];
    if(override){
      const header=read(override.evidencePath);
      assert.ok(header.includes(override.sourceText));
      assert.equal(override.periodDays,Number(header.match(/Orbital period\s*~\s*([\d.]+) d/)[1]));
      assert.ok(sources.find(s=>s.id===override.sourceId));
    }
    assert.equal(moon.periodDays,override?.periodDays??row.periodDays);
    assert.equal(moon.sourceUrl, references.find(source => source.sourceId === row.factSourceId).url);
    const source = moon.id === 'moon' ? 'nasa-moon-facts' : 'nasa-jupiter-moons';
    assert.ok(read(`${source}.txt`).includes(row.factQuote));
  }
});

test('moon catalog exposes exactly ten immutable, ordered satellite records', async () => {
  assert.ok(existsSync(moduleUrl), 'src/moons.js must exist');
  const { MOONS } = await import(moduleUrl);
  assert.deepEqual(MOONS.map(moon => moon.id), ids);
  assert.ok(Object.isFrozen(MOONS));
  for (const moon of MOONS) {
    assert.ok(Object.isFrozen(moon));
    assert.equal(moon.parentId, parents[ids.indexOf(moon.id)]);
    assert.equal(typeof moon.name, 'string');
    for (const key of ['radiusKm', 'orbitRadiusKm', 'periodDays']) {
      assert.ok(Number.isFinite(moon[key]) && moon[key] > 0, `${moon.id}.${key}`);
    }
    assert.match(moon.sourceUrl, /^https:\/\/[^/]*nasa\.gov\//);
    assert.ok(moon.fact.length > 30);
    assert.throws(() => { moon.radiusKm = 0; }, TypeError);
  }
  assert.throws(() => MOONS.push({}), TypeError);
});

test('five expansion records preserve an exact official row, quote, fact and cross-checked period chain', async () => {
  const { MOONS } = await import(moduleUrl);
  const read = path => readFileSync(new URL(`./fixtures/moons/${path}`, import.meta.url), 'utf8');
  const path = new URL('./fixtures/moons/expansion-parameters.json', import.meta.url);
  assert.ok(existsSync(path), 'new moon descriptors require saved evidence');
  const { records, sources: references } = JSON.parse(readFileSync(path, 'utf8'));
  const { sources } = JSON.parse(readFileSync(new URL('../docs/moon-sources.json', import.meta.url), 'utf8'));
  assert.deepEqual(records.map(row => row.id), ids.slice(5));
  assert.equal(new Set(sources.map(source => source.id)).size, sources.length);
  for (const item of references) {
    const bytes = readFileSync(new URL(`./fixtures/moons/${item.evidencePath}`, import.meta.url));
    assert.ok(bytes.length > 0, item.evidencePath);
    assert.equal(item.url, sources.find(source => source.id === item.sourceId).url);
  }
  for (const row of records) {
    const moon = MOONS.find(moon => moon.id === row.id);
    const radius = row.radiusRow.split('|').slice(1, -1).map(cell => cell.trim());
    const orbit = row.orbitRow.split('|').slice(1, -1).map(cell => cell.trim());
    assert.ok(read(row.radiusEvidencePath).includes(row.radiusRow));
    assert.ok(read(row.orbitEvidencePath).includes(row.orbitRow));
    assert.equal(moon.radiusKm, Number(radius[6]));
    assert.equal(moon.orbitRadiusKm, Number(orbit[6]));
    assert.equal(moon.parentId, row.parentId);
    assert.equal(moon.fact, row.fact);
    assert.equal(moon.sourceUrl.replace(/\/$/, ''), sources.find(source => source.id === row.factSourceId).url);
    assert.ok(read(row.factEvidencePath).includes(row.factQuote));
    for (const [sourceId, quote] of [[row.radiusSourceId, row.radiusRow], [row.orbitSourceId, row.orbitRow], [row.factSourceId, row.factQuote]]) {
      assert.ok(sources.find(source => source.id === sourceId).quotes.some(item => item.text === quote));
    }
    const period = row.period;
    assert.equal(period.tableDays, Number(orbit[12]));
    const header = read(period.evidencePath);
    assert.ok(header.includes(period.sourceText));
    assert.equal(Number(header.match(/Orbital period\s*(?:, days)?\s*=\s*([\d.]+)/)[1]), period.headerDays);
    assert.equal(Number(period.headerDays.toFixed(period.adoptedDecimalPlaces)), moon.periodDays);
    assert.equal(Number(period.tableDays.toFixed(period.adoptedDecimalPlaces)), moon.periodDays);
    assert.ok(sources.find(source => source.id === period.sourceId).quotes.some(item => item.text === period.sourceText));
    for (const claim of row.surfaceEvidence) {
      assert.ok(read(claim.evidencePath).includes(claim.quote));
      assert.ok(sources.find(source => source.id === claim.sourceId).quotes.some(item => item.text === claim.quote));
    }
  }
  const triton = records.find(row => row.id === 'triton');
  assert.ok(triton.factQuote.includes('retrograde orbit'));
  assert.equal(MOONS.find(moon => moon.id === 'triton').retrograde, true);
});

test('model metadata declares the schematic plane, illustrative phases and shared interval', async () => {
  const { MOON_MODEL } = await import(moduleUrl);
  assert.ok(MOON_MODEL, 'MOON_MODEL must exist');
  assert.deepEqual(MOON_MODEL.range, SCIENCE.range);
  assert.equal(MOON_MODEL.epoch, '2000-01-01T12:00:00Z');
  assert.match(MOON_MODEL.model, /schematic.*circular/i);
  assert.match(MOON_MODEL.coordinates, /parent-centric.*km.*XY.*z = 0/i);
  assert.deepEqual(MOON_MODEL.initialPhaseDeg, { moon: 0, io: 0, europa: 90, ganymede: 180, callisto: 270,
    enceladus: 45, titan: 225, miranda: 135, triton: 45, charon: 315 });
  const limitations = MOON_MODEL.limitations.join(' ');
  for (const phrase of [/illustrative/i, /not.*ephemeris/i, /ecliptic/i, /lunar phases/i, /barycenter/i, /display/i]) {
    assert.match(limitations, phrase);
  }
  for (const value of [MOON_MODEL, MOON_MODEL.range, MOON_MODEL.initialPhaseDeg, MOON_MODEL.limitations]) {
    assert.ok(Object.isFrozen(value));
  }
});

test('Triton alone reverses the illustrative motion without claiming the real orbital plane', async () => {
  const { MOONS, MOON_MODEL, moonPositionAt } = await import(moduleUrl);
  assert.deepEqual(MOONS.filter(moon => moon.retrograde).map(moon => moon.id), ['triton']);
  const epoch = Date.parse(MOON_MODEL.epoch);
  for (const moon of MOONS) {
    const before = moonPositionAt(moon.id, new Date(epoch));
    const after = moonPositionAt(moon.id, new Date(epoch + moon.periodDays * 86400000 / 4));
    const cross = before.x * after.y - before.y * after.x;
    assert.equal(Math.sign(cross), moon.id === 'triton' ? -1 : 1);
  }
  const limitations = MOON_MODEL.limitations.join(' ');
  assert.match(limitations, /Triton.*retrograde.*schematic/i);
  assert.match(limitations, /Charon.*not.*barycentric/i);
});

test('each moon travels one schematic circle per adopted period at constant parent-centric radius', async () => {
  const { MOONS, MOON_MODEL, moonPositionAt } = await import(moduleUrl);
  assert.equal(typeof moonPositionAt, 'function');
  const epoch = Date.parse(MOON_MODEL.epoch);
  for (const moon of MOONS) {
    const phase = MOON_MODEL.initialPhaseDeg[moon.id] * Math.PI / 180;
    for (const turns of [-1, -0.75, -0.5, -0.25, 0, 0.25, 0.5, 0.75, 1]) {
      const date = new Date(epoch + turns * moon.periodDays * 86400000);
      const point = moonPositionAt(moon.id, date);
      assert.deepEqual(Object.keys(point).sort(), ['x', 'y', 'z']);
      for (const coordinate of Object.values(point)) assert.ok(Number.isFinite(coordinate));
      assert.equal(point.z, 0);
      assert.ok(Math.abs(Math.hypot(point.x, point.y, point.z) - moon.orbitRadiusKm) < 1e-8);
      const angle = phase + turns * 2 * Math.PI * (moon.id === 'triton' ? -1 : 1);
      // A JS Date truncates sub-millisecond instants: allow 1 ms of arc plus floating-point noise.
      const toleranceKm = moon.orbitRadiusKm * 2 * Math.PI / (moon.periodDays * 86400000) + 1e-7;
      assert.ok(Math.hypot(point.x - moon.orbitRadiusKm * Math.cos(angle),
        point.y - moon.orbitRadiusKm * Math.sin(angle)) <= toleranceKm, `${moon.id}: ${turns} turns`);
    }
  }
});
