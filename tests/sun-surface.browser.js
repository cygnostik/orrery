import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdir, mkdtemp, readFile, writeFile} from 'node:fs/promises';
import {fileURLToPath} from 'node:url';
import path from 'node:path';
import {build, preview} from 'vite';
import {chromium} from '@playwright/test';
import {createBrowserHarness, recordRendererConsole} from './browser-harness.js';

// The exact old Sun-only algorithm, kept small and executable for visual A/B.
// It never changes production state, dependencies or non-Sun surface generation.
function legacySun(width = 512, height = 256) {
  const data = new Uint8Array(width * height * 4);
  const noise = (x, y, z) => Math.sin(x * 3.1 + Math.sin(z * 4.3) + y * 2.7) * 0.24 +
    Math.sin(y * 6.7 + Math.sin(x * 3.6) + z * 4.1) * 0.15 +
    Math.sin(z * 15.1 + Math.sin(y * 11.4) + x * 7.6) * 0.07 +
    Math.sin(x * 39.2 + y * 19.3 + z * 23.7) * 0.035;
  for (let y = 0; y < height; y++) {
    const latitude = (y / (height - 1) - 0.5) * Math.PI;
    const sy = Math.sin(latitude), c = Math.cos(latitude);
    for (let x = 0; x < width; x++) {
      const longitude = x / (width - 1) * Math.PI * 2;
      const sx = Math.cos(longitude) * c, sz = Math.sin(longitude) * c;
      const n = noise(sx * 2.3, sy * 2.3, sz * 2.3), grain = noise(sx * 33, sy * 33, sz * 33);
      const amount = Math.max(0, Math.min(1, 0.68 + grain * 0.4 + n * 0.2)), i = (y * width + x) * 4;
      data[i] = 221 + 34 * amount; data[i + 1] = 163 + 74 * amount;
      data[i + 2] = 83 + 106 * amount; data[i + 3] = 255;
    }
  }
  return data;
}

const root = fileURLToPath(new URL('../', import.meta.url));
const evidence = path.join(root, 'evidence/sun-polish');

