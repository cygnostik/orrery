import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import {solarOrientation, earthQuaternion} from '../src/earth-orientation.js';
import {createState} from '../src/state.js';
const near = (a,b,e=1e-7) => assert.ok(Math.abs(a-b)<e, `${a} ≠ ${b}`);

// Evaluated from NOAA's unmodified calcSunDeclination/calcEquationOfTime
// functions: https://gml.noaa.gov/grad/solcalc/main.js (see docs/sunlight.md).
const references = [
  ['1800-01-01T00:00:00Z', -23.057126804296292, -3.788881689877671],
  ['2000-01-01T12:00:00Z', -23.032515938065938, -3.3012588023605938],
  ['2050-06-21T12:00:00Z', 23.43061113244102, -1.9209586586254364],
  ['2200-12-21T18:00:00Z', -23.410238438145548, 2.284762280705566],
  ['2250-01-01T00:00:00Z', -23.018487065502214, -2.645933674201775],
];
test('NOAA/Meeus solar reference reconstruction spans the full app range', () => {
  for (const [date,declination,equationOfTime] of references) {
    const s=solarOrientation(date); near(s.declination,declination); near(s.equationOfTime,equationOfTime);
  }
  for (const date of ['bad','1799-12-31T23:59:59.999Z','2250-01-01T00:00:00.001Z']) assert.throws(()=>solarOrientation(date),RangeError);
});
test('UTC midnight/noon and seasons remain approximate solar geography', () => {
  assert.ok(Math.abs(solarOrientation('2026-03-20T12:00:00Z').subsolarLongitude)<3);
  assert.ok(Math.abs(solarOrientation('2026-03-20T00:00:00Z').subsolarLongitude)>177);
  assert.ok(solarOrientation('2026-06-21T12:00:00Z').declination>23.4);
  assert.ok(solarOrientation('2026-12-21T12:00:00Z').declination< -23.4);
});
test('inverse quaternion preserves solar geography at arbitrary displayed bearings and heights', () => {
  for (const [date] of references) for (const angle of [0,1,3]) for (const y of [0,-.1,.15]) {
    const sun=new THREE.Vector3(Math.cos(angle),y,-Math.sin(angle)).normalize();
    const q=earthQuaternion(date,sun),v=sun.clone().applyQuaternion(q.clone().invert()),s=solarOrientation(date);
    near(Math.asin(v.y)*180/Math.PI,s.declination);
    near(Math.atan2(-v.z,v.x)*180/Math.PI,s.subsolarLongitude); near(q.length(),1);
  }
});
test('existing Earth map UV axes stay Greenwich +X, east -Z, north +Y', () => {
  const geo=new THREE.SphereGeometry(1,64,40),p=geo.attributes.position,uv=geo.attributes.uv;
  for(const [u,wanted] of [[.5,[1,0,0]],[.75,[0,0,-1]],[0,[-1,0,0]]]) {
    const i=Array.from({length:uv.count},(_,i)=>i).find(i=>uv.getX(i)===u&&uv.getY(i)===.5);
    wanted.forEach((n,k)=>near(p.array[i*3+k],n));
  }
  geo.dispose();
});
test('exhibit lighting stays the default', () => assert.equal(createState().lightsOut,false));