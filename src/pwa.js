import './pwa.css';

// Independent of the instrument: never reads or mutates its inspection state.
export function initPwa() {
  const actions = document.querySelector('.footer-actions');
  if (!actions || document.querySelector('#pwa-status')) return;
  const makeButton = (id, label) => {
    const button = document.createElement('button');
    button.id = id;
    button.type = 'button';
    button.className = 'text-button hud';
    button.textContent = label;
    return button;
  };
  const install = makeButton('pwa-install', 'Install Orrery');
  install.hidden = true;
  let installPrompt;
  const standalone = () => matchMedia('(display-mode: standalone)').matches || navigator.standalone === true;
  window.addEventListener('beforeinstallprompt', event => {
    event.preventDefault();
    if (standalone() || typeof event.prompt !== 'function') return;
    installPrompt = event;
    install.hidden = false;
  });
  window.addEventListener('appinstalled', () => {installPrompt = null; install.hidden = true;});
  install.addEventListener('click', async () => {
    const prompt = installPrompt;
    installPrompt = null;
    install.hidden = true;
    if (!prompt) return;
    try {await prompt.prompt(); await prompt.userChoice;} catch { /* Browser owns dismissal and installation policy. */ }
  });
  const help = makeButton('pwa-help-open', 'Install & offline help');
  help.setAttribute('aria-controls', 'science-dialog');
  const helpSection = document.createElement('section');
  helpSection.id = 'pwa-help';
  helpSection.innerHTML = `<h3 id="pwa-help-title" tabindex="-1">Install & offline use</h3>
    <p>Install is optional. In a compatible browser, use Install Orrery when offered, or the browser’s install menu. Orrery never opens an install prompt automatically.</p>
    <p>On iPhone or iPad, open Orrery in Safari, choose Share → Add to Home Screen, and enable Open as Web App if offered. On supported macOS Safari versions, choose File → Add to Dock. These browsers do not offer this page’s install button.</p>
    <p>Installation and offline support are separate browser capabilities. If no install option is offered, you can continue using Orrery in a browser tab.</p>
    <p>Keep Orrery open and online until the footer says Available offline. This saves the instrument, fonts, textures and planet portraits locally. External science and attribution websites still need a connection. The first visit requires internet; private browsing, storage limits or clearing site data may prevent or remove offline access.</p>
    <p>If the offline copy is partly deleted or browser storage fails, reconnect and reload. Reconnecting or reloading alone may not repair a partly deleted copy. Check that your browser allows site storage and has free space.</p>
    <p>If it is still unavailable, a site-data reset may help. Clearing site data removes the offline copy and may require reinstalling the app. Do not clear site data while offline. While online, close all Orrery tabs and app windows, clear only this site’s data in browser settings, then reopen Orrery online and wait for Available offline.</p>
    <p>Updates download in the background. Update & reload applies a completed update only when you choose; reloading resets the current date, view and inspection. Other open tabs are not reloaded automatically.</p>`;
  document.querySelector('#science-copy')?.append(helpSection);
  help.addEventListener('click', () => {
    const dialog = document.querySelector('#science-dialog');
    if (!dialog) return;
    if (!dialog.hasAttribute('open')) {
      dialog.dispatchEvent(new CustomEvent('orrery:open-sources', {detail:{opener:help}}));
      if (!dialog.hasAttribute('open')) document.querySelector('#about-open')?.click();
    }
    helpSection.querySelector('h3').focus();
  });
  actions.append(install, help);
  const status = document.createElement('span');
  status.id = 'pwa-status';
  status.setAttribute('role', 'status');
  status.setAttribute('aria-live', 'polite');
  status.setAttribute('aria-atomic', 'true');
  const update = makeButton('pwa-update', 'Update & reload');
  update.hidden = true;
  const updateNote = document.createElement('span');
  updateNote.id = 'pwa-update-note';
  updateNote.className = 'sr-only';
  updateNote.textContent = 'Reloads Orrery and resets the current inspection. Other open tabs will not reload.';
  update.setAttribute('aria-describedby', updateNote.id);
  actions.append(update, updateNote, status);
  if (!import.meta.env.PROD || !window.isSecureContext || !navigator.serviceWorker) {
    status.dataset.state = 'unavailable';
    status.textContent = !import.meta.env.PROD ? 'Offline support is disabled in development' : !window.isSecureContext ? 'Offline support requires HTTPS' : 'Offline support is unavailable in this browser';
    return;
  }
  let ready = false, failed = false;
  let registration, reloadRequested = false, hadController = Boolean(navigator.serviceWorker.controller);
  update.addEventListener('click', () => {
    if (reloadRequested) return;
    reloadRequested = true;
    update.disabled = true;
    if (registration?.waiting) registration.waiting.postMessage({type:'ORRERY_APPLY_UPDATE'});
    else location.reload();
  });
  function render() {
    status.dataset.state = ready ? 'ready' : failed ? 'unavailable' : 'preparing';
    status.textContent = ready ? (navigator.onLine ? 'Available offline' : 'Offline · using saved Orrery') : failed ? 'Offline copy unavailable · see Install & offline help' : 'Preparing offline copy…';
    if (!update.hidden) status.textContent += ' · update available';
  }
  let cancelStatusCheck;
  function checkReady() {
    cancelStatusCheck?.();
    const worker = navigator.serviceWorker.controller;
    if (!worker) return;
    const channel = new MessageChannel();
    const finish = complete => {
      clearTimeout(timeout);
      channel.port1.close();
      cancelStatusCheck = null;
      if (worker !== navigator.serviceWorker.controller) return;
      ready = complete;
      failed = !ready;
      render();
    };
    const timeout = setTimeout(() => finish(false), 5000);
    cancelStatusCheck = () => {clearTimeout(timeout); channel.port1.close();};
    channel.port1.onmessage = event => finish(event.data?.type === 'ORRERY_STATUS' && event.data.complete === true);
    try {worker.postMessage({type:'ORRERY_STATUS'}, [channel.port2]);} catch {finish(false);}
  }
  render();
  window.addEventListener('online', () => {render(); checkReady(); registerWorker();});
  window.addEventListener('offline', () => {render(); checkReady();});
  window.addEventListener('pageshow', checkReady);
  document.addEventListener('visibilitychange', () => {if (!document.hidden) checkReady();});
  navigator.serviceWorker.addEventListener('controllerchange', () => {
    if (reloadRequested) {reloadRequested = false; location.reload(); return;}
    if (hadController) {update.hidden = false; render();}
    hadController = true;
    checkReady();
  });
  function registerWorker() {
    return navigator.serviceWorker.register('/sw.js', {scope:'/', updateViaCache:'none'}).then(result => {
    if (registration === result) {checkReady(); return;}
    registration = result;
    if (registration.waiting) {update.hidden = false; render();}
    const watch = () => {
      const worker = registration.installing;
      if (!worker) return;
      worker.addEventListener('statechange', () => {
        if (worker.state === 'redundant') {failed = true; render();}
        if (worker.state === 'installed' && navigator.serviceWorker.controller) {update.hidden = false; render();}
      });
    };
    registration.addEventListener('updatefound', watch);
    watch();
    checkReady();
  }).catch(() => {failed = true; render();});
  }
  registerWorker();
}

initPwa();
