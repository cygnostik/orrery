import * as THREE from 'three';
import {MOONS, MOON_MODEL, moonPositionAt} from './moons.js';
import {createLunarMechanism} from './lunar-mechanism.js';
import {BODY_HEIGHT} from './scene-assets.js';
import {createMoonSurface} from './moon-surfaces.js';

// Independent exhibition scales: neither distance nor size ratios are physical.
export const SATELLITE_DISPLAY = Object.freeze(Object.fromEntries(Object.entries({
  moon: {radius: 0.115, orbit: 0.65}, io: {radius: 0.12, orbit: 1.18},
  europa: {radius: 0.105, orbit: 1.53}, ganymede: {radius: 0.15, orbit: 1.91}, callisto: {radius: 0.14, orbit: 2.29},
  enceladus: {radius: 0.09, orbit: 1.78}, titan: {radius: 0.15, orbit: 2.26},
  miranda: {radius: 0.09, orbit: 0.86}, triton: {radius: 0.12, orbit: 0.92}, charon: {radius: 0.10, orbit: 0.53},
}).map(([id, display]) => [id, Object.freeze(display)])));

// Feature cues are illustrative; provenance is in docs/moons.md and recipe in docs/moon-surfaces.md.
const SURFACES = {
  moon: {cue: 'maria and craters'},
  io: {cue: 'sulfur-colored patches'},
  europa: {cue: 'ice fissures'},
  ganymede: {cue: 'mottled grooved and cratered terrain'},
  callisto: {cue: 'dark cratered terrain'},
  enceladus: {cue: 'bright ice and exaggerated south-polar fractures'},
  titan: {cue: 'golden haze hiding the surface'},
  miranda: {cue: 'scarred terrain and angular ridge patches'},
  triton: {cue: 'muted nitrogen-frost illustration'},
  charon: {cue: 'dark reddish north-polar cap'},
};

export function createSatellites({instrument} = {}) {
  const group = new THREE.Group(); group.name = 'illustrated-moon-companions';
  const bodies = new Map(), tracks = new Map(), labels = new Map();
  const mechanism = instrument ? createLunarMechanism({instrument, display: SATELLITE_DISPLAY, bodyHeight: BODY_HEIGHT}) : null;
  let activeParents = new Map();
  function isVisible(object) {
    if (!object) return false;
    for (let node = object; node; node = node.parent) if (!node.visible) return false;
    return true;
  }
  for (const moon of MOONS) {
    const display = SATELLITE_DISPLAY[moon.id];
    const material = new THREE.MeshStandardMaterial({name: `illustrated-${moon.id}`, map: createMoonSurface(moon.id), roughness: 0.92, metalness: 0, envMapIntensity: 0.14});
    const mesh = new THREE.Mesh(new THREE.SphereGeometry(display.radius, 64, 48), material);
    mesh.layers.set(1); mesh.name = `satellite-${moon.id}`; mesh.userData = {moonId: moon.id, parentId: moon.parentId, bodyId: moon.parentId, model: MOON_MODEL.model, surface: `Authored illustration: ${SURFACES[moon.id].cue}; not a calibrated map or orientation`};
    // Do not claim eclipse accuracy for decorative local radii.
    mesh.castShadow = mesh.receiveShadow = false; mesh.visible = false; group.add(mesh); bodies.set(moon.id, mesh);
    const points = Array.from({length: 97}, (_, i) => new THREE.Vector3(Math.cos(i / 96 * Math.PI * 2) * display.orbit, 0, -Math.sin(i / 96 * Math.PI * 2) * display.orbit));
    const track = new THREE.Line(new THREE.BufferGeometry().setFromPoints(points), new THREE.LineBasicMaterial({color: 0x8fa7b8, opacity: 0.23, transparent: true, depthWrite: false}));
    track.name = `illustrative-track-${moon.id}`; track.visible = false; group.add(track); tracks.set(moon.id, track);
  }
  function addLabels(font, ink) {
    if (labels.size) return;
    for (const moon of MOONS) {
      const canvas = document.createElement('canvas'); canvas.width = 256; canvas.height = 64;
      const ctx = canvas.getContext('2d'); if (!ctx) continue;
      ctx.font = `22px ${font}`; ctx.fillStyle = ink; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillText(moon.name.toUpperCase(), 128, 32);
      const map = new THREE.CanvasTexture(canvas); map.colorSpace = THREE.SRGBColorSpace;
      const sprite = new THREE.Sprite(new THREE.SpriteMaterial({map, transparent: true, opacity: 0.9, depthWrite: false, depthTest: false, toneMapped: false}));
      sprite.layers.set(2); sprite.name = `satellite-label-${moon.id}`; sprite.scale.set(0.8, 0.2, 1); sprite.visible = false; group.add(sprite); labels.set(moon.id, sprite);
    }
  }
  function update(date, planets, {moons = true, selected = '', labels: showLabels = true, mode = 'observatory'} = {}) {
    activeParents = planets;
    const mechanical = mode === 'mechanical' && mechanism;
    if (mechanical) mechanism.update();
    if (mechanism) for (const family of mechanism.families.values()) family.visible = Boolean(mechanical && moons);
    for (const moon of MOONS) {
      const parent = planets.get(moon.parentId), mesh = bodies.get(moon.id), track = tracks.get(moon.id), label = labels.get(moon.id), display = SATELLITE_DISPLAY[moon.id];
      mesh.visible = Boolean(moons && isVisible(parent));
      track.visible = !mechanical && mesh.visible && moon.parentId === selected;
      if (label) label.visible = mesh.visible && showLabels && moon.parentId === selected;
      if (!parent) continue;
      if (mechanical) {
        mechanism.outputMounts.get(moon.id).add(mesh); mesh.position.set(0, 0, 0);
      } else {
        group.add(mesh);
        const offset = moonPositionAt(moon.id, date);
        const factor = display.orbit / moon.orbitRadiusKm * parent.scale.x;
        mesh.position.set(parent.position.x + offset.x * factor, parent.position.y + offset.z * factor, parent.position.z - offset.y * factor);
      }
      mesh.scale.setScalar(parent.scale.x);
      track.position.copy(parent.position); track.scale.copy(parent.scale);
      if (label) {
        if (mechanical) mesh.getWorldPosition(label.position); else label.position.copy(mesh.position);
        label.position.y += (display.radius + 0.17) * parent.scale.x;
        label.scale.set(0.8 * parent.scale.x, 0.2 * parent.scale.x, 1);
      }
    }
  }
  // A world-space inspection sphere; no orbital/phase accuracy is implied.
  function inspectionTarget(moonId) {
    const mesh = bodies.get(moonId);
    if (!isVisible(mesh) || !isVisible(activeParents.get(mesh.userData.parentId))) return null;
    const scale = mesh.getWorldScale(new THREE.Vector3());
    return {position: mesh.getWorldPosition(new THREE.Vector3()),
      radius: SATELLITE_DISPLAY[moonId].radius * Math.max(Math.abs(scale.x), Math.abs(scale.y), Math.abs(scale.z))};
  }
  // LOCAL display units; renderer applies the parent's world scale exactly once.
  function inspectionRadius(parentId) {
    let radius = 0;
    for (const moon of MOONS) if (moon.parentId === parentId) {
      const display = SATELLITE_DISPLAY[moon.id];
      radius = Math.max(radius, display.orbit + display.radius);
    }
    return radius;
  }
  return {group, bodies, labels, mechanism, update, addLabels, inspectionRadius, inspectionTarget, model: MOON_MODEL, display: SATELLITE_DISPLAY};
}
