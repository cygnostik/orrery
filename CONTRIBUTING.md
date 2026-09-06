# Contributing

Bug reports, focused fixes, accessibility improvements and carefully sourced scientific corrections are welcome.

1. Open an issue describing the problem or proposed change, with the browser, operating system and reproduction steps when relevant.
2. Keep changes scoped. Preserve the distinction between Mechanical's geared mean motion and Observatory's approximate astronomical model.
3. Add a failing regression test before changing behavior. Numerical changes need cited source data and explicit units; do not silently replace illustrative phases with claims of observed positions.
4. Run `npm run test:unit`, `npm run build`, `npm test`, and the applicable PWA or compatibility tests. Include what you actually tested; simulated mobile viewports are not physical-device tests.
5. Stage the intended files and run `npm run audit:public`. Do not include credentials, local evidence, private reference material, build output or downloaded research pages.
6. Submit a pull request explaining the change and verification. Include a screenshot for a visible change.

Original code contributions are accepted under the MIT License. Keep third-party attribution and license notices. ProDyn.ai and TrustEdge.gt names and marks are not a grant of endorsement or trademark rights.
