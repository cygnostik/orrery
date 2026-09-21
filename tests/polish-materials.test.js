import test from 'node:test';
import assert from 'node:assert/strict';
import {Color} from 'three';
import {createInstrument,createPlanet} from '../src/scene-assets.js';
test('drive disclosure highlighting never emits light in Lights out',()=>{
 const {group,mechanism}=createInstrument();mechanism.select('earth',new Color(0x30b0d0),true);
 const glowing=[];group.traverse(o=>{if(o.material?.emissiveIntensity>0&&o.material.emissive?.getHex()>0)glowing.push(o.name);});assert.deepEqual(glowing,[]);
 mechanism.select(null,new Color(0x30b0d0));group.traverse(o=>{if(o.name.startsWith('wheel-'))assert.equal(o.material.emissiveIntensity,0);});
});
test('Saturn thin rings receive shadows without aliasing as shadow casters',()=>{
 const saturn=createPlanet({id:'saturn',tiltDeg:26.73});const rings=saturn.getObjectByName('saturn-rings');assert.equal(rings.castShadow,false);assert.equal(rings.receiveShadow,true);assert.equal(saturn.getObjectByName('saturn-surface').castShadow,true);
});
