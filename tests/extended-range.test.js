import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {SCIENCE} from '../src/science.js';
import {MOONS, moonPositionAt} from '../src/moons.js';

test('date entry and all schematic moons share the extended 2250 boundary', () => {
  assert.equal(SCIENCE.range.end, '2250-01-01');
  const html = readFileSync(new URL('../index.html', import.meta.url), 'utf8');
  const input = html.match(/<input\b[^>]*id="simulation-date"[^>]*>/)?.[0];
  assert.ok(input, 'date control exists');
  assert.match(input, /min="1800-01-01"/);
  assert.match(input, /max="2249-12-31"/);
  for (const moon of MOONS) {
    for (const date of ['2050-12-31', '2200-01-01', '2250-01-01']) {
      assert.ok(Object.values(moonPositionAt(moon.id, date)).every(Number.isFinite));
    }
    assert.throws(() => moonPositionAt(moon.id, '2250-01-01T00:00:00.001Z'), RangeError);
  }
});
