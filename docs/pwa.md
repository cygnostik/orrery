# Install, offline use and updates

Orrery is a static educational web app at **https://orrery.prodyn.ai/**. Installation is optional. Its offline copy includes the instrument, JavaScript, CSS, local fonts, textures, planet portraits, icons, screenshots and local attribution files. External reference websites still require a connection.

## Using Orrery offline

1. Open Orrery online and keep the page open until the footer says **Available offline**. Opening the page once is not enough: every precache request must finish successfully.
2. You can then close the tab and reopen Orrery without a connection. The saved instrument works without having previously selected every planet.
3. **Offline · using saved Orrery** indicates a confirmed local copy while the browser reports no connection. The browser’s connectivity signal is advisory, not an internet reachability test.

Private browsing, denied storage, insufficient quota, browser eviction or clearing site data can prevent or remove offline access. Readiness is checked with the controlling worker when the page opens, returns to the foreground or changes connectivity. A complete-install marker **and every expected cache entry** must be present. A missing or unresponsive worker never supplies proof of readiness.

If the first download fails, reconnecting retries registration without reloading the instrument. If a previously installed copy is partly removed, the footer stops claiming it is available offline and points to **Install & offline help**. Reconnect and reload, but this alone may not repair a partly deleted copy: the current worker’s network fallback does not recache missing entries. Check that the browser allows site storage and has free space.

If the copy is still unavailable, a site-data reset may help. **Clearing site data removes the offline copy and may require reinstalling the app. Do not clear site data while offline.** While online, close all Orrery tabs and app windows, clear only this site’s data in browser settings, then reopen Orrery online and wait for **Available offline**. Offline storage is not a backup or a permanent-storage guarantee.

## Installing

- **Compatible Chromium browsers:** use **Install Orrery** if the browser makes an install prompt available, or use its own install menu. Orrery shows its button only after `beforeinstallprompt`; it calls the prompt only after a click. Dismissing it does not trigger repeated prompts.
- **iPhone/iPad Safari:** choose **Share → Add to Home Screen**, enabling **Open as Web App** if offered.
- **Supported macOS Safari versions:** choose **File → Add to Dock**.

Safari does not expose this page’s Chromium install prompt. Installation menus, standalone behavior and storage policies differ across browsers and operating systems. **Install & offline help** remains available when the worker cannot be registered. Native OS installation and physical Apple-device behavior require a device check; the automated PWA tests do not certify those surfaces.

## Updates

Each build gets an explicit semantic version and a newly generated timestamp/UUID release ID, even when the semantic version is unchanged. The generated `/sw.js` consequently changes on every build. Release identity does not depend on content digests.

The current version continues running while an update downloads. A completed update waits and exposes **Update & reload**. No worker forces an automatic reload. Clicking the button activates the waiting worker and reloads that tab once; the current date, view and inspection reset. Other open tabs keep running and receive their own reload offer. A new worker may also activate normally after all old tabs close.

An unsuccessful update deletes only its own incomplete cache and leaves the active release intact. Activation removes obsolete caches whose names start with `orrery-pwa-v1-`; caches belonging to other applications are untouched. Do not reuse a manually supplied release ID for a different build.

## Build and integration

```sh
npm run build
# Equivalent:
# vite build && node scripts/build-pwa.mjs
```

Run the PWA builder **after** all distribution files have been finalized. It writes `dist/sw.js` and `dist/pwa-release.json`. To target an isolated output directory:

```sh
node scripts/build-pwa.mjs /absolute/path/to/output
```

Programmatic interface:

```js
import {buildPwa} from './scripts/build-pwa.mjs';
const release = await buildPwa({
  outDir: 'dist',
  version: '0.5.0-beta.1',
  // Omit releaseId in production: a unique ID is generated automatically.
});
// release: {version, releaseId, cacheName, assets, sizes}
```

The entry module must import `./pwa.js`; it imports `pwa.css` itself and initializes once. It needs `.footer-actions` and the existing `#science-copy` / `#science-dialog` help surface. Its help action dispatches `orrery:open-sources` with `{opener: helpButton}`, falling back to the existing `#about-open` action. Keep native/fallback dialog behavior in the common browser-support controller. Do not duplicate its full install/help section in static HTML.

The document head needs:

```html
<link rel="manifest" href="/manifest.webmanifest">
<link rel="apple-touch-icon" href="/icons/apple-touch-icon.png">
<meta name="theme-color" content="#050A0F">
```

DOM interfaces are `#pwa-install`, `#pwa-help-open`, `#pwa-help`, `#pwa-update`, `#pwa-update-note` and `#pwa-status`. The status has `role="status"`, a polite live region and `data-state="preparing|ready|unavailable"`. No instrument state or `window.__orrery` diagnostics are changed.

Worker messages:

- `{type: 'ORRERY_STATUS'}` with a transferred `MessagePort` → `{type: 'ORRERY_STATUS', complete, cacheName}` on that port.
- `{type: 'ORRERY_APPLY_UPDATE'}` sent to `registration.waiting` → request activation. Only a user click sends this message.

Vite development never registers a production worker. HTTPS is required outside the browser’s trusted loopback exception. Use different development and production-preview origins/ports so an old production worker cannot control development pages.

## Hosting contract

Deploy the **whole completed distribution atomically**. Do not publish `sw.js` ahead of its assets, alter files after generation, or transform responses through an HTML fallback. Keep the previous release available during rollout where the hosting platform supports it.

- Serve `/sw.js` with a JavaScript MIME type and `Cache-Control: no-cache, must-revalidate`; allow worker scope `/`.
- Revalidate `index.html`, `manifest.webmanifest` and `pwa-release.json`. Avoid immutable caching on stable public asset paths.
- CSP must permit same-origin scripts, styles, fonts, images, connections, workers and manifests. The worker makes no third-party requests.
- Missing assets must return a real error, not a success response containing the application shell.

The builder sorts the local asset inventory, excludes generated worker/metadata files, dotfiles such as `.htaccess`, private directories, source maps and non-web server configuration files. Missing HTML or manifest icons/screenshots fail the build. The worker fetches in bounded batches, rejects redirects, non-success responses, unexpected HTML and wrong byte lengths, then writes its completion marker last. These checks detect incomplete transfers and common hosting mistakes; they cannot identify same-length altered content. Atomic deployment is still required.

Only same-origin `GET` requests for precached paths are intercepted. `/` and `/index.html` support cold offline navigation, including root query strings and fragments. This is not a general SPA fallback for arbitrary routes. Third-party requests, non-GET requests and unlisted runtime URLs are not cached. Cache access failures fall back to the network when possible.

## Verification

```sh
node --test tests/pwa.test.js
npm run test:pwa
# Equivalent: node --test tests/pwa.browser.js
```

The browser tests build the real app into a temporary directory, serve it on an OS-selected loopback port, launch an isolated Chromium profile, and remove their artifacts afterward. They do not use the normal `dist/`, preview server or Playwright configuration. Set `ORRERY_BROWSER` to an installed Chromium executable when needed; otherwise the harness tries installed Edge/Chrome and then Playwright’s browser.

Coverage includes cold offline navigation and direct byte comparisons for all local files; delayed, failed and invalid precaches; waiting-update consent and a single reload; multi-tab preservation; cache-namespace cleanup; denied storage, real quota exhaustion and partial eviction; install-event gating; insecure/unsupported contexts; Vite development; request boundaries; and responsive keyboard targets. Synthetic install events test UI policy, not the operating system’s install dialog. API-denial probes are explicitly injected; the generated service worker and its network/cache lifecycle run in the real browser.
