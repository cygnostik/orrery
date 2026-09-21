import {panelAction} from './panel-actions.js';
import {test,expect} from '@playwright/test';

test.use({hasTouch:true,deviceScaleFactor:3});

async function ready(page){await page.goto('/');await expect.poll(()=>page.evaluate(()=>window.__orrery?.diagnostics().ready)).toBe(true);}

test('touch surfaces explain pinch zoom without hiding camera controls',async({page})=>{
 await page.setViewportSize({width:320,height:740});await ready(page);
 await expect(page.locator('.gesture-hint')).toBeVisible();await expect(page.locator('.gesture-hint')).toContainText('PINCH');
 await expect(page.locator('#universe canvas')).toHaveAttribute('aria-label',/pinch/i);
 await panelAction(page,'Settings',()=>page.locator('#view-home').tap());await panelAction(page,'Settings',()=>page.locator('#view-top').tap());
 const hint=await page.locator('.gesture-hint').boundingBox();expect(hint.x).toBeGreaterThanOrEqual(0);expect(hint.x+hint.width).toBeLessThanOrEqual(320);
});

const sizes=[{width:320,height:740},{width:390,height:844},{width:640,height:1000},{width:700,height:1000},{width:768,height:1024},{width:1440,height:1000},{width:844,height:390}];

test('touch and high-DPR layouts remain bounded across seven viewports',async({page},testInfo)=>{
 test.setTimeout(180000);
 const errors=[];page.on('pageerror',error=>errors.push(String(error)));
 await ready(page);await panelAction(page,'Settings',()=>page.locator('#pluto').check());await panelAction(page,'Settings',()=>page.locator('#labels').check());
 const measurements=[];
 for(const size of sizes){
  await page.setViewportSize(size);
  const planet=page.getByRole('button',{name:'09 Pluto',exact:true});await planet.tap();
  await expect(page.locator('#body-name')).toHaveText('Pluto');
  await page.locator('#universe').scrollIntoViewIfNeeded();
  await expect.poll(()=>page.evaluate(()=>{
   const d=window.__orrery.diagnostics(),r=document.querySelector('#universe').getBoundingClientRect();
   return Math.abs(d.width-r.width)<1&&Math.abs(d.height-r.height)<1;
  })).toBe(true);
  const layout=await page.evaluate(()=>{
   const d=window.__orrery.diagnostics(),canvas=document.querySelector('#universe canvas'),rect=canvas.getBoundingClientRect();
   return {viewport:{width:innerWidth,height:innerHeight},documentWidth:document.documentElement.scrollWidth,canvas:{width:rect.width,height:rect.height,bufferWidth:canvas.width,bufferHeight:canvas.height},pixelRatio:d.pixelRatio,
    properties:[...document.querySelectorAll('.properties dd')].map(node=>({text:node.textContent,width:node.clientWidth,scroll:node.scrollWidth})),
    labels:[...document.querySelectorAll('.planet-label:not([hidden])')].map(node=>{const r=node.getBoundingClientRect(),p=node.parentElement.getBoundingClientRect();return {left:r.left-p.left,right:r.right-p.left,parentWidth:p.width};})};
  });
  measurements.push(layout);
  expect(layout.documentWidth,JSON.stringify(size)).toBe(size.width);
  expect(layout.pixelRatio).toBe(1.75);expect(layout.canvas.width).toBeGreaterThan(0);
  expect(Math.abs(layout.canvas.bufferWidth-layout.canvas.width*1.75)).toBeLessThanOrEqual(1);
  for(const p of layout.properties)expect(p.scroll,p.text).toBeLessThanOrEqual(p.width);
  for(const label of layout.labels){expect(label.left).toBeGreaterThanOrEqual(0);expect(label.right).toBeLessThanOrEqual(label.parentWidth);}
  await page.locator('#about-open').tap();await expect(page.locator('#science-dialog')).toBeVisible();
  const dialog=await page.locator('#science-dialog').boundingBox();
  expect(dialog.x).toBeGreaterThanOrEqual(0);expect(dialog.x+dialog.width).toBeLessThanOrEqual(size.width);
  expect(dialog.y).toBeGreaterThanOrEqual(0);expect(dialog.y+dialog.height).toBeLessThanOrEqual(size.height+1);
  await page.locator('#about-close').tap();await expect(page.locator('#about-open')).toBeFocused();
  if([320,1440,844].includes(size.width)){await page.evaluate(()=>window.scrollTo(0,0));await page.screenshot({path:testInfo.outputPath(`layout-${size.width}x${size.height}.png`)});}
 }
 await testInfo.attach('layouts.json',{body:JSON.stringify(measurements,null,2),contentType:'application/json'});
 expect(errors).toEqual([]);
});

test('safe-area gutters protect the shell and source dialog',async({page})=>{
 await page.setViewportSize({width:844,height:390});await ready(page);
 // Emulated nonzero safe-area values, not a claim of physical notch testing.
 await page.evaluate(()=>{for(const [side,value] of Object.entries({top:24,right:44,bottom:21,left:44}))document.documentElement.style.setProperty(`--orrery-safe-${side}`,`${value}px`);});
 const shell=await page.evaluate(()=>{
  const mast=document.querySelector('.masthead').getBoundingClientRect(),main=document.querySelector('main').getBoundingClientRect(),body=getComputedStyle(document.body);
  return {left:main.left,right:main.right,top:mast.top,paddingBottom:parseFloat(body.paddingBottom),width:document.documentElement.scrollWidth};
 });
 expect(shell.left).toBeGreaterThanOrEqual(44);expect(shell.right).toBeLessThanOrEqual(800);expect(shell.top).toBeGreaterThanOrEqual(24);expect(shell.paddingBottom).toBeGreaterThanOrEqual(21);expect(shell.width).toBe(844);
 await page.locator('#about-open').tap();
 const dialog=await page.locator('#science-dialog').boundingBox();
 expect(dialog.x).toBeGreaterThanOrEqual(44);expect(dialog.x+dialog.width).toBeLessThanOrEqual(800);expect(dialog.y).toBeGreaterThanOrEqual(24);expect(dialog.y+dialog.height).toBeLessThanOrEqual(369);
});
