/** M15 Signal acquisition, adapted from ProDyn DSM 2.2 motion.js.
 * Local data commits before the finite presentation; no loading claim or RAF.
 */
export function bindSelectionMotion({signal}){
 const path=document.querySelector('#selection-signal');
 const preference=matchMedia('(prefers-reduced-motion: reduce)');
 let animation,generation=0;
 const visible=()=>{const r=path.getBoundingClientRect();return !document.hidden&&r.bottom>0&&r.top<innerHeight&&r.right>0&&r.left<innerWidth;};
 const settle=()=>{generation++;animation?.cancel();animation=undefined;path.setAttribute('stroke-dashoffset','0');path.dataset.motionState='settled';};
 const acquire=()=>{
  settle();if(signal.aborted||preference.matches||!path.animate||!visible())return;
  const styles=getComputedStyle(document.documentElement),time=styles.getPropertyValue('--t-slow').trim();
  const duration=parseFloat(time)*(time.endsWith('ms')?1:1000),current=generation;
  try{animation=path.animate([{strokeDashoffset:'1'},{strokeDashoffset:'0'}],{duration,easing:styles.getPropertyValue('--ease-enter').trim()});}
  catch{settle();return;}
  path.dataset.motionState='running';
  animation.finished.then(()=>{if(current===generation)settle();},error=>{if(error.name!=='AbortError')console.error(error);});
 };
 preference.addEventListener('change',()=>{if(preference.matches)settle();},{signal});
 document.addEventListener('visibilitychange',()=>{if(document.hidden)settle();},{signal});
 window.addEventListener('pagehide',settle,{signal});
 window.addEventListener('resize',settle,{signal});
 const observer=typeof IntersectionObserver==='function'?new IntersectionObserver(entries=>{if(!entries[0].isIntersecting)settle();}):null;
 observer?.observe(path);
 signal.addEventListener('abort',()=>{settle();observer?.disconnect();},{once:true});
 settle();return {acquire,settle};
}
