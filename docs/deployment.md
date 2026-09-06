# Static hosting and updates

The public application is https://orrery.prodyn.ai/. It requires only a static HTTPS host. Rendering and orbital calculations run in the visitor's browser; the server does not need Node.js, a database or a GPU.

## Build

```sh
npm ci
npm run test:unit
npm run build
npm test
npm run test:pwa
npm run test:compat
```

Serve **the contents of `dist/`**, including dotfiles, rather than the repository. A local preview uses `npm run preview`. Normal `file://` loading is not supported.

This release is configured for the root of a dedicated hostname. A subdirectory deployment requires auditing root-relative assets, manifest scope/start URL, canonical/social URLs and the service-worker scope; changing Vite's base alone is not enough.

## Publish safely

1. Keep the currently served release as a rollback copy outside the public document root.
2. Upload the already-tested build to a staging directory outside the document root. Never upload credentials, source, test output, dependency folders or research captures.
3. Verify its file inventory and sizes, then promote the release. If the host cannot swap document-root directories, upload assets before the HTML entrypoint and service worker, using per-file atomic replacement. Keep older bundled assets for already-open clients.
4. Read the live HTTPS page, manifest, social card, icons, license notices and service worker back from the host. Check MIME types, response status, browser errors and renderer readiness. Complete an online visit followed by a fresh offline reload.
5. Do not rebuild between verification and upload: each production build receives its own offline-cache release identifier.

The supplied `.htaccess` supports Apache-compatible hosts: directory listing is disabled, manifest MIME type is declared, source/private-file extensions are denied, common security headers are set, and HTML/manifest/service-worker/release-metadata responses require revalidation. Its HTTPS redirect recognizes TLS termination via `X-Forwarded-Proto` and leaves ACME challenge paths alone. Change the canonical hostname in that rule when deploying a fork, and ensure any reverse proxy controls the forwarded header. Nginx and other servers need equivalent configuration. Check actual response headers and both HTTP and HTTPS navigation rather than assuming the file is honored or the redirect cannot loop.

`sw.js` must be served as JavaScript, never as an HTML fallback. Do not permanently cache it or the HTML entrypoint at an upstream CDN. The browser's service worker manages its own versioned application cache and offers available updates without automatically interrupting an inspection.

## Roll back

Restore the saved known-good release, including its matching HTML, bundles, manifest and service worker. Verify live HTTPS responses and reload the app. Existing clients may retain their prior worker until an update is accepted or their tabs are closed; a server rollback does not instantly erase browser storage.

Deployment accounts, authentication and host-specific paths belong in private operational records, not in this repository. No deployment credential is required to build or run Orrery locally.
