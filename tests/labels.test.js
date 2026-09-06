import {test} from 'node:test';
import assert from 'node:assert/strict';
const api=await import('../src/labels.js').catch(()=>({}));
test('labels fit within the viewport and competing labels never overlap',()=>{
 assert.equal(typeof api.layoutLabels,'function','bounded label placement is implemented');
 const labels=[{id:'neptune',x:389,y:200,width:70,height:16},{id:'saturn',x:382,y:198,width:60,height:16},{id:'earth',x:5,y:1,width:50,height:16}];
 const placed=api.layoutLabels(labels,{width:390,height:600});
 assert.equal(placed.length,3);
 for(const p of placed){assert.ok(p.x>=8&&p.x+p.width<=382);assert.ok(p.y>=8&&p.y+p.height<=592);}
 for(const a of placed)for(const b of placed)if(a!==b)assert.ok(a.x+a.width<=b.x||b.x+b.width<=a.x||a.y+a.height<=b.y||b.y+b.height<=a.y);
});
