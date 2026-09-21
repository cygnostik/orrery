import {panelAction} from './panel-actions.js';
import {test,expect} from '@playwright/test';

async function ready(page){await page.goto('/');await expect.poll(()=>page.evaluate(()=>window.__orrery?.diagnostics().ready)).toBe(true);}
async function stopped(page){
 let last=-1;
 await expect.poll(async()=>{const frame=await page.evaluate(()=>window.__orrery.diagnostics().frames);const same=frame===last;last=frame;return same;},{intervals:[250,500,500,500],timeout:15000}).toBe(true);
 const snapshot=await page.evaluate(()=>({frames:window.__orrery.diagnostics().frames,date:window.__orrery.getState().date}));
 await page.waitForTimeout(350);
 expect(await page.evaluate(()=>({frames:window.__orrery.diagnostics().frames,date:window.__orrery.getState().date}))).toEqual(snapshot);
 return snapshot;
}

test('keyboard, dates, nullable selection and lifecycle keep paused frames stopped',async({page})=>{
 const errors=[];page.on('pageerror',error=>errors.push(String(error)));
 await ready(page);await stopped(page);
 const jupiter=page.getByRole('button',{name:'05 Jupiter',exact:true});await jupiter.focus();await page.keyboard.press('Enter');await expect(page.locator('#body-name')).toHaveText('Jupiter');
 await page.locator('#simulation-date').fill('2024-02-29');await page.locator('#simulation-date').blur();
 await expect.poll(()=>page.evaluate(()=>window.__orrery.getState().date)).toBe('2024-02-29T12:00:00.000Z');
 await page.locator('#simulation-date').fill('');await page.locator('#simulation-date').dispatchEvent('change');await expect(page.locator('#simulation-date')).toHaveValue('2024-02-29');
 await page.locator('#simulation-date').fill('1700-01-01');await page.locator('#simulation-date').blur();await expect(page.locator('#simulation-date')).toHaveValue('2024-02-29');
 await page.locator('#manual-crank').focus();await page.keyboard.press('ArrowRight');
 await expect.poll(()=>page.evaluate(()=>window.__orrery.getState().date)).toBe('2024-03-01T12:00:00.000Z');
 await page.locator('#universe').focus();const camera=await page.evaluate(()=>window.__orrery.diagnostics().camera);
 await page.keyboard.press('Escape');await expect.poll(()=>page.evaluate(()=>window.__orrery.getState().selected)).toBe(null);
 expect(await page.evaluate(()=>window.__orrery.diagnostics().camera)).toEqual(camera);
 await panelAction(page,'Settings',()=>page.getByRole('button',{name:'Observatory',exact:true}).click());expect(await page.evaluate(()=>window.__orrery.getState().selected)).toBe(null);
 await page.locator('#focus-body').click();await stopped(page);
 const open=page.locator('#about-open');await open.focus();await page.keyboard.press('Enter');await expect(page.locator('#science-dialog')).toBeVisible();
 await page.keyboard.press('Escape');await expect(open).toBeFocused();await expect(page.locator('#science-dialog')).toBeHidden();
 const help=page.locator('#pwa-help-open');await help.click();await expect(page.locator('#pwa-help-title')).toBeFocused();await page.locator('#about-close').click();await expect(help).toBeFocused();
 await page.emulateMedia({reducedMotion:'no-preference'});await page.locator('#auto-drive').click();await expect.poll(()=>page.evaluate(()=>window.__orrery.getState().playing)).toBe(true);
 await page.emulateMedia({reducedMotion:'reduce'});await expect.poll(()=>page.evaluate(()=>window.__orrery.getState().playing)).toBe(false);await stopped(page);
 // Exercise persisted-event handling deterministically, without claiming real BFCache eligibility.
 await page.evaluate(()=>window.dispatchEvent(new PageTransitionEvent('pagehide',{persisted:true})));const before=await stopped(page);
 expect(await page.evaluate(()=>window.__orrery.diagnostics().disposed)).toBe(false);
 await page.evaluate(()=>window.dispatchEvent(new PageTransitionEvent('pageshow',{persisted:true})));
 await expect.poll(()=>page.evaluate(()=>window.__orrery.diagnostics().frames)).toBeGreaterThan(before.frames);await stopped(page);
 await page.evaluate(()=>window.__orrery.dispose());await expect(page.locator('#universe canvas')).toHaveCount(0);await stopped(page);
 expect(errors).toEqual([]);
});

test('missing WebGL2 keeps references usable and all cached 3D actions disabled',async({page})=>{
 const errors=[];page.on('pageerror',error=>errors.push(String(error)));
 await page.addInitScript(()=>{const original=HTMLCanvasElement.prototype.getContext;HTMLCanvasElement.prototype.getContext=function(type,...args){return /^webgl/.test(type)?null:original.call(this,type,...args);};});
 await page.goto('/');await expect(page.locator('#load-message')).toContainText('3D is unavailable');await expect(page.locator('#fallback')).toBeVisible();
 expect(await page.evaluate(()=>window.__orrery.diagnostics().ready)).toBe(false);
 for(const name of ['05 Jupiter','06 Saturn','03 Earth']){
  await page.getByRole('button',{name,exact:true}).click();await expect(page.locator('#body-name')).toHaveText(name.slice(3));
  for(const selector of ['#auto-drive','#focus-body','#view-home','#view-top','#focus-craft','#crank-forward','#crank-back','#auto-drive'])await expect(page.locator(selector)).toBeDisabled();
  const moonButtons=page.locator('[data-focus-moon]');for(let i=0;i<await moonButtons.count();i++)await expect(moonButtons.nth(i)).toBeDisabled();
 }
 await page.locator('#about-open').click();await expect(page.locator('#science-dialog')).toBeVisible();await expect(page.locator('#model-source')).toHaveAttribute('href','https://ssd.jpl.nasa.gov/planets/approx_pos.html');
 await page.locator('#about-close').click();expect(errors).toEqual([]);
});

test('texture failure still renders, then actual context loss stops the instrument',async({page})=>{
 await page.route('**/textures/2k_earth_daymap.jpg',route=>route.abort());await ready(page);
 expect(await page.evaluate(()=>window.__orrery.diagnostics().textureFallbacks)).toContain('earth');
 expect(await page.evaluate(()=>window.__orrery.diagnostics().drawCalls)).toBeGreaterThan(0);
 await page.locator('#auto-drive').click();
 const extension=await page.evaluate(()=>{
  const gl=document.querySelector('#universe canvas').getContext('webgl2'),lose=gl.getExtension('WEBGL_lose_context');
  if(!lose)return false;lose.loseContext();return true;
 });
 expect(extension,'Actual WEBGL_lose_context extension required; do not replace with a synthetic event').toBe(true);
 await expect(page.locator('#fallback')).toBeVisible();await expect(page.locator('#load-message')).toContainText('context lost');
 expect(await page.evaluate(()=>window.__orrery.getState().playing)).toBe(false);await stopped(page);
 await page.getByRole('button',{name:'06 Saturn',exact:true}).click();await expect(page.locator('#focus-body')).toBeDisabled();await expect(page.locator('#body-name')).toHaveText('Saturn');
});
