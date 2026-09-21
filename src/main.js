import {createState,advance,setDate,turnCrank,MIN_DATE,MAX_DATE} from './state.js';
import {bindMechanicalControls} from './museum-controls.js';
import {bindSelectionMotion} from './interface-motion.js';
import {bindFooterMotion} from './footer-motion.js';
import {bindFullscreen,bindScienceDialog} from './browser-support.js';
import {renderBodyPortrait} from './body-portrait.js';
import './character.css';
import './museum.css';
import './browser-support.css';
import './pwa.js';
import './panels.css';
import {BODIES,positionAt,SCIENCE} from './science.js';
import {createDriveTrain} from './drive-train.js';
import {MOONS,MOON_MODEL} from './moons.js';
import {layoutLabels} from './labels.js';
const $=selector=>document.querySelector(selector);
const state=createState(new Date());
const driveModel=createDriveTrain();
const reduced=matchMedia('(prefers-reduced-motion: reduce)');
let scene=null,frame=0,lastTime=0,raf=0,disposed=false,dirty=true;
let inspectedMoon=null;
const listeners=new AbortController();
const on=(node,event,handler)=>node.addEventListener(event,handler,{signal:listeners.signal});
const coarsePointer=matchMedia('(pointer: coarse)');
const syncGestureHint=()=>{$('.gesture-hint').lastChild.textContent=coarsePointer.matches?' PINCH TO ZOOM':' SCROLL TO EXPLORE';};
on(coarsePointer,'change',syncGestureHint);syncGestureHint();
$('#universe').setAttribute('aria-label',$('#universe').getAttribute('aria-label').replace('scroll to zoom','scroll or pinch to zoom'));
const footerMotion=bindFooterMotion({signal:listeners.signal});
const selectionMotion=bindSelectionMotion({signal:listeners.signal});
const mechanics=bindMechanicalControls({readState:()=>state,manualTurn:windClock,toggleAuto:toggleDrive,signal:listeners.signal});
const fmt=(value,places=0)=>Number(value).toLocaleString('en-US',{maximumFractionDigits:places});
const announce=text=>{$('#status').textContent=text;};
const bodyButtons=new Map(),labelNodes=new Map(),labelSizes=new Map();
for(const [index,body] of BODIES.entries()){
 const button=document.createElement('button');button.className='planet-button';button.dataset.body=body.id;
 button.setAttribute('aria-label',`${String(index+1).padStart(2,'0')} ${body.name}`);
 const number=document.createElement('span');number.textContent=String(index+1).padStart(2,'0');
 button.append(number,document.createTextNode(body.name));
 on(button,'click',()=>select(body.id));on(button,'dblclick',()=>inspectBody());bodyButtons.set(body.id,button);
 const label=document.createElement('span');label.className='planet-label';label.textContent=body.name;label.hidden=true;
 $('#planet-labels').append(label);labelNodes.set(body.id,label);
}
for(const moon of MOONS){
 const label=document.createElement('span');label.className='planet-label moon-label';label.textContent=moon.name;label.hidden=true;
 $('#planet-labels').append(label);labelNodes.set(moon.id,label);
}
const moonRows=new Map(MOONS.map(moon=>{
 const row=document.createElement('li');
 const inspect=document.createElement('button');inspect.textContent=moon.name+' ↗';inspect.setAttribute('aria-label',`Inspect ${moon.name}`);inspect.dataset.focusMoon=moon.id;inspect.setAttribute('aria-pressed','false');
 on(inspect,'click',()=>inspectMoon(moon.id));
 const link=document.createElement('a');link.textContent='Reference ↗';link.setAttribute('aria-label',`${moon.name} reference`);link.href=moon.sourceUrl;link.target='_blank';link.rel='noopener noreferrer';
 const period=document.createElement('span');period.className='hud';period.textContent=`≈ ${fmt(moon.periodDays,2)} days`;
 const description=document.createElement('p');description.textContent=`Mean radius ${fmt(moon.radiusKm)} km. ${moon.fact}`;
 row.append(inspect,period,description,link);return [moon.id,row];
}));
function syncMoonFamily(){
 const family=MOONS.filter(moon=>moon.parentId===state.selected);
 $('#moon-family').hidden=!state.moons||family.length===0;
 $('#moon-family-count').textContent=String(family.length);
 $('#moon-family-preview').textContent=family.map(moon=>moon.name).join(' · ');
 $('#moon-list').replaceChildren(...family.map(moon=>moonRows.get(moon.id)));
}
function syncBodies(){
 for(const body of BODIES){const button=bodyButtons.get(body.id);if(body.id==='pluto'&&!state.pluto){button.remove();labelNodes.get(body.id).hidden=true;}else if(!button.isConnected)$('#body-buttons').append(button);}
}
function clearMoonFocus(){
 scene?.setFollow(null);
 const wasInspecting=inspectedMoon!==null;
 inspectedMoon=null;$('#inspection-subject').hidden=true;
 for(const row of moonRows.values())row.querySelector('button').setAttribute('aria-pressed','false');
 if(wasInspecting)syncInspector();
}
function inspectMoon(id){
 const moon=MOONS.find(moon=>moon.id===id);
 if(renderError||!state.moons||moon?.parentId!==state.selected||typeof scene?.focusMoon!=='function')return;
 scene.update(state);
 clearMoonFocus();
 if(scene.focusMoon(id)===false)return;
 inspectedMoon=id;
 moonRows.get(id).querySelector('button').setAttribute('aria-pressed','true');
 $('#inspection-subject').textContent=`${moon.name} · ${BODIES.find(body=>body.id===moon.parentId).name} system · illustrated surface`;
 $('#inspection-subject').hidden=false;syncInspector();syncTime();requestRender();
 $('.inspector').scrollTop=0;selectionMotion.acquire();
 $('#universe').scrollIntoView({block:'center',behavior:'instant'});
 syncFollow();announce(`Inspecting ${moon.name}. Camera follows position. Surface and orbit are illustrative.`);
}
function select(id){
 clearMoonFocus();scene?.setFollow(null);state.selected=id;showPanel('info');
 $('#moon-family').open=id==='jupiter'||id==='saturn';
 if(id===null)scene?.clearInspection();
 sync();$('.inspector').scrollTop=0;
 if(id!==null)selectionMotion.acquire();
 announce(id===null?'Selection cleared. Drag to orbit, right-drag or two-finger drag to pan, and scroll to inspect.':`${BODIES.find(b=>b.id===id).name} selected`);
}
// The renderer keeps the parent system selected; the inspector can show its moon.
function syncInspector(){
 const body=BODIES.find(b=>b.id===state.selected);
 const moon=MOONS.find(m=>m.id===inspectedMoon);
 const subject=moon||body;
 const index=BODIES.indexOf(body);
 $('.inspector').dataset.selection=subject?'body':'none';
 $('.inspector').setAttribute('aria-label',subject?'Selected celestial body':'Free inspection');
 $('#inspector-label').textContent=moon?'SELECTED MOON':body?'SELECTED BODY':'FREE INSPECTION';
 $('#moon-family-label').textContent=moon?`${body.name} moons`:'Moon companions';
 $('#body-portrait').hidden=Boolean(moon);
 $('#inclination-property').hidden=Boolean(moon);
 $('#sun-distance').hidden=Boolean(moon);
 $('#tilt-label').textContent=moon?'PARENT':'AXIAL TILT';
 $('#tilt-label').title=moon?'Parent system.':'Reference obliquity, not the current viewing angle.';
 $('#eccentricity-label').textContent=moon?'ORBIT DIRECTION':'ECCENTRICITY';
 $('#eccentricity-label').title=moon?'Sourced orbital direction; schematic motion does not encode the real orbital plane.':'Reference J2000 orbital eccentricity. Mechanical arms follow fixed-radius circles, not this ellipse.';
 $('#axis-label').textContent=moon?'ORBITAL RADIUS':'SEMI-MAJOR AXIS';
 $('#axis-label').title=moon?'Approximate reference orbital radius around the parent, not a current distance.':'Reference semi-major axis at J2000: half the longest diameter of the orbital ellipse.';
 $('#axis-unit').textContent=moon?' KM':' AU';
 $('#reference-label').textContent=moon?'ILLUSTRATIVE MODEL':'ASTRONOMICAL REFERENCE';
 if(subject){
 $('#body-name').textContent=subject.name;
 $('#body-index').textContent=moon?'MOON':`${String(index+1).padStart(2,'0')} / ${state.pluto?'09':'08'}`;
 $('#body-kind').textContent=moon?'NATURAL SATELLITE':body.id==='pluto'?'DWARF PLANET':index<4?'TERRESTRIAL PLANET':index<6?'GAS GIANT':'ICE GIANT';
 $('#body-fact').textContent=subject.fact;
 // No moon portrait maps are provided; do not reuse the parent's surface study.
 if(!moon)renderBodyPortrait($('#body-portrait'),body);
 $('#body-tilt').textContent=moon?body.name:`${Number(body.tiltDeg.toFixed(2))}°`;
 $('#body-eccentricity').textContent=moon?(moon.retrograde?'Retrograde':'Prograde'):body.eccentricity.toFixed(4);
 $('#body-axis').textContent=moon?`≈ ${fmt(moon.orbitRadiusKm)}`:fmt(body.aAU,3);
 $('#body-period').textContent=moon?`≈ ${fmt(moon.periodDays,2)}`:fmt(body.periodDays,1);
 $('#body-radius').textContent=fmt(subject.radiusKm,moon?1:0);
 $('#body-inclination').textContent=moon?'—':fmt(Math.abs(body.inclinationDeg)<0.005?0:body.inclinationDeg,2);
 $('#body-source').href=subject.sourceUrl;
 $('#focus-body').replaceChildren(document.createTextNode(`Inspect ${subject.name} `),Object.assign(document.createElement('span'),{textContent:'↗'}));
 }else{
  $('#body-name').textContent=state.mode==='mechanical'?'Mechanism':'Observatory';
  $('#body-index').textContent='—';$('#body-kind').textContent=state.mode==='mechanical'?'TIME, BY HAND':'NO BODY SELECTED';
  $('#body-fact').textContent='Nothing selected. Drag to orbit, right-drag or two-finger drag to pan, and scroll to move closer. Click a world to return to its details.';
  $('#focus-body').textContent=state.mode==='mechanical'?'Inspect mechanism ↗':'Frame all planets ↗';
 }
 $('#focus-body').setAttribute('aria-label',subject?`Inspect ${subject.name}`:state.mode==='mechanical'?'Inspect mechanism':'Frame all planets');
 $('#distance-model-note').textContent=moon?'Approximate reference orbit. Illustrative phase, plane and spacing. Not an ephemeris.':state.mode==='mechanical'?'Astronomical reference, not the geared arm position.':'Approximate heliocentric position at the selected date.';
 $('#drive-reference').hidden=Boolean(moon)||state.mode!=='mechanical'||!body;
 if(body&&!moon){
 const output=driveModel.outputs.find(output=>output.id===body.id);
 $('#drive-output-period').textContent=fmt(output.periodDays,3);
 $('#drive-period-error').textContent=`${output.periodErrorDays>=0?'+':''}${fmt(output.periodErrorDays,5)} days`;
 $('#drive-path').textContent=['Crank',...output.path.filter(id=>id.endsWith('-output')).map(id=>BODIES.find(body=>id===`${body.id}-output`).name),`${body.name} keyed arm`].join(' → ');
 }
}
function sync(){
 if(inspectedMoon&&(!state.moons||MOONS.find(moon=>moon.id===inspectedMoon)?.parentId!==state.selected))clearMoonFocus();
 syncInspector();
 for(const [id,button] of bodyButtons)button.setAttribute('aria-pressed',String(id===state.selected));
 for(const button of document.querySelectorAll('[data-mode]'))button.setAttribute('aria-pressed',String(button.dataset.mode===state.mode));
 for(const button of document.querySelectorAll('[data-base-style]'))button.setAttribute('aria-pressed',String(button.dataset.baseStyle===state.baseStyle));
 $('#scale').disabled=state.mode==='mechanical'||Boolean(renderError);
 $('#scale').value=state.scale;
 $('#lights-out').checked=state.lightsOut;
 $('#scale-help').textContent=state.mode==='mechanical'?'True distance in Observatory':'Body sizes remain enlarged';
 $('#scale-note').textContent=state.mode==='mechanical'?'Gear-driven mean motion · enlarged bodies':state.scale==='distance'?'True orbital distances · enlarged bodies':'Compressed orbital spacing · enlarged bodies';
 syncMoonFamily();syncTime();syncFollow();requestRender();
}
function syncTime(){
 const iso=state.date.toISOString();
 if(document.activeElement!==$('#simulation-date'))$('#simulation-date').value=iso.slice(0,10);
 $('#time-readout').textContent=`${iso.slice(11,19)} UTC`;
 $('#body-distance').textContent=state.selected?`${fmt(positionAt(state.selected,state.date).radiusAU,3)} AU`:'—';
 $('#play-state').textContent=state.playing?'RUNNING':'PAUSED';
 mechanics.sync();footerMotion.setPlaying(state.playing);
}
for(const button of document.querySelectorAll('[data-mode]'))on(button,'click',()=>{clearMoonFocus();state.mode=button.dataset.mode;sync();});
on($('#pluto'),'change',()=>{state.pluto=$('#pluto').checked;if(!state.pluto&&state.selected==='pluto')state.selected='earth';syncBodies();sync();});
let interacting=false,settleFrames=0,renderError=null;
function requestRender(frames=16){
 dirty=true;settleFrames=Math.max(settleFrames,frames);
 if(!raf&&!disposed&&!document.hidden&&scene&&!renderError)raf=requestAnimationFrame(tick);
}
function tick(now){
 raf=0;if(disposed||document.hidden||!scene||renderError)return;
 const dt=lastTime?Math.min((now-lastTime)/1000,0.1):0;lastTime=now;
 const changed=state.playing;advance(state,dt);
 if(dirty||changed){scene.update(state);dirty=false;}
 scene.render(dt);frame++;
 if(changed||frame%12===0)syncTime();
 const projected=scene.projectLabels?.()||[];
 for(const node of labelNodes.values())node.hidden=true;
 if(state.labels){
  const bounds=$('#universe').getBoundingClientRect();
  const obstacles=[...document.querySelectorAll('.stage-heading>div,.stage-toolbar,.stage-caption')].map(el=>{const r=el.getBoundingClientRect();return {x:r.left-bounds.left,y:r.top-bounds.top,width:r.width,height:r.height};});
  const candidates=projected.filter(p=>labelNodes.has(p.id)&&p.visible&&(p.id!=='pluto'||state.pluto)&&(!MOONS.some(m=>m.id===p.id)||(state.moons&&MOONS.find(m=>m.id===p.id).parentId===state.selected))).map(p=>({...p,...labelSizes.get(p.id)})).sort((a,b)=>Number(b.id===state.selected)-Number(a.id===state.selected));
  for(const point of layoutLabels(candidates,bounds,obstacles)){const node=labelNodes.get(point.id);node.hidden=false;node.style.left=`${point.x}px`;node.style.top=`${point.y}px`;node.classList.toggle('selected',point.id===state.selected);}
 }
 settleFrames--;if(state.playing||interacting||settleFrames>0)raf=requestAnimationFrame(tick);else lastTime=0;
}
function fallback(message){
 renderError=message;state.playing=false;cancelAnimationFrame(raf);raf=0;mechanics.fail();
 clearMoonFocus();for(const control of document.querySelectorAll('#follow-camera,#render-quality,#reflection-quality,#focus-body,#focus-craft,#view-home,#view-top,#labels,#scale,#speed,#moons,#lights-out,[data-base-style],[data-mode],[data-focus-moon]'))control.disabled=true;
 for(const row of moonRows.values())row.querySelector('button').disabled=true;
 $('#fallback').hidden=false;$('#load-message').textContent=message;syncTime();
 for(const label of labelNodes.values())label.hidden=true;
 announce(message);
}
function toggleDrive(){if(renderError)return;state.playing=!state.playing;lastTime=0;syncTime();requestRender();}
function windClock(turns){if(renderError||!turnCrank(state,turns))return;clearMoonFocus();lastTime=0;syncTime();requestRender();}
on($('#speed'),'change',()=>{state.speed=Number($('#speed').value);requestRender();});
on($('#simulation-date'),'change',()=>{
 clearMoonFocus();
 if(!setDate(state,$('#simulation-date').value)){announce('Choose a valid date within the supported model range.');$('#simulation-date').value=state.date.toISOString().slice(0,10);return;}
 state.playing=false;sync();requestRender();
});
on($('#today'),'click',()=>{clearMoonFocus();state.date=new Date(Math.max(MIN_DATE,Math.min(MAX_DATE,Date.now())));state.playing=false;sync();requestRender();});
on($('#labels'),'change',()=>{state.labels=$('#labels').checked;requestRender();});
on($('#lights-out'),'change',()=>{if(renderError)return;state.lightsOut=$('#lights-out').checked;requestRender();announce(state.lightsOut?'Lights out. Sunlight and illustrative model shadows; not eclipse predictions.':'Exhibit lighting restored.');});
on($('#moons'),'change',()=>{const wasInspecting=inspectedMoon!==null;clearMoonFocus();state.moons=$('#moons').checked;sync();if(wasInspecting){scene?.update(state);scene?.focusBody(state.selected);requestRender();}});
for(const button of document.querySelectorAll('[data-base-style]'))on(button,'click',()=>{state.baseStyle=button.dataset.baseStyle;sync();});
on($('#scale'),'change',()=>{clearMoonFocus();state.scale=$('#scale').value;sync();scene?.resetView('home');requestRender();});
on($('#view-home'),'click',()=>{clearMoonFocus();scene?.resetView('home');requestRender();});
on($('#view-top'),'click',()=>{clearMoonFocus();scene?.resetView('top');requestRender();});
function inspectBody(){
 if(renderError)return;
 if(inspectedMoon){inspectMoon(inspectedMoon);return;}
 scene?.update(state);
 if(state.selected)scene?.focusBody(state.selected);
 else if(state.mode==='mechanical')scene?.focusMechanism();
 else scene?.resetView('home');
 syncFollow();requestRender();announce(`Camera focused on ${state.selected||(state.mode==='mechanical'?'the mechanism':'all planets')}`);
}
on($('#focus-body'),'click',inspectBody);
on($('#focus-craft'),'click',()=>{
 if(renderError||state.mode!=='mechanical')return;
 clearMoonFocus();scene?.setFollow(null);state.playing=false;lastTime=0;syncTime();scene?.update(state);
 if(scene?.focusCraft()){
  requestRender();announce('Simulation paused. Black opal inlay close-up. Drag to see the blue fire change with the light.');
 }
});

