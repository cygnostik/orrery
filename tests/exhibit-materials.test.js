import test from 'node:test';
import assert from 'node:assert/strict';

const load = () => import('../src/exhibit-materials.js');

test('DLC and PVD are distinct physically based neutral-black finishes', async () => {
  const {createBlackDlcMaterial, createBlackPvdMaterial} = await load();
  const dlc = createBlackDlcMaterial(), pvd = createBlackPvdMaterial();
  for (const material of [dlc, pvd]) {
    assert.ok(material.isMeshPhysicalMaterial);
    const rgb = material.color.toArray();
    assert.ok(Math.max(...rgb) < 0.06, 'near-black body, not blue paint');
    assert.ok(Math.max(...rgb) / Math.min(...rgb) < 1.3, 'neutral specimen albedo');
    assert.equal(material.emissive.getHex(), 0, 'responds to real lights only');
    assert.ok(material.clearcoat > 0 && material.clearcoatRoughness < 0.15);
    assert.equal(material.transparent, false);
  }
  assert.ok(dlc.roughness >= 0.24 && dlc.roughness <= 0.34);
  assert.ok(dlc.ior >= 1.9, 'hard-carbon high-index surface approximation');
  assert.ok(pvd.metalness >= 0.9);
  assert.ok(pvd.roughness <= 0.18 && pvd.roughness < dlc.roughness);
  assert.notEqual(dlc.name, pvd.name);
  dlc.dispose(); pvd.dispose();
});

test('opal inlays are two shared instanced batches of smooth domed stones and bezels', async () => {
  const {createOpalInlays} = await load();
  assert.equal(typeof createOpalInlays, 'function');
  const positions = Array.from({length: 20}, (_, i) => [i, 0.96, -i]);
  const group = createOpalInlays(positions);
  const stone = group.getObjectByName('black-opal-cabochons');
  const bezel = group.getObjectByName('black-opal-bezels');
  assert.equal(group.children.length, 2);
  for (const mesh of [stone, bezel]) {
    assert.ok(mesh.isInstancedMesh); assert.equal(mesh.count, 20);
    assert.equal(mesh.castShadow, true); assert.equal(mesh.receiveShadow, true);
    mesh.geometry.computeBoundingBox();
    assert.ok(mesh.geometry.boundingBox.max.x < 0.28);
    assert.ok(mesh.geometry.attributes.normal.count > 500, 'smooth—not hex/faceted');
    const {Matrix4, Vector3} = await import('three');
    const matrix = new Matrix4(); mesh.getMatrixAt(7, matrix);
    assert.deepEqual(new Vector3().setFromMatrixPosition(matrix).toArray().map(v => +v.toFixed(5)), positions[7]);
  }
  assert.ok(stone.geometry.boundingBox.max.y > 0.10);
  assert.ok(stone.geometry.boundingBox.max.y < 0.16);
  assert.equal(stone.material.flatShading, false);
  assert.equal(stone.material.clearcoat, 1);
  assert.ok(stone.material.clearcoatRoughness <= 0.04);
  assert.equal(stone.material.emissive.getHex(), 0);
  assert.equal(stone.material.transparent, false);
  assert.ok(stone.material.normalMap.isDataTexture, 'subcoat facets reflect lighting under a smooth clearcoat');
  assert.equal(stone.material.clearcoatNormalMap, null);
  const repeat = createOpalInlays([[0, 0, 0]]).getObjectByName('black-opal-cabochons');
  const data = stone.material.map.image.data;
  assert.deepEqual(data, repeat.material.map.image.data, 'original texture is deterministic');
  let blue = 0, charcoal = 0;
  for (let i = 0; i < data.length; i += 4) {
    if (data[i + 2] > data[i] * 2 && data[i + 2] > 55) blue++;
    if (Math.max(...data.subarray(i, i + 3)) < 30) charcoal++;
  }
  const total = data.length / 4;
  assert.ok(blue / total > 0.18 && blue / total < 0.65, 'dense blue fire with black interstices');
  assert.ok(charcoal / total > 0.30, 'black body must remain visible, not blue plastic');
  const densities = [];
  for (let by = 0; by < 8; by++) for (let bx = 0; bx < 8; bx++) {
    let fire = 0;
    for (let y = by * 64; y < (by + 1) * 64; y++) for (let x = bx * 64; x < (bx + 1) * 64; x++) {
      const at = (y * 512 + x) * 4;
      if (data[at + 2] > 55 && data[at + 2] > data[at] * 2) fire++;
    }
    densities.push(fire / 4096);
  }
  const densityMean = densities.reduce((a, b) => a + b, 0) / densities.length;
  const variance = densities.reduce((a, n) => a + (n - densityMean) ** 2, 0) / densities.length;
  assert.ok(variance > .003, 'organic clustered fire domains, not uniform glitter noise');
  assert.throws(() => createOpalInlays([[0, NaN, 0]]), /finite/i);
  assert.equal(createOpalInlays([]).children.length, 0);
});