test('Sun polish: isolated production render, A/B views and unchanged resources', {timeout:120000}, async t => {
  const harness = createBrowserHarness(t, {operationTimeout:45000});
  await mkdir(evidence, {recursive:true});
  const fixture = await mkdtemp(path.join(evidence, 'fixture-'));
  const outDir = path.join(fixture, 'dist');
  const entry = path.join(fixture, 'index.html');
  let beforeSource = legacySun.toString(), beforeCall = 'legacySun()', beforeScope = 'compact legacy Sun algorithm (same pixels, not full baseline startup)';
  try {
    const snapshot = await readFile(path.join(evidence, 'scene-assets-before.js'), 'utf8');
    beforeSource = snapshot.slice(snapshot.indexOf('export function createSurfaceData('), snapshot.indexOf('export function createPlanet('))
      .replace('export function createSurfaceData', 'function originalSurfaceData');
    assert.ok(beforeSource.startsWith('function originalSurfaceData('));
    beforeCall = "originalSurfaceData('sun')";
    beforeScope = 'exact pre-edit production createSurfaceData from captured source';
  } catch(error) {if(error.code !== 'ENOENT') throw error;}
  await writeFile(entry, `<!doctype html><html><head><meta charset="utf-8"><link rel="stylesheet" href="/assets/tokens.css"><style>html,body{margin:0;background:#050a0f}#stage{position:fixed;inset:0}</style></head><body><div id="stage"></div><script type="module" src="./main.js"></script></body></html>`);
  await writeFile(path.join(fixture, 'main.js'), `
    import * as THREE from 'three';
    import {createOrrery} from '/src/scene.js';
    import {createState} from '/src/state.js';
    import {createSurfaceData} from '/src/scene-assets.js';
    ${beforeSource}
    const measure = fn => {const start = performance.now(); const data = fn(); return {data, ms:performance.now()-start};};
    const before = () => ${beforeCall};
    const oldFirst = measure(before), newFirst = measure(()=>createSurfaceData('sun'));
    const generation = {scope:'512x256 RGBA CPU bake, first invocation and 9 warmed samples; not total application startup', beforeGenerator:${JSON.stringify(beforeScope)}, beforeFirstMs:oldFirst.ms, afterFirstMs:newFirst.ms, beforeMs:[], afterMs:[]};
    for(let i=0;i<9;i++){generation.beforeMs.push(measure(before).ms);generation.afterMs.push(measure(()=>createSurfaceData('sun')).ms);}
    const app = await createOrrery({container:document.getElementById('stage')});
    const state = createState(new Date('2026-03-20T12:00:00Z')); state.selected=null; state.playing=false; state.labels=false;
    app.update(state);app.resetView();app.render();
    const {scene,renderer,camera,controls,planets} = app.sunTest;
    const sun = planets.get('sun'), surface = sun.getObjectByName('sun-surface'), map=surface.material.map;
    const resources=[], maps=new Map();
    scene.traverse(o=>{resources.push([o,o.geometry,o.material]);for(const m of [o.material].flat().filter(Boolean))for(const v of Object.values(m))if(v?.isTexture && v!==map && v.image?.data)maps.set(v,v.image.data.slice());});
    function preserved(){return resources.every(([o,g,m])=>o.geometry===g&&o.material===m)&&[...maps].every(([texture,bytes])=>texture.image.data.every((v,i)=>v===bytes[i]));}
    async function set(variant,view){
      // Let ResizeObserver settle before a one-shot render/screenshot. Resizing
      // the drawing buffer after drawing would otherwise capture a blank frame.
      await new Promise(requestAnimationFrame);await new Promise(requestAnimationFrame);
      app.resize();
      // Observatory removes the real axial mount's occlusion, exposing the
      // south pole without altering or hiding individual machinery meshes.
      state.mode=view==='south'?'observatory':'mechanical';app.update(state);
      map.image.data.set(variant==='before'?oldFirst.data:newFirst.data);map.needsUpdate=true;
      if(view==='overview') app.resetView();
      else {
        app.clearInspection();
        controls.minDistance=.1;controls.maxPolarAngle=Math.PI;controls.minPolarAngle=0;
        const direction = view==='north'?new THREE.Vector3(0,1,.001):view==='south'?new THREE.Vector3(0,-1,.001):view==='seam'?new THREE.Vector3(-1,0,.001):new THREE.Vector3(.3,.25,1).normalize();
        direction.applyQuaternion(surface.parent.quaternion);
        controls.target.copy(sun.position);camera.position.copy(sun.position).addScaledVector(direction,4.3);controls.update();
      }
      app.render();app.render();
      const d=app.diagnostics();
      return {mode:d.mode,drawCalls:d.drawCalls,triangles:d.triangles,geometries:d.geometries,textures:d.textures,textureFallbacks:d.textureFallbacks,preserved:preserved(),camera:d.camera};
    }
    const gl=renderer.getContext(),debug=gl.getExtension('WEBGL_debug_renderer_info');
    window.sunTest={app,set,generation,beforeBytes:oldFirst.data,gpu:debug?gl.getParameter(debug.UNMASKED_RENDERER_WEBGL):gl.getParameter(gl.RENDERER),ready:true};
  `);
  await harness.run('isolated Vite build', () => build({configFile:false,root,base:'/',logLevel:'warn',plugins:[{
    name:'sun-only-test-instrumentation',transform(code,id){
      if(!id.endsWith('/src/scene.js')) return;
      const needle='return {update, render, resize, resetView, focusBody,';
      assert.equal(code.split(needle).length,2,'inspect actual scene return API before adapting');
      return code.replace(needle,'return {sunTest: {scene, renderer, camera, controls, planets}, update, render, resize, resetView, focusBody,');
    }
  }],build:{outDir,emptyOutDir:true,chunkSizeWarningLimit:1000,rollupOptions:{input:entry}}}));
  const server = await harness.own('preview',()=>preview({configFile:false,root,base:'/',build:{outDir},preview:{host:'127.0.0.1',port:0}}),s=>new Promise((resolve,reject)=>{s.httpServer.close(error=>error?reject(error):resolve());s.httpServer.closeAllConnections();}));
  const browser = await harness.launch(chromium,{headless:true,args:['--use-angle=metal']});
  const page = harness.page(await browser.newPage({viewport:{width:1440,height:1000},deviceScaleFactor:1}));
  const errors=[],driverNotices=[];
  page.on('pageerror',error=>errors.push(error.message));
  page.on('console',message=>recordRendererConsole(message,errors,driverNotices));
  await page.goto(`http://127.0.0.1:${server.httpServer.address().port}/${path.relative(root,entry)}`);
  await page.waitForFunction(()=>window.sunTest?.ready);
  const result={browser:browser.version(),...await page.evaluate(()=>({generation:window.sunTest.generation,gpu:window.sunTest.gpu})),views:{}};
  // Compare the complete captured baseline buffer when an initial snapshot exists.
  try {
    const bytes=await readFile(path.join(evidence,'sun-before.rgba'));
    const actual=Buffer.from(await page.evaluate(()=>Array.from(window.sunTest.beforeBytes)));
    assert.ok(bytes.equals(actual),'A/B baseline exactly matches the actual pre-edit production buffer');
    result.baselineBytesMatch=true;
  } catch(error) {if(error.code!=='ENOENT')throw error;}
  for(const view of ['overview','close','seam','north','south']){
    if(view!=='overview')await page.setViewportSize({width:1000,height:1000});
    result.views[view]={};
    for(const variant of ['before','after']){
      result.views[view][variant]=await page.evaluate(({variant,view})=>window.sunTest.set(variant,view),{variant,view});
      assert.ok(result.views[view][variant].preserved,'original resource identities and non-Sun texture bytes');
      assert.deepEqual(result.views[view][variant].textureFallbacks,[]);
      await page.screenshot({path:path.join(evidence,`${view}-${variant}.png`)});
    }
    assert.deepEqual(result.views[view].after,result.views[view].before,'identical scene/resource budget and camera');
  }
  result.errors=errors;result.driverNotices=driverNotices;result.outDir=outDir;
  await writeFile(path.join(evidence,'browser-results.json'),JSON.stringify(result,null,2));
  assert.deepEqual(errors,[]);
  await page.evaluate(()=>window.sunTest.app.dispose());
  console.log(JSON.stringify(result,null,2));
});