function showPanel(name){
 for(const tab of document.querySelectorAll('[role=tab]')){const active=tab.id===`tab-${name}`;tab.setAttribute('aria-selected',String(active));tab.tabIndex=active?0:-1;document.getElementById(tab.getAttribute('aria-controls')).hidden=!active;}
 requestRender();
}
for(const [index,tab] of [...document.querySelectorAll('[role=tab]')].entries()){
 on(tab,'click',()=>showPanel(tab.id.slice(4)));
 on(tab,'keydown',event=>{const tabs=[...document.querySelectorAll('[role=tab]')];let next;if(event.key==='ArrowRight')next=(index+1)%tabs.length;if(event.key==='ArrowLeft')next=(index+tabs.length-1)%tabs.length;if(event.key==='Home')next=0;if(event.key==='End')next=tabs.length-1;if(next!==undefined){event.preventDefault();showPanel(tabs[next].id.slice(4));tabs[next].focus();}});
}
function syncFollow(){ $('#follow-camera').checked=Boolean(scene?.diagnostics().followSubject);$('#follow-camera').disabled=Boolean(renderError)||!state.selected; }
on($('#follow-camera'),'change',()=>{scene?.setFollow($('#follow-camera').checked?(inspectedMoon||state.selected):null);syncFollow();requestRender();});
on($('#drive-reference'),'toggle',()=>{state.driveHighlight=$('#drive-reference').open;requestRender();});
for(const [id,key] of [['render-quality','renderQuality'],['reflection-quality','reflectionQuality']])on($('#'+id),'change',()=>{state[key]=Number($('#'+id).value);requestRender();});
on($('#help-sources'),'click',()=>$('#about-open').click());

