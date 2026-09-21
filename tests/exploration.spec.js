import {panelAction} from './panel-actions.js';
import {test,expect} from '@playwright/test';
import * as THREE from 'three';
import {BODY_HEIGHT,BODY_RADII} from '../src/scene-assets.js';
const ready=async page=>{await page.goto('/');await expect.poll(()=>page.evaluate(()=>window.__orrery?.diagnostics().ready)).toBe(true);};
const cameraFor=d=>{
 const camera=new THREE.PerspectiveCamera(35,d.width/d.height,.03,400);
 camera.position.fromArray(d.camera.position);camera.lookAt(new THREE.Vector3().fromArray(d.camera.target));camera.updateMatrixWorld();return camera;
};
test('background and machinery clicks deselect without resetting the camera; Escape also releases a close-up',async({page})=>{
 await ready(page);const canvas=page.locator('#universe canvas');await canvas.scrollIntoViewIfNeeded();
 let before=await page.evaluate(()=>window.__orrery.diagnostics().camera);
 await canvas.click({position:{x:20,y:280}});
 await expect.poll(()=>page.evaluate(()=>window.__orrery.getState().selected)).toBe(null);
 await expect(page.locator('#body-name')).toHaveText('Mechanism');
 await expect(page.locator('#body-portrait')).toBeHidden();
 await expect(page.locator('.planet-button[aria-pressed=true]')).toHaveCount(0);
 expect(await page.evaluate(()=>window.__orrery.diagnostics().camera)).toEqual(before);
 await page.getByRole('button',{name:'05 Jupiter',exact:true}).click();await canvas.scrollIntoViewIfNeeded();
 const d=await page.evaluate(()=>window.__orrery.diagnostics()),p=new THREE.Vector3(-8,-1.92,8).project(cameraFor(d));
 before=d.camera;await canvas.click({position:{x:(p.x*.5+.5)*d.width,y:(-.5*p.y+.5)*d.height}});
 await expect.poll(()=>page.evaluate(()=>window.__orrery.getState().selected)).toBe(null);
 expect(await page.evaluate(()=>window.__orrery.diagnostics().camera)).toEqual(before);
 await page.getByRole('button',{name:'Inspect mechanism',exact:true}).click();
 const machinery=await page.evaluate(()=>window.__orrery.diagnostics().camera);
 expect(machinery.position).not.toEqual(before.position);
 await page.getByRole('button',{name:'03 Earth',exact:true}).click();await page.locator('#focus-body').click();
 before=await page.evaluate(()=>window.__orrery.diagnostics().camera);
 await page.keyboard.press('Escape');await expect.poll(()=>page.evaluate(()=>window.__orrery.getState().selected)).toBe(null);
 expect(await page.evaluate(()=>window.__orrery.diagnostics().camera)).toEqual(before);
 await panelAction(page,'Settings',()=>page.getByRole('button',{name:'Observatory',exact:true}).click());await expect(page.locator('#body-name')).toHaveText('Observatory');
 await page.locator('#focus-body').click();await expect(page.locator('#body-distance')).not.toBeVisible();
 await page.getByRole('button',{name:'03 Earth',exact:true}).click();await expect(page.locator('#body-distance')).toContainText('AU');
});

