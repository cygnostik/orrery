import * as THREE from 'three';

/** Additive jewels inside the existing journals, plus the domed grip end-cap.
 * The instrument supplies its pillar materials; host traversal owns/deduplicates
 * all resources. No new materials, textures, shadow passes or finish controls.
 */
export function createPivotInlays({parent, pivots, crank, stoneMaterial, bezelMaterial}) {
  const profile = [[0, -.04], [.173, -.04], [.184, -.012]].map(p => new THREE.Vector2(...p));
  for (let i = 0; i <= 8; i++) {
    const angle = i / 8 * Math.PI / 2;
    profile.push(new THREE.Vector2(.184 * Math.cos(angle), .125 * Math.sin(angle)));
  }
  const geometry = new THREE.LatheGeometry(profile, 24);
  geometry.name = 'pivot-domed-opal-cabochon';
  const vertices = geometry.attributes.position, uv = geometry.attributes.uv;
  for (let i = 0; i < vertices.count; i++) uv.setXY(i, vertices.getX(i) / .368 + .5, vertices.getZ(i) / .368 + .5);
  const bezelGeometry = new THREE.LatheGeometry([[.174, -.05], [.206, -.05], [.208, -.024], [.204, -.008], [.187, .007], [.18, -.012], [.174, -.05]].map(p => new THREE.Vector2(...p)), 24);
  bezelGeometry.name = 'pivot-rolled-opal-bezel';
  const stones = new THREE.InstancedMesh(geometry, stoneMaterial, pivots.length + 1);
  const bezels = new THREE.InstancedMesh(bezelGeometry, bezelMaterial, pivots.length + 1);
  stones.name = 'pivot-opal-cabochons'; bezels.name = 'pivot-opal-bezels';
  const group = new THREE.Group(); group.name = 'pivot-opal-inlays';
  group.add(stones, bezels); parent.add(group);
  const batches = [stones, bezels];
  for (const mesh of batches) {
    mesh.receiveShadow = true;
    mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
  }
  const matrix = new THREE.Matrix4(), inverse = new THREE.Matrix4();
  const rotation = new THREE.Quaternion(), axis = new THREE.Vector3(0, 1, 0);
  const position = new THREE.Vector3(), scale = new THREE.Vector3(.46, .10, .46);
  // Outer bezel .09568 fits the untouched .102 bore, above the +.315 shaft
  // end and below the +.35 housing top. Radial clearance avoids the bridge.
  pivots.forEach((node, index) => {
    rotation.setFromAxisAngle(axis, index * 2.3999632297);
    matrix.compose(position.set(node.x, node.y + .325, node.z), rotation, scale);
    for (const mesh of batches) mesh.setMatrixAt(index, matrix);
  });
  const crankLocal = new THREE.Matrix4().compose(new THREE.Vector3(1.12, .867, 0),
    new THREE.Quaternion(), new THREE.Vector3(.90, .65, .90));
  function update() {
    // Read the actual rotor after mechanism.update, not a separate date/rate.
    // Update only ancestors, not the entire instrument or fixed pivot matrices.
    group.updateWorldMatrix(true, false); crank.updateWorldMatrix(true, false);
    inverse.copy(group.matrixWorld).invert();
    matrix.multiplyMatrices(inverse, crank.matrixWorld).multiply(crankLocal);
    for (const mesh of batches) {
      mesh.setMatrixAt(pivots.length, matrix);
      mesh.instanceMatrix.needsUpdate = true;
      mesh.computeBoundingBox(); mesh.computeBoundingSphere();
    }
  }
  return {group, update};
}
