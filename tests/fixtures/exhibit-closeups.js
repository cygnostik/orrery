import * as THREE from 'three';
import {RoomEnvironment} from 'three/addons/environments/RoomEnvironment.js';
import {RoundedBoxGeometry} from 'three/addons/geometries/RoundedBoxGeometry.js';
import {createBlackDlcMaterial, createBlackPvdMaterial, createOpalInlays} from '../../src/exhibit-materials.js';
import {createSaturnRingTexture} from '../../src/saturn-rings.js';

const canvas = document.querySelector('canvas');
const renderer = new THREE.WebGLRenderer({canvas, antialias: true, preserveDrawingBuffer: true});
renderer.setSize(innerWidth, innerHeight - 150, false);
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.toneMapping = THREE.ACESFilmicToneMapping; renderer.toneMappingExposure = 1.15;
const scene = new THREE.Scene();
scene.background = new THREE.Color(getComputedStyle(document.body).getPropertyValue('--pd-field').trim());
const camera = new THREE.PerspectiveCamera(35, canvas.width / canvas.height, .005, 60);
// Match the exhibit's photographic room, light intensities and exposure.
const room = new RoomEnvironment();
room.traverse(o => {
  if (o.isLight) o.intensity *= .55;
  if (o.material?.isMeshStandardMaterial) o.material.color.set(0x263645);
  if (o.material?.emissiveIntensity) o.material.emissiveIntensity *= .65;
});
const pmrem = new THREE.PMREMGenerator(renderer), env = pmrem.fromScene(room, .025);
scene.environment = env.texture; scene.environmentIntensity = .95; scene.environmentRotation.y = .4;
room.dispose(); pmrem.dispose();
const key = new THREE.DirectionalLight(0xe3efff, 1.7); key.position.set(-9, 19, 7); scene.add(key);
const fill = new THREE.DirectionalLight(0xdde8ec, .65); fill.position.set(7, 8, -14); scene.add(fill);

