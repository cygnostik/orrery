import {test} from 'node:test';
import assert from 'node:assert/strict';
const api = await import('../src/state.js').catch(()=>({}));
test('date input rejects invalid or out-of-model dates without losing the previous state',()=>{
 assert.equal(typeof api.setDate,'function','validated date input is implemented');
 const s=api.createState(new Date('2026-09-05T12:00:00Z'));
 for(const value of ['bad','2026-02-30','1799-12-31','2051-01-01','']) {assert.equal(api.setDate(s,value),false);assert.equal(s.date.toISOString(),'2026-09-05T12:00:00.000Z');}
 assert.equal(api.setDate(s,'2024-02-29'),true);assert.equal(s.date.toISOString(),'2024-02-29T12:00:00.000Z');
});
test('a new instrument starts at the supplied UTC date with eight planets and mechanical display',()=>{
  assert.equal(typeof api.createState,'function','instrument state factory is implemented');
  const state=api.createState(new Date('2026-09-05T12:00:00Z'));
  assert.equal(state.date.toISOString(),'2026-09-05T12:00:00.000Z');
  assert.equal(state.mode,'mechanical');
  assert.equal(state.pluto,false);
  assert.equal(state.selected,'earth');
  assert.equal(state.scale,'display');
});
test('museum defaults enable the first moon set and nebula-glass finish without auto motion',()=>{
 const s=api.createState(new Date('2026-09-05T12:00:00Z'));
 assert.equal(s.moons,true);assert.equal(s.baseStyle,'nebula');assert.equal(s.playing,false);
});
test('planet labels start off without hiding the planets or moon companions',()=>{
 const s=api.createState(new Date('2026-09-05T12:00:00Z'));
 assert.equal(s.labels,false);assert.equal(s.moons,true);assert.equal(s.selected,'earth');
});
test('manual crank advances reversibly in 30-day turns, disengages auto and preserves bounds',()=>{
 assert.equal(typeof api.turnCrank,'function','manual crank reducer is implemented');
 const s=api.createState(new Date('2026-09-05T12:00:00Z'));s.playing=true;
 assert.equal(api.turnCrank(s,0.25),true);
 assert.equal(s.date.toISOString(),'2026-09-13T00:00:00.000Z');assert.equal(s.playing,false);
 api.turnCrank(s,-0.25);assert.equal(s.date.toISOString(),'2026-09-05T12:00:00.000Z');
 for(const value of [NaN,Infinity,'1',null]){assert.equal(api.turnCrank(s,value),false);assert.equal(s.date.toISOString(),'2026-09-05T12:00:00.000Z');}
 api.turnCrank(s,1e6);assert.equal(s.date.getTime(),api.MAX_DATE);
 api.turnCrank(s,-1e6);assert.equal(s.date.getTime(),api.MIN_DATE);
});
test('time advances in simulated days per real second only while playing and clamps to supported dates',()=>{
  assert.equal(typeof api.advance,'function','simulation clock is implemented');
  const s=api.createState(new Date('2026-09-05T12:00:00Z'));
  api.advance(s,1); assert.equal(s.date.toISOString(),'2026-09-05T12:00:00.000Z');
  s.playing=true; s.speed=10;
  api.advance(s,0.05); assert.equal(s.date.toISOString(),'2026-09-06T00:00:00.000Z');
  s.date=new Date('2049-12-31T23:59:58Z');api.advance(s,0.1);
  assert.equal(s.date.toISOString(),'2050-01-01T00:00:00.000Z');assert.equal(s.playing,false);
});
