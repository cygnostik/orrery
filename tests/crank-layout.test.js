import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import {createDriveTrain, CRANK_LAYOUT, INPUT_DAYS_PER_TURN} from '../src/drive-train.js';
import {createLunarDrive} from '../src/lunar-drive.js';
import {createMechanism, crankDeltaTurns} from '../src/mechanism.js';

const near = (a, b, message) => assert.ok(Math.abs(a - b) < 1e-8, message || `${a} != ${b}`);
// Numeric fixtures captured by executing BOTH unmodified drives before replacing
// the input stage. These are mean-motion outputs, not invented ephemeris samples.
const BEFORE = [{"outputs":[{"id":"mercury","ratio":0.34102803738317755,"periodDays":87.96930665935874,"mountingAngle":-1.8538245298241223},{"id":"venus","ratio":0.13351088304655426,"periodDays":224.70078330273063,"mountingAngle":-3.096091688751235},{"id":"earth","ratio":0.08213417126525,"periodDays":365.2560138838663,"mountingAngle":1.7519646486652485},{"id":"mars","ratio":0.04366942699649794,"periodDays":686.9794742762676,"mountingAngle":-0.009628935682899594},{"id":"jupiter","ratio":0.0069239219950498745,"periodDays":4332.804445435394,"mountingAngle":0.6349586014471034},{"id":"saturn","ratio":0.0027892188722668395,"periodDays":10755.699489304887,"mountingAngle":0.7954964631436026},{"id":"uranus","ratio":0.000977607406715308,"periodDays":30687.165209598694,"mountingAngle":-0.7609802844141714},{"id":"neptune","ratio":0.0004984215097250897,"periodDays":60190.018718387284,"mountingAngle":-0.9788442274730486},{"id":"pluto","ratio":0.00033129767360265226,"periodDays":90553.0053192617,"mountingAngle":-1.9105189948001848}],"samples":[{"date":"2000-01-01T12:00:00Z","angles":[-1.8538245298241223,-3.096091688751235,1.7519646486652485,-0.009628935682899594,0.6349586014471034,0.7954964631436026,-0.7609802844141714,-0.9788442274730486,-1.9105189948001848]},{"date":"2000-01-31T12:00:00Z","angles":[0.2889178239981498,-2.257218070044553,2.2680288667764392,0.2647541663944478,0.6784628863944583,0.8130216421803376,-0.7548377959201079,-0.9757125527663616,-1.908437390125102]},{"date":"1800-01-01T00:00:00Z","angles":[-5219.324318969365,-2045.711409558586,-1254.8386032411781,-668.11876333892,-105.29580003111481,-41.87743823235434,-15.717632643034243,-8.604315554520442,-6.979122298393448]},{"date":"2050-01-01T00:00:00Z","angles":[1302.540583359484,507.5682236989414,315.90605742385253,167.02108445390235,27.11819206314943,11.463949201756048,2.9782595863470225,0.9275627502226337,-0.6433421488434306]}]},{"outputs":[{"id":"moon","ratio":1.0980167288262803,"periodDays":27.321988101281804,"mountingAngle":-1.7519646486652485},{"id":"io","ratio":16.949124866832406,"periodDays":1.770002890161411,"mountingAngle":-0.6349586014471034},{"id":"europa","ratio":8.45072737750081,"periodDays":3.549990274194847,"mountingAngle":0.9358377253477932},{"id":"ganymede","ratio":4.192519673549808,"periodDays":7.155601484536145,"mountingAngle":2.5066340521426898},{"id":"callisto","ratio":1.79743565381186,"periodDays":16.690444487611202,"mountingAngle":4.077430378937587},{"id":"enceladus","ratio":21.894430580542807,"periodDays":1.3702114740842115,"mountingAngle":-0.010098299746154282},{"id":"titan","ratio":1.8814211591279266,"periodDays":15.945393116502183,"mountingAngle":3.131494353843639},{"id":"miranda","ratio":21.231473669769734,"periodDays":1.4129965948955896,"mountingAngle":3.117174774606516},{"id":"triton","ratio":-5.104643293318369,"periodDays":5.877002226437244,"mountingAngle":1.7642423908704967},{"id":"charon","ratio":4.696834015792726,"periodDays":6.387281283334139,"mountingAngle":7.408306138582323}],"samples":[{"date":"2000-01-01T12:00:00Z","angles":[0,0,1.5707963267948966,3.141592653589793,4.71238898038469,0.7853981633974483,3.9269908169872414,2.356194490192345,0.7853981633974483,5.497787143782138]},{"date":"2000-01-31T12:00:00Z","angles":[6.899042577598677,106.49449233283353,54.668282420088275,29.483970666499296,16.006010271016102,138.35216269612732,15.748308600636605,135.75747790185974,-31.288021575573335,35.00886562207228]},{"date":"1800-01-01T00:00:00Z","angles":[-16798.823724323895,-259308.76410583282,-129288.1529665378,-64139.23174988039,-27494.69077264256,-334967.40790080704,-28780.390746480032,-324823.0988487491,78097.9587915703,-71852.50275356881]},{"date":"2050-01-01T00:00:00Z","angles":[4199.792169113195,64828.52220761243,32324.665455619117,16039.064208012245,6879.704349652254,83744.55330746269,7200.154191613536,81210.38747134263,-19523.90886793507,17970.366810802894]}]}];

