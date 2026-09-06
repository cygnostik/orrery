/** Exact M1 visuals, locally gated by clock, viewport and preference. */
export function bindFooterMotion({signal}){
 const footer=document.querySelector('.footer'),preference=matchMedia('(prefers-reduced-motion: reduce)');
 let playing=false,inView=false;
 const sync=()=>{footer.dataset.atmosphere=playing&&inView&&!document.hidden&&!preference.matches&&!signal.aborted?'running':'paused';};
 const observer=typeof IntersectionObserver==='function'?new IntersectionObserver(entries=>{inView=entries[0].isIntersecting;sync();}):null;
 observer?.observe(footer);
 document.addEventListener('visibilitychange',sync,{signal});
 preference.addEventListener('change',sync,{signal});
 window.addEventListener('pagehide',()=>{inView=false;sync();},{signal});
 window.addEventListener('pageshow',()=>{const r=footer.getBoundingClientRect();inView=r.bottom>0&&r.top<innerHeight;sync();},{signal});
 signal.addEventListener('abort',()=>{observer?.disconnect();sync();},{once:true});
 sync();return {setPlaying(value){playing=Boolean(value);sync();}};
}
