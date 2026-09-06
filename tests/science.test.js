import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';

const moduleUrl = new URL('../src/science.js', import.meta.url);
const evidence = name => JSON.parse(readFileSync(new URL(`./fixtures/science/${name}.json`, import.meta.url), 'utf8'));

test('Pluto remains within the measured modern-Horizons regression tolerance', async () => {
  const { positionAt } = await import(moduleUrl);
  const samples = evidence('horizons-vectors').filter(row => row.body === 'pluto');
  assert.equal(samples.length, 6);
  for (const expected of samples) {
    const actual = positionAt('pluto', expected.date);
    assert.ok(Math.hypot(actual.x - expected.x, actual.y - expected.y, actual.z - expected.z) < 0.012);
  }
});

test('all nine coefficient sets and secular rates agree with the parsed official tables', async () => {
  const { BODIES, positionAt } = await import(moduleUrl);
  const table = evidence('elements'), physical = evidence('physical');
  assert.equal(Object.keys(table).length, 9);
  assert.equal(Object.keys(physical).length, 9);
  for (const body of BODIES) {
    assert.equal(body.aAU, table[body.id].base[0]);
    assert.equal(body.eccentricity, table[body.id].base[1]);
    assert.equal(body.inclinationDeg, table[body.id].base[2]);
    assert.equal(body.radiusKm, physical[body.id].radiusKm);
    assert.equal(body.periodDays, physical[body.id].periodYears * 365.25);
    assert.ok(Object.isFrozen(body));
    for (const date of ['1800-01-01', '1900-07-15', '2000-01-01T12:00:00Z', '2026-09-05', '2050-01-01']) {
      const t = (Date.parse(date) - Date.UTC(2000, 0, 1, 12)) / (36525 * 86400000);
      const [a, e, i, L, p, o] = table[body.id].base.map((v, n) => v + t * table[body.id].rate[n]);
      const rad = Math.PI / 180;
      const M = (((L - p) % 360 + 360) % 360) * rad;
      // Independent bisection solver and polar-coordinate transform.
      let low = 0, high = 2 * Math.PI;
      for (let n = 0; n < 60; n++) {
        const E = (low + high) / 2;
        if (E - e * Math.sin(E) < M) low = E; else high = E;
      }
      const E = (low + high) / 2;
      const v = 2 * Math.atan2(Math.sqrt(1 + e) * Math.sin(E / 2), Math.sqrt(1 - e) * Math.cos(E / 2));
      const u = v + (p - o) * rad, O = o * rad, I = i * rad;
      const r = a * (1 - e * Math.cos(E));
      const expected = {
        x: r * (Math.cos(O) * Math.cos(u) - Math.sin(O) * Math.sin(u) * Math.cos(I)),
        y: r * (Math.sin(O) * Math.cos(u) + Math.cos(O) * Math.sin(u) * Math.cos(I)),
        z: r * Math.sin(u) * Math.sin(I),
      };
      const actual = positionAt(body.id, date);
      assert.ok(Math.hypot(actual.x - expected.x, actual.y - expected.y, actual.z - expected.z) < 2e-12,
        `${body.id} ${date}`);
      const longitude = ((Math.atan2(expected.y, expected.x) / rad) + 360) % 360;
      assert.ok(Math.abs(actual.longitudeDeg - longitude) < 1e-10);
    }
  }
});

test('orbit sampling rejects invalid or unbounded segment counts', async () => {
  const { orbitPoints } = await import(moduleUrl);
  for (const count of [2, 0, -1, 1.5, NaN, Infinity, '180', null, 10001]) {
    assert.throws(() => orbitPoints('earth', '2000-01-01', count), RangeError);
  }
  assert.equal(orbitPoints('earth', '2000-01-01', 3).length, 4);
  assert.equal(orbitPoints('earth', '2000-01-01', 10000).length, 10001);
});

test('invalid IDs and malformed, ambiguous, or impossible dates throw rather than normalize', async () => {
  const { positionAt, orbitPoints } = await import(moduleUrl);
  for (const fn of [positionAt, orbitPoints]) {
    for (const id of ['sun', 'Earth', '__proto__', 'constructor', null, 3, {}]) {
      assert.throws(() => fn(id, '2000-01-01'), RangeError);
    }
    for (const date of [undefined, null, 0, {}, new Date(NaN), '', 'not-a-date', '2024-02-30',
      '2023-02-29', '2024-01-01T24:00:00Z', '2024-01-01T00:00:00', '2024-01-01T00:00:00-08:00', '01/02/2024']) {
      assert.throws(() => fn('earth', date), { name: /Error$/ });
    }
    const date = new Date('2024-02-29T12:34:56.123Z');
    const before = date.toISOString();
    assert.deepEqual(fn('earth', date), fn('earth', before));
    assert.deepEqual(fn('earth', before), fn('earth', before.replace('Z', '+00:00')));
    assert.equal(date.toISOString(), before);
  }
});