test('replacement retains all planetary and lunar rates, epoch phases and sampled outputs', () => {
  assert.equal(INPUT_DAYS_PER_TURN, 30);
  for (const [i, drive] of [createDriveTrain(), createLunarDrive()].entries()) {
    assert.deepEqual(drive.outputs.map(({id, ratio, periodDays, mountingAngle}) => ({id, ratio, periodDays, mountingAngle})), BEFORE[i].outputs);
    for (const sample of BEFORE[i].samples) {
      const state = drive.atDate(new Date(sample.date));
      const actual = state.outputs.map(o => i ? o.worldAngle : o.angle);
      if (!i) assert.deepEqual(actual, sample.angles);
      else actual.forEach((angle, j) => {
        // The old lunar evaluator applied x*60/60 three times; removing those
        // redundant operations can change final floating-point rounding only.
        const tolerance = 64 * Number.EPSILON * Math.max(1, Math.abs(sample.angles[j]));
        assert.ok(Math.abs(angle - sample.angles[j]) <= tolerance, `${state.outputs[j].id}: baseline drift`);
      });
    }
  }
});

test('one compact 1:1 miter pair replaces the entire radial input spur train', () => {
  const drive = createDriveTrain(), {nodes, edges, root} = drive.topology;
  assert.equal(root, 'crank-spindle');
  assert.equal(nodes.filter(n => /^input-/.test(n.id)).length, 0, 'remove all four deck idlers');
  const pair = edges.filter(e => e.type === 'right-angle');
  assert.equal(pair.length, 1, 'exactly one direction-changing input pair');
  const a = nodes.find(n => n.id === pair[0].driver), b = nodes.find(n => n.id === pair[0].driven);
  assert.equal(a.gearForm, 'miter'); assert.equal(b.gearForm, 'miter');
  assert.equal(a.teeth, b.teeth); assert.equal(a.module, b.module);
  assert.ok(a.pitchRadius <= 0.35 && b.pitchRadius <= 0.35, 'compact, not another large gear tier');
  assert.ok(edges.some(e => e.driver === root && e.driven === a.id && e.type === 'rigid'));
  assert.ok(edges.some(e => e.driver === b.id && e.driven === 'mercury-driver' && e.type === 'rigid'));
  for (const angle of [-1000, 0, 0.1, 1000]) {
    const state = drive.propagate(angle);
    assert.equal(state[a.id], angle); assert.equal(state[b.id], -angle);
  }
});

