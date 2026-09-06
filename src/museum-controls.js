import {MIN_DATE,MAX_DATE,DAYS_PER_TURN} from './state.js';

/** Direct manipulation of the existing clock; owns no animation loop. */
export function bindMechanicalControls({readState,manualTurn,toggleAuto,signal}){
 const crank=document.querySelector('#manual-crank');
 const rotor=document.querySelector('#crank-rotor');
 const auto=document.querySelector('#auto-drive');
 const section=document.querySelector('#mechanical-console');
 const on=(node,event,fn)=>node.addEventListener(event,fn,{signal});
 let drag=null;
 const release=()=>{if(drag&&crank.hasPointerCapture(drag.id))crank.releasePointerCapture(drag.id);drag=null;crank.classList.remove('dragging');};
 const angle=e=>Math.atan2(e.clientY-drag.y,e.clientX-drag.x);
 on(crank,'pointerdown',e=>{
  if(e.button!==0||crank.getAttribute('aria-disabled')==='true')return;
  const r=crank.getBoundingClientRect();
  drag={id:e.pointerId,x:r.left+r.width/2,y:r.top+r.height/2,last:0};
  drag.last=angle(e);crank.setPointerCapture(e.pointerId);crank.focus({preventScroll:true});crank.classList.add('dragging');manualTurn(0);e.preventDefault();
 });
 on(crank,'pointermove',e=>{
  if(!drag||e.pointerId!==drag.id||Math.hypot(e.clientX-drag.x,e.clientY-drag.y)<12)return;
  const a=angle(e);let delta=a-drag.last;delta=Math.atan2(Math.sin(delta),Math.cos(delta));drag.last=a;
  manualTurn(delta/(2*Math.PI));
 });
 on(crank,'pointerup',release);on(crank,'pointercancel',release);on(crank,'lostpointercapture',()=>{drag=null;crank.classList.remove('dragging');});
 on(crank,'keydown',e=>{
  if(crank.getAttribute('aria-disabled')==='true')return;
  let turns;
  if(['ArrowRight','ArrowUp'].includes(e.key))turns=e.shiftKey?1:1/DAYS_PER_TURN;
  if(['ArrowLeft','ArrowDown'].includes(e.key))turns=e.shiftKey?-1:-1/DAYS_PER_TURN;
  if(e.key==='Home')turns=(MIN_DATE-readState().date.getTime())/(DAYS_PER_TURN*86400000);
  if(e.key==='End')turns=(MAX_DATE-readState().date.getTime())/(DAYS_PER_TURN*86400000);
  if(turns!==undefined){e.preventDefault();manualTurn(turns);}
 });
 on(document.querySelector('#crank-back'),'click',()=>manualTurn(-.25));
 on(document.querySelector('#crank-forward'),'click',()=>manualTurn(.25));
 on(auto,'click',toggleAuto);
 on(document,'visibilitychange',()=>{if(document.hidden)release();});
 signal.addEventListener('abort',release,{once:true});
 return {
  sync(){const s=readState();section.hidden=s.mode!=='mechanical';
   auto.setAttribute('aria-checked',String(s.playing));
   document.querySelector('#drive-state').textContent=s.playing?'Drive engaged':'Disengaged';
   const turns=(s.date.getTime()-Date.UTC(2000,0,1,12))/(DAYS_PER_TURN*86400000);
   rotor.setAttribute('transform',`rotate(${((turns%1)+1)%1*360} 60 60)`);
   crank.setAttribute('aria-valuemax',String((MAX_DATE-MIN_DATE)/86400000));
   crank.setAttribute('aria-valuenow',String((s.date.getTime()-MIN_DATE)/86400000));
   crank.setAttribute('aria-valuetext',s.date.toISOString().replace('T',' ').replace('.000Z',' UTC'));
  },
  fail(){release();auto.disabled=true;crank.setAttribute('aria-disabled','true');crank.tabIndex=-1;document.querySelector('#crank-back').disabled=true;document.querySelector('#crank-forward').disabled=true;}
 };
}
