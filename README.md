# @deepseek-ai/dsh-client-ui-version-check

English | [中文](README.zh.md)

Hover the top-left brand logo to float the installed dsh version plus the latest updatable version, and open a centered modal with the release notes for the installed version and newer. A dual-face plugin: the host half enriches `host.describe` with the real installed version and the latest published version; the client half renders a non-invasive hover popover and modal with **zero external CSS** (self-contained stylesheet using dsh theme tokens).

## Screenshots

![Version check modal](docs/version-check-modal.png)

The details modal shows the installed version and newer releases with their bilingual (Simplified-Chinese + English) summaries, themed to match the host UI.

## Features

- **Hover popover** on the top-left brand logo: `dsh version` + `latest version` + update status (update available / up to date / could not check).
- **Refresh button**: bypasses the 60s client cache and re-requests `/api/host.describe`.
- **Details modal**: fetches the GitHub releases API (CORS-open), filters to the installed version and newer (newest first), extracts each release's Simplified-Chinese **and English** summaries, and renders them in a centered, theme-aware modal. Closes via the close button, a backdrop click, or Escape.
- **Clickable links in summaries**: raw-HTML anchors, markdown links, and bare http(s) URLs inside a release summary render as links that open in a new browser tab (`rel="noopener noreferrer"`). Everything else renders as plain text — scripts, styles, images, and forms are dropped, so third-party release bodies can never inject markup or fetch anything into the host page.
- **Theme-native**: all colors come from dsh design tokens (`--dsw-alias-*`, `--dsw-static-amber-*`), so light/dark themes are followed automatically; font sizes inherit the host body and scale via `em`.

## Non-invasive by design

- **No core slot is registered** — the sidebar brand slots stay owned by the official brand plugin.
- The brand button is located via DOM observation (structure: `button[aria-label="新建会话"/"New session"]` whose first child is a span containing nested spans — the New Session button's first child is the SVG icon, so the two never collide).
- The popover and modal are `position: fixed` elements appended to `document.body`, escaping the sidebar column's overflow clipping.
- Version data comes from a raw POST to `/api/host.describe` (bypassing the core client-side schema, which would strip the plugin-added fields), with a 60s cache.

## Host half

Wraps `apiProxy.host.describe` at runtime, before the response is returned:

- `version`: the real installed version, read from `@deepseek-ai/dsh/package.json`.
- `latestVersion`: the latest published version from the npm registry (the user's configured registry first, then the official registry, with a mirror fallback), with a 10-minute TTL, a 2.5s timeout per candidate, and in-flight dedupe. Failures yield `null` and never break `host.describe`.

Core packages are never touched.

## Installation

The package carries both faces (`main` = host half, `exports["./client"]` = client half, `dsh.client.platform: "web"`). Install it into the web profile's node_modules and register it through the profile's plugin patch file (e.g. `cordis.patch.yml`):

```yaml
- insert:
    - id: ui-version-check
      name: '@deepseek-ai/dsh-client-ui-version-check'
```

A server restart is required when the plugin is first added (plugin-set changes enter the loader on restart); subsequent bundle-content updates only need a browser hard refresh (Ctrl+F5).

## Model Experience

None; the plugin only reads `host.describe` and the GitHub releases API in the browser. Nothing reaches a model request.

#### KV Cache effect

None; this package neither assembles nor sends a provider request.

## Known Limitations and Deferred Work

- **Latest-version lookup is host-side only** — the client renders whatever `host.describe` reports; the upstream `host.describe` version remains a `0.0.1` placeholder without this plugin.
- **Release notes come from GitHub** — offline or CORS-blocked environments show "Could not fetch release notes" with a Retry button.
- **Brand button detection is structural** — it targets the sidebar's brand button by `aria-label` + nested-span shape; a future layout change could require updating `isBrandButton`.
- **Deferred** — a full changelog rendering (markdown) instead of the plain-text summary extraction.