test('crank rotates about an outward horizontal shaft with its grip outside the rim', () => {
  const model = createMechanism(), {crank, crankCenter, crankHandle} = model;
  model.group.updateMatrixWorld(true);
  const axis = new THREE.Vector3(0, 1, 0).transformDirection(crank.parent.matrixWorld);
  near(axis.y, 0, 'shaft must be horizontal, not the old vertical spindle');
  assert.equal(model.crankFrame, crank.parent);
  assert.equal(crankCenter.parent, crank.parent, 'reference is on the static frame, not the rotor');
  near(crankCenter.position.y, 0.42);
  assert.ok(axis.dot(new THREE.Vector3(0.22, 0, 1).normalize()) > 0.999);
  const origin = crank.getWorldPosition(new THREE.Vector3());
  assert.ok(Math.hypot(origin.x, origin.z) > CRANK_LAYOUT.rimRadius + 0.4);
  assert.ok(origin.y >= -2.5 && origin.y <= -1.5);
  const frameMatrix = crank.parent.matrixWorld.clone();
  for (let i = 0; i <= 32; i++) {
    model.update(new Date(Date.parse('2000-01-01T12:00:00Z') + i / 32 * 30 * 86400000));
    model.group.updateMatrixWorld(true);
    assert.deepEqual(crank.parent.matrixWorld, frameMatrix, 'axis frame never spins with its crank');
    near(crank.rotation.y, model.diagnostics().nodeAngles['crank-spindle']);
    const center = crankCenter.getWorldPosition(new THREE.Vector3());
    const grip = crankHandle.getWorldPosition(new THREE.Vector3());
    near(grip.clone().sub(center).dot(axis), 0, 'grip stays in the picking plane');
    near(grip.distanceTo(center), 1.12, 'same lever reach at every phase');
    const local = crank.parent.worldToLocal(grip.clone());
    near(Math.cos(Math.atan2(-local.z, local.x)), Math.cos(crank.rotation.y), 'static-frame picking recovers angle');
    assert.ok(Math.hypot(grip.x, grip.z) - 0.18 > CRANK_LAYOUT.rimRadius + 0.4);
    assert.ok(grip.y - 0.18 > -3.48, 'grip clears the base bottom');
  }
  assert.ok(model.hitTargets.includes(crankHandle));
  assert.equal(crankHandle.userData.control, 'crank');
  assert.ok(model.switchTip && model.lever, 'existing auto control contract retained');
  assert.equal(model.group.getObjectByName('crank-pedestal'), undefined, 'no obsolete deck-height pedestal');
});

test('the line shaft physically reaches its pinion through two fixed rim/deck-supported journals', () => {
  const model = createMechanism(), d = model.diagnostics();
  model.group.updateMatrixWorld(true);
  const root = d.topology.nodes.find(n => n.id === 'crank-spindle');
  const pinion = d.topology.nodes.find(n => n.id === 'crank-miter');
  const shaft = model.group.getObjectByName('shaft-crank-spindle-crank-miter');
  const expectedLength = Math.hypot(root.x - pinion.x, root.y - pinion.y, root.z - pinion.z);
  near(shaft.geometry.parameters.height, expectedLength, 'one continuous shaft must span rim to miter');
  const axis = new THREE.Vector3(0, 1, 0).transformDirection(shaft.matrixWorld);
  const center = shaft.getWorldPosition(new THREE.Vector3());
  near(center.clone().addScaledVector(axis, expectedLength / 2).distanceTo(new THREE.Vector3(root.x, root.y, root.z)), 0);
  near(center.clone().addScaledVector(axis, -expectedLength / 2).distanceTo(new THREE.Vector3(pinion.x, pinion.y, pinion.z)), 0);
  near(shaft.geometry.parameters.radiusTop, CRANK_LAYOUT.shaftRadius);
  assert.equal(shaft.parent, model.crank, 'line shaft spins with its input, not an independent animation');
  for (const name of ['crank-bearing', 'input-journal-inboard']) {
    const journal = model.group.getObjectByName(name);
    assert.ok(journal, name);
    assert.equal(journal.parent, model.crankFrame, 'journals must stay fixed');
    const bore = Math.min(...journal.geometry.parameters.points.map(p => p.x));
    assert.ok(bore > CRANK_LAYOUT.shaftRadius, 'journal does not fuse with rotating shaft');
    const delta = journal.getWorldPosition(new THREE.Vector3()).sub(center);
    near(delta.clone().cross(axis).length(), 0, 'journals are coaxial with the shaft');
  }
  for (const name of ['crank-rim-foot', 'input-inboard-foot']) {
    const foot = model.group.getObjectByName(name);
    assert.ok(foot, 'fixed journals need load-bearing deck feet');
    const bounds = new THREE.Box3().setFromObject(foot);
    assert.ok(Math.abs(bounds.min.y - (-1.92)) < 1e-6, 'foot is seated on the deck');
    assert.ok(bounds.max.y < root.y - CRANK_LAYOUT.shaftRadius, 'foot stays below the rotating shaft');
  }
  assert.ok(d.shafts.some(s => s.driver === 'central-miter' && s.driven === 'mercury-driver' && s.innerRadius > 0), 'hollow central connection retains its bore');
  assert.equal(d.topology.nodes.filter(n => /^input-/.test(n.id)).length, 0);
});

