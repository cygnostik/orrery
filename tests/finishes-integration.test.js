import test from 'node:test';
import assert from 'node:assert/strict';
import {createInstrument,createPlanet,BODY_HEIGHT,BODY_RADII} from '../src/scene-assets.js';
import {BODIES} from '../src/science.js';

function dispose(group){
 const geometries=new Set(),materials=new Set(),textures=new Set();
 group.traverse(node=>{if(node.geometry)geometries.add(node.geometry);for(const material of [node.material].flat().filter(Boolean)){materials.add(material);for(const value of Object.values(material))if(value?.isTexture)textures.add(value);}});
 geometries.forEach(g=>g.dispose());materials.forEach(m=>m.dispose());textures.forEach(t=>t.dispose());
}

test('the lower gear bank is black DLC while planet beams use black PVD',()=>{
 const instrument=createInstrument();
 try{
  const lower=instrument.mechanism.diagnostics().topology.nodes.filter(n=>n.kind==='gear'&&n.y<0);
  assert.ok(lower.length>=4);
  for(const node of lower){
   const wheel=instrument.group.getObjectByName(node.id==='input-0'?'drive-wheel':`wheel-${node.id}`);
   assert.match(wheel.material.name,/dlc/i,`${node.id} must carry the requested lower-bank coating`);
  }
  for(const [id,arm] of instrument.arms){
   const beams=arm.children.filter(n=>n.geometry?.type==='BoxGeometry');
   assert.ok(beams.length>=2,`${id} retains its twin bars`);
   for(const beam of beams)assert.match(beam.material.name,/pvd/i,`${id} beam is black PVD`);
  }
 }finally{instrument.disposeFinishes();dispose(instrument.group);}
});

test('pillar crowns carry domed opal inlays instead of screw heads while perimeter fasteners remain',()=>{
 const instrument=createInstrument();
 try{
  const opals=instrument.group.getObjectByName('black-opal-cabochons');
  assert.ok(opals?.isInstancedMesh,'actual instanced cabochons must be installed on the instrument');
  assert.equal(opals.count,[8,6,6].reduce((sum,n)=>sum+n,0));
  assert.equal(instrument.group.getObjectByName('inlaid-fasteners').count,48,'only the perimeter keeps its screw heads');
  assert.match(opals.geometry.name,/domed/);assert.match(opals.material.name,/opal/);
 }finally{instrument.disposeFinishes();dispose(instrument.group);}
});

test('the actual Saturn ring mesh uses separately colored radial bands and a transparent Cassini gap',()=>{
 const planet=createPlanet(BODIES.find(body=>body.id==='saturn'));
 try{
  const ring=planet.getObjectByName('saturn-rings');
  assert.equal(ring.material.map.name,'saturn-natural-color-radial-bands');
  const {data,width}=ring.material.map.image;
  const ratios=[.1,.3,.56,.9].map(u=>{const i=Math.round(u*(width-1))*4;return data[i]/data[i+1];});
  assert.ok(Math.max(...ratios)-Math.min(...ratios)>.04,'not one uniformly tinted swatch');
  assert.equal(data[Math.round(.69*(width-1))*4+3],0,'the Cassini gap must expose the background');
 }finally{dispose(planet);}
});

test('the raised solar globe remains seated on a continuous central support',()=>{
 const instrument=createInstrument();
 try{
  const axle=instrument.group.getObjectByName('solar-axle');axle.geometry.computeBoundingBox();
  const top=axle.position.y+axle.geometry.boundingBox.max.y;
  assert.ok(top>=BODY_HEIGHT-BODY_RADII.sun,'solar axle must reach the underside of the raised Sun');
  assert.ok(top<BODY_HEIGHT,'the support must terminate inside the mounted globe, not emerge through it');
 }finally{instrument.disposeFinishes();dispose(instrument.group);}
});