test('Jupiter and Saturn reveal moon facts immediately and each moon is directly pickable after deselection',async({page})=>{
 await ready(page);await page.locator('#simulation-date').fill('2000-01-01');
 for(const [button,parent,names] of [['05 Jupiter','jupiter',['Io','Europa','Ganymede','Callisto']],['06 Saturn','saturn',['Enceladus','Titan']]]){
  await page.getByRole('button',{name:button,exact:true}).click();
  await expect(page.locator('#moon-family')).toHaveJSProperty('open',true);
  for(const name of names){
   const inspect=page.getByRole('button',{name:`Inspect ${name}`,exact:true});
   await expect(inspect).toBeVisible();await expect(inspect.locator('..')).toContainText('Mean radius');
   await expect(page.getByRole('link',{name:`${name} reference`,exact:true})).toHaveAttribute('href',/science.nasa.gov/);
   await inspect.click();await expect(page.locator('#inspection-subject')).toContainText(name);
   const id=name.toLowerCase(),d=await page.evaluate(()=>window.__orrery.diagnostics());
   expect(d.inspectedMoon).toBe(id);d.camera.target.forEach((value,i)=>expect(value).toBeCloseTo(d.moonOutputs.find(m=>m.id===id).position[i],10));
   await page.keyboard.press('Escape');await expect.poll(()=>page.evaluate(()=>window.__orrery.getState().selected)).toBe(null);
   await expect(page.locator('#inspection-subject')).toBeHidden();
   const canvas=page.locator('#universe canvas');await canvas.scrollIntoViewIfNeeded();const r=await canvas.boundingBox();
   await canvas.click({position:{x:r.width/2,y:r.height/2}});
   await expect.poll(()=>page.evaluate(()=>window.__orrery.diagnostics().inspectedMoon)).toBe(id);
   expect(await page.evaluate(()=>window.__orrery.getState().selected)).toBe(parent);
  }
 }
});

test('planet labels start off and can still be enabled explicitly',async({page})=>{
 await ready(page);await expect(page.locator('#labels')).not.toBeChecked();
 expect(await page.evaluate(()=>window.__orrery.getState().labels)).toBe(false);
 await expect(page.locator('.planet-label:visible')).toHaveCount(0);
 expect(await page.evaluate(()=>window.__orrery.diagnostics().moonLabels.every(l=>!l.visible))).toBe(true);
 await panelAction(page,'Settings',()=>page.locator('#labels').check());await expect.poll(()=>page.locator('.planet-label:visible').count()).toBeGreaterThan(0);
 await panelAction(page,'Settings',()=>page.locator('#labels').uncheck());await expect(page.locator('.planet-label:visible')).toHaveCount(0);
});

test('starter perspective is slightly closer and lower while keeping planets and the base in frame',async({page})=>{
 await ready(page);
 const initial=await page.evaluate(()=>window.__orrery.diagnostics());
 const offset=new THREE.Vector3().fromArray(initial.camera.position).sub(new THREE.Vector3().fromArray(initial.camera.target));
 const elevation=THREE.MathUtils.radToDeg(Math.asin(offset.y/offset.length()));
 expect(elevation).toBeGreaterThan(20);expect(elevation).toBeLessThan(26);
 expect(offset.length()).toBeGreaterThan(62);expect(offset.length()).toBeLessThan(68);
 for(const width of [1440,700,390]){
  await page.setViewportSize({width,height:1000});
  for(const pluto of [false,true]){
   await panelAction(page,'Settings',()=>page.locator('#pluto').setChecked(pluto));await panelAction(page,'Settings',()=>page.locator('#view-home').click());
   for(const date of ['1800-01-01','2000-01-01','2049-12-31']){
    await page.locator('#simulation-date').fill(date);await page.waitForTimeout(80);
    const d=await page.evaluate(()=>window.__orrery.diagnostics()),camera=cameraFor(d),points=[];
    for(const body of d.driveOutputs.filter(o=>o.visible)){
     const r=BODY_RADII[body.id]*(body.id==='saturn'?2.3:1);
     for(const delta of [[r,0,0],[-r,0,0],[0,r,0],[0,-r,0],[0,0,r],[0,0,-r]])points.push({id:body.id,p:new THREE.Vector3().fromArray(body.planetPosition).add(new THREE.Vector3(...delta))});
    }
    points.push({id:'sun',p:new THREE.Vector3(0,BODY_HEIGHT+BODY_RADII.sun,0)});
    for(let i=0;i<48;i++)for(const y of [-3.5,-1.92])points.push({id:'base',p:new THREE.Vector3(Math.cos(i/48*Math.PI*2)*15.2,y,Math.sin(i/48*Math.PI*2)*15.2)});
    for(const {id,p} of points){p.project(camera);expect(Math.abs(p.x),`${width}/${date}/${id} horizontal`).toBeLessThan(.99);expect(Math.abs(p.y),`${width}/${date}/${id} vertical`).toBeLessThan(.99);}
   }
  }
 }
});
