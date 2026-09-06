import {test,expect} from '@playwright/test';

async function ready(page){
 await page.goto('/');
 await expect.poll(()=>page.evaluate(()=>window.__orrery?.diagnostics().ready)).toBe(true);
 await expect(page.locator('#fallback')).toBeHidden();
}

test('sources remain readable without the native dialog API',async({page})=>{
 const errors=[];page.on('pageerror',error=>errors.push(String(error)));
 await page.addInitScript(()=>{HTMLDialogElement.prototype.showModal=undefined;HTMLDialogElement.prototype.close=undefined;});
 await page.goto('/');
 const open=page.locator('#about-open');await open.click();
 await expect(page.locator('#science-dialog')).toBeVisible();
 await expect(page.locator('#model-source')).toHaveAttribute('href','https://ssd.jpl.nasa.gov/planets/approx_pos.html');
 await page.keyboard.press('Escape');await expect(page.locator('#science-dialog')).toBeHidden();await expect(open).toBeFocused();
 await open.click();await page.locator('#about-close').click();await expect(page.locator('#science-dialog')).toBeHidden();await expect(open).toBeFocused();
 const help=page.locator('#pwa-help-open');await help.click();await expect(page.locator('#science-dialog')).toBeVisible();
 await expect(page.locator('#pwa-help-title')).toBeFocused();await page.keyboard.press('Escape');await expect(help).toBeFocused();
 expect(errors).toEqual([]);
});

test('DPR-only window changes resize the paused drawing buffer',async({page})=>{
 await ready(page);
 await page.evaluate(()=>{Object.defineProperty(window,'devicePixelRatio',{configurable:true,value:1.5});window.dispatchEvent(new Event('resize'));});
 await expect.poll(()=>page.evaluate(()=>window.__orrery.diagnostics().pixelRatio)).toBe(1.5);
 expect(await page.evaluate(()=>window.__orrery.getState().playing)).toBe(false);
});

test('fullscreen denial and policy-disabled APIs fail gracefully',async({browser,baseURL})=>{
 for(const mode of ['denied','policy-disabled','absent']){
  const context=await browser.newContext({baseURL,reducedMotion:'reduce',serviceWorkers:'block'});
  try{
   const page=await context.newPage();const errors=[];page.on('pageerror',error=>errors.push(String(error)));
   await page.addInitScript(mode=>{
    Object.defineProperty(Element.prototype,'webkitRequestFullscreen',{configurable:true,value:undefined});
    Object.defineProperty(Element.prototype,'requestFullscreen',{configurable:true,value:mode==='absent'?undefined:function(){return Promise.reject(new Error('Fullscreen denied'));}});
    Object.defineProperty(document,'fullscreenEnabled',{configurable:true,value:mode!=='policy-disabled'});
   },mode);
   await page.goto('/');const button=page.locator('#fullscreen');
   if(mode==='denied'){await button.click();await expect(page.locator('#status')).toContainText('Fullscreen was not available');await expect(button).toHaveAttribute('aria-pressed','false');}
   else{await expect(button).toBeDisabled();await expect(button).toHaveText('Browser fullscreen only');await expect(button).toHaveAttribute('title',/not available/);}
   await page.locator('#about-open').click();await expect(page.locator('#science-dialog')).toBeVisible();expect(errors).toEqual([]);
  }finally{await context.close();}
 }
});

test('renderer boots without ES2022 Object.hasOwn or Array.at',async({page})=>{
 const errors=[];page.on('pageerror',error=>errors.push(String(error)));
 await page.addInitScript(()=>{Object.hasOwn=undefined;Array.prototype.at=undefined;});
 await ready(page);await page.getByRole('button',{name:'05 Jupiter',exact:true}).click();
 await page.getByRole('button',{name:'Observatory',exact:true}).click();await page.locator('#simulation-date').fill('2024-02-29');await page.locator('#simulation-date').blur();
 await expect.poll(()=>page.evaluate(()=>window.__orrery.getState().date)).toBe('2024-02-29T12:00:00.000Z');
 expect(await page.evaluate(()=>window.__orrery.diagnostics().drawCalls)).toBeGreaterThan(0);expect(errors).toEqual([]);
});

// Read renderer and WebGL state: a visible fallback is never a renderer pass.
test('real WebGL2 renderer boots without errors',async({page,browser},testInfo)=>{
 const errors=[];page.on('pageerror',error=>errors.push(String(error)));
 page.on('console',message=>{if(message.type()==='error')errors.push(message.text());});
 await ready(page);
 const graphics=await page.evaluate(()=>{
  const d=window.__orrery.diagnostics();
  const gl=document.querySelector('#universe canvas').getContext('webgl2');
  return {ready:d.ready,backend:d.backend,drawCalls:d.drawCalls,triangles:d.triangles,textureFallbacks:d.textureFallbacks,webgl:gl?.getParameter(gl.VERSION),renderer:gl?.getParameter(gl.RENDERER),userAgent:navigator.userAgent};
 });
 await testInfo.attach('renderer.json',{body:JSON.stringify({browserVersion:browser.version(),...graphics},null,2),contentType:'application/json'});
 expect(graphics.backend).toBe('WebGL2');expect(graphics.webgl).toContain('WebGL 2.0');
 expect(graphics.drawCalls).toBeGreaterThan(0);expect(graphics.triangles).toBeGreaterThan(0);
 expect(graphics.textureFallbacks).toEqual([]);expect(errors).toEqual([]);
});

test('prefixed fullscreen enters and exits with synchronized state',async({page})=>{
 await page.addInitScript(()=>{
  Object.defineProperty(Element.prototype,'requestFullscreen',{configurable:true,value:undefined});
  Object.defineProperty(document,'fullscreenEnabled',{configurable:true,value:undefined});
  Object.defineProperty(document,'webkitFullscreenEnabled',{configurable:true,value:true});
  Object.defineProperty(document,'webkitFullscreenElement',{configurable:true,writable:true,value:null});
  Element.prototype.webkitRequestFullscreen=function(){document.webkitFullscreenElement=this;document.dispatchEvent(new Event('webkitfullscreenchange'));};
  document.webkitExitFullscreen=function(){document.webkitFullscreenElement=null;document.dispatchEvent(new Event('webkitfullscreenchange'));};
 });
 await page.goto('/');
 const button=page.locator('#fullscreen');
 await expect(button).toBeEnabled();await button.click();
 await expect(button).toHaveText('Exit fullscreen ↙');await expect(button).toHaveAttribute('aria-pressed','true');
 await button.click();await expect(button).toHaveText('Fullscreen ↗');await expect(button).toHaveAttribute('aria-pressed','false');
});
