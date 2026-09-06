import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import {crankDeltaTurns} from './mechanism.js';
import {createSatellites} from './satellite-scene.js';
import {MECHANICAL_RADII, FAMILY_ENVELOPES} from './lunar-layout.js';
import { BODY_HEIGHT, BODY_RADII, DISPLAY_RADII, DISTANCE_FACTOR, createInstrument, createPlanet, mapPosition, replaceSurfaceTexture } from './scene-assets.js';

/** Museum specimen renderer. The host exclusively owns time and requestAnimationFrame. */
export async function createOrrery({container, onSelect = () => {}, onError = () => {}, onManualTurn = () => {}, onAutoToggle = () => {}} = {}) {
  if (!container?.appendChild) throw new TypeError('createOrrery requires a DOM container');
  const {BODIES, positionAt, orbitPoints} = await import('./science.js');
  let renderer;
  try {
    renderer = new THREE.WebGLRenderer({antialias: true, alpha: true, powerPreference: 'high-performance'});
  } catch (error) { onError(error); throw error; }
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.15;
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFShadowMap;
  renderer.info.autoReset = false;
  renderer.setClearColor(0, 0);
  renderer.domElement.setAttribute('aria-label', 'Interactive three-dimensional orrery. Drag to orbit; scroll or pinch to zoom; right-drag or two-finger drag to pan. Use planet buttons to select with a keyboard.');
  renderer.domElement.style.display = 'block';
  renderer.domElement.style.width = '100%'; renderer.domElement.style.height = '100%';
  renderer.domElement.style.touchAction = 'none';
  container.appendChild(renderer.domElement);

  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(35, 1, 0.03, 400);
  camera.layers.enable(1);
  const controls = new OrbitControls(camera, renderer.domElement);
  controls.enableDamping = false; // direct manipulation remains direct under reduced motion
  controls.enablePan = true; controls.screenSpacePanning = true;
  controls.minDistance = 1.2; controls.maxDistance = 180;
  controls.minPolarAngle = 0.015; controls.maxPolarAngle = Math.PI * 0.485;
  controls.zoomSpeed = 0.8; controls.rotateSpeed = 0.6;
  const computed = getComputedStyle(container);
  const cssColor = (name, fallbackName = '--pd-ivory') => {
    const raw = computed.getPropertyValue(name).trim() || computed.getPropertyValue(fallbackName).trim();
    if (!raw) throw new Error(`Required ProDyn token missing: ${name}`);
    // THREE.Color does not use CSS alpha; material opacity is explicit below.
    const rgb = raw.match(/^rgba?\(([^)]+)\)/);
    return new THREE.Color(rgb ? `rgb(${rgb[1].split(',').slice(0, 3).join(',')})` : raw);
  };
  const ivory = cssColor('--pd-ivory'), signal = cssColor('--pd-signal');
  const dim = Number.parseFloat(computed.getPropertyValue('--alpha-dim')) || 0.36;

  const room = new RoomEnvironment();
  // Dark photographic studio walls and narrow bright softboxes give metals
  // readable reflection bands, rather than bathing the entire frame in white.
  room.traverse(object => {
    if (object.isLight) object.intensity *= 0.55;
    if (object.material?.isMeshStandardMaterial) object.material.color.set(0x263645);
    if (object.material?.emissiveIntensity) object.material.emissiveIntensity *= 0.65;
  });
  const pmrem = new THREE.PMREMGenerator(renderer);
  const environmentTarget = pmrem.fromScene(room, 0.025);
  scene.environment = environmentTarget.texture;
  scene.environmentIntensity = 0.95;
  scene.environmentRotation.y = 0.4;
  room.dispose(); pmrem.dispose();

  const {group: instrument, arms, mechanism, setBaseStyle, disposeFinishes} = createInstrument();
  scene.add(instrument);
  const key = new THREE.DirectionalLight(0xe3efff, 1.7);
  key.position.set(-9, 19, 7); key.castShadow = true;
  key.shadow.mapSize.set(2048, 2048);
  Object.assign(key.shadow.camera, {left: -17, right: 17, top: 17, bottom: -17, near: 1, far: 60});
  key.shadow.normalBias = 0.025; key.shadow.bias = -0.0001;
  scene.add(key);
  const fill = new THREE.DirectionalLight(0xdde8ec, 0.65);
  fill.position.set(7, 8, -14); scene.add(fill);
  const sunLight = new THREE.PointLight(0xfff4e4, 2.8, 0, 0);
  sunLight.layers.set(1); sunLight.castShadow = true;
  sunLight.shadow.mapSize.set(512, 512); sunLight.shadow.camera.near = 0.025; sunLight.shadow.camera.far = 60;
  sunLight.shadow.bias = -0.0004; sunLight.shadow.normalBias = 0.009;
  scene.add(sunLight);
  const nightFill = new THREE.AmbientLight(0xbcc9d2, 0.035); nightFill.layers.set(1); scene.add(nightFill);

  const planets = new Map();
  const sun = createPlanet({id: 'sun', tiltDeg: 7.25});
  planets.set('sun', sun); scene.add(sun);
  for (const body of BODIES) { const planet = createPlanet(body); planets.set(body.id, planet); scene.add(planet); }
  const satellites = createSatellites({instrument: {group: instrument, arms, mechanism}}); scene.add(satellites.group);
  const loader = new THREE.TextureLoader();
  const textureFallbacks = [];
  const texturePaths = {mercury: 'mercury', venus: 'venus_atmosphere', earth: 'earth_daymap', mars: 'mars', jupiter: 'jupiter', saturn: 'saturn', uranus: 'uranus', neptune: 'neptune'};
  await Promise.all(Object.entries(texturePaths).map(async ([id, filename]) => {
    try {
      const texture = await loader.loadAsync(`${import.meta.env.BASE_URL}textures/2k_${filename}.jpg`);
      texture.anisotropy = Math.min(8, renderer.capabilities.getMaxAnisotropy());
      replaceSurfaceTexture(planets.get(id), texture);
    } catch { textureFallbacks.push(id); }
  }));
  const solarHalo = makeHalo();
  sun.add(solarHalo);
  // The illuminated surface itself stays small; only a soft, low-opacity corona extends beyond it.
  function makeHalo() {
    const size = 128, data = new Uint8Array(size * size * 4);
    for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) {
      const r = Math.hypot(x - size / 2, y - size / 2) / (size / 2);
      const at = (y * size + x) * 4;
      data[at] = 255; data[at + 1] = 211; data[at + 2] = 145;
      data[at + 3] = Math.max(0, (Math.exp(-r * r * 6) - Math.exp(-6)) * 95);
    }
    const texture = new THREE.DataTexture(data, size, size, THREE.RGBAFormat);
    texture.colorSpace = THREE.SRGBColorSpace; texture.magFilter = texture.minFilter = THREE.LinearFilter; texture.needsUpdate = true;
    const halo = new THREE.Sprite(new THREE.SpriteMaterial({map: texture, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, opacity: 0.65, toneMapped: false}));
    halo.scale.set(4.8, 4.8, 1); halo.name = 'solar-corona';
    return halo;
  }

  const orbitGroup = new THREE.Group(); orbitGroup.name = 'scientific-orbits'; scene.add(orbitGroup);
  const orbits = new Map();
  for (const body of BODIES) {
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.BufferAttribute(new Float32Array(181 * 3), 3).setUsage(THREE.DynamicDrawUsage));
    const material = new THREE.LineBasicMaterial({color: ivory, transparent: true, opacity: dim, depthWrite: false});
    const line = new THREE.Line(geometry, material); line.name = `orbit-${body.id}`;
    orbitGroup.add(line); orbits.set(body.id, line);
  }
  // Static, sparse decorative background; explicitly not a star catalogue.
  let seed = 821;
  const random = () => { seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0; return seed / 4294967296; };
  const starsData = new Float32Array(260 * 3);
  for (let i = 0; i < 260; i++) {
    const y = random() * 2 - 1, angle = random() * Math.PI * 2, r = 110 + random() * 60;
    starsData.set([Math.sqrt(1 - y * y) * Math.cos(angle) * r, y * r, Math.sqrt(1 - y * y) * Math.sin(angle) * r], i * 3);
  }
  const starsGeometry = new THREE.BufferGeometry(); starsGeometry.setAttribute('position', new THREE.BufferAttribute(starsData, 3));
  const stars = new THREE.Points(starsGeometry, new THREE.PointsMaterial({color: ivory, size: 1.1, sizeAttenuation: false, transparent: true, opacity: dim, depthWrite: false}));
  stars.name = 'decorative-seeded-sky'; scene.add(stars);

  const selectionGeometry = new THREE.BufferGeometry();
  const arcs = [];
  for (let arc = 0; arc < 4; arc++) for (let i = 0; i < 8; i++) {
    const a = arc * Math.PI / 2 + 0.14 + i * 0.085, b = a + 0.085;
    arcs.push(Math.cos(a), Math.sin(a), 0, Math.cos(b), Math.sin(b), 0);
  }
  selectionGeometry.setAttribute('position', new THREE.Float32BufferAttribute(arcs, 3));
  const selection = new THREE.LineSegments(selectionGeometry, new THREE.LineBasicMaterial({color: signal, transparent: true, opacity: 0.8, depthTest: false, depthWrite: false}));
  selection.name = 'selection-reticle'; selection.renderOrder = 10; scene.add(selection);

  // Only licensed HUD glyphs are used for the actual graduated dial.
  if (document.fonts) await document.fonts.load('12px "Departure Mono ProDyn"');
  satellites.addLabels(computed.getPropertyValue('--pd-font-hud').trim(), computed.getPropertyValue('--pd-ivory').trim());
  const engravingCanvas = document.createElement('canvas'); engravingCanvas.width = engravingCanvas.height = 2048;
  const ctx = engravingCanvas.getContext('2d');
  if (ctx) {
    ctx.translate(1024, 1024);
    ctx.font = `16px ${computed.getPropertyValue('--pd-font-hud').trim()}`;
    ctx.fillStyle = computed.getPropertyValue('--pd-ivory').trim(); ctx.globalAlpha = 0.56;
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    for (let degrees = 0; degrees < 360; degrees += 30) {
      ctx.save(); ctx.rotate(-degrees * Math.PI / 180); ctx.translate(934, 0); ctx.rotate(Math.PI / 2);
      ctx.fillText(String(degrees).padStart(3, '0'), 0, 0); ctx.restore();
    }
    const map = new THREE.CanvasTexture(engravingCanvas); map.colorSpace = THREE.SRGBColorSpace;
    const engravings = new THREE.Mesh(new THREE.PlaneGeometry(30.3, 30.3), new THREE.MeshBasicMaterial({map, transparent: true, depthWrite: false, opacity: 0.72, toneMapped: false}));
    engravings.rotation.x = -Math.PI / 2; engravings.position.y = -1.909; engravings.name = 'dial-numerals'; instrument.add(engravings);
  }

  let state = {date: new Date('2000-01-01T12:00:00Z'), mode: 'mechanical', selected: 'earth', pluto: false, scale: 'display', labels: false, playing: false, baseStyle: 'nebula', moons: true};
  let disposed = false, ready = false, contextLost = false, width = 1, height = 1, frame = 0, orbitKey = '', home = true, lastView = 'home';
  let inspectedMoon = null;
  const scratch = new THREE.Vector3();
  const raycaster = new THREE.Raycaster(); raycaster.layers.enable(1); raycaster.layers.enable(2);
  const pointer = new THREE.Vector2();
  let down = null, activeControl = null;
  const crankPlane = new THREE.Plane(), planeHit = new THREE.Vector3(), crankOrigin = new THREE.Vector3();

  function worldRadius() {
    if (state.mode === 'mechanical') return Math.max(15.3, ...BODIES.filter(b => state.pluto || b.id !== 'pluto').map(b => MECHANICAL_RADII[b.id] + FAMILY_ENVELOPES[b.id])) + 0.25;
    return Math.max(...BODIES.filter(b => state.pluto || b.id !== 'pluto').map(b => (state.scale === 'distance' ? b.aAU * DISTANCE_FACTOR : DISPLAY_RADII[b.id]) * (1 + b.eccentricity))) + 1;
  }
  function resetView(view = 'home') {
    if (disposed) return;
    inspectedMoon = null; updateSatellites();
    controls.maxPolarAngle = Math.PI * 0.485;
    controls.minDistance = 1.2;
    lastView = view; home = true;
    const radius = worldRadius();
    const direction = view === 'top' ? new THREE.Vector3(0, 1, 0.001) : new THREE.Vector3(0.22, state.mode === 'mechanical' ? 0.42 : 1.1, 1).normalize();
    direction.normalize();
    const right = new THREE.Vector3().crossVectors(new THREE.Vector3(0, 1, 0), direction).normalize();
    const up = new THREE.Vector3().crossVectors(direction, right).normalize();
    controls.target.set(0, state.mode === 'mechanical' ? 2.7 : 0, 0);
    const tan = Math.tan(THREE.MathUtils.degToRad(camera.fov / 2));
    let distance = 1;
    for (let i = 0; i < 96; i++) for (const y of state.mode === 'mechanical' ? [-3.5, BODY_HEIGHT + 1] : [-radius * 0.31, radius * 0.31]) {
      const p = new THREE.Vector3(Math.cos(i / 96 * Math.PI * 2) * radius, y, Math.sin(i / 96 * Math.PI * 2) * radius).sub(controls.target);
      distance = Math.max(distance, p.dot(direction) + Math.abs(p.dot(right)) / (tan * camera.aspect) * 1.035, p.dot(direction) + Math.abs(p.dot(up)) / tan * 1.035);
    }
    camera.position.copy(controls.target).addScaledVector(direction, distance);
    controls.update();
  }
  function resize() {
    if (disposed) return;
    const bounds = container.getBoundingClientRect();
    if (!bounds.width || !bounds.height) return;
    width = bounds.width; height = bounds.height;
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.75));
    renderer.setSize(width, height, false);
    camera.aspect = width / height; camera.updateProjectionMatrix();
    if (home) resetView(lastView);
  }
  function update(next = {}) {
    if (disposed) return;
    const candidate = {...state, ...next};
    if (!['mechanical', 'observatory'].includes(candidate.mode)) throw new RangeError('Unknown orrery mode');
    if (!['nebula', 'obsidian'].includes(candidate.baseStyle)) throw new RangeError('Unknown base finish');
    if (!['display', 'distance'].includes(candidate.scale)) throw new RangeError('Unknown orrery distance scale');
    const date = candidate.date instanceof Date ? candidate.date : new Date(candidate.date);
    // Mechanical time is validated by the drive model. The scientific solver
    // is used only in Observatory, never to overwrite transmitted arm outputs.
    const positions = candidate.mode === 'observatory' ? BODIES.map(body => positionAt(body.id, date)) : null;
    mechanism.update(date, candidate.playing);
    const refit = candidate.mode !== state.mode || candidate.scale !== state.scale || candidate.pluto !== state.pluto;
    if (candidate.selected !== state.selected || candidate.mode !== state.mode || !candidate.moons) inspectedMoon = null;
    state = {...candidate, date};
    const mechanical = state.mode === 'mechanical';
    if (!mechanical && activeControl) releasePointer();
    mechanism.select(state.selected, signal); setBaseStyle(state.baseStyle);
    instrument.visible = mechanical; orbitGroup.visible = !mechanical; stars.visible = !mechanical;
    key.visible = fill.visible = mechanical;
    sun.position.set(0, mechanical ? BODY_HEIGHT : 0, 0);
    sun.scale.setScalar(!mechanical && state.scale === 'distance' ? 0.06 / BODY_RADII.sun : 1);
    sunLight.position.copy(sun.position);
    for (let i = 0; i < BODIES.length; i++) {
      const body = BODIES[i], planet = planets.get(body.id), active = body.id !== 'pluto' || state.pluto;
      planet.visible = active; arms.get(body.id).visible = active; orbits.get(body.id).visible = active;
      const track = instrument.getObjectByName(`track-${body.id}`);
      track.visible = active && track.userData.withinDial;
      if (mechanical) arms.get(body.id).getObjectByName(`planet-mount-${body.id}`).getWorldPosition(planet.position);
      else planet.position.copy(mapPosition(body, positions[i], 'observatory', state.scale));
      planet.scale.setScalar(!mechanical && state.scale === 'distance' ? Math.min(1, body.aAU * (1 - body.eccentricity) * DISTANCE_FACTOR * 0.18 / BODY_RADII[body.id]) : 1);

      const orbit = orbits.get(body.id);
      orbit.material.color.copy(body.id === state.selected ? signal : ivory);
      orbit.material.opacity = body.id === state.selected ? 0.72 : dim;
    }
    updateSatellites();
    // The osculating path changes negligibly within a day; sample once per UTC day.
    const nextOrbitKey = `${date.toISOString().slice(0, 10)}:${state.scale}`;
    if (!mechanical && orbitKey !== nextOrbitKey) {
      for (const body of BODIES) {
        const samples = orbitPoints(body.id, date, 180), line = orbits.get(body.id), attribute = line.geometry.attributes.position;
        samples.forEach((p, i) => { const mapped = mapPosition(body, p, 'observatory', state.scale); attribute.setXYZ(i, mapped.x, mapped.y, mapped.z); });
        attribute.needsUpdate = true; line.geometry.computeBoundingSphere();
      }
      orbitKey = nextOrbitKey;
    }
    if (refit) resetView(lastView);
  }
  function updateSatellites() {
    satellites.update(state.date, planets, {...state, labels: state.labels && !inspectedMoon});
  }
  function focusExtent(position, radius, viewDirection = null) {
    home = false;
    const direction = viewDirection?.clone().normalize() || camera.position.clone().sub(controls.target).normalize();
    controls.maxPolarAngle = viewDirection?.y < 0 ? Math.PI - 0.015 : Math.PI * 0.485;
    // Fit the limiting field of view: family extent remains framed in portrait
    // as well as landscape. Globe-only views leave room to read their surface.
    const halfFov = Math.min(THREE.MathUtils.degToRad(camera.fov / 2), Math.atan(Math.tan(THREE.MathUtils.degToRad(camera.fov / 2)) * camera.aspect));
    const distance = Math.max(0.16, radius * 1.25 / Math.sin(halfFov));
    controls.minDistance = Math.min(1.2, Math.max(0.08, radius * 1.5));
    controls.target.copy(position);
    camera.position.copy(position).addScaledVector(direction, distance);
    controls.update(); return true;
  }
  function focusBody(id) {
    const planet = planets.get(id);
    if (!planet?.visible || disposed) return false;
    inspectedMoon = null; updateSatellites();
    const radius = Math.max(BODY_RADII[id] * (id === 'saturn' ? 2.3 : 1), state.moons ? satellites.inspectionRadius(id) : 0) * planet.scale.x;
    return focusExtent(planet.position, radius);
  }
  function focusMoon(id) {
    if (disposed) return false;
    const target = satellites.inspectionTarget?.(id);
    if (!target) return false;
    inspectedMoon = id; updateSatellites();
    // Authored specimen features, not calibrated body-fixed attitude: inspect
    // Enceladus's south fractures and Charon's north cap from their lit side.
    let direction = null;
    if (id === 'enceladus' || id === 'charon') {
      direction = sun.position.clone().sub(target.position); direction.y = 0;
      direction.normalize(); direction.y = id === 'enceladus' ? -1.5 : 1.5;
    }
    return focusExtent(target.position, target.radius, direction);
  }
  function clearInspection() {
    if (disposed) return false;
    inspectedMoon = null; updateSatellites(); home = false;
    // Release the subject without moving the eye or orbit target. Pan remains
    // freely available; permit close inspection and looking beneath the arms.
    controls.minDistance = 0.08; controls.maxPolarAngle = Math.PI - 0.015;
    return true;
  }
  function focusMechanism() {
    if (disposed || state.mode !== 'mechanical') return false;
    focusExtent(new THREE.Vector3(0, 0.8, 0), 7, new THREE.Vector3(0.32, 0.5, 1));
    return clearInspection();
  }
  function focusCraft() {
    if (disposed || state.mode !== 'mechanical') return false;
    const crowns = instrument.getObjectByName('black-opal-cabochons');
    if (!crowns?.count) return false;
    instrument.updateMatrixWorld(true);
    const matrix = new THREE.Matrix4(), point = new THREE.Vector3(), target = new THREE.Vector3();
    let best = -Infinity;
    for (let i = 0; i < crowns.count; i++) {
      crowns.getMatrixAt(i, matrix); point.setFromMatrixPosition(matrix).applyMatrix4(crowns.matrixWorld);
      const score = point.y * 100 + point.z;
      if (score > best) {best = score; target.copy(point);}
    }
    inspectedMoon = null; updateSatellites(); target.y += 0.03;
    return focusExtent(target, 0.42, new THREE.Vector3(0.35, 0.85, 1.3));
  }
  function render(dtSeconds = 0) {
    if (disposed || contextLost) return;
    // Direct-input OrbitControls updates during events. Repeated spherical
    // round trips at rest cause ulp camera drift during an unrelated crank.
    if (controls.enableDamping || controls.autoRotate) controls.update(Math.max(0, Math.min(0.1, dtSeconds || 0)));
    const selected = planets.get(state.selected);
    selection.visible = Boolean(selected?.visible);
    if (selection.visible) {
      selection.position.copy(selected.position); selection.quaternion.copy(camera.quaternion);
      selection.scale.setScalar(BODY_RADII[state.selected] * selected.scale.x * (state.selected === 'saturn' ? 2.65 : 1.5));
    }
    // Lights are camera-layer filtered, NOT mesh-layer filtered in Three.js.
    // Separate passes keep museum softboxes off the planets' night sides.
    renderer.info.reset();
    camera.layers.set(0); renderer.autoClear = true;
    renderer.render(scene, camera);
    camera.layers.set(1); renderer.autoClear = false;
    renderer.render(scene, camera);
    camera.layers.set(2); renderer.render(scene, camera);
    camera.layers.set(0); camera.layers.enable(1); camera.layers.enable(2); renderer.autoClear = true;
    frame++; ready = true;
  }
  function projectLabels() {
    if (disposed) return [];
    scene.updateMatrixWorld(); camera.updateMatrixWorld();
    return [...planets].map(([id, body]) => {
      scratch.copy(body.position); scratch.y += BODY_RADII[id] * body.scale.x + 0.18;
      scratch.project(camera);
      return {id, x: (scratch.x * 0.5 + 0.5) * width, y: (-scratch.y * 0.5 + 0.5) * height, visible: state.labels && body.visible && scratch.z > -1 && scratch.z < 1 && Math.abs(scratch.x) < 0.97 && Math.abs(scratch.y) < 0.98};
    });
  }
  function prepareRay(event) {
    const rect = renderer.domElement.getBoundingClientRect();
    pointer.set((event.clientX - rect.left) / rect.width * 2 - 1, -(event.clientY - rect.top) / rect.height * 2 + 1);
    scene.updateMatrixWorld(); camera.updateMatrixWorld(); raycaster.setFromCamera(pointer, camera);
  }
  function controlHit(event) {
    if (state.mode !== 'mechanical') return null;
    prepareRay(event);
    return raycaster.intersectObjects(mechanism.hitTargets, false)[0]?.object.userData.control || null;
  }
  function crankAngle(event) {
    prepareRay(event);
    mechanism.crankCenter.getWorldPosition(crankOrigin);
    crankPlane.setFromNormalAndCoplanarPoint(new THREE.Vector3(0, 1, 0).transformDirection(mechanism.crank.parent.matrixWorld), crankOrigin);
    if (!raycaster.ray.intersectPlane(crankPlane, planeHit)) return null;
    // Read the angle in the fixed shaft frame, not world XZ: the side crank's
    // winding plane is vertical and its axis is horizontal.
    mechanism.crank.parent.worldToLocal(planeHit);
    planeHit.sub(mechanism.crankCenter.position);
    if (Math.hypot(planeHit.x, planeHit.z) < 0.15) return null;
    return Math.atan2(-planeHit.z, planeHit.x);
  }
  function captureEvent(event) { event.preventDefault(); event.stopImmediatePropagation(); }
  function releasePointer() {
    const id = activeControl?.id;
    activeControl = null; down = null; controls.enabled = true;
    renderer.domElement.style.cursor = '';
    if (id !== undefined && renderer.domElement.hasPointerCapture(id)) renderer.domElement.releasePointerCapture(id);
  }
  function pointerDown(event) {
    if (activeControl) {captureEvent(event); return;}
    if (event.button !== 0 || down && down.id !== event.pointerId) { down = null; return; }
    down = {x: event.clientX, y: event.clientY, id: event.pointerId};
    const kind = controlHit(event);
    if (!kind) return;
    activeControl = {kind, id: event.pointerId, angle: kind === 'crank' ? crankAngle(event) : null};
    controls.enabled = false; renderer.domElement.setPointerCapture(event.pointerId);
    renderer.domElement.style.cursor = kind === 'crank' ? 'grabbing' : 'pointer';
    captureEvent(event);
    if (kind === 'crank') onManualTurn(0);
  }
  function pointerMove(event) {
    if (!activeControl) {renderer.domElement.style.cursor = controlHit(event) === 'crank' ? 'grab' : controlHit(event) ? 'pointer' : ''; return;}
    captureEvent(event);
    if (activeControl.id !== event.pointerId || activeControl.kind !== 'crank') return;
    const angle = crankAngle(event);
    if (angle === null) return;
    const delta = activeControl.angle === null ? 0 : crankDeltaTurns(activeControl.angle, angle);
    activeControl.angle = angle;
    if (delta) onManualTurn(delta);
  }
  function pointerUp(event) {
    if (activeControl) {
      captureEvent(event);
      if (activeControl.id !== event.pointerId) return;
      const toggle = activeControl.kind === 'auto' && down && Math.hypot(event.clientX - down.x, event.clientY - down.y) < 12;
      releasePointer(); if (toggle) onAutoToggle(); return;
    }
    if (!down || event.pointerId !== down.id || Math.hypot(event.clientX - down.x, event.clientY - down.y) > 6) { down = null; return; }
    down = null;
    const rect = renderer.domElement.getBoundingClientRect();
    pointer.set((event.clientX - rect.left) / rect.width * 2 - 1, -(event.clientY - rect.top) / rect.height * 2 + 1);
    scene.updateMatrixWorld(); raycaster.setFromCamera(pointer, camera);
    const activeBodies = [...planets.values(), ...satellites.bodies.values()].filter(body => body.visible);
    const hit = raycaster.intersectObjects([...activeBodies, ...(instrument.visible ? [instrument] : [])], true).find(result => {
      for (let object = result.object; object; object = object.parent) if (!object.visible) return false;
      return true;
    });
    if (hit) {
      // A foreground mechanical part must not select a planet behind it.
      for (let object = hit.object; object; object = object.parent) {
        if (activeBodies.includes(object)) { onSelect(object.userData.moonId || object.userData.bodyId); return; }
      }
      onSelect(null); return;
    }
    // Tiny worlds remain tappable without expanding their rendered sphere size.
    let closest = null, minimum = event.pointerType === 'touch' ? 22 : 13;
    for (const body of activeBodies) {
      const p = body.getWorldPosition(new THREE.Vector3()).project(camera);
      if (p.z < -1 || p.z > 1) continue;
      const d = Math.hypot((p.x * 0.5 + 0.5) * rect.width - (event.clientX - rect.left), (-p.y * 0.5 + 0.5) * rect.height - (event.clientY - rect.top));
      if (d < minimum) { minimum = d; closest = body.userData.moonId || body.userData.bodyId; }
    }
    onSelect(closest);
  }
  function onControlStart() { home = false; }
  function onContextLost(event) { event.preventDefault(); contextLost = true; ready = false; onError(new Error('WebGL context lost. Reload to restore the instrument.')); }
  function onPointerCancel(event) { if (activeControl && (!event || activeControl.id === event.pointerId)) releasePointer(); else down = null; }
  controls.addEventListener('start', onControlStart);
  renderer.domElement.addEventListener('pointerdown', pointerDown, true);
  renderer.domElement.addEventListener('pointermove', pointerMove, true);
  renderer.domElement.addEventListener('pointerup', pointerUp, true);
  renderer.domElement.addEventListener('pointercancel', onPointerCancel, true);
  renderer.domElement.addEventListener('lostpointercapture', onPointerCancel);
  renderer.domElement.addEventListener('webglcontextlost', onContextLost);
  const observer = new ResizeObserver(resize); observer.observe(container);
  function controlProjection(object) {
    scene.updateMatrixWorld(); camera.updateMatrixWorld();
    const world = object.getWorldPosition(new THREE.Vector3()), point = world.clone().project(camera);
    return {x: (point.x * 0.5 + 0.5) * width, y: (-point.y * 0.5 + 0.5) * height, world: world.toArray(), visible: !disposed && state.mode === 'mechanical' && point.z > -1 && point.z < 1 && Math.abs(point.x) < 1 && Math.abs(point.y) < 1};
  }
  function controlPoints() {
    const crankGrip = controlProjection(mechanism.crankHandle), crankAxle = controlProjection(mechanism.crankCenter), autoSwitch = controlProjection(mechanism.switchTip);
    return {crankGrip, crankAxle, crank: crankGrip, crankCenter: crankAxle, autoSwitch, switch: autoSwitch};
  }
  function diagnostics() {
    const visible = object => {for (let node = object; node; node = node.parent) if (!node.visible) return false; return Boolean(object);};
    const lunarMechanism = satellites.mechanism.diagnostics();
    const moonOutputs = [...satellites.bodies].map(([id, body]) => {
      const mount = satellites.mechanism.outputMounts.get(id), family = satellites.mechanism.families.get(body.userData.parentId);
      return {id, parentId: body.userData.parentId, position: body.getWorldPosition(new THREE.Vector3()).toArray(), localPosition: body.position.toArray(),
        mountParent: body.parent.name, mountPosition: mount.getWorldPosition(new THREE.Vector3()).toArray(), visible: visible(body), supportVisible: visible(family)};
    });
    const driveOutputs = mechanism.diagnostics().outputs.map(output => {
      const arm = arms.get(output.id);
      return {id: output.id, outputAngle: output.angle, armAngle: arm.rotation.y + arm.parent.rotation.y, planetPosition: planets.get(output.id).position.toArray(), visible: planets.get(output.id).visible};
    });
    return {driveOutputs, lunarMechanism, moonOutputs, moonLabels: [...satellites.labels].map(([id, label]) => ({id, visible: label.visible, layer: label.layers.mask})), moonCount: [...satellites.bodies.values()].filter(body => body.visible).length, moonModel: satellites.model.model, controlPoints: controlPoints(), baseStyle: state.baseStyle, mechanism: mechanism.diagnostics(), draggingCrank: activeControl?.kind === 'crank', camera: {position: camera.position.toArray(), target: controls.target.toArray()}, controls: {crank: controlProjection(mechanism.crankHandle), crankCenter: controlProjection(mechanism.crankCenter), autoSwitch: controlProjection(mechanism.switchTip)},ready: ready && !disposed && !contextLost, revision: THREE.REVISION, backend: 'WebGL2', mode: state.mode, bodyCount: [...planets.values()].filter(body => body.visible).length, drawCalls: renderer.info.render.calls, triangles: renderer.info.render.triangles, geometries: renderer.info.memory.geometries, textures: renderer.info.memory.textures, frame, width, height, pixelRatio: renderer.getPixelRatio(), selected: state.selected, scale: state.scale, disposed, textureFallbacks: [...textureFallbacks], stars: 'decorative seeded positions; not an astronomical catalogue'};
  }
  function dispose() {
    if (disposed) return;
    releasePointer(); disposed = true; ready = false; observer.disconnect();
    disposeFinishes();
    controls.removeEventListener('start', onControlStart); controls.dispose();
    renderer.domElement.removeEventListener('pointerdown', pointerDown, true);
    renderer.domElement.removeEventListener('pointermove', pointerMove, true);
    renderer.domElement.removeEventListener('pointerup', pointerUp, true);
    renderer.domElement.removeEventListener('pointercancel', onPointerCancel, true);
    renderer.domElement.removeEventListener('lostpointercapture', onPointerCancel);
    renderer.domElement.removeEventListener('webglcontextlost', onContextLost);
    const geometries = new Set(), materials = new Set(), textures = new Set();
    scene.traverse(object => {
      if (object.geometry) geometries.add(object.geometry);
      if (object.material) for (const material of Array.isArray(object.material) ? object.material : [object.material]) materials.add(material);
      if (object.isLight && object.shadow) object.shadow.dispose();
      if (object.isInstancedMesh) object.dispose();
      if (object.isReflector) object.getRenderTarget().dispose();
    });
    for (const material of materials) { for (const value of Object.values(material)) if (value?.isTexture) textures.add(value); material.dispose(); }
    for (const geometry of geometries) geometry.dispose();
    for (const texture of textures) texture.dispose();
    environmentTarget.dispose(); scene.environment = null;
    renderer.renderLists.dispose(); renderer.dispose(); renderer.forceContextLoss(); renderer.domElement.remove();
  }
  update(state); resize(); resetView(); render(0);
  return {update, render, resize, resetView, focusBody, focusMoon, focusCraft, clearInspection, focusMechanism, projectLabels, controlPoints, diagnostics, dispose};
}
