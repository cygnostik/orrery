import test from 'node:test';
import assert from 'node:assert/strict';
import {existsSync} from 'node:fs';

test('release media declares exact social, install and screenshot exports', async () => {
  const source = new URL('../scripts/release-media.mjs', import.meta.url);
  assert.ok(existsSync(source), 'the reproducible release media exporter exists');
  const {OUTPUTS} = await import(source);
  const expected = {
    'public/social/orrery-card.jpg': [1200, 630],
    'public/social/orrery-card.png': [1200, 630],
    'public/social/orrery-square.png': [1080, 1080],
    'public/icons/icon-192.png': [192, 192],
    'public/icons/icon-512.png': [512, 512],
    'public/icons/maskable-512.png': [512, 512],
    'public/icons/apple-touch-icon.png': [180, 180],
    'public/icons/favicon-32.png': [32, 32],
    'public/icons/favicon-16.png': [16, 16],
    'public/screenshots/desktop.png': [1440, 1000],
    'public/screenshots/mobile.png': [390, 844],
  };
  for (const [path, dimensions] of Object.entries(expected)) {
    assert.deepEqual(OUTPUTS.find(row => row.path === path)?.size, dimensions, path);
  }
  assert.equal(new Set(OUTPUTS.map(row => row.path)).size, OUTPUTS.length);
  assert.ok(OUTPUTS.every(row => /^(docs\/media|public\/(social|icons|screenshots))\//.test(row.path)));
});
