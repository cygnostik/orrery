# Security and privacy

Orrery is a static, client-side application. It has no accounts, database, payment processing, application analytics, advertising, or telemetry. Fonts, images, JavaScript and offline assets are served from the same origin. A hosting provider may retain ordinary access and security logs.

The service worker saves public application files in this browser for offline use. Browser settings can clear these files at any time. External NASA/JPL and other reference links need a network connection. Opening them is a user action, not background telemetry.

## Reporting a vulnerability

Use the repository's private vulnerability reporting form under **Security → Report a vulnerability** at https://github.com/cygnostik/orrery/security/advisories/new. Do not put secrets or a working exploit against a live service in a public issue. Reports should describe the affected version, impact, and a minimal reproduction.

## Release checks

Run `npm run audit:public` against the staged source before publishing. The check reports file names and rule names without displaying matched secret values. It rejects private operations data, local paths, credentials, unapproved font files, raw research captures, and generated development artifacts. It is a preventive check, not a guarantee that every possible secret is detectable.

Deploy only the contents of `dist/`, never the source workspace. Keep credentials outside the repository, use HTTPS, and preserve the license notices. See [deployment](docs/deployment.md).