test('rendered miter wheels have hollow tapered faces on intersecting pitch cones', () => {
  const model = createMechanism(), d = model.diagnostics();
  model.group.updateMatrixWorld(true);
  const wheels = d.topology.nodes.filter(n => n.gearForm === 'miter');
  assert.equal(wheels.length, 2);
  const axes = [];
  for (const node of wheels) {
    const wheel = model.group.getObjectByName(`wheel-${node.id}`);
    assert.equal(wheel.geometry.parameters.gearForm, 'miter', 'a spur disc tipped on its side is not a bevel gear');
    const positions = wheel.geometry.getAttribute('position');
    const layers = new Map();
    let minRadius = Infinity;
    for (let i = 0; i < positions.count; i++) {
      const y = positions.getY(i), radius = Math.hypot(positions.getX(i), positions.getZ(i));
      layers.set(y, Math.max(layers.get(y) || 0, radius));
      minRadius = Math.min(minRadius, radius);
    }
    const sorted = [...layers].sort((a, b) => a[0] - b[0]);
    assert.ok(sorted.at(-1)[1] - sorted[0][1] > 0.08, 'tooth face tapers toward the common apex');
    assert.ok(Math.abs(minRadius - node.bore) < 1e-6, 'actual negative-space bore stays open');
    const axis = new THREE.Vector3(0, 1, 0).transformDirection(wheel.matrixWorld);
    axes.push(axis);
    const impliedApex = wheel.getWorldPosition(new THREE.Vector3()).addScaledVector(axis, -node.pitchRadius);
    near(impliedApex.distanceTo(new THREE.Vector3(...node.pitchApex)), 0, '45-degree pitch cone converges at declared apex');
    const bounds = new THREE.Box3().setFromObject(wheel);
    assert.ok(bounds.min.y > -1.92, 'input teeth stay above the intact deck');
    assert.ok(bounds.max.y < -1.11, 'pair stays below the existing first spur tier');
    assert.match(wheel.material.name, /dlc/i, 'low clockwork retains the black DLC finish');
  }
  near(axes[0].dot(axes[1]), 0, 'miter shaft axes intersect at 90 degrees');
  assert.equal(d.rightAnglePairs.length, 1);
  assert.match(d.model, /exhibition.*not manufacturing/i, 'diagnostics do not claim conjugate contact validation');
});

