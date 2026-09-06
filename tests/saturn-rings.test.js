import test from 'node:test';
import assert from 'node:assert/strict';

test('Saturn radial texture separates colored C/B/A zones and transparent divisions', async () => {
  const {createSaturnRingTexture, SATURN_RING_EXTENT} = await import('../src/saturn-rings.js');
  assert.deepEqual(SATURN_RING_EXTENT, {inner: 1.35, outer: 2.3});
  const texture = createSaturnRingTexture(), repeat = createSaturnRingTexture();
  assert.ok(texture.isDataTexture);
  assert.equal(texture.image.width, 2048); assert.equal(texture.image.height, 1);
  assert.equal(texture.colorSpace, 'srgb');
  assert.deepEqual(texture.image.data, repeat.image.data);
  const data = texture.image.data, width = texture.image.width;
  const pixel = t => [...data.subarray(Math.round(t * (width - 1)) * 4, Math.round(t * (width - 1)) * 4 + 4)];
  assert.equal(pixel(0.657)[3], 0, 'Huygens-side opening');
  assert.equal(pixel(0.692)[3], 0, 'open Cassini division, not dark paint');
  assert.equal(pixel(0.922)[3], 0, 'Encke opening');
  assert.equal(pixel(0.983)[3], 0, 'Keeler opening');
  const mean = (a, b, channel) => {
    let sum = 0, count = 0;
    for (let x = Math.floor(a * width); x < Math.floor(b * width); x++) {sum += data[x * 4 + channel]; count++;}
    return sum / count;
  };
  assert.ok(mean(.2, .64, 0) > mean(.02, .18, 0) * 1.3, 'B is brighter than C on lit side');
  assert.ok(mean(.2, .64, 3) > mean(.02, .18, 3) * 1.5, 'C more translucent than B');
  assert.ok(mean(.68, .71, 3) < 25, 'Cassini mostly open, with faint ringlets');
  const chroma = new Set(); let partial = 0, clear = 0;
  for (let i = 0; i < data.length; i += 4) {
    if (data[i + 3] === 0) clear++;
    else {chroma.add(Math.round(100 * data[i + 2] / data[i])); if (data[i + 3] < 200) partial++;}
  }
  assert.ok(chroma.size >= 15, 'band chromaticity varies, not a grayscale multiplier');
  assert.ok(clear > 60 && partial > 300);
  assert.ok(pixel(.35)[0] - pixel(.35)[2] > 25, 'sandy B band');
  assert.ok(pixel(.60)[0] - pixel(.60)[2] < 25, 'ivory B band');
  assert.equal(createSaturnRingTexture(512).image.width, 512);
  assert.throws(() => createSaturnRingTexture(17), /power of two/i);
  texture.dispose(); repeat.dispose();
});
