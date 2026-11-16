# Lumi browser and hosting integration

These changes are based on the updated per-world minigames and game-manager panel.
The previous password-hunt service is not included in this branch.

## Access on our test server

- HTTP: http://www.verdano.com.br:18080/lumi/
- Temporary HTTPS: https://www.verdano.com.br:18443/lumi/ (untrusted certificate).
- Local: http://127.0.0.1/lumi/

All game assets use relative URLs, preserving the browser's origin and port.
The machine-specific Caddy configuration remains in the local deployment checkout;
this PR contains only portable Lumi changes. A host serving this game must serve
its static assets and route /lumi to /lumi/ so relative URLs resolve correctly.

## Camera and colors

Camera permission is checked when the player opens the scanner. Browsers that
cannot query camera permission still use the normal camera request. Denied
permission explains site and operating-system settings and offers a retry.
HTTP without a secure context explains that permissions cannot fix the connection;
manual entry remains available. Trusted HTTPS is required for public camera access.
The temporary certificate is not a substitute for trusted HTTPS.

The authored palette opts out of automatic browser darkening. The manual-code
example is A1B2, not one of the four valid station codes.

## Offline cache

The service worker caches only known game files, bypasses APIs and other apps,
and deletes only its own older caches. HTML is network-first with offline fallback.
Player progress is preserved. Optional licensed fonts are not bundled.

## Backend

The upstream Supabase settings remain unconfigured. This PR does not create a
shared database or claim to enable global ranking, feedback or collective counters.

## Validation

Run from the repository root, using Node.js:

```sh
node --test lumi/test/*.test.cjs
```

Tests cover script parsing, required PWA assets, cache isolation, API exclusion,
and permission/error guidance. Safari/Firefox real-device testing remains pending.
