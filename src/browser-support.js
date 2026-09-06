/** Keep reference content available when showModal is absent (e.g. older Safari). */
export function bindScienceDialog({dialog,openButton,closeButton,signal}){
 const native=typeof dialog.showModal==='function'&&typeof dialog.close==='function';
 const doc=dialog.ownerDocument;
 let opener=openButton;
 const restoreFocus=()=>{(opener?.isConnected?opener:openButton).focus({preventScroll:true});};
 if(!native){dialog.classList.add('dialog-fallback');dialog.setAttribute('role','dialog');dialog.setAttribute('aria-modal','false');}
 function close(){
  if(native)dialog.close();else{dialog.removeAttribute('open');restoreFocus();}
 }
 function open(trigger=openButton){
  opener=typeof trigger?.focus==='function'?trigger:openButton;
  if(dialog.hasAttribute('open'))return;
  if(native)dialog.showModal();else{dialog.setAttribute('open','');closeButton.focus();}
 }
 openButton.addEventListener('click',()=>open(),{signal});
 // Optional callers (such as install help) share the fallback and retain their own return focus.
 dialog.addEventListener('orrery:open-sources',event=>open(event.detail?.opener),{signal});
 // WebKit does not focus buttons on pointer clicks, so restore the opener explicitly.
 dialog.addEventListener('close',restoreFocus,{signal});
 closeButton.addEventListener('click',close,{signal});
 dialog.addEventListener('click',event=>{
  if(event.target!==dialog)return;
  const r=dialog.getBoundingClientRect();
  if(event.clientX<r.left||event.clientX>r.right||event.clientY<r.top||event.clientY>r.bottom)close();
 },{signal});
 if(!native)doc.addEventListener('keydown',event=>{
  if(event.key==='Escape'&&dialog.hasAttribute('open')){event.preventDefault();event.stopImmediatePropagation();close();}
 },{signal,capture:true});
}

/** Feature detection only: browser branding does not predict API availability. */
export function bindFullscreen({button,document:doc=document,onChange=()=>{},announce=()=>{},signal}){
 const root=doc.documentElement;
 const standard=typeof root.requestFullscreen==='function';
 const request=standard?root.requestFullscreen:root.webkitRequestFullscreen;
 const exit=standard?doc.exitFullscreen:doc.webkitExitFullscreen;
 const enabled=standard?doc.fullscreenEnabled:doc.webkitFullscreenEnabled;
 const available=typeof request==='function'&&typeof exit==='function'&&enabled!==false;
 const active=()=>Boolean(doc.fullscreenElement||doc.webkitFullscreenElement);
 function sync(){
  const pressed=active();
  button.disabled=!available;
  button.textContent=pressed?'Exit fullscreen ↙':available?'Fullscreen ↗':'Browser fullscreen only';
  button.setAttribute('aria-pressed',String(pressed));
  button.title=available?'Toggle fullscreen':'Fullscreen is not available here. Use your browser’s fullscreen command if supported.';
 }
 async function toggle(){
  try{
   if(!available){announce('Fullscreen is not available in this browser.');return;}
   // Older Safari methods return void; modern implementations return a Promise.
   if(active())await exit.call(doc);else await request.call(root);
  }catch{announce('Fullscreen was not available. You can use your browser’s fullscreen command.');}
  sync();
 }
 const changed=()=>{sync();onChange();};
 button.addEventListener('click',toggle,{signal});
 for(const event of ['fullscreenchange','webkitfullscreenchange'])doc.addEventListener(event,changed,{signal});
 for(const event of ['fullscreenerror','webkitfullscreenerror'])doc.addEventListener(event,()=>announce('Fullscreen was not available. You can use your browser’s fullscreen command.'),{signal});
 sync();
}
