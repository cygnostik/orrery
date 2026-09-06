import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { createSatellites } from '../src/satellite-scene.js';
import { createMoonSurface } from '../src/moon-surfaces.js';

function dispose(model) {
  const resources = new Set();
  model.group.traverse(object => {
    if (object.geometry) resources.add(object.geometry);
    for (const material of [object.material].flat().filter(Boolean)) {
      resources.add(material);
      for (const value of Object.values(material)) if (value?.isTexture) resources.add(value);
    }
  });
  for (const resource of resources) resource.dispose();
}

// Residual against a 4×4 block mean measures actual small-scale content, not dimensions.
function fineDetail({data, width, height}) {
  let squared = 0, samples = 0, largestStep = 0;
  for (let y = 32; y < height - 32; y += 4) for (let x = 0; x < width; x += 4) {
    const block = [];
    for (let dy = 0; dy < 4; dy++) for (let dx = 0; dx < 4; dx++) {
      const i = ((y + dy) * width + x + dx) * 4;
      block.push((data[i] + data[i + 1] + data[i + 2]) / 3);
      if (x + dx + 1 < width) largestStep = Math.max(largestStep, Math.abs(data[i] - data[i + 4]));
    }
    const mean = block.reduce((sum, value) => sum + value, 0) / block.length;
    for (const value of block) { squared += (value - mean) ** 2; samples++; }
  }
  return {rms: Math.sqrt(squared / samples), largestStep};
}

test('surface generation rejects unsupported IDs instead of creating a blank or borrowed prototype map', () => {
  for (const id of ['', 'Europa', 'unknown', '__proto__', 'constructor', 'toString']) {
    assert.throws(() => createMoonSurface(id), RangeError, String(id));
  }
  for (const id of [undefined, null, 1, {}, ['europa']]) {
    assert.throws(() => createMoonSurface(id), TypeError);
  }
});

test('albedo resources stay independently owned, directly reproducible and traversal-disposable', () => {
  const model = createSatellites(), repeat = createSatellites(), disposed = new Map();
  try {
    const maps = [...model.bodies.values()].map(mesh => mesh.material.map);
    assert.equal(new Set(maps).size, 10, 'one owned albedo map per moon');
    for (const [id, mesh] of model.bodies) {
      const map = mesh.material.map, other = repeat.bodies.get(id).material.map;
      assert.notEqual(map, other);
      assert.notEqual(map.source, other.source);
      assert.notEqual(map.image.data.buffer, other.image.data.buffer);
      assert.deepEqual(map.image.data, other.image.data, `${id}: compare actual bytes, not a digest`);
      assert.deepEqual(Object.values(mesh.material).filter(value => value?.isTexture), [map]);
      assert.equal(mesh.material.bumpMap, null);
      assert.equal(mesh.material.normalMap, null);
      assert.equal(mesh.material.transparent, false);
      assert.equal(map.colorSpace, THREE.SRGBColorSpace);
      assert.equal(map.flipY, false, 'low v remains south');
      assert.equal(map.generateMipmaps, true);
      assert.equal(map.minFilter, THREE.LinearMipmapLinearFilter);
      assert.equal(map.magFilter, THREE.LinearFilter);
      assert.equal(map.wrapS, THREE.RepeatWrapping);
      assert.equal(map.wrapT, THREE.ClampToEdgeWrapping);
      map.addEventListener('dispose', () => disposed.set(id, (disposed.get(id) || 0) + 1));
    }
    const first = model.bodies.get('io').material.map.image.data;
    first[0] ^= 1;
    const fresh = createMoonSurface('io');
    try {
      assert.deepEqual(fresh.image.data, repeat.bodies.get('io').material.map.image.data, 'no shared mutable pixel cache');
    } finally { fresh.dispose(); }
  } finally { dispose(model); dispose(repeat); }
  assert.equal(disposed.size, 10);
  assert.ok([...disposed.values()].every(count => count === 1));
});

test('authored maps add restrained native small-scale detail on a continuous sphere', () => {
  const model = createSatellites();
  try {
    for (const [id, mesh] of model.bodies) {
      const {data, width, height} = mesh.material.map.image;
      assert.equal(width, 512, `${id}: bounded native detail resolution`);
      assert.equal(height, 256);
      for (let y = 0; y < height; y++) {
        const start = y * width * 4;
        assert.deepEqual(data.subarray(start, start + 4), data.subarray(start + (width - 1) * 4, start + width * 4), `${id}: longitude seam row ${y}`);
      }
      for (const y of [0, height - 1]) for (let x = 1; x < width; x++) {
        const first = y * width * 4, at = first + x * 4;
        assert.deepEqual(data.subarray(first, first + 4), data.subarray(at, at + 4), `${id}: a pole is one surface point`);
      }
      for (let i = 3; i < data.length; i += 4) assert.equal(data[i], 255, `${id}: opaque albedo`);
    }
    for (const id of ['io', 'europa', 'ganymede', 'callisto', 'enceladus']) {
      const detail = fineDetail(model.bodies.get(id).material.map.image);
      assert.ok(detail.rms > 0.65, `${id}: genuine small-scale structure (${detail.rms})`);
      assert.ok(detail.rms < 8, `${id}: no high-contrast grit (${detail.rms})`);
      assert.ok(detail.largestStep < 65, `${id}: no hard black cracks (${detail.largestStep})`);
    }
    assert.ok(fineDetail(model.bodies.get('titan').material.map.image).rms < 0.8, 'Titan remains smooth haze, not ground detail');
  } finally { dispose(model); }
});