const dialog=$('#science-dialog');
on(document,'keydown',event=>{if(event.key==='Escape'&&!dialog.hasAttribute('open')&&!event.target.closest('input,select,textarea'))select(null);});
bindScienceDialog({dialog,openButton:$('#about-open'),closeButton:$('#about-close'),signal:listeners.signal});
$('#model-description').textContent=`${SCIENCE.model}. Supported interval: ${SCIENCE.range.start} through ${SCIENCE.range.end} UTC.`;
$('#model-source').href=SCIENCE.sourceUrl;
$('#moon-model-limits').textContent=MOON_MODEL.limitations.join(' ');
$('#moon-model-source').href=MOON_MODEL.sourceUrl;
$('#model-limits').textContent=Array.isArray(SCIENCE.limitations)?SCIENCE.limitations.join(' '):SCIENCE.limitations;
bindFullscreen({button:$('#fullscreen'),signal:listeners.signal,announce,onChange:()=>{scene?.resize();requestRender();}});
on($('#universe'),'pointerdown',()=>{interacting=true;requestRender();});
on(window,'pointerup',()=>{interacting=false;requestRender();});
on(window,'pointercancel',()=>{interacting=false;requestRender();});
on($('#universe'),'pointermove',()=>{if(interacting)requestRender();});
on($('#universe'),'wheel',()=>requestRender());
on($('#universe'),'keydown',()=>requestRender());
on(reduced,'change',()=>{if(reduced.matches){state.playing=false;syncTime();}requestRender();});
on(document,'visibilitychange',()=>{lastTime=0;if(document.hidden){cancelAnimationFrame(raf);raf=0;}else requestRender();});
const observer=new ResizeObserver(()=>{scene?.resize();requestRender();});observer.observe($('#universe'));
// Browser zoom / display changes can change DPR without changing the container's CSS size.
on(window,'resize',()=>{scene?.resize();requestRender();});
function dispose(){if(disposed)return;disposed=true;cancelAnimationFrame(raf);observer.disconnect();listeners.abort();scene?.dispose();}
on(window,'pagehide',event=>{if(event.persisted){cancelAnimationFrame(raf);raf=0;lastTime=0;}else dispose();});
on(window,'pageshow',event=>{if(event.persisted)requestRender();});
window.__orrery={getState:()=>({...state,date:state.date.toISOString()}),diagnostics:()=>({ready:!!scene&&!renderError,frames:frame,disposed,renderError,inspectedMoon,...scene?.diagnostics()}),dispose};
syncBodies();sync();
$('#load-message').textContent='Preparing your instrument…';
try{
 const {createOrrery}=await import('./scene.js');
 await document.fonts.ready;
 for(const [id,node] of labelNodes){node.hidden=false;const rect=node.getBoundingClientRect();labelSizes.set(id,{width:rect.width,height:rect.height});node.hidden=true;}
 const created=await createOrrery({container:$('#universe'),onManualTurn:windClock,onAutoToggle:toggleDrive,onSelect:id=>{
  const moon=MOONS.find(moon=>moon.id===id);
  if(moon&&state.moons&&(moon.parentId!=='pluto'||state.pluto)){
   select(moon.parentId);$('#moon-family').open=true;inspectMoon(id);
  }else if(id===null||BODIES.some(b=>b.id===id)&&(id!=='pluto'||state.pluto))select(id);
 },onInspect:id=>{const moon=MOONS.find(m=>m.id===id);if(moon){if(state.selected!==moon.parentId)select(moon.parentId);inspectMoon(id);}else if(BODIES.some(b=>b.id===id)){if(state.selected!==id)select(id);inspectBody();}},onFollowChange:syncFollow,onError:error=>fallback(`3D unavailable: ${error?.message||String(error)}. Planet facts remain available.`)});
 if(disposed)created.dispose();else{scene=created;scene.update(state);scene.render(0);$('#fallback').hidden=true;requestRender();}
}catch(error){fallback(`3D is unavailable in this browser. Planet facts and the science reference remain available.`);console.error('Orrery renderer initialization failed:',error);}
