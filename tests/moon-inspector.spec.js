import {panelAction} from './panel-actions.js';
import {test,expect} from '@playwright/test';
import {MOONS} from '../src/moons.js';

const ready=async page=>{
 await page.goto('/');
 await expect.poll(()=>page.evaluate(()=>window.__orrery?.diagnostics().ready)).toBe(true);
};
const inspect=async(page,id)=>{
 const moon=MOONS.find(m=>m.id===id);
 await page.locator(`button[data-body=${moon.parentId}]`).click();
 if(!await page.locator('#moon-family').evaluate(el=>el.open))await page.locator('#moon-family summary').click();
 await page.locator(`[data-focus-moon=${id}]`).click();
 await expect(page.locator('#body-name')).toHaveText(moon.name);
};
const assertMoon=async(page,id,playing=false)=>{
 const moon=MOONS.find(m=>m.id===id),fmt=(n,p=0)=>n.toLocaleString('en-US',{maximumFractionDigits:p});
 await expect(page.locator('#body-name')).toHaveText(moon.name);
 await expect(page.locator('#body-kind')).toHaveText('NATURAL SATELLITE');
 await expect(page.locator('#body-tilt')).toHaveText(new RegExp(moon.parentId,'i'));
 await expect(page.locator('#body-eccentricity')).toHaveText(moon.retrograde?'Retrograde':'Prograde');
 await expect(page.locator('#body-axis')).toHaveText(`≈ ${fmt(moon.orbitRadiusKm)}`);
 await expect(page.locator('#axis-unit')).toHaveText(' KM');
 await expect(page.locator('#body-period')).toHaveText(`≈ ${fmt(moon.periodDays,2)}`);
 await expect(page.locator('#body-radius')).toHaveText(fmt(moon.radiusKm,1));
 await expect(page.locator('#body-fact')).toHaveText(moon.fact);
 await expect(page.locator('#body-source')).toHaveAttribute('href',moon.sourceUrl);
 await expect(page.locator('#body-portrait')).toBeHidden();
 await expect(page.locator('#body-distance')).toBeHidden();
 await expect(page.locator('#body-inclination')).toBeHidden();
 await expect(page.locator('#drive-reference')).toBeHidden();
 await expect(page.locator('#distance-model-note')).toContainText('Not an ephemeris');
 await expect(page.locator('#focus-body')).toHaveAccessibleName(`Inspect ${moon.name}`);
 expect(await page.evaluate(()=>window.__orrery.getState().selected)).toBe(moon.parentId);
 expect(await page.evaluate(()=>window.__orrery.getState().playing)).toBe(playing);
};

test('moon family inspection and real canvas picking promote sourced moon readouts',async({page})=>{
 await ready(page);
 await page.locator('#auto-drive').click();
 await inspect(page,'io');await assertMoon(page,'io',true);
 await page.locator('[data-focus-moon=europa]').click();await assertMoon(page,'europa',true);
 await page.locator('#focus-body').click();await assertMoon(page,'europa',true);
 await page.locator('#auto-drive').click();
 await page.keyboard.press('Escape');
 await expect(page.locator('#body-name')).toHaveText('Mechanism');
 const canvas=page.locator('#universe canvas');await canvas.scrollIntoViewIfNeeded();
 const bounds=await canvas.boundingBox();await canvas.click({position:{x:bounds.width/2,y:bounds.height/2}});
 await assertMoon(page,'europa');
 await expect(page.locator('button[data-body=jupiter]')).toHaveAttribute('aria-pressed','true');
 await page.locator('#moon-family summary').click();
 await page.setViewportSize({width:1440,height:1400});
 await page.locator('.inspector').evaluate(el=>{el.scrollTop=0;});
 await page.screenshot({path:'evidence/moon-inspector/desktop-europa.png',fullPage:true});
});

test('all ten moon descriptors come from the existing metadata',async({page})=>{
 const errors=[];page.on('pageerror',error=>errors.push(error.message));
 await ready(page);await panelAction(page,'Settings',()=>page.locator('#pluto').check());
 for(const moon of MOONS){
  await inspect(page,moon.id);await assertMoon(page,moon.id);
  await expect(page.locator('#moon-family-label')).toHaveText(new RegExp(moon.parentId,'i'));
 }
 expect(errors).toEqual([]);
});

