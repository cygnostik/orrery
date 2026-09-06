#!/usr/bin/env node
/**
 * Real-render release media, without changing Orrery's scene or source UI.
 * Run a production preview first, then: node scripts/release-media.mjs
 * ORRERY_URL overrides the preview URL; ORRERY_BROWSER is a Chromium executable.
 * Requires only the project's existing @playwright/test dependency.
 * Camera/selection changes use the real controls. No generated machine artwork.
 */
import assert from 'node:assert/strict';
import {existsSync} from 'node:fs';
import {mkdir, readFile, writeFile, stat} from 'node:fs/promises';
import {dirname, resolve} from 'node:path';
import {fileURLToPath} from 'node:url';
import {chromium} from '@playwright/test';
import * as THREE from 'three';
import {createInstrument, BODY_RADII, BODY_HEIGHT} from '../src/scene-assets.js';
import {SATELLITE_DISPLAY} from '../src/satellite-scene.js';

const SOCIAL_LAYOUTS = {
  landscape:{width:1200,height:630,x:16,y:-120,imageWidth:1248,imageHeight:780},
  square:{width:1080,height:1080,x:-180,y:65,imageWidth:1411.2,imageHeight:882},
};

async function measureSocialFraming(snapshot) {
  // Camera parameters come from renderer source; world positions come from the
  // live renderer. Project original base/arm/crank vertices, not guessed pixels.
  const source=await readFile(resolve(ROOT,'src/scene.js'),'utf8');
  const match=source.match(/new THREE\.PerspectiveCamera\(([\d.]+),/);
  assert.ok(match,'Locate the actual renderer camera FOV for framing checks');
  const camera=new THREE.PerspectiveCamera(Number(match[1]),1440/900,0.03,400);
  camera.position.fromArray(snapshot.camera.position);
  camera.lookAt(new THREE.Vector3().fromArray(snapshot.camera.target));camera.updateMatrixWorld();
  const rows=[],point=new THREE.Vector3();
  const collect=(name,visit)=>{
    const box=new THREE.Box2();
    const add=world=>{point.copy(world).project(camera);box.expandByPoint(new THREE.Vector2((point.x+1)*720,(1-point.y)*450));};
    visit(add);rows.push({name,min:box.min.toArray(),max:box.max.toArray()});
  };
  const sphere=(name,position,radius)=>{
    // A sphere at Saturn's outer ring radius conservatively encloses its tilt.
    const geometry=new THREE.SphereGeometry(radius,96,64),center=new THREE.Vector3().fromArray(position);
    collect(name,add=>{const positions=geometry.attributes.position;for(let i=0;i<positions.count;i++)add(new THREE.Vector3().fromBufferAttribute(positions,i).add(center));});
    geometry.dispose();
  };
  for(const row of snapshot.driveOutputs.filter(row=>row.visible)) sphere(row.id,row.planetPosition,BODY_RADII[row.id]*(row.id==='saturn'?2.3:1));
  sphere('sun',[0,BODY_HEIGHT,0],BODY_RADII.sun);
  for(const row of snapshot.moonOutputs.filter(row=>row.visible)) sphere(row.id,row.position,SATELLITE_DISPLAY[row.id].radius);
  const rig=createInstrument();rig.mechanism.update(new Date('2026-09-05T12:00:00.000Z'),false);
  for(const [id,arm] of rig.arms) {
    arm.visible=snapshot.driveOutputs.some(row=>row.id===id&&row.visible);
    const track=rig.group.getObjectByName(`track-${id}`);
    if(track)track.visible=arm.visible&&track.userData.withinDial;
  }
  rig.group.updateMatrixWorld(true);
  for(const row of snapshot.driveOutputs.filter(row=>row.visible)) {
    const mount=rig.arms.get(row.id).getObjectByName(`planet-mount-${row.id}`).getWorldPosition(new THREE.Vector3());
    assert.ok(mount.distanceTo(new THREE.Vector3().fromArray(row.planetPosition))<1e-7,`${row.id}: source geometry matches live renderer`);
  }
  const meshVertices=(object,add)=>{
    const positions=object.geometry?.attributes.position;if(!positions)return;
    const instance=new THREE.Matrix4(),world=new THREE.Matrix4(),vertex=new THREE.Vector3();
    for(let n=0;n<(object.isInstancedMesh?object.count:1);n++){
      if(object.isInstancedMesh){object.getMatrixAt(n,instance);world.multiplyMatrices(object.matrixWorld,instance);}else world.copy(object.matrixWorld);
      for(let i=0;i<positions.count;i++)add(vertex.fromBufferAttribute(positions,i).applyMatrix4(world));
    }
  };
  for(const name of ['plinth','dial-face','glass-reflection','lower-bezel','glass-edge','index-rail']) collect(name,add=>meshVertices(rig.group.getObjectByName(name),add));
  collect('complete-instrument-including-crank-and-arms',add=>rig.group.traverse(object=>{
    for(let parent=object;parent;parent=parent.parent)if(!parent.visible)return;
    if(object.isMesh)meshVertices(object,add);
  }));
  rig.disposeFinishes();
  const result={method:'Projected original instrument vertices and live-renderer globe positions; Saturn bounded by its outer-ring sphere',sourceViewport:[1440,900],fov:Number(match[1]),cards:{}};
  for(const [name,layout] of Object.entries(SOCIAL_LAYOUTS)){
    const bounds=rows.map(row=>{
      const minX=layout.x+row.min[0]*layout.imageWidth/1440,maxX=layout.x+row.max[0]*layout.imageWidth/1440;
      const minY=layout.y+row.min[1]*layout.imageHeight/900,maxY=layout.y+row.max[1]*layout.imageHeight/900;
      const margins={left:minX,right:layout.width-maxX,top:minY,bottom:layout.height-maxY};
      assert.ok(Object.values(margins).every(margin=>margin>=32),`${name}/${row.name}: 32px minimum frame clearance`);
      return {name:row.name,bounds:[minX,minY,maxX,maxY].map(n=>+n.toFixed(2)),margins:Object.fromEntries(Object.entries(margins).map(([key,n])=>[key,+n.toFixed(2)]))};
    });
    result.cards[name]={...layout,minimumClearance:+Math.min(...bounds.flatMap(row=>Object.values(row.margins))).toFixed(2),bounds};
  }
  return result;
}

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
export const OUTPUTS = [
  {path:'public/social/orrery-card.jpg', size:[1200,630]},
  {path:'public/social/orrery-card.png', size:[1200,630]},
  {path:'public/social/orrery-square.png', size:[1080,1080]},
  ...[['icon-192',192],['icon-512',512],['maskable-512',512],['apple-touch-icon',180],['favicon-32',32],['favicon-16',16]].map(([name,size])=>({path:`public/icons/${name}.png`,size:[size,size]})),
  {path:'public/screenshots/desktop.png', size:[1440,1000]},
  {path:'public/screenshots/mobile.png', size:[390,844]},
  {path:'docs/media/hero.png', size:[1600,1000]},
  {path:'docs/media/mechanism.png', size:[1200,750]},
  {path:'docs/media/saturn.png', size:[1200,750]},
  {path:'docs/media/mobile.png', size:[390,844]},
];

function browserPath() {
  if (process.env.ORRERY_BROWSER) {
    assert.ok(existsSync(process.env.ORRERY_BROWSER), 'ORRERY_BROWSER must name an existing Chromium executable');
    return process.env.ORRERY_BROWSER;
  }
  const paths = [chromium.executablePath(),
    '/Applications/Microsoft Edge.app/Contents/MacOS/Microsoft Edge',
    '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
    '/usr/bin/chromium', '/usr/bin/chromium-browser', '/usr/bin/google-chrome',
    ...(process.env.PROGRAMFILES ? [`${process.env.PROGRAMFILES}/Google/Chrome/Application/chrome.exe`] : []),
    ...(process.env['PROGRAMFILES(X86)'] ? [`${process.env['PROGRAMFILES(X86)']}/Microsoft/Edge/Application/msedge.exe`] : []),
  ];
  const executable = paths.find(path => existsSync(path));
  assert.ok(executable, 'Install Playwright Chromium or set ORRERY_BROWSER to Chrome/Edge');
  return executable;
}

async function main() {
  const url = new URL(process.env.ORRERY_URL || 'http://127.0.0.1:5198/');
  assert.ok(['http:', 'https:'].includes(url.protocol), 'ORRERY_URL must use HTTP(S)');
  assert.ok(!url.username && !url.password, 'Use a public, credential-free preview URL');
  const report = {source:'Actual Orrery WebGL renderer', url:url.href, simulationDate:'2026-09-05T12:00:00.000Z',
    rendererChecks:[], renderedFonts:[], outputs:[], errors:[], failedRequests:[],
    transformations:['CSS-only capture isolation; no source scene changes', 'Real camera controls, fixed simulation date, paused motion', 'Crop and downsample; editorial type on social cards', 'Top-down machine crop for icons; circular crop stays within maskable safe area'],
    visualQA:{status:'pending-human-or-vision-review', note:'Automated checks are not a substitute for visual review.'}};
  for (const {path} of OUTPUTS) await mkdir(dirname(resolve(ROOT,path)), {recursive:true});
  await mkdir(resolve(ROOT,'evidence'), {recursive:true});
  const browser = await chromium.launch({executablePath:browserPath(), headless:true, args:['--enable-unsafe-swiftshader']});
  report.browser = browser.version();
  const dataURL = buffer => `data:image/png;base64,${buffer.toString('base64')}`;
  const save = (path, buffer) => writeFile(resolve(ROOT,path), buffer);
  let compose;
  try {
    const capture = async (width,height,dpr=1) => {
      const page = await browser.newPage({viewport:{width,height}, deviceScaleFactor:dpr,
        reducedMotion:'reduce', colorScheme:'dark', locale:'en-US', timezoneId:'UTC', serviceWorkers:'block'});
      page.on('pageerror', e=>report.errors.push(e.message));
      page.on('console', m=>{if(m.type()==='error') report.errors.push(m.text());});
      page.on('requestfailed', r=>report.failedRequests.push({url:r.url(),reason:r.failure()?.errorText}));
      await page.addInitScript(() => {
        const RealDate = Date, fixed = RealDate.parse('2026-09-05T12:00:00.000Z');
        window.Date = class extends RealDate {
          constructor(...args) { super(...(args.length ? args : [fixed])); }
          static now() { return fixed; }
        };
      });
      await page.goto(url.href, {waitUntil:'networkidle'});
      await page.waitForFunction(()=>window.__orrery?.diagnostics().ready, null, {timeout:60000});
      await page.locator('#simulation-date').fill('2026-09-05');
      await page.locator('#simulation-date').dispatchEvent('change');
      await page.locator('#simulation-date').blur();
      await page.evaluate(async()=>{await document.fonts.ready; scrollTo(0,0);});
      await page.waitForTimeout(200);
      return page;
    };
    const record = async (page,name) => {
      const row = await page.evaluate(()=>{
        const source=window.__orrery.diagnostics();
        const keys=['ready','backend','revision','width','height','pixelRatio','camera','drawCalls','triangles','geometries','textures','frame','textureFallbacks','bodyCount','moonCount','selected','baseStyle','controlPoints'];
        return {state:window.__orrery.getState(),diagnostics:Object.fromEntries(keys.map(key=>[key,source[key]])),
          overflow:document.documentElement.scrollWidth>innerWidth,
          canvasSize:[document.querySelector('#universe canvas').width,document.querySelector('#universe canvas').height]};
      });
      assert.ok(row.diagnostics.ready && row.diagnostics.backend==='WebGL2', `${name}: actual WebGL ready`);
      assert.ok(row.diagnostics.drawCalls>0 && row.diagnostics.triangles>0, `${name}: real geometry drawn`);
      assert.deepEqual(row.diagnostics.textureFallbacks, [], `${name}: no texture fallback`);
      assert.equal(row.state.date,report.simulationDate, `${name}: deterministic date`);
      assert.equal(row.state.playing,false, `${name}: paused`);
      assert.equal(row.overflow,false, `${name}: no horizontal overflow`);
      report.rendererChecks.push({name,...row});
    };
    const settle = async page => {
      await page.evaluate(()=>scrollTo(0,0));
      await page.waitForTimeout(250);
    };
    const click = async(page,selector) => {
      await page.locator(selector).evaluate(el=>el.click());
      await settle(page);
    };
    const deselect = async page => {
      await page.locator('#universe').focus();
      await page.keyboard.press('Escape');
      await page.evaluate(()=>document.activeElement?.blur());
      await settle(page);
    };
    const isolate = async page => {
      // Moving the existing canvas container avoids ancestor clipping/stacking.
      // Hidden controls remain connected and usable by their genuine handlers.
      await page.evaluate(()=>{
        const universe = document.querySelector('#universe');
        document.body.append(universe);
        for(const node of document.body.children) if(node!==universe) node.style.display='none';
        Object.assign(universe.style,{position:'fixed',inset:'0',width:'100vw',height:'100vh',zIndex:'9999'});
        document.querySelector('#planet-labels').style.display='none';
      });
      await settle(page);
    };
    const shot = page => page.screenshot({animations:'disabled',caret:'hide'});

    // Genuine application screenshots. No rearranged or invented interface.
    for(const [name,width,height,path] of [
      ['desktop',1440,1000,'public/screenshots/desktop.png'],
      ['hero',1600,1000,'docs/media/hero.png'],
      ['mobile',390,844,'public/screenshots/mobile.png'],
    ]) {
      const page=await capture(width,height);
      await record(page,name);
      const pixels=await shot(page);
      await save(path,pixels);
      if(name==='mobile') await save('docs/media/mobile.png',pixels);
      await page.close();
    }

    // The approved machine, isolated by capture-only DOM styling.
    const scene=await capture(1440,900,1.75);
    await deselect(scene); await isolate(scene); await click(scene,'#view-home');
    await record(scene,'social-machine');
    report.socialFraming=await measureSocialFraming(await scene.evaluate(()=>{
      const {camera,driveOutputs,moonOutputs}=window.__orrery.diagnostics();return {camera,driveOutputs,moonOutputs};
    }));
    const machine=dataURL(await shot(scene));
    await click(scene,'#focus-body');
    await record(scene,'mechanism');
    const mechanism=dataURL(await shot(scene));
    await click(scene,'#view-home');
    await scene.getByRole('button',{name:'06 Saturn',exact:true,includeHidden:true}).evaluate(el=>el.click());
    await click(scene,'#focus-body'); await deselect(scene);
    await record(scene,'saturn');
    const saturn=dataURL(await shot(scene));
    await scene.setViewportSize({width:1024,height:1024});
    await click(scene,'#view-top');
    await record(scene,'icon-top-down');
    const top=dataURL(await shot(scene));
    await scene.close();

    // Compose with the same locally licensed fonts and canonical project tokens.
    const tokens=await readFile(resolve(ROOT,'public/assets/tokens.css'),'utf8');
    const font=async name=>(await readFile(resolve(ROOT,`public/assets/fonts/${name}`))).toString('base64');
    const oxanium=await font('Oxanium-wght.woff2'),departure=await font('DepartureMono-Regular.woff2');
    compose=await browser.newPage({viewport:{width:1200,height:630},deviceScaleFactor:1,reducedMotion:'reduce'});
    const styles=`${tokens}
      @font-face{font-family:'Oxanium ProDyn';src:url(data:font/woff2;base64,${oxanium}) format('woff2');font-weight:200 800;font-display:swap}
      @font-face{font-family:'Departure Mono ProDyn';src:url(data:font/woff2;base64,${departure}) format('woff2');font-display:swap}
      *{box-sizing:border-box}html,body{margin:0;width:100%;height:100%;overflow:hidden}
      body{background:var(--pd-field);color:var(--pd-ivory);font-family:var(--pd-font-display)}
      .card{position:relative;width:100vw;height:100vh;overflow:hidden}
      .machine{position:absolute;left:${SOCIAL_LAYOUTS.landscape.x}px;top:${SOCIAL_LAYOUTS.landscape.y}px;width:${SOCIAL_LAYOUTS.landscape.imageWidth}px;height:${SOCIAL_LAYOUTS.landscape.imageHeight}px;max-width:none}
      .copy{position:absolute;left:48px;top:48px}
      .eyebrow{margin:0;color:var(--pd-signal);font:var(--fs-body-sm)/var(--lh-body) var(--pd-font-hud);letter-spacing:var(--ls-label)}
      h1{margin:32px 0 12px;font-size:calc(var(--fs-h2)*4);font-weight:500;line-height:var(--lh-tight);letter-spacing:var(--ls-display)}
      .deck{margin:0;font-size:var(--fs-h3);line-height:var(--lh-heading);color:var(--pd-ivory-muted);max-width:290px}
      .edition{margin:32px 0 0;font:var(--fs-body)/var(--lh-body) var(--pd-font-hud);color:var(--pd-ivory-muted);letter-spacing:var(--ls-label)}
      .footer{position:absolute;left:48px;right:48px;bottom:32px;border-top:var(--bw-hairline) solid var(--pd-line);padding-top:20px;display:flex;justify-content:space-between;align-items:center;font:var(--fs-body)/var(--lh-body) var(--pd-font-hud);color:var(--pd-ivory-muted)}
      .footer b{font-weight:400;color:var(--pd-ivory)}
      .square .machine{left:${SOCIAL_LAYOUTS.square.x}px;top:${SOCIAL_LAYOUTS.square.y}px;width:${SOCIAL_LAYOUTS.square.imageWidth}px;height:${SOCIAL_LAYOUTS.square.imageHeight}px}
      .square .copy{top:56px;left:56px}
      .square h1{margin-top:24px;font-size:calc(var(--fs-h2)*5)}
      .square .deck{max-width:none;font-size:var(--fs-h2)}
      .square .edition{position:absolute;top:4px;left:748px;margin:0;white-space:nowrap}
      .square .footer{left:56px;right:56px;bottom:40px;font-size:var(--fs-lead)}
      .caption{position:absolute;left:56px;bottom:120px;font-size:var(--fs-h2);line-height:var(--lh-heading);color:var(--pd-ivory)}
    `;
    const social = async square => {
      await compose.setViewportSize({width:square?1080:1200,height:square?1080:630});
      await compose.setContent(`<style>${styles}</style><main class="card ${square?'square':''}"><img class="machine" src="${machine}" alt="Actual Orrery mechanical renderer"><div class="copy"><p class="eyebrow">A STUDY IN CELESTIAL MOTION</p><h1>Orrery</h1><p class="deck">The solar system.<br ${square?'hidden':''}> Within reach.</p><p class="edition">v0.5 Beta</p></div>${square?'<p class="caption">Time, by hand.<br>Wonder, by design.</p>':''}<footer class="footer"><b>ProDyn.ai</b><span>orrery.prodyn.ai</span></footer></main>`);
      await compose.evaluate(async()=>{await document.fonts.ready;await Promise.all([...document.images].map(image=>image.decode()));});
      const cdp=await compose.context().newCDPSession(compose);
      await cdp.send('DOM.enable');
      await cdp.send('CSS.enable');
      const {root}=await cdp.send('DOM.getDocument');
      for(const selector of ['h1','.eyebrow']) {
        const {nodeId}=await cdp.send('DOM.querySelector',{nodeId:root.nodeId,selector});
        const {fonts}=await cdp.send('CSS.getPlatformFontsForNode',{nodeId});
        assert.ok(fonts.some(font=>font.isCustomFont&&font.glyphCount>0), `${selector}: custom font glyphs must render`);
        report.renderedFonts.push({card:square?'square':'landscape',selector,fonts});
      }
      await cdp.detach();
      if(square) await save('public/social/orrery-square.png',await shot(compose));
      else {
        await save('public/social/orrery-card.png',await shot(compose));
        await save('public/social/orrery-card.jpg',await compose.screenshot({type:'jpeg',quality:92,animations:'disabled'}));
      }
    };
    await social(false);await social(true);

    await compose.setContent(`<style>${styles}</style>`);
    const raster = async (source,width,height,kind='image') => {
      const encoded = await compose.evaluate(async({source,width,height,kind})=>{
        const image=new Image();image.src=source;await image.decode();
        const canvas=document.createElement('canvas');canvas.width=width;canvas.height=height;
        const ctx=canvas.getContext('2d');
        ctx.fillStyle=getComputedStyle(document.documentElement).getPropertyValue('--pd-field').trim();ctx.fillRect(0,0,width,height);
        ctx.imageSmoothingEnabled=true;ctx.imageSmoothingQuality='high';
        if(kind==='image') ctx.drawImage(image,0,0,width,height);
        else {
          // Photographic specimen crop of the real top-down gear bank. No logo,
          // invented orbital glyph, border, or AI artwork is added.
          const radius=width*(kind==='maskable'?0.37:0.45),side=radius*2;
          ctx.save();ctx.beginPath();ctx.arc(width/2,height/2,radius,0,Math.PI*2);ctx.clip();
          const crop=image.width*0.78;
          // Gentle exposure compensation at favicon scale preserves real detail.
          if(width<=32) ctx.filter='brightness(1.3) contrast(1.12)';
          ctx.drawImage(image,(image.width-crop)/2,(image.height-crop)/2,crop,crop,(width-side)/2,(height-side)/2,side,side);
          ctx.restore();
        }
        return canvas.toDataURL('image/png').split(',')[1];
      },{source,width,height,kind});
      return Buffer.from(encoded,'base64');
    };
    await save('docs/media/mechanism.png',await raster(mechanism,1200,750));
    await save('docs/media/saturn.png',await raster(saturn,1200,750));
    for(const spec of OUTPUTS.filter(row=>row.path.startsWith('public/icons/'))) {
      await save(spec.path,await raster(top,...spec.size,spec.path.includes('maskable')?'maskable':'icon'));
    }

    // Decode every exact on-disk target, verify dimensions, opacity, nonblank
    // pixels and the Android circular safe zone; no file digests are used.
    for(const spec of OUTPUTS) {
      const bytes=await readFile(resolve(ROOT,spec.path));
      const mime=spec.path.endsWith('.jpg')?'image/jpeg':'image/png';
      const check=await compose.evaluate(async({source,maskable})=>{
        const image=new Image();image.src=source;await image.decode();
        const canvas=document.createElement('canvas');canvas.width=image.width;canvas.height=image.height;
        const ctx=canvas.getContext('2d',{willReadFrequently:true});ctx.drawImage(image,0,0);
        const {data}=ctx.getImageData(0,0,canvas.width,canvas.height);
        let min=255,max=0,bright=0,transparent=0,unsafe=0;
        const bg=[data[0],data[1],data[2]];
        for(let i=0;i<data.length;i+=4){
          const l=Math.max(data[i],data[i+1],data[i+2]);min=Math.min(min,l);max=Math.max(max,l);
          if(l>70)bright++;if(data[i+3]!==255)transparent++;
          if(maskable){const index=i/4,x=index%canvas.width+0.5,y=Math.floor(index/canvas.width)+0.5;
            if(Math.hypot(x-canvas.width/2,y-canvas.height/2)>canvas.width*0.4 && bg.some((v,c)=>data[i+c]!==v))unsafe++;
          }
        }
        return {width:image.width,height:image.height,min,max,brightPixels:bright,transparentPixels:transparent,unsafePixels:unsafe};
      },{source:`data:${mime};base64,${bytes.toString('base64')}`,maskable:spec.path.includes('maskable')});
      assert.deepEqual([check.width,check.height],spec.size,spec.path);
      assert.ok(check.max-check.min>30 && check.brightPixels>0,`${spec.path}: nonblank decoded pixels`);
      assert.equal(check.transparentPixels,0,`${spec.path}: opaque field`);
      assert.equal(check.unsafePixels,0,`${spec.path}: maskable circular safe zone`);
      report.outputs.push({path:spec.path,bytes:(await stat(resolve(ROOT,spec.path))).size,...check});
    }
    assert.equal(report.outputs.length,OUTPUTS.length);
    assert.deepEqual(report.errors,[],'No browser errors');
    assert.deepEqual(report.failedRequests,[],'No failed requests');
    report.totalBytes=report.outputs.reduce((sum,row)=>sum+row.bytes,0);
    report.automatedChecks='passed';
  } catch(error) {
    report.automatedChecks='failed';report.failure=error.message;throw error;
  } finally {
    await writeFile(resolve(ROOT,'evidence/release-media.json'),JSON.stringify(report,null,2)+'\n');
    await browser.close();
  }
  console.log(JSON.stringify({automatedChecks:report.automatedChecks,browser:report.browser,totalBytes:report.totalBytes,outputs:report.outputs.map(({path,width,height,bytes})=>({path,width,height,bytes})),visualQA:report.visualQA},null,2));
}

if(process.argv[1] && resolve(process.argv[1])===fileURLToPath(import.meta.url)) {
  main().catch(error=>{console.error(`Release media failed: ${error.message}`);process.exitCode=1;});
}
