import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdir,writeFile} from 'node:fs/promises';
import {resolve,join} from 'node:path';
import {build,preview} from 'vite';
import {chromium} from '@playwright/test';
import {createBrowserHarness,recordRendererConsole} from './browser-harness.js';
test('isolated ring diagnosis, Neptune lighting, follow and bounded reflection resources',{timeout:120000},async t=>{
 const harness=createBrowserHarness(t,{operationTimeout:30000}),root=resolve(import.meta.dirname,'..'),outDir=join(root,'evidence/polish/fixture-dist');
 await mkdir(join(root,'evidence/polish'),{recursive:true});
 await build({root,configFile:false,logLevel:'warn',build:{outDir,rollupOptions:{input:join(root,'tests/fixtures/sunlight/index.html')}},plugins:[{name:'polish-test-handles',transform(code,id){if(id!==join(root,'src/scene.js'))return;const needle='return {setFollow, update';assert.equal(code.split(needle).length,2);return code.replace(needle,'return {testHandles:{scene,renderer,camera,controls,planets,satellites,sunLight,instrument}, setFollow, update');}}]});
 const server=await harness.own('preview',()=>preview({root,configFile:false,build:{outDir},preview:{host:'127.0.0.1',port:0}}),s=>new Promise(r=>{s.httpServer.close(r);s.httpServer.closeAllConnections();}));
 const browser=await harness.launch(chromium,{headless:true,args:process.platform==='darwin'?['--use-angle=metal']:[]});
 const page=harness.page(await browser.newPage({viewport:{width:1100,height:820}})),errors=[],notices=[];
 page.on('pageerror',e=>errors.push(e.message));page.on('console',m=>recordRendererConsole(m,errors,notices));
 await page.goto(`http://127.0.0.1:${server.httpServer.address().port}/tests/fixtures/sunlight/index.html`);await page.waitForFunction(()=>window.fixture?.app.diagnostics().ready);
 const capture=async name=>page.screenshot({path:join(root,`evidence/polish/${name}.png`)});
 const result={};
 for(const id of ['saturn','neptune']){
  await page.evaluate(id=>{const f=window.fixture;f.update({selected:id,moons:false});f.app.focusBody(id);f.app.setFollow(null);const planet=f.h.planets.get(id);const direction=f.h.sunLight.position.clone().sub(planet.position).normalize();direction.y+=.45;f.h.controls.target.copy(planet.position);f.h.camera.position.copy(planet.position).addScaledVector(direction,id==='saturn'?4.8:2.7);f.h.controls.update();f.app.render();},id);
  for(const out of [false,true]){
   await page.evaluate(out=>window.fixture.update({lightsOut:out}),out);await capture(`${id}-${out?'out':'exhibit'}`);
  }
  if(id==='saturn'){
   await page.evaluate(()=>{const f=window.fixture;window.clean=f.pixels();f.h.planets.get('saturn').getObjectByName('saturn-rings').castShadow=true;f.app.render();});await capture('saturn-ring-casting-before');
   result.ringDifference=await page.evaluate(()=>{const f=window.fixture;const difference=f.difference(window.clean,f.pixels());f.h.planets.get('saturn').getObjectByName('saturn-rings').castShadow=false;return difference;});assert.ok(result.ringDifference.changed>0);
  }else{
   result.neptune=await page.evaluate(()=>{const f=window.fixture,m=f.h.planets.get('neptune').getObjectByName('neptune-surface').material;return {source:m.map.image.src,roughness:m.roughness,metalness:m.metalness,emissive:m.emissive.getHex(),envMapIntensity:m.envMapIntensity};});
   // Same original map without direct/environment lighting isolates baked cloud features.
   await page.evaluate(()=>{const f=window.fixture,m=f.h.planets.get('neptune').getObjectByName('neptune-surface').material;m.emissive.set(0xffffff);m.emissiveMap=m.map;m.emissiveIntensity=.6;f.h.sunLight.intensity=0;f.app.render();});await capture('neptune-map-isolation');
   await page.evaluate(()=>{const f=window.fixture,m=f.h.planets.get('neptune').getObjectByName('neptune-surface').material;m.emissive.set(0);m.emissiveMap=null;f.h.sunLight.intensity=2.8;});
  }
 }
 await page.evaluate(()=>{const f=window.fixture;f.update({selected:'uranus',moons:true,lightsOut:false});f.app.focusMoon('miranda');f.app.render();});await capture('miranda');
 result.follow=await page.evaluate(()=>{const f=window.fixture;f.app.focusMoon('miranda');const before=f.app.diagnostics(),offset=f.h.camera.position.clone().sub(f.h.controls.target);f.update({date:new Date('2027-01-01T12:00:00Z'),playing:true});const after=f.app.diagnostics();return {before:before.camera,after:after.camera,subject:after.followSubject,offsetError:offset.distanceTo(f.h.camera.position.clone().sub(f.h.controls.target)),targetError:f.h.controls.target.distanceTo(f.h.satellites.inspectionTarget('miranda').position)};});
 assert.equal(result.follow.subject,'miranda');assert.ok(result.follow.offsetError<1e-10);assert.ok(result.follow.targetError<1e-10);assert.notDeepEqual(result.follow.before.target,result.follow.after.target);
 result.resources=await page.evaluate(()=>{const f=window.fixture;const cycle=()=>{for(const size of [512,1024,2048,1024]){f.update({reflectionQuality:size,renderQuality:size===2048?2:1.75});f.app.render();}};cycle();const before=f.app.diagnostics();for(let i=0;i<5;i++)cycle();const after=f.app.diagnostics();return {before:{textures:before.textures,geometries:before.geometries},after:{textures:after.textures,geometries:after.geometries},gpu:(()=>{const gl=f.h.renderer.getContext(),e=gl.getExtension('WEBGL_debug_renderer_info');return e?gl.getParameter(e.UNMASKED_RENDERER_WEBGL):gl.getParameter(gl.RENDERER);})()};});
 assert.deepEqual(result.resources.before,result.resources.after);
 result.errors=errors;result.driverNotices=notices;assert.deepEqual(errors,[]);await writeFile(join(root,'evidence/polish/renderer.json'),JSON.stringify(result,null,2));
});