test('moon readouts clear coherently across controls and renderer failure',async({page})=>{
 await ready(page);
 for(const action of [
  ()=>page.locator('#crank-forward').click(),
  ()=>panelAction(page,'Settings',()=>page.locator('#view-home').click()),
  ()=>panelAction(page,'Settings',()=>page.locator('#view-top').click()),
  ()=>panelAction(page,'Graphics',()=>page.locator('#focus-craft').click()),
  ()=>page.locator('#simulation-date').fill('2000-01-01'),
  ()=>page.locator('#today').click(),
  ()=>panelAction(page,'Settings',()=>page.locator('[data-mode=observatory]').click()),
 ]){
  await inspect(page,'io');await action();
  await expect(page.locator('#body-name')).toHaveText('Jupiter');
  expect(await page.evaluate(()=>window.__orrery.diagnostics().inspectedMoon)).toBe(null);
 }
 await inspect(page,'triton');await assertMoon(page,'triton');
 await panelAction(page,'Settings',()=>page.locator('#scale').selectOption('distance'));
 await expect(page.locator('#body-name')).toHaveText('Neptune');
 await inspect(page,'triton');await panelAction(page,'Settings',()=>page.locator('#moons').uncheck());
 await expect(page.locator('#body-name')).toHaveText('Neptune');
 await expect(page.locator('#moon-family')).toBeHidden();
 await expect(page.locator('#body-portrait')).toBeVisible();
 await expect(page.locator('#body-distance')).toContainText('AU');
 await expect(page.locator('#axis-unit')).toHaveText(' AU');
 await panelAction(page,'Settings',()=>page.locator('#moons').check());await panelAction(page,'Settings',()=>page.locator('#pluto').check());
 await inspect(page,'charon');await assertMoon(page,'charon');
 await panelAction(page,'Settings',()=>page.locator('#pluto').uncheck());await expect(page.locator('#body-name')).toHaveText('Earth');
 await inspect(page,'moon');await page.locator('button[data-body=mars]').click();
 await expect(page.locator('#body-name')).toHaveText('Mars');
 await expect(page.locator('#body-kind')).toHaveText('TERRESTRIAL PLANET');
 await inspect(page,'io');
 await page.evaluate(()=>document.querySelector('#universe canvas').dispatchEvent(new Event('webglcontextlost',{cancelable:true})));
 await expect(page.locator('#body-name')).toHaveText('Jupiter');
 await expect(page.locator('#focus-body')).toBeDisabled();
 await expect(page.locator('[data-focus-moon=io]')).toBeDisabled();
 await page.locator('button[data-body=saturn]').click();
 await expect(page.locator('[data-focus-moon=titan]')).toBeDisabled();
 await expect(page.locator('#body-source')).toHaveAttribute('href',/saturn/);
});

for(const width of [390,700])test(`moon inspector stays readable at ${width}px`,async({page})=>{
 await page.setViewportSize({width,height:900});await ready(page);
 await inspect(page,'triton');await assertMoon(page,'triton');
 await page.locator('#focus-body').click();await assertMoon(page,'triton');
 await page.locator('.inspector').scrollIntoViewIfNeeded();
 expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
 const boxes=await page.locator('.inspector h2,.surface-reference,.properties,.body-fact,.position-readout,#focus-body').evaluateAll(nodes=>nodes.map(el=>{const r=el.getBoundingClientRect();return {x:r.x,y:r.y,right:r.right,bottom:r.bottom,width:r.width};}));
 for(const box of boxes){expect(box.x).toBeGreaterThanOrEqual(0);expect(box.right).toBeLessThanOrEqual(width);expect(box.width).toBeGreaterThan(0);}
 for(let i=0;i<boxes.length;i++)for(let j=i+1;j<boxes.length;j++){
  const a=boxes[i],b=boxes[j];expect(a.right<=b.x+1||b.right<=a.x+1||a.bottom<=b.y+1||b.bottom<=a.y+1,`overlap ${i}/${j}`).toBe(true);
 }
 await page.screenshot({path:`evidence/moon-inspector/narrow-${width}-triton.png`,fullPage:true});
});
