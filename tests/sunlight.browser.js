import {panelAction} from './panel-actions.js';
import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp, mkdir, writeFile, readFile, readdir, rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {resolve, join} from 'node:path';
import {build, preview} from 'vite';
import {chromium} from '@playwright/test';
import {createBrowserHarness, recordRendererConsole} from './browser-harness.js';
import {buildPwa} from '../scripts/build-pwa.mjs';

test('production sunlight controls and isolated same-budget shadow evidence', {timeout:240000}, async t => {
  const harness=createBrowserHarness(t,{operationTimeout:60000});
  const root=resolve(import.meta.dirname,'..');
  const temp=await mkdtemp(join(tmpdir(),'orrery-sunlight-'));
  t.after(()=>rm(temp,{recursive:true,force:true}));
  const evidence=join(root,'evidence/sunlight');await mkdir(evidence,{recursive:true});
  const result={errors:[],driverNotices:[]};
  const browser=await harness.launch(chromium,{headless:true,args:process.platform==='darwin'?['--use-angle=metal']:[]});
  result.browser=browser.version();
  async function start(outDir,extra={}) {
    await harness.run('isolated production build',()=>build({root,configFile:false,logLevel:'warn',build:{outDir,emptyOutDir:true,...extra.build},plugins:extra.plugins||[]}));
    if (!extra.plugins) await buildPwa({outDir});
    const server=await harness.own('preview',()=>preview({root,configFile:false,build:{outDir},preview:{host:'127.0.0.1',port:0}}),s=>new Promise((yes,no)=>{s.httpServer.close(e=>e?no(e):yes());s.httpServer.closeAllConnections();}));
    return `http://127.0.0.1:${server.httpServer.address().port}`;
  }
  const url=await start(join(temp,'production'));
  for (const file of await readdir(join(temp,'production/assets'))) if (file.endsWith('.js')) {
    assert.ok(!(await readFile(join(temp,'production/assets',file),'utf8')).includes('testHandles'),'private fixture must not enter normal build');
  }
  const page=harness.page(await browser.newPage({viewport:{width:1440,height:1000},deviceScaleFactor:1,reducedMotion:'reduce'}));
  page.on('pageerror',e=>result.errors.push(e.message));
  page.on('console',m=>recordRendererConsole(m,result.errors,result.driverNotices));
  const ready=()=>page.waitForFunction(()=>window.__orrery?.diagnostics().ready);
  const diag=()=>page.evaluate(()=>window.__orrery.diagnostics());
  await page.goto(url);await ready();
  assert.equal(await page.locator('#alignment,#bias,#shadows').count(),0);
  assert.equal(await page.locator('#lights-out').isChecked(),false);
  await page.locator('#simulation-date').fill('2026-03-20');await page.locator('#simulation-date').dispatchEvent('change');
  await page.waitForFunction(()=>window.__orrery.getState().date.startsWith('2026-03-20'));
  result.productionDefault=await diag();
  assert.equal(result.productionDefault.earthOrientation.georeferenced,true);
  await page.screenshot({path:join(evidence,'01-exhibit.png'),fullPage:true});
  await page.getByRole('tab',{name:'Settings',exact:true}).click();await page.locator('#lights-out').focus();await page.keyboard.press('Space');
  await page.waitForFunction(()=>window.__orrery.diagnostics().lightsOut);
  result.productionOut=await diag();
  assert.deepEqual(result.productionOut.driveOutputs,result.productionDefault.driveOutputs);
  assert.deepEqual(result.productionOut.moonOutputs,result.productionDefault.moonOutputs);
  assert.deepEqual(result.productionOut.sunlightShadow,{mapSize:[512,512],radius:1.5,bias:0,normalBias:.001});
  await page.locator('#universe').scrollIntoViewIfNeeded();await page.screenshot({path:join(evidence,'02-lights-out.png'),fullPage:true});
  await page.getByRole('tab',{name:'Info',exact:true}).click();await page.locator('#focus-body').click();await panelAction(page,'Settings',()=>page.locator('#view-home').click());
  assert.equal((await diag()).lightsOut,true);
  await panelAction(page,'Settings',()=>page.locator('[data-mode="observatory"]').click());
  await page.waitForFunction(()=>window.__orrery.diagnostics().mode==='observatory');
  await panelAction(page,'Settings',()=>page.locator('#scale').selectOption('distance'));
  await page.locator('#simulation-date').fill('2249-12-31');await page.locator('#simulation-date').dispatchEvent('change');
  await page.waitForFunction(()=>window.__orrery.getState().date.startsWith('2249-12-31'));
  const future=await diag();assert.ok(future.earthOrientation.quaternion.every(Number.isFinite));
  assert.notDeepEqual(future.earthOrientation.quaternion,result.productionDefault.earthOrientation.quaternion);
  await panelAction(page,'Settings',()=>page.locator('#lights-out').uncheck());await page.waitForFunction(()=>!window.__orrery.diagnostics().lightsOut);
  assert.equal((await diag()).sunlightShadow.normalBias,.009);
  await panelAction(page,'Settings',()=>page.locator('#lights-out').check());
  await panelAction(page,'Settings',()=>page.locator('#moons').uncheck());await page.waitForFunction(()=>window.__orrery.diagnostics().moonCount===0);
  await panelAction(page,'Settings',()=>page.locator('#moons').check());
  for(const width of [390,700]) {
    await page.setViewportSize({width,height:1000});await panelAction(page,'Settings',()=>page.locator('#lights-out').uncheck());await panelAction(page,'Settings',()=>page.locator('#lights-out').check());
    assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false);
    await page.screenshot({path:join(evidence,`03-narrow-${width}.png`),fullPage:true});
    await panelAction(page,'Settings',()=>page.locator('[data-mode="mechanical"]').click());await panelAction(page,'Settings',()=>page.locator('#lights-out').uncheck());await panelAction(page,'Settings',()=>page.locator('#lights-out').check());
    await page.screenshot({path:join(evidence,`03-narrow-mechanical-${width}.png`),fullPage:true});
    await panelAction(page,'Settings',()=>page.locator('[data-mode="observatory"]').click());
  }
  await page.reload();await ready();assert.equal(await page.locator('#lights-out').isChecked(),false);
  await panelAction(page,'Settings',()=>page.locator('#lights-out').check());
  await page.evaluate(()=>document.querySelector('#universe canvas').getContext('webgl2').getExtension('WEBGL_lose_context').loseContext());
  await page.waitForFunction(()=>Boolean(window.__orrery.diagnostics().renderError));
  assert.equal(await page.locator('#lights-out').isDisabled(),true);
  await page.locator('button[data-body="jupiter"]').click();assert.equal(await page.locator('#lights-out').isDisabled(),true);
  await page.reload();await ready();assert.equal(await page.locator('#lights-out').isChecked(),false);
  await panelAction(page,'Settings',()=>page.locator('#lights-out').check());await page.waitForFunction(()=>window.__orrery.diagnostics().lightsOut);
  await page.close();

  // Test-only source transform. No production API, query flag or staging control.
  const fixtureURL=await start(join(temp,'fixture'),{build:{rollupOptions:{input:join(root,'tests/fixtures/sunlight/index.html')}},plugins:[{
    name:'private-sunlight-handles',transform(code,id) {
      if(id!==join(root,'src/scene.js'))return;
      const needle='return {setFollow, update, render, resize, resetView';
      assert.equal(code.split(needle).length,2,'scene return seam changed');
      return code.replace(needle,'return {testHandles: {scene, renderer, camera, controls, planets, satellites, sunLight, key, fill, nightFill, instrument}, setFollow, update, render, resize, resetView');
    }
  }]});
  const p=harness.page(await browser.newPage({viewport:{width:1100,height:820},deviceScaleFactor:1}));
  p.on('pageerror',e=>result.errors.push(e.message));p.on('console',m=>recordRendererConsole(m,result.errors,result.driverNotices));
  await p.goto(fixtureURL+'/tests/fixtures/sunlight/index.html');await p.waitForFunction(()=>window.fixture?.app.diagnostics().ready);
  result.default=await p.evaluate(()=>window.fixture.sample());
  await p.evaluate(()=>{const f=window.fixture;window.machinery=[];f.h.instrument.traverse(o=>window.machinery.push([o,o.position.clone(),o.quaternion.clone(),o.scale.clone(),o.geometry,o.material]));f.update({lightsOut:true});});
  result.out=await p.evaluate(()=>window.fixture.sample());
  result.machineryPreserved=await p.evaluate(()=>window.machinery.every(([o,p,q,s,g,m])=>o.position.equals(p)&&o.quaternion.equals(q)&&o.scale.equals(s)&&o.geometry===g&&o.material===m));
  assert.equal(result.machineryPreserved,true);
  assert.equal(result.default.textures,result.out.textures);assert.equal(result.default.geometries,result.out.geometries);
  await p.evaluate(()=>window.fixture.stage('front'));
  await p.evaluate(()=>{const f=window.fixture;f.h.sunLight.shadow.radius=1;window.before=f.pixels();});
  await p.screenshot({path:join(evidence,'04-shadow-before-radius-1.png')});
  await p.evaluate(()=>{const f=window.fixture;f.h.sunLight.shadow.radius=1.5;window.after=f.pixels();});
  await p.screenshot({path:join(evidence,'05-shadow-after-radius-1.5.png')});
  result.smoothing=await p.evaluate(()=>window.fixture.difference(window.before,window.after));assert.ok(result.smoothing.changed>100);
  result.cast=await p.evaluate(()=>{const f=window.fixture;f.moon.castShadow=false;const off=f.pixels();f.moon.castShadow=true;const on=f.pixels();return f.difference(off,on);});
  assert.ok(result.cast.changed>1000,'shadow must remain, not blur away');
  await p.evaluate(()=>{window.fixture.moon.castShadow=false;window.fixture.app.render();});
  await p.screenshot({path:join(evidence,'06-shadow-off.png')});
  await p.evaluate(()=>window.fixture.stage('back'));
  result.receive=await p.evaluate(()=>{const f=window.fixture;f.moon.receiveShadow=false;const off=f.pixels();f.moon.receiveShadow=true;return f.difference(off,f.pixels());});
  assert.ok(result.receive.changed>100,'Moon receives Earth shadow');
  await p.screenshot({path:join(evidence,'07-earth-shadow-on-moon.png')});
  await p.evaluate(()=>{window.fixture.update({lightsOut:false});window.fixture.app.resetView();});
  result.restored=await p.evaluate(()=>window.fixture.sample());
  assert.equal(result.restored.textures,result.default.textures);assert.equal(result.restored.geometries,result.default.geometries);
  assert.equal(result.restored.drawCalls,result.default.drawCalls);
  // Find a close conjunction using only the actual geared outputs. No staging
  // or production controls: select a date, then render its untouched positions.
  result.ordinary=await p.evaluate(()=>{
    const f=window.fixture,start=Date.parse('2026-03-01T12:00:00Z');let best=-Infinity,date;
    f.state.lightsOut=true;
    for(let day=0;day<35;day+=.125) {
      f.state.date=new Date(start+day*86400000);f.app.update(f.state);
      const toSun=f.h.sunLight.position.clone().sub(f.earth.position).normalize();
      const toMoon=f.moon.getWorldPosition(f.earth.position.clone()).sub(f.earth.position).normalize();
      const dot=toSun.dot(toMoon);if(dot>best){best=dot;date=f.state.date.toISOString();}
    }
    f.update({date:new Date(date)});f.focus();
    f.moon.castShadow=false;const off=f.pixels();f.moon.castShadow=true;const on=f.pixels();
    return {date,alignmentDot:best,...f.difference(off,on)};
  });
  assert.ok(result.ordinary.changed>1000,'ordinary geared output also casts a shadow');
  await p.screenshot({path:join(evidence,'08-ordinary-geared-shadow.png')});
  for (const key of ['productionDefault','productionOut']) {
    const {lightsOut,earthOrientation,sunlightShadow,drawCalls,triangles,textures,geometries}=result[key];
    result[key]={lightsOut,earthOrientation,sunlightShadow,drawCalls,triangles,textures,geometries};
  }
  await writeFile(join(evidence,'observations.json'),JSON.stringify(result,null,2));
  assert.deepEqual(result.errors,[]);
  console.log(JSON.stringify({default:result.default,out:result.out,restored:result.restored,smoothing:result.smoothing,cast:result.cast,receive:result.receive,ordinary:result.ordinary,machineryPreserved:result.machineryPreserved}));
});