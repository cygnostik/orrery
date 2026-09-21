import {panelAction} from './panel-actions.js';
import {test,expect} from '@playwright/test';
import {BODIES} from '../src/science.js';
const ready=async page=>{await page.goto('/');await expect.poll(()=>page.evaluate(()=>window.__orrery?.diagnostics().ready),{timeout:15000}).toBe(true);};

test('desktop reference detail scrolls within the stage instead of stretching an empty scene row',async({page})=>{
 await ready(page);
 const layout=await page.locator('.instrument-layout').boundingBox(),stage=await page.locator('.stage').boundingBox();
 expect(Math.abs(layout.height-stage.height)).toBeLessThan(2);
 expect(await page.locator('.inspector').evaluate(el=>getComputedStyle(el).overflowY)).toBe('auto');
});

test('every selected planet has a distinct surface portrait with reference tilt and eccentricity',async({page})=>{
 await page.goto('/');await expect(page.locator('#body-portrait')).toHaveAttribute('data-body','earth');await panelAction(page,'Settings',()=>page.getByLabel('Include Pluto').check());
 const portraits=[];
 for(const [index,body] of BODIES.entries()){
  await page.getByRole('button',{name:`${String(index+1).padStart(2,'0')} ${body.name}`,exact:true}).click();
  const portrait=page.locator('#body-portrait');
  await expect(portrait).toBeVisible();await expect(portrait).toHaveAttribute('data-body',body.id);
  await expect(portrait.locator('svg')).toHaveAccessibleName(`${body.name} surface study — illustrative, not a live view`);
  await expect(page.locator('#body-tilt')).toHaveText(`${Number(body.tiltDeg.toFixed(2))}°`);
  await expect(page.locator('#body-eccentricity')).toHaveText(body.eccentricity.toFixed(4));
  portraits.push(await portrait.locator('svg').innerHTML());
 }
 expect(new Set(portraits).size).toBe(BODIES.length);
 await expect(page.locator('.body-emblem')).toHaveCount(0);
});

test('the inspector distinguishes geared mean motion from the astronomical position reference',async({page})=>{
 await page.goto('/');
 await expect(page.locator('#scale-note')).toContainText('Gear-driven mean motion');
 await expect(page.locator('#distance-model-note')).toContainText('Astronomical reference, not the geared arm position');
 await expect(page.locator('#drive-reference')).toBeVisible();
 await expect(page.locator('#drive-output-period')).not.toHaveText('—');
 await expect(page.locator('#drive-path')).toContainText('Earth');
});

test('Saturn favorites are surfaced as individual inspection controls with source links',async({page})=>{
 await page.goto('/');await page.getByRole('button',{name:'06 Saturn',exact:true}).click();
 await expect(page.locator('#moon-family-preview')).toContainText('Enceladus');
 await expect(page.locator('#moon-family-preview')).toBeInViewport();
 await expect(page.locator('#moon-family')).toHaveJSProperty('open',true);
 for(const name of ['Enceladus','Titan']){
  await expect(page.getByRole('button',{name:`Inspect ${name}`,exact:true})).toBeVisible();
  await expect(page.getByRole('link',{name:`${name} reference`,exact:true})).toHaveAttribute('href',/science.nasa.gov/);
 }
 await expect.poll(()=>page.evaluate(()=>window.__orrery?.diagnostics().ready)).toBe(true);
 const before=await page.evaluate(()=>window.__orrery.diagnostics().camera.position);
 await page.getByRole('switch',{name:'Automatic movement',exact:true}).click();
 await page.getByRole('button',{name:'Inspect Enceladus',exact:true}).click();
 expect(await page.evaluate(()=>window.__orrery.getState().playing)).toBe(true);
 await expect(page.locator('#follow-camera')).toBeChecked();
 expect(await page.evaluate(()=>window.__orrery.diagnostics().followSubject)).toBe('enceladus');
 await expect(page.locator('#inspection-subject')).toContainText('Enceladus');
 expect(await page.evaluate(()=>window.__orrery.diagnostics().camera.position)).not.toEqual(before);
 const date=await page.evaluate(()=>window.__orrery.getState().date);
 await expect.poll(()=>page.evaluate(()=>window.__orrery.getState().date)).not.toBe(date);
 const moonTarget=await page.evaluate(()=>window.__orrery.diagnostics().camera.target);
 await panelAction(page,'Settings',()=>page.getByLabel('Show moons').uncheck());await expect(page.locator('#inspection-subject')).toBeHidden();
 expect(await page.evaluate(()=>window.__orrery.diagnostics().camera.target)).not.toEqual(moonTarget);
});

test('renderer failure disables newly revealed moon inspection but keeps its reference readable',async({page})=>{
 await page.addInitScript(()=>{const original=HTMLCanvasElement.prototype.getContext;HTMLCanvasElement.prototype.getContext=function(type,...args){if(type.startsWith('webgl'))return null;return original.call(this,type,...args);};});
 await page.goto('/');await expect(page.locator('#load-message')).toContainText('3D is unavailable');
 await page.getByRole('button',{name:'06 Saturn',exact:true}).click();await expect(page.locator('#moon-family')).toHaveJSProperty('open',true);
 await expect(page.getByRole('button',{name:'Inspect Enceladus',exact:true})).toBeDisabled();
 await expect(page.getByRole('link',{name:'Enceladus reference',exact:true})).toBeVisible();
});