function sampleWheel() {
  const shape = new THREE.Shape(), teeth = 48;
  for (let i = 0; i < teeth; i++) for (const [f, r] of [[-.5,.48],[-.32,.48],[-.2,.53],[.2,.53],[.32,.48],[.5,.48]]) {
    const a = (i + f) / teeth * Math.PI * 2, x = Math.cos(a) * r, y = Math.sin(a) * r;
    if (i === 0 && f === -.5) shape.moveTo(x, y); else shape.lineTo(x, y);
  }
  shape.closePath();
  for (let i = 0; i < 6; i++) {
    const a = i / 6 * Math.PI * 2, hole = new THREE.Path();
    hole.absarc(Math.cos(a) * .31, Math.sin(a) * .31, .117, 0, Math.PI * 2, true); shape.holes.push(hole);
  }
  const bore = new THREE.Path(); bore.absarc(0, 0, .087, 0, Math.PI * 2, true); shape.holes.push(bore);
  const geometry = new THREE.ExtrudeGeometry(shape, {depth: .08, bevelEnabled: true, bevelSize: .005, bevelThickness: .005, bevelSegments: 2, steps: 1, curveSegments: 24});
  geometry.rotateX(-Math.PI / 2); return geometry;
}
const metals = new THREE.Group(), dlc = createBlackDlcMaterial(), pvd = createBlackPvdMaterial();
const wheel = new THREE.Mesh(sampleWheel(), dlc); wheel.position.set(-.63, 0, 0); metals.add(wheel);
for (const z of [-.24, .02, .28]) {
  const bar = new THREE.Mesh(new RoundedBoxGeometry(.92, .10, .13, 3, .008), pvd); bar.position.set(.59, .025, z); metals.add(bar);
}
const washer = new THREE.Mesh(new THREE.TorusGeometry(.14, .027, 12, 64), pvd); washer.rotation.x = Math.PI / 2; washer.position.set(.85, .15, .02); metals.add(washer);
const opal = createOpalInlays([[-.46, 0, -.02], [0, 0, .14], [.46, 0, -.02]]);
const standMaterial = createBlackPvdMaterial();
for (const [x, y, z] of [[-.46,0,-.02],[0,0,.14],[.46,0,-.02]]) {
  const stand = new THREE.Mesh(new THREE.CylinderGeometry(.235, .245, .06, 96), standMaterial); stand.position.set(x, y - .08, z); opal.add(stand);
}
const ringGeo = new THREE.RingGeometry(1.35, 2.3, 256, 1), pos = ringGeo.attributes.position;
for (let i = 0; i < pos.count; i++) ringGeo.attributes.uv.setXY(i, (Math.hypot(pos.getX(i), pos.getY(i)) - 1.35) / .95, .5);
const saturn = new THREE.Group();
const rings = new THREE.Mesh(ringGeo, new THREE.MeshStandardMaterial({map: createSaturnRingTexture(), side: THREE.DoubleSide, transparent: true, opacity: .92, alphaTest: .05, roughness: .94, envMapIntensity: .18, depthWrite: true}));
rings.rotation.x = -Math.PI / 2; saturn.add(rings);
const globe = new THREE.Mesh(new THREE.SphereGeometry(1, 64, 40), new THREE.MeshStandardMaterial({color: 0xc8b995, roughness: .91, envMapIntensity: .08})); saturn.add(globe);
const subjects = {metals, opal, saturn};
for (const group of Object.values(subjects)) {group.visible = false; scene.add(group);}
const labels = {metals: ['Black DLC / polished black PVD', 'LEFT / hard-carbon satin gear     RIGHT / narrow-highlight PVD bars'], opal: ['Blue-fire black opal / polished cabochons', 'Charcoal body · cobalt, azure and cyan pinfire · smooth clearcoat'], saturn: ['Saturn / natural-color ring interpretation', 'Grey C ring · sandy / ivory B ring · Cassini division · subtly warmer A ring']};
function render() {renderer.render(scene, camera);}
function pixels() {render(); const gl = renderer.getContext(), data = new Uint8Array(canvas.width * canvas.height * 4); gl.readPixels(0, 0, canvas.width, canvas.height, gl.RGBA, gl.UNSIGNED_BYTE, data); return data;}
function metrics() {
  const data = pixels(), bg = [...data.subarray(0, 3)]; let nonBackground = 0, sum = 0, max = 0;
  for (let i = 0; i < data.length; i += 4) {
    if (data.subarray(i, i + 3).some((v, k) => Math.abs(v - bg[k]) > 4)) nonBackground++;
    for (let k = 0; k < 3; k++) {sum += data[i + k]; max = Math.max(max, data[i + k]);}
  }
  return {nonBackground, mean: sum / (data.length / 4 * 3), max, drawCalls: renderer.info.render.calls, triangles: renderer.info.render.triangles, geometries: renderer.info.memory.geometries, textures: renderer.info.memory.textures, glError: renderer.getContext().getError()};
}
function show(subject, view = 'front') {
  for (const [name, group] of Object.entries(subjects)) group.visible = name === subject;
  const distances = {metals: 3.1, opal: 2, saturn: 8}, d = distances[subject];
  camera.position.set(view === 'front' ? 0 : d * .32, d * (view === 'front' ? .72 : .38), d * (view === 'front' ? .72 : .92));
  camera.lookAt(0, 0, 0); camera.updateMatrixWorld();
  scene.environmentRotation.y = .4;
  document.querySelector('#subject').textContent = labels[subject][0];
  document.querySelector('#detail').textContent = labels[subject][1];
  return metrics();
}
function response() {
  show('opal'); const lit = pixels(), again = pixels(); let repeatDifference = 0;
  for (let i = 0; i < lit.length; i++) repeatDifference += Math.abs(lit[i] - again[i]);
  scene.environmentRotation.y = 1.8; const rotated = pixels();
  scene.environment = null; key.intensity = fill.intensity = 0; const dark = pixels();
  scene.environment = env.texture; key.intensity = 1.7; fill.intensity = .65; scene.environmentRotation.y = .4;
  let changedPixels = 0, bluePixels = 0, litSum = 0, darkSum = 0, count = 0;
  for (let i = 0; i < lit.length; i += 4) {
    if (Math.max(...lit.subarray(i, i + 3)) < 24) continue;
    count++;
    litSum += lit[i] + lit[i + 1] + lit[i + 2]; darkSum += dark[i] + dark[i + 1] + dark[i + 2];
    if (Math.abs(lit[i] - rotated[i]) + Math.abs(lit[i + 1] - rotated[i + 1]) + Math.abs(lit[i + 2] - rotated[i + 2]) > 15) changedPixels++;
    if (lit[i + 2] > lit[i] * 1.5 && lit[i + 2] > 45 && lit[i + 1] > lit[i] * 1.2) bluePixels++;
  }
  render(); return {litMean: litSum / count / 3, darkMean: darkSum / count / 3, changedPixels, bluePixels, repeatDifference};
}
function fireResponse() {
  show('opal');
  const stones = opal.getObjectByName('black-opal-cabochons'), material = stones.material;
  for (const child of opal.children) child.visible = child === stones;
  // Remove the clearcoat entirely: this assertion must be about the colored
  // buried microfacets, never the uncolored top-shell softbox reflection.
  material.clearcoat = 0; material.needsUpdate = true;
  const front = pixels(); scene.environmentRotation.y = 1.8; const rotated = pixels();
  scene.environmentRotation.y = .4; camera.position.x += .035; camera.lookAt(0, 0, 0); const moved = pixels();
  const blue = (data, i) => data[i + 2] > 45 && data[i + 2] > data[i] * 1.5 && data[i + 1] > data[i] * 1.2;
  let undercoatChangedBlue = 0, viewChangedBlue = 0;
  for (let i = 0; i < front.length; i += 4) {
    if (!blue(front, i)) continue;
    if (Math.abs(front[i + 2] - rotated[i + 2]) > 10) undercoatChangedBlue++;
    if (Math.abs(front[i + 2] - moved[i + 2]) > 10) viewChangedBlue++;
  }
  material.clearcoat = 1; material.needsUpdate = true;
  for (const child of opal.children) child.visible = true;
  opal.visible = false;
  const positions = Array.from({length: 20}, (_, i) => [(i % 5 - 2) * 4, 0, (Math.floor(i / 5) - 1.5) * 3]);
  const tiny = createOpalInlays(positions); subjects.tiny = tiny; scene.add(tiny);
  camera.position.set(0, 25, 25); camera.lookAt(0, 0, 0);
  const data = pixels(); let tinyBluePixels = 0;
  for (let i = 0; i < data.length; i += 4) if (blue(data, i)) tinyBluePixels++;
  const projected = new THREE.Vector3(.184, 0, 0).project(camera).sub(new THREE.Vector3(-.184, 0, 0).project(camera));
  document.querySelector('#subject').textContent = 'Black opal / overview-size optical proof';
  document.querySelector('#detail').textContent = '20 actual 0.368-diameter cabochons · approximately 13 pixels wide · no boosted exposure';
  return {undercoatChangedBlue, viewChangedBlue, tinyBluePixels, centerCabochonWidthPx: projected.x * canvas.width / 2};
}
function dispose() {
  const geometries = new Set(), materials = new Set(), textures = new Set();
  for (const group of Object.values(subjects)) {
    group.traverse(o => {if (o.geometry) geometries.add(o.geometry); if (o.material) materials.add(o.material); if (o.isInstancedMesh) o.dispose();}); scene.remove(group);
  }
  for (const m of materials) {for (const v of Object.values(m)) if (v?.isTexture) textures.add(v); m.dispose();}
  for (const g of geometries) g.dispose(); for (const t of textures) t.dispose();
  scene.environment = null; env.dispose(); render();
  const result = {...renderer.info.memory}; renderer.dispose(); renderer.forceContextLoss(); return result;
}
show('metals');
window.__materials = {ready: true, show, response, fireResponse, dispose};
