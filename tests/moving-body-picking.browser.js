import test from 'node:test';
import assert from 'node:assert/strict';
import {resolve, join} from 'node:path';
import {build, preview} from 'vite';
import {chromium} from '@playwright/test';
import {createBrowserHarness, recordRendererConsole} from './browser-harness.js';

test('moving-body double-click preserves its bounded first-click candidate', {timeout:120000}, async t => {
  const root=resolve(import.meta.dirname,'..'), outDir=join(root,'evidence/moving-body-picking/fixture-dist');
  const harness=createBrowserHarness(t);
  await build({root,configFile:false,logLevel:'warn',build:{outDir,rollupOptions:{input:join(root,'tests/fixtures/sunlight/index.html')}},plugins:[{
    name:'picking-test-handles', transform(code,id) {
      if(id===join(root,'src/scene.js')) {
        const needle='return {setFollow, update';
        assert.equal(code.split(needle).length,2);
        return code.replace(needle,'return {testHandles:{THREE,scene,renderer,camera,controls,planets,satellites,sunLight,instrument}, setFollow, update');
      }
      if(id===join(root,'tests/fixtures/sunlight/fixture.js')) {
        return code.replace("container:document.querySelector('#stage')", "container:document.querySelector('#stage'), onSelect:id=>{window.picks.push(['select',id]);update({selected:id});}, onInspect:id=>window.picks.push(['inspect',id])");
      }
    }
  }]});
  const server=await harness.own('preview',()=>preview({root,configFile:false,build:{outDir},preview:{host:'127.0.0.1',port:0}}),s=>new Promise(r=>{s.httpServer.close(r);s.httpServer.closeAllConnections();}));
  const browser=await harness.launch(chromium,{headless:true,args:process.platform==='darwin'?['--use-angle=metal']:[]});
  const page=harness.page(await browser.newPage({viewport:{width:1100,height:820}}));
  const errors=[],notices=[];
  page.on('pageerror',e=>errors.push(e.message));
  page.on('console',m=>recordRendererConsole(m,errors,notices));
  await page.goto(`http://127.0.0.1:${server.httpServer.address().port}/tests/fixtures/sunlight/index.html`);
  await page.waitForFunction(()=>window.fixture?.app.diagnostics().ready);
  const start=async(mode='observatory')=>page.evaluate(mode=>{
    const f=window.fixture;
    window.picks=[]; window.clock=1000; performance.now=()=>window.clock;
    f.update({mode,date:new Date('2026-03-20T12:00:00Z'),selected:null,moons:false,playing:true});
    f.app.resetView('top');
    f.h.controls.target.set(0,0,0); f.h.camera.position.set(0,18,.001);f.h.controls.update();f.app.render();
    if(mode==='mechanical') {
      const mercury=f.h.planets.get('mercury').position;
      f.h.controls.target.set(0,mercury.y,0);
      f.h.camera.position.set(-mercury.z,0,mercury.x).normalize().multiplyScalar(8).y=mercury.y-.2;
      f.h.controls.maxPolarAngle=Math.PI;f.h.controls.update();f.app.render();
    }
    const rect=f.h.renderer.domElement.getBoundingClientRect();
    const p=f.h.planets.get('mercury').position.clone().project(f.h.camera);
    window.clickPoint={x:rect.left+(p.x*.5+.5)*rect.width,y:rect.top+(-p.y*.5+.5)*rect.height};
    return window.clickPoint;
  },mode);
  const point=await start();
  await page.mouse.click(point.x,point.y);
  assert.deepEqual(await page.evaluate(()=>window.picks),[['select','mercury']]);
  const moved=await page.evaluate(()=>{
    const f=window.fixture; window.clock+=150;
    // 150 ms of playback at one Julian year per second.
    f.update({date:new Date(f.state.date.getTime()+365.25*86400000*.15)});
    const rect=f.h.renderer.domElement.getBoundingClientRect(),p=f.h.planets.get('mercury').position.clone().project(f.h.camera);
    return Math.hypot(rect.left+(p.x*.5+.5)*rect.width-window.clickPoint.x,rect.top+(-p.y*.5+.5)*rect.height-window.clickPoint.y);
  });
  assert.ok(moved>26,`Mercury must leave the click tolerance: ${moved}px`);
  await page.mouse.click(point.x,point.y);
  assert.deepEqual(await page.evaluate(()=>window.picks),[['select','mercury'],['inspect','mercury']]);
  await t.test('mechanical playback also inspects the first moving subject',async()=>{
    const p=await start('mechanical');await page.mouse.click(p.x,p.y);
    assert.deepEqual(await page.evaluate(()=>window.picks),[['select','mercury']]);
    await page.evaluate(()=>{const f=window.fixture;window.clock+=150;f.update({date:new Date(f.state.date.getTime()+365.25*86400000*.15)});});
    await page.mouse.click(p.x,p.y);
    assert.deepEqual(await page.evaluate(()=>window.picks),[['select','mercury'],['inspect','mercury']]);
  });
  await t.test('time and spatial limits do not turn independent clicks into Inspect',async()=>{
    for(const boundary of ['time','space']) {
      const p=await start(); await page.mouse.click(p.x,p.y);
      await page.evaluate(boundary=>{window.clock+=boundary==='time'?450:150;},boundary);
      await page.mouse.click(p.x+(boundary==='space'?8:0),p.y);
      assert.deepEqual(await page.evaluate(()=>window.picks),[['select','mercury'],['select','mercury']],boundary);
    }
  });
  await t.test('drag, pan, multi-pointer and cancellation discard the candidate',async()=>{
    for(const gesture of ['drag','pan','multi','cancel','lost-capture']) {
      const p=await start(); await page.mouse.click(p.x,p.y);
      if(gesture==='drag'||gesture==='pan') {
        await page.mouse.move(p.x,p.y);
        await page.mouse.down({button:gesture==='pan'?'right':'left'});
        await page.mouse.move(p.x+30,p.y+20);
        await page.mouse.move(p.x,p.y);
        await page.mouse.up({button:gesture==='pan'?'right':'left'});
      } else {
        await page.evaluate(gesture=>{
          const canvas=window.fixture.h.renderer.domElement,p=window.clickPoint;
          // Synthetic pointers have no browser capture identity. Disable only
          // OrbitControls; the scene's real gesture handlers remain active.
          window.fixture.h.controls.enabled=false;
          const release=canvas.releasePointerCapture;
          canvas.releasePointerCapture=id=>{if(id!==11&&id!==12)release.call(canvas,id);};
          const send=(type,id)=>canvas.dispatchEvent(new PointerEvent(type,{bubbles:true,pointerId:id,pointerType:'touch',button:0,clientX:p.x,clientY:p.y}));
          if(gesture==='multi') {send('pointerdown',11);send('pointerdown',12);send('pointerup',11);send('pointerup',12);}
          else if(gesture==='lost-capture') {send('pointerdown',11);send('lostpointercapture',11);}
          else send('pointercancel',11);
          window.fixture.h.controls.enabled=true;
          canvas.releasePointerCapture=release;
        },gesture);
      }
      await page.evaluate(()=>window.clock+=150);
      await page.mouse.click(p.x,p.y);
      assert.equal(await page.evaluate(()=>window.picks.filter(([kind])=>kind==='inspect').length),0,gesture);
    }
  });
  await t.test('hidden and offscreen candidates cannot be inspected',async()=>{
    for(const hidden of ['body','ancestor','offscreen']) {
      const p=await start(); await page.mouse.click(p.x,p.y);
      await page.evaluate(hidden=>{
        const f=window.fixture,body=f.h.planets.get('mercury');window.clock+=150;
        if(hidden==='body')body.visible=false;
        else if(hidden==='ancestor')body.parent.visible=false;
        else body.position.set(10000,0,0);
      },hidden);
      await page.mouse.click(p.x,p.y);
      assert.equal(await page.evaluate(()=>window.picks.filter(([kind])=>kind==='inspect').length),0,hidden);
      await page.evaluate(()=>{const body=window.fixture.h.planets.get('mercury');body.visible=true;body.parent.visible=true;});
    }
  });
  await t.test('state and view changes discard old candidates even when restored',async()=>{
    for(const change of ['selection','mode','scale','pluto','moons','reset','resize','focus','clear']) {
      const p=await start(); await page.mouse.click(p.x,p.y);
      await page.evaluate(change=>{
        const f=window.fixture,h=f.h,pos=h.camera.position.clone(),target=h.controls.target.clone();
        if(change==='selection'){f.update({selected:'earth'});f.update({selected:'mercury'});}
        if(change==='mode'){f.update({mode:'mechanical'});f.update({mode:'observatory'});}
        if(change==='scale'){f.update({scale:'distance'});f.update({scale:'display'});}
        if(change==='pluto'){f.update({pluto:true});f.update({pluto:false});}
        if(change==='moons'){f.update({moons:true});f.update({moons:false});}
        if(change==='reset')f.app.resetView();
        if(change==='resize')f.app.resize();
        if(change==='focus')f.app.focusBody('earth');
        if(change==='clear')f.app.clearInspection();
        // Restore without control events, so they cannot mask invalidation.
        h.camera.position.copy(pos);h.controls.target.copy(target);h.camera.lookAt(target);h.camera.updateMatrixWorld();
        window.clock+=150;
      },change);
      await page.mouse.click(p.x,p.y);
      assert.equal(await page.evaluate(()=>window.picks.filter(([kind])=>kind==='inspect').length),0,change);
    }
  });
  await t.test('foreground machinery vetoes Inspect and clears the candidate',async()=>{
    const p=await start(); await page.mouse.click(p.x,p.y);
    await page.evaluate(()=>{
      const f=window.fixture,h=f.h,T=h.THREE;
      // Stage an opaque machine part in front of the exact second-click ray.
      window.blocker=new T.Mesh(new T.BoxGeometry(1,1,1),new T.MeshBasicMaterial());
      const world=h.planets.get('mercury').position.clone().lerp(h.camera.position,.25);
      h.instrument.visible=true;h.instrument.updateMatrixWorld(true);
      window.blocker.position.copy(h.instrument.worldToLocal(world));h.instrument.add(window.blocker);
      window.clock+=150;
    });
    await page.mouse.click(p.x,p.y);
    assert.deepEqual(await page.evaluate(()=>window.picks),[['select','mercury'],['select',null]]);
    await page.evaluate(()=>{const b=window.blocker;b.removeFromParent();b.geometry.dispose();b.material.dispose();window.clock+=50;});
    await page.mouse.click(p.x,p.y);
    assert.deepEqual(await page.evaluate(()=>window.picks),[['select','mercury'],['select',null],['select','mercury']]);
  });
  assert.deepEqual(errors,[]);
});