test('removing input gears does not reindex the established central metal finishes', () => {
  const model = createMechanism(), {outputs, topology} = model.diagnostics();
  for (const [bodyIndex, output] of outputs.entries()) {
    for (const [gearIndex, suffix] of ['driver', 'wheel', 'pinion', 'output'].entries()) {
      const node = topology.nodes.find(n => n.id === `${output.id}-${suffix}`);
      const wheel = model.group.getObjectByName(`wheel-${node.id}`);
      if (node.y < 0) assert.match(wheel.material.name, /dlc/i);
      else {
        // Original palette index: root + four input discs, then five nodes/body.
        const originalIndex = 5 + 5 * bodyIndex + gearIndex;
        assert.equal(wheel.material.name, originalIndex % 3 ? 'polished-platinum' : 'satin-titanium', node.id);
      }
    }
  }
});

test('compact input retention uses the existing fixed solar axle without another support tower', () => {
  const model = createMechanism(), d = model.diagnostics();
  const centralShaft = d.shafts.find(s => s.driver === 'central-miter');
  for (const end of ['lower', 'upper']) {
    const journal = model.group.getObjectByName(`central-input-journal-${end}`);
    assert.ok(journal, 'driven hollow shaft needs journals on the existing solar axle');
    assert.equal(journal.parent, model.group);
    const radii = journal.geometry.parameters.points.map(p => p.x);
    near(Math.min(...radii), 0.115, 'journal seats on the unchanged solar axle');
    assert.ok(Math.max(...radii) < centralShaft.innerRadius, 'journal clears independent rotating shaft');
    assert.ok(journal.position.y > -1.27 && journal.position.y < -1.04);
  }
  const bearing = model.group.getObjectByName('crank-bearing');
  for (const end of ['inboard', 'outboard']) {
    const collar = model.group.getObjectByName(`crank-thrust-${end}`);
    assert.ok(collar, 'rim journal needs axial retention rather than a free sliding shaft');
    assert.equal(collar.parent, model.crank);
    assert.ok(Math.abs(collar.position.y - bearing.position.y) > 0.125 + collar.geometry.parameters.height / 2);
  }
});

test('clockwise projected drag advances the date and the physical handle follows the picked angle', () => {
  const model = createMechanism(); model.group.updateMatrixWorld(true);
  const camera = new THREE.PerspectiveCamera(35, 1440 / 1000, 0.1, 300);
  camera.position.set(10, 29, 47); camera.lookAt(0, 2.7, 0); camera.updateMatrixWorld(true);
  const pixel = object => {
    const p = object.getWorldPosition(new THREE.Vector3()).project(camera);
    return new THREE.Vector2((p.x + 1) * 720, (1 - p.y) * 500);
  };
  const center = pixel(model.crankCenter), grip = pixel(model.crankHandle);
  const radius = grip.distanceTo(center), start = Math.atan2(grip.y - center.y, grip.x - center.x);
  const axis = new THREE.Vector3(0, 1, 0).transformDirection(model.crank.parent.matrixWorld);
  const plane = new THREE.Plane().setFromNormalAndCoplanarPoint(axis, model.crankCenter.getWorldPosition(new THREE.Vector3()));
  const raycaster = new THREE.Raycaster(); let previous = 0, turns = 0;
  for (let i = 1; i <= 12; i++) {
    const a = start + Math.PI / 2 * i / 12;
    const x = center.x + Math.cos(a) * radius, y = center.y + Math.sin(a) * radius;
    raycaster.setFromCamera(new THREE.Vector2(x / 720 - 1, 1 - y / 500), camera);
    const hit = raycaster.ray.intersectPlane(plane, new THREE.Vector3());
    model.crank.parent.worldToLocal(hit);
    const picked = Math.atan2(-hit.z, hit.x);
    turns += crankDeltaTurns(previous, picked); previous = picked;
    model.update(new Date(Date.parse('2000-01-01T12:00:00Z') + turns * 30 * 86400000));
    near(model.crank.rotation.y, picked, 'date-driven handle follows the hand, never against it');
  }
  assert.ok(turns > 0.05, 'clockwise screen drag advances time with the original signed input');
});
