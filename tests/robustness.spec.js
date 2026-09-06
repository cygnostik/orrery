import {test,expect} from '@playwright/test';
const ready=async(page)=>{await page.goto('/');await expect.poll(()=>page.evaluate(()=>window.__orrery?.diagnostics().ready),{timeout:15000}).toBe(true);};
test('normal production loads locally without errors and every texture succeeds',async({page})=>{
 const errors=[],external=[];page.on('pageerror',e=>errors.push(String(e)));page.on('console',m=>{if(m.type()==='error')errors.push(m.text());});page.on('requestfailed',r=>errors.push(r.url()));page.on('request',r=>{if(!r.url().startsWith('http://127.0.0.1:5196/')&&!r.url().startsWith('data:'))external.push(r.url());});
 await ready(page);expect(errors).toEqual([]);expect(external).toEqual([]);
 expect(await page.evaluate(()=>window.__orrery.diagnostics().textureFallbacks)).toEqual([]);
});
test('reduced motion starts still and changing preference stops an explicitly running simulation',async({page})=>{
 await page.emulateMedia({reducedMotion:'reduce'});await ready(page);
 expect(await page.evaluate(()=>window.__orrery.getState().playing)).toBe(false);
 await page.emulateMedia({reducedMotion:'no-preference'});await page.locator('#play').click();
 expect(await page.evaluate(()=>window.__orrery.getState().playing)).toBe(true);
 await page.emulateMedia({reducedMotion:'reduce'});
 await expect.poll(()=>page.evaluate(()=>window.__orrery.getState().playing)).toBe(false);
 await page.waitForTimeout(600);const before=await page.evaluate(()=>window.__orrery.diagnostics().frames);await page.waitForTimeout(300);expect(await page.evaluate(()=>window.__orrery.diagnostics().frames)).toBe(before);
});
for(const width of [390,640,700,767,768,1024,1440])test(`layout stays bounded at ${width}px`,async({page})=>{
 await page.setViewportSize({width,height:1000});await ready(page);
 await page.locator('#pluto').check();await page.locator('#labels').check();await page.getByRole('button',{name:'09 Pluto',exact:true}).click();await page.waitForTimeout(350);
 expect(await page.evaluate(()=>document.documentElement.scrollWidth)).toBe(width);
 const rects=await page.locator('.planet-label:visible').evaluateAll(nodes=>nodes.map(n=>{const r=n.getBoundingClientRect(),b=n.parentElement.getBoundingClientRect();return {text:n.textContent,left:r.left-b.left,right:r.right-b.left,w:b.width};}));
 for(const r of rects){expect(r.left,r.text).toBeGreaterThanOrEqual(0);expect(r.right,r.text).toBeLessThanOrEqual(r.w);}
 const sizes=await page.locator('.properties dd').evaluateAll(nodes=>nodes.map(n=>({text:n.textContent,width:n.clientWidth,scroll:n.scrollWidth})));
 for(const s of sizes)expect(s.scroll,s.text).toBeLessThanOrEqual(s.width);
});
test('distance mapping, labels, and repeated mode changes preserve stable resource counts',async({page})=>{
 await ready(page);await page.locator('#labels').check();await page.getByRole('button',{name:'Observatory',exact:true}).click();await page.locator('#scale').selectOption('distance');await page.locator('#labels').uncheck();await page.waitForTimeout(350);
 expect(await page.evaluate(()=>window.__orrery.diagnostics().scale)).toBe('distance');await expect(page.locator('.planet-label:visible')).toHaveCount(0);
 await page.locator('#pluto').check();await page.waitForTimeout(250);
 // Warm both modes with Pluto: its mechanical supports are uploaded only when first visible.
 for(const mode of ['Mechanical','Observatory']){await page.getByRole('button',{name:mode,exact:true}).click();const f=await page.evaluate(()=>window.__orrery.diagnostics().frame);await page.waitForFunction(frame=>window.__orrery.diagnostics().frame>frame,f);}
 const baseline=await page.evaluate(()=>window.__orrery.diagnostics());
 for(let i=0;i<4;i++){await page.getByRole('button',{name:'Mechanical',exact:true}).click();await page.getByRole('button',{name:'Observatory',exact:true}).click();}
 await page.waitForTimeout(350);const after=await page.evaluate(()=>window.__orrery.diagnostics());expect(after.geometries).toBe(baseline.geometries);expect(after.textures).toBe(baseline.textures);
});
test('no WebGL has a meaningful fallback and planet facts still work',async({page})=>{
 await page.addInitScript(()=>{const original=HTMLCanvasElement.prototype.getContext;HTMLCanvasElement.prototype.getContext=function(type,...args){if(type.startsWith('webgl'))return null;return original.call(this,type,...args);};});
 await page.goto('/');await expect(page.locator('#fallback')).toBeVisible();await expect(page.locator('#load-message')).toContainText('3D is unavailable');await expect(page.locator('#play')).toBeDisabled();await expect(page.locator('#focus-body')).toBeDisabled();
 await page.getByRole('button',{name:'04 Mars',exact:true}).click();await expect(page.locator('#body-name')).toHaveText('Mars');await expect(page.locator('#body-radius')).not.toHaveText('—');
});
test('actual WebGL context loss stops motion and shows a useful fallback',async({page})=>{
 await ready(page);await page.evaluate(()=>document.querySelector('#universe canvas').getContext('webgl2').getExtension('WEBGL_lose_context').loseContext());await expect(page.locator('#fallback')).toBeVisible();await expect(page.locator('#load-message')).toContainText('context lost');expect(await page.evaluate(()=>window.__orrery.getState().playing)).toBe(false);
});
test('missing texture uses a declared procedural fallback rather than a blank planet',async({page})=>{
 await page.route('**/textures/2k_earth_daymap.jpg',route=>route.abort());await ready(page);expect(await page.evaluate(()=>window.__orrery.diagnostics().textureFallbacks)).toContain('earth');expect(await page.evaluate(()=>window.__orrery.diagnostics().drawCalls)).toBeGreaterThan(0);
});
test('keyboard can select a planet and close science with focus restored',async({page})=>{
 await ready(page);const target=page.getByRole('button',{name:'05 Jupiter',exact:true});await target.focus();await page.keyboard.press('Enter');await expect(page.locator('#body-name')).toHaveText('Jupiter');
 const open=page.getByRole('button',{name:'Science & sources',exact:true});await open.focus();await page.keyboard.press('Enter');await expect(page.getByRole('dialog')).toBeVisible();await page.keyboard.press('Escape');await expect(open).toBeFocused();
});
test('no JavaScript retains an informative static solar-system view',async({browser})=>{
 const context=await browser.newContext({javaScriptEnabled:false});const page=await context.newPage();await page.goto('http://127.0.0.1:5196/');await expect(page.locator('noscript')).toBeVisible();await expect(page.locator('#fallback svg')).toBeVisible();await expect(page.locator('noscript .noscript')).toContainText('Pluto');await context.close();
});
test('teardown cancels owned frames and removes the renderer',async({page})=>{
 await ready(page);await page.evaluate(()=>window.__orrery.dispose());await expect(page.locator('#universe canvas')).toHaveCount(0);const frames=await page.evaluate(()=>window.__orrery.diagnostics().frames);await page.waitForTimeout(200);expect(await page.evaluate(()=>window.__orrery.diagnostics().frames)).toBe(frames);expect(await page.evaluate(()=>window.__orrery.diagnostics().disposed)).toBe(true);
});
