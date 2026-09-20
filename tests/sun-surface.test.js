import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import {createSurfaceData, createPlanet, BODY_RADII} from '../src/scene-assets.js';

// Test actual production bytes, including the endpoints sampled by SphereGeometry.
test('solar granulation is deterministic, seamless and constant at each pole', () => {
  for (const [width, height] of [[512, 256], [128, 64]]) {
    const data = createSurfaceData('sun', width, height);
    assert.deepEqual(data, createSurfaceData('sun', width, height));
    assert.equal(data.length, width * height * 4);
    for (let y = 0; y < height; y++) {
      const i = y * width * 4;
      assert.deepEqual(data.subarray(i, i + 4), data.subarray(i + (width - 1) * 4, i + width * 4));
    }
    for (const y of [0, height - 1]) for (let x = 1; x < width; x++) {
      const i = y * width * 4;
      assert.deepEqual(data.subarray(i, i + 4), data.subarray(i + x * 4, i + x * 4 + 4));
    }
    for (let i = 3; i < data.length; i += 4) assert.equal(data[i], 255);
  }
});

test('native solar detail avoids the old high-contrast subpixel weave', () => {
  const data = createSurfaceData('sun');
  let maximum = 0, total = 0, count = 0;
  for (let y = 64; y < 192; y++) for (let x = 0; x < 511; x++) {
    const i = (y * 512 + x) * 4;
    const difference = Math.abs(data[i + 2] - data[i + 6]);
    maximum = Math.max(maximum, difference); total += difference; count++;
  }
  assert.ok(maximum <= 26, `restrained adjacent blue-channel step: ${maximum}`);
  assert.ok(total / count < 6, `mean adjacent contrast: ${total / count}`);
  assert.ok(total / count > 0.5, 'retain visible granulation, not a flat replacement');
});

test('polar detail is band-limited for the retained sphere UV fan', () => {
  const data = createSurfaceData('sun');
  for (const y of [1, 254]) {
    const blue = Array.from({length:512}, (_, x) => data[(y * 512 + x) * 4 + 2]);
    assert.ok(Math.max(...blue) - Math.min(...blue) <= 2, 'first polar row must not stretch high-contrast cells into radial spokes');
  }
});

test('solar polish retains the original geometry, unlit material and single-map budget', () => {
  const model = createPlanet({id: 'sun', tiltDeg: 7.25});
  const surface = model.getObjectByName('sun-surface');
  const {geometry, material} = surface, texture = material.map;
  try {
    assert.equal(geometry.parameters.radius, BODY_RADII.sun);
    assert.equal(geometry.parameters.widthSegments, 64);
    assert.equal(geometry.parameters.heightSegments, 40);
    assert.equal(material.type, 'MeshBasicMaterial');
    assert.equal(material.color.getHex(), 0xfff2d8);
    assert.equal(material.toneMapped, false);
    assert.equal(surface.castShadow, false);
    assert.equal(surface.receiveShadow, false);
    assert.equal(surface.layers.mask, 2);
    assert.deepEqual(Object.values(material).filter(value => value?.isTexture), [texture]);
    assert.equal(texture.image.width, 512); assert.equal(texture.image.height, 256);
    assert.equal(texture.image.data.byteLength, 524288);
    assert.equal(texture.colorSpace, THREE.SRGBColorSpace);
    assert.equal(texture.wrapS, THREE.RepeatWrapping);
    assert.equal(texture.wrapT, THREE.ClampToEdgeWrapping);
    assert.equal(texture.generateMipmaps, true);
    assert.equal(texture.minFilter, THREE.LinearMipmapLinearFilter);
    assert.equal(texture.magFilter, THREE.LinearFilter);
  } finally {geometry.dispose(); material.dispose(); texture.dispose();}
});
