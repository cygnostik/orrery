import {panelAction} from './panel-actions.js';
import {test,expect} from '@playwright/test';
import {MOONS} from '../src/moons.js';

test('opal workmanship can be inspected on the real instrument and returns home cleanly',async({page})=>{
 await page.goto('/');await expect.poll(()=>page.evaluate(()=>window.__orrery?.diagnostics().ready)).toBe(true);
 const home=await page.evaluate(()=>window.__orrery.diagnostics().camera);
 await page.locator('#auto-drive').click();
 await panelAction(page,'Graphics',()=>page.getByRole('button',{name:'Inspect opal & finish',exact:true}).click({timeout:5000}));
 await expect(page.locator('#inspection-subject')).toBeHidden(); // Material captions no longer cover the specimen.
 expect(await page.evaluate(()=>window.__orrery.getState().playing)).toBe(false);
 const detail=await page.evaluate(()=>window.__orrery.diagnostics().camera);
 expect(Math.hypot(...detail.position.map((x,i)=>x-detail.target[i]))).toBeLessThan(4);
 expect(detail.target[1]).toBeGreaterThan(2);
 await panelAction(page,'Settings',()=>page.locator('#view-home').click());await expect(page.locator('#inspection-subject')).toBeHidden();
 const reset=await page.evaluate(()=>window.__orrery.diagnostics().camera);
 expect(reset.target).toEqual(home.target);
 await page.evaluate(()=>{document.querySelector('canvas').dispatchEvent(new Event('webglcontextlost',{cancelable:true}));});
 await expect(page.locator('#focus-craft')).toBeDisabled();
});

test('all ten production moons inherit visible mechanical supports and reverse with the crank',async({page})=>{
 await page.goto('/');await expect.poll(()=>page.evaluate(()=>window.__orrery?.diagnostics().ready)).toBe(true);
 await page.locator('#simulation-date').fill('2026-09-05');await panelAction(page,'Settings',()=>page.getByLabel('Include Pluto').check());
 // DOM toggles schedule the Three.js update on the next frame; wait for that
 // frame rather than reading the previously hidden Charon immediately.
 await expect.poll(()=>page.evaluate(()=>window.__orrery.diagnostics().moonOutputs.every(m=>m.visible&&m.supportVisible))).toBe(true);
 const before=await page.evaluate(()=>window.__orrery.diagnostics());
 expect(before.lunarMechanism.outputCount).toBe(MOONS.length);
 expect(before.lunarMechanism.drawnGears).toEqual([]);
 expect(before.lunarMechanism.supportEnvelopes.some(s=>s.name.startsWith('lunar-frame-'))).toBe(false);
 expect(before.moonOutputs.map(m=>m.id).sort()).toEqual(MOONS.map(m=>m.id).sort());
 for(const moon of before.moonOutputs){
  expect(moon.mountParent).toBe(`moon-mount-${moon.id}`);expect(moon.visible&&moon.supportVisible).toBe(true);
  expect(moon.localPosition).toEqual([0,0,0]);
  for(let i=0;i<3;i++)expect(moon.position[i]).toBeCloseTo(moon.mountPosition[i],9);
 }
 await page.locator('#crank-forward').click();await page.waitForTimeout(100);
 const forward=await page.evaluate(()=>window.__orrery.diagnostics().moonOutputs);
 for(const moon of forward){const start=before.moonOutputs.find(m=>m.id===moon.id);expect(Math.hypot(...moon.position.map((v,i)=>v-start.position[i]))).toBeGreaterThan(.001);}
 await page.locator('#crank-back').click();await page.waitForTimeout(100);
 const reverse=await page.evaluate(()=>window.__orrery.diagnostics().moonOutputs);
 for(const moon of reverse){const start=before.moonOutputs.find(m=>m.id===moon.id);for(let i=0;i<3;i++)expect(moon.position[i]).toBeCloseTo(start.position[i],8);}
 expect(await page.locator('#drive-reference').textContent()).not.toContain('schematic overlays');
 expect(await page.locator('#science-dialog').textContent()).not.toContain('not geared outputs');
 await panelAction(page,'Settings',()=>page.getByRole('button',{name:'Observatory',exact:true}).click());
 await expect.poll(()=>page.evaluate(()=>window.__orrery.diagnostics().moonOutputs.every(m=>!m.supportVisible))).toBe(true);
});
