import * as THREE from 'three';
import '../../../src/style.css';
import {createOrrery} from '../../../src/scene.js';
import {createState} from '../../../src/state.js';
const state=createState(new Date('2026-03-20T12:00:00Z')); state.selected=null;
const app=await createOrrery({container:document.querySelector('#stage')});
const h=app.testHandles;
const earth=h.planets.get('earth'), moon=h.satellites.bodies.get('moon');
function update(options={}) {Object.assign(state,options); app.update(state);app.render();document.querySelector('#note').textContent='TEST FIXTURE — original application motion, not an eclipse prediction';}
function stage(side='front') {
  update({lightsOut:true}); app.clearInspection();
  document.querySelector('#note').textContent='TEST FIXTURE — STAGED shadow geometry, not an eclipse prediction';
  const toSun=h.sunLight.position.clone().sub(earth.position).normalize();
  h.scene.updateMatrixWorld(true);
  moon.position.copy(moon.parent.worldToLocal(earth.position.clone().addScaledVector(toSun,side==='front'?.65:-.65)));
  focus(side);
}
function focus(side='front') {
  const toSun=h.sunLight.position.clone().sub(earth.position).normalize();
  const lateral=new THREE.Vector3().crossVectors(new THREE.Vector3(0,1,0),toSun).normalize();
  const direction=toSun.clone().addScaledVector(lateral,side==='front'?.40:1.4).add(new THREE.Vector3(0,.32,0)).normalize();
  h.controls.target.copy(earth.position);h.camera.position.copy(earth.position).addScaledVector(direction,3.1);
  h.controls.minDistance=.4;h.controls.maxPolarAngle=Math.PI-.015;h.controls.update();app.render();
}
function pixels() {
  app.render();const gl=h.renderer.getContext();gl.finish();
  const p=new Uint8Array(gl.drawingBufferWidth*gl.drawingBufferHeight*4);
  gl.readPixels(0,0,gl.drawingBufferWidth,gl.drawingBufferHeight,gl.RGBA,gl.UNSIGNED_BYTE,p);return p;
}
function difference(a,b) {
  let changed=0,total=0,max=0;
  for(let i=0;i<a.length;i+=4){const d=Math.abs(a[i]-b[i])+Math.abs(a[i+1]-b[i+1])+Math.abs(a[i+2]-b[i+2]);if(d>8)changed++;total+=d;max=Math.max(max,d);}
  return {changed,total,max};
}
async function sample() {
  const times=[],gl=h.renderer.getContext(),debug=gl.getExtension('WEBGL_debug_renderer_info');
  for(let i=0;i<30;i++){await new Promise(requestAnimationFrame);const start=performance.now();app.render();gl.finish();if(i>=6)times.push(performance.now()-start);}
  times.sort((a,b)=>a-b);const d=app.diagnostics();
  return {medianMs:times[12],p95Ms:times[22],drawCalls:d.drawCalls,triangles:d.triangles,textures:d.textures,geometries:d.geometries,gpu:debug?gl.getParameter(debug.UNMASKED_RENDERER_WEBGL):gl.getParameter(gl.RENDERER),pixelRatio:d.pixelRatio,width:d.width,height:d.height};
}
update();
window.fixture={app,h,state,earth,moon,update,stage,focus,pixels,difference,sample};