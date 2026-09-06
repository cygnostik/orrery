# Browser support

## Scope and requirements

Orrery is a modern-browser WebGL 2 application. The checked release uses Three.js 0.185.1, Vite 8.2.2 and Playwright 1.63.0. Prefer current Chromium-based browsers (including Edge) or Safari. JavaScript modules, top-level await and an available WebGL 2 context are required for the interactive instrument.

The production build targets `chrome89`, `edge89` and `safari15`. These are compilation targets, **not a claim that those old releases or every device have been tested**. GPU drivers, browser policy, embedded webviews and available memory can still prevent 3D initialization. There is no WebGL 1, Internet Explorer or legacy-browser renderer.

## Verified compatibility run

The focused production-preview run on macOS passed **24 tests: 12 in each engine, with no skips or retries**:

| Engine actually launched | Version reported by automation | Graphics result |
| --- | --- | --- |
| Microsoft Edge / Chromium | 152.0.4191.62 | Actual WebGL 2 context; renderer ready; visible mechanical model |
| Playwright WebKit, Safari engine | 26.6 | Actual WebGL 2 context; renderer ready; visible mechanical model |

Both normal boots reported 996 draw calls, 1,472,728 triangles and no texture fallbacks. These are diagnostic counts for the initial scene, **not frame-rate or physical-device performance measurements**. A visible static fallback was never counted as a renderer pass.

Each engine exercised **320×740, 390×844, 640×1000, 700×1000, 768×1024, 1440×1000 and 844×390 CSS-pixel viewports**. The layout test used touch capability and device scale factor 3; the drawing buffer remained capped at DPR 1.75. It checked page overflow, property-value bounds, projected-label bounds, canvas sizing, tapped planet selection, and source-dialog bounds/focus. Desktop functional tests used ordinary mouse/keyboard contexts. Screenshots at 320, 1440 and landscape widths were retained; narrow and desktop WebKit images show the actual instrument.

Landscape deliberately remains vertically scrollable rather than squeezing the instrument into the short screen. Horizontal planet navigation is independently scrollable on phones.

## Compatibility behavior

- **Fullscreen:** standard API first, prefixed WebKit API when needed; both change/error event names are handled. Promise-returning and older void-returning methods work. The button follows actual fullscreen state and exposes `aria-pressed`. Missing APIs or disabled fullscreen policy show a disabled “Browser fullscreen only” control with an explanation. Request rejection leaves the app usable and announces the failure.
- **Sources:** native modal dialog where supported. Without the dialog methods, the same source content opens as a scrollable, non-modal reference panel with Close and Escape. The opener regains keyboard focus, including WebKit pointer-click behavior. Install/offline help shares this path through the `orrery:open-sources` event and restores focus to its own invoking button. The fallback is intentionally not represented as a native modal/focus trap.
- **Touch:** the existing gesture hint says “PINCH TO ZOOM” on coarse-pointer devices. It wraps without covering camera buttons. Canvas and stage descriptions also explain pinch zoom and two-finger pan. Planet buttons, camera buttons and DOM crank controls remain alternatives to precise 3D picking.
- **Viewport and density:** existing container ResizeObservers update canvas size and projection. Window resize also refreshes DPR when browser zoom/display changes do not resize the container in CSS pixels. Long narrow-screen property values can wrap their units rather than forcing horizontal page overflow.
- **Safe areas:** `browser-support.css` applies `env(safe-area-inset-*)` to the page shell, skip link and source dialog. Dialog height uses `vh` with an `svh` enhancement. The tests inject nonzero gutter values through the same CSS custom properties; this verifies layout consumption, not physical notch or installed-app behavior.
- **Runtime API floor:** application calls to ES2022 `Object.hasOwn` and `Array.prototype.at` were replaced with equivalent own-property checks and last-item indexing. A browser-init test removes both APIs, then verifies real renderer boot, selection, Observatory mode and date changes. No global runtime polyfills were added; this is a targeted API regression test, not an old-browser certification.
- **GPU failure:** unavailable WebGL 2 leaves planet facts and sources usable and disables both connected and cached renderer-dependent controls. A failed texture retains its declared procedural replacement. Actual `WEBGL_lose_context` testing stopped simulation, displayed the reload guidance and kept references usable. Context loss is not silently advertised as automatic recovery.
- **Lifecycle and accessibility:** keyboard selection, leap-day input, blank/out-of-range date rejection, keyboard hand winding, nullable deselection without camera movement, native dialog focus return, reduced-motion changes and disposal were exercised. Paused frames and dates remain stopped after settling. Persisted `pagehide`/`pageshow` handlers were exercised using synthetic lifecycle events; real browser BFCache admission was not asserted.

The compatibility edits do not alter the approved camera motion, mechanical drive ratios, material model or scene geometry.

## Reproduce

```sh
# Existing local Edge/Chrome can supply the Chromium executable.
# Install the bundled engines if needed; no application dependencies change.
npx playwright install chromium webkit
npx playwright test --config=playwright.compat.config.js
```

The config builds into `evidence/compatibility/dist`, serves only loopback on **5274**, refuses an occupied port, uses one worker, and runs only `compatibility*.spec.js`. It does not overwrite the ordinary `dist` build or run the full project suite. Set `ORRERY_COMPAT_PORT` for another free port, or `ORRERY_BROWSER` to an existing Chromium executable path.

Reports, traces, screenshots and the aggregated run evidence live under the ignored `evidence/compatibility/` directory. `results.json` is the authoritative machine-readable test report; renderer and layout measurements are test attachments.

## Verification boundaries

- Playwright WebKit is Safari-engine evidence, **not testing of the installed Safari app or an iPhone/iPad**.
- Touch capability, viewport sizes, DPR-only changes, fullscreen API denial/prefix variants and safe-area gutters include controlled emulation. They do not certify real multi-touch gestures, native fullscreen transitions, mobile browser chrome, virtual keyboards, device rotation or physical notches.
- Old compilation-target releases, sustained mobile GPU performance, real BFCache eligibility and assistive-technology combinations were not tested.
- This compatibility configuration blocks service workers to isolate renderer and DOM behavior. PWA installation, offline caching, updates and installed-app safe areas require their separate verification; they are not implied by this run.