test('model metadata exposes and enforces the conservative published validity interval', async () => {
  const { SCIENCE, positionAt, orbitPoints } = await import(moduleUrl);
  assert.ok(SCIENCE, 'SCIENCE metadata must exist');
  assert.deepEqual(SCIENCE.range, { start: '1800-01-01', end: '2050-01-01' });
  assert.match(SCIENCE.model, /JPL/);
  assert.match(SCIENCE.sourceUrl, /ssd\.jpl\.nasa\.gov/);
  assert.match(SCIENCE.limitations.join(' '), /barycenter/i);
  for (const fn of [positionAt, orbitPoints]) {
    for (const date of ['1800-01-01', '2050-01-01']) assert.doesNotThrow(() => fn('earth', date));
    for (const date of ['1799-12-31T23:59:59.999Z', '2050-01-01T00:00:00.001Z', '2050-12-31']) {
      assert.throws(() => fn('earth', date), RangeError);
    }
  }
});

test('orbitPoints returns a closed, correctly oriented ellipse at the selected date', async () => {
  const { BODIES, orbitPoints, positionAt } = await import(moduleUrl);
  assert.equal(typeof orbitPoints, 'function');
  const fixtures = evidence('elements');
  for (const body of BODIES) {
    for (const date of ['1900-01-01T00:00:00Z', '2000-01-01T12:00:00Z', '2049-12-31T00:00:00Z']) {
      const points = orbitPoints(body.id, date, 180);
      assert.equal(points.length, 181);
      assert.deepEqual(points[0], points.at(-1));
      assert.notEqual(points[0], points.at(-1));
      const t = (Date.parse(date) - Date.parse('2000-01-01T12:00:00Z')) / (36525 * 86400000);
      const el = fixtures[body.id].base.map((v, i) => v + t * fixtures[body.id].rate[i]);
      const radii = points.map(p => Math.hypot(p.x, p.y, p.z));
      assert.ok(Math.abs(Math.min(...radii) - el[0] * (1 - el[1])) < 1e-12);
      assert.ok(Math.abs(Math.max(...radii) - el[0] * (1 + el[1])) < 1e-12);
      const I = el[2] * Math.PI / 180, O = el[5] * Math.PI / 180;
      const normal = [Math.sin(I) * Math.sin(O), -Math.sin(I) * Math.cos(O), Math.cos(I)];
      for (const p of [...points, positionAt(body.id, date)]) {
        assert.ok(Math.abs(p.x * normal[0] + p.y * normal[1] + p.z * normal[2]) < 1e-12);
      }
    }
    assert.equal(orbitPoints(body.id, '2000-01-01').length, 181);
  }
});

test('Earth positions match independent Horizons EMB vectors across the supported interval', async () => {
  const { positionAt } = await import(moduleUrl);
  assert.equal(typeof positionAt, 'function');
  const samples = evidence('horizons-vectors').filter(row => row.body === 'earth');
  assert.equal(samples.length, 6);
  for (const expected of samples) {
    const actual = positionAt('earth', expected.date);
    const errorAU = Math.hypot(actual.x - expected.x, actual.y - expected.y, actual.z - expected.z);
    assert.ok(errorAU < 0.0002, `${expected.date}: ${errorAU} AU error`);
    assert.equal(actual.radiusAU, Math.hypot(actual.x, actual.y, actual.z));
    assert.ok(actual.longitudeDeg >= 0 && actual.longitudeDeg < 360);
  }
});
test('science module exposes the nine ordered, sourced body records', async () => {
  assert.ok(existsSync(moduleUrl), 'src/science.js must exist');
  const { BODIES } = await import(moduleUrl);
  assert.deepEqual(BODIES.map(body => body.id), [
    'mercury', 'venus', 'earth', 'mars', 'jupiter', 'saturn', 'uranus', 'neptune', 'pluto',
  ]);
  for (const body of BODIES) {
    assert.equal(body.kind, body.id === 'pluto' ? 'dwarf-planet' : 'planet');
    assert.ok(body.name && body.fact);
    assert.match(body.sourceUrl, /^https:\/\/(science\.nasa\.gov|ssd\.jpl\.nasa\.gov)\//);
    for (const key of ['aAU', 'eccentricity', 'inclinationDeg', 'radiusKm', 'periodDays', 'tiltDeg']) {
      assert.ok(Number.isFinite(body[key]), `${body.id}.${key} must be finite`);
    }
    assert.ok(body.radiusKm > 0 && body.periodDays > 0 && body.aAU > 0);
    assert.ok(body.eccentricity >= 0 && body.eccentricity < 1);
  }
});
