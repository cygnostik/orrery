import {test,expect} from '@playwright/test';
const ready=async page=>{await page.goto('/');await expect.poll(()=>page.evaluate(()=>window.__orrery?.diagnostics().ready)).toBe(true);};
const tab=(page,name)=>page.getByRole('tab',{name,exact:true}).click();
test('panel tabs, single clock switch, running inspection and quality controls',async({page})=>{
 const errors=[];page.on('pageerror',e=>errors.push(e.message));await ready(page);
 await expect(page.getByRole('tab')).toHaveCount(4);
 await page.getByRole('tab',{name:'Info',exact:true}).focus();await page.keyboard.press('ArrowRight');await expect(page.getByRole('tab',{name:'Settings',exact:true})).toBeFocused();
 await expect(page.locator('#panel-settings')).toBeVisible();await page.locator('[data-mode=observatory]').click();
 await expect(page.locator('#auto-drive')).toBeVisible();await expect(page.locator('#play')).toHaveCount(0);
 await page.locator('#auto-drive').click();await tab(page,'Info');await page.locator('button[data-body=earth]').click();await page.locator('#focus-body').click();
 expect(await page.evaluate(()=>window.__orrery.getState().playing)).toBe(true);
 await expect(page.locator('#follow-camera')).toBeChecked();
 const before=await page.evaluate(()=>window.__orrery.diagnostics());await page.waitForTimeout(500);const after=await page.evaluate(()=>window.__orrery.diagnostics());
 expect(after.camera.target).not.toEqual(before.camera.target);expect(after.followSubject).toBe('earth');
 await page.locator('#auto-drive').click();await page.locator('#auto-drive').click();expect(await page.evaluate(()=>window.__orrery.diagnostics().followSubject)).toBe('earth');
 await tab(page,'Settings');await page.locator('#view-top').click();expect(await page.evaluate(()=>window.__orrery.diagnostics().followSubject)).toBe(null);
 await tab(page,'Graphics');await page.locator('#reflection-quality').selectOption('2048');await page.locator('#render-quality').selectOption('2');
 await expect.poll(()=>page.evaluate(()=>window.__orrery.diagnostics().reflectionSize)).toBe(2048);
 expect(errors).toEqual([]);
});
for(const width of [390,640,700,767,1440])test(`polish layout ${width}`,async({page})=>{
 await page.setViewportSize({width,height:1000});await ready(page);
 for(const name of ['Info','Settings','Graphics','Help']){
  await tab(page,name);
  await expect(page.locator('[role=tabpanel]:visible')).toHaveCount(1);
  await expect(page.locator(`#panel-${name.toLowerCase()}`)).toBeVisible();
  expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
 }
 await tab(page,'Info');await page.screenshot({path:`evidence/polish/layout-${width}.png`,fullPage:true});
});
