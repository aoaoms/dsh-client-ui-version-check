# @deepseek-ai/dsh-client-ui-version-check

English | [中文](README.zh.md)

> **Upgrade notice: 0.1.0 no longer works on dsh >= 0.1.5 — update to 0.2.0.**
> dsh 0.1.5 removed the `apiProxy` service and the dotted `/api/host.describe` route this plugin depended on, so hovering the logo only showed `dsh version …` and "Could not check latest version". 0.2.0 serves its own `/api/dsh-version-check` route (the old route stays as a fallback) and fixes the "latest version" decision for rc/channel builds. See *Upgrade and fix notes* below.

Hover the top-left brand logo to float the installed dsh version plus the latest updatable version, and open a centered modal with the release notes for the installed version and newer. A dual-face plugin: the host half serves the real installed version and the newest published version over its own `/api/dsh-version-check` route; the client half renders a non-invasive hover popover and modal with **zero external CSS** (self-contained stylesheet using dsh theme tokens).

## Upgrade and fix notes (0.1.0 → 0.2.0)

### Symptom

After dsh was updated to **0.1.5 or newer**, the 0.1.0 plugin still opened its popover but both data rows were empty:

```
dsh version            …
latest version         Could not check latest version
```

The browser's network panel showed `POST /api/host.describe` returning **404** (console: `Failed to load resource: 404`). The Refresh/Details buttons and the details modal itself kept working — only the data path was broken.

### Root cause

1. **The old endpoint is gone**: the client always POSTed raw to `/api/host.describe`. dsh 0.1.5 moved the shared `/api` channel to `<namespace>/<method>` endpoints (`settings/describe`, and so on), which removed the dotted `host.describe` route → 404 → the client got no version data at all.
2. **The host half silently stopped firing**: it wrapped `apiProxy.host.describe` at runtime through `ctx.inject(["apiProxy"], …)` to add `version` / `latestVersion`. Core no longer provides the `apiProxy` service on 0.1.5, so the injection never ran and the plugin's fields were never written (on the older layout it was what bypassed the core client-side schema, which strips unknown fields).
3. **Secondary defect (version comparison)**: the old code only read npm's `latest` dist-tag and tested string equality for "update available". With channels published as `latest=0.1.5-rc.1`, `next=0.1.5-rc.2`, `alpha=0.1.6-alpha.1`, a machine installed from `next` at 0.1.5-rc.2 was shown "update available → 0.1.5-rc.1" — a downgrade, not an update.

### What 0.2.0 changes

- **Host half** (`lib/index.js`): registers the plugin's own exact Fetch route **`/api/dsh-version-check`** on the shared `/api` channel (`ctx.connection.fetch.register`; the registration is scoped to this plugin and is disposed on reload) and answers with the standard `client-request` / `server-response` envelope. The legacy `apiProxy` wrapper is kept as a compatibility branch for dsh <= 0.1.4.
- **Latest-version semantics**: reads the registry's **dist-tags**, takes the newest version across every tag, and reports the tag carrying it (falling back to `/latest`). Registry order: the user's configured registry, then the official one, then npmmirror; 10-minute TTL, 2.5s timeout per candidate, in-flight dedupe.
- **Client half** (`lib/client.js`): tries `/api/dsh-version-check` first, then `/api/host.describe`; the update status now uses a **semver comparison** instead of equality; the release channel is shown (`0.1.6-alpha.1 (alpha)`); an unreadable installed version renders "Could not read installed version" instead of a fake `0.0.1`.
- **Installed-version lookup**: module resolution first (`@deepseek-ai/dsh/package.json`), then the running CLI entry (`…/@deepseek-ai/dsh/lib/bin.js` and its parents); `null` when neither candidate identifies the harness package.

### How to upgrade

1. Obtain the 0.2.0 files: an upstream release, your workspace source copy, or point the profile dependency at the source with `link:`.
2. Replace the plugin directory in the profile (for example `$DSH_HOME/profiles/node_modules/@deepseek-ai/dsh-client-ui-version-check`), or run `dsh plugin --profile web add link:<local path>` to switch to a linked dependency.
3. **Restart `dsh web`** (see *Activation boundary* below — the host half requires it).
4. Verify: the settings **plugin inventory** shows `…dsh-client-ui-version-check 0.2.0`; hovering the logo shows both versions; the network panel shows `POST /api/dsh-version-check → 200`.

### Activation boundary: which half needs a restart

| Change | Who loads it | How it takes effect |
| --- | --- | --- |
| `lib/client.js` (client half) | dsh-client-modules snapshots it and serves it to the browser | **No restart**: `dsh-client-hmr` polls every registered bundle's mtime/size every 500ms, and on a change calls `clientModules.rebuilt(id)` to re-snapshot it under a new `rev`, which the browser half hot-swaps over the `/plugins/events` SSE channel (measured: combo `rev` went from `04e32111eefc` to `3e1dfa843950`). Without that plugin the bundle content is a boot-time snapshot and a restart is required |
| `lib/index.js` (host half) | the dsh web process, imported at boot | **Restart `dsh web`**: the profile's `hmr` row is `disabled: true` by default, and `patchReload: live` reloads configuration only, never code |

This plugin is dual-face, so **follow the host half's rule: restart once after upgrading.** Replacing files without restarting (or restarting without replacing them) leaves the popover at "Could not check latest version".

## Screenshots

![Version check modal](docs/version-check-modal.png)

The details modal shows the installed version and newer releases with their bilingual (Simplified-Chinese + English) summaries, themed to match the host UI.

## Features

- **Hover popover** on the top-left brand logo: `dsh version` + `latest version` + update status (update available / up to date / could not check).
- **Refresh button**: bypasses the 60s client cache and re-requests `/api/dsh-version-check`.
- **Details modal**: fetches the GitHub releases API (CORS-open), filters to the installed version and newer (newest first), extracts each release's Simplified-Chinese **and English** summaries, and renders them in a centered, theme-aware modal. Closes via the close button, a backdrop click, or Escape.
- **Clickable links in summaries**: raw-HTML anchors, markdown links, and bare http(s) URLs inside a release summary render as links that open in a new browser tab (`rel="noopener noreferrer"`). Everything else renders as plain text — scripts, styles, images, and forms are dropped, so third-party release bodies can never inject markup or fetch anything into the host page.
- **Theme-native**: all colors come from dsh design tokens (`--dsw-alias-*`, `--dsw-static-amber-*`), so light/dark themes are followed automatically; font sizes inherit the host body and scale via `em`.

## Non-invasive by design

- **No core slot is registered** — the sidebar brand slots stay owned by the official brand plugin.
- The brand button is located via DOM observation (structure: `button[aria-label="新建会话"/"New session"]` whose first child is a span containing nested spans — the New Session button's first child is the SVG icon, so the two never collide).
- The popover and modal are `position: fixed` elements appended to `document.body`, escaping the sidebar column's overflow clipping.
- Version data comes from a raw POST to the plugin's own `/api/dsh-version-check` route (the legacy dotted `/api/host.describe` of dsh <= 0.1.4 is tried as a fallback), bypassing the core client-side schema, which would strip the plugin-added fields, with a 60s cache.

## Host half

Answers the version query over two transports, the modern one first:

- **dsh >= 0.1.5** — the plugin owns the exact `/api/dsh-version-check` Fetch route on the shared Connection `/api` channel (`ctx.connection.fetch.register`). Core dropped both the `apiProxy` service and the dotted `host.describe` route when that channel moved to `<namespace>/<method>` Typert endpoints, which is why 0.1.5 silently broke the previous mechanism.
- **dsh <= 0.1.4** — wraps `apiProxy.host.describe` at runtime and merges the same fields into its response.

The payload both transports report:

- `version`: the real installed version, read from `@deepseek-ai/dsh/package.json` (module resolution first, then the running CLI entry), or `null` when neither candidate identifies the harness package.
- `latestVersion` + `latestTag`: the newest published version across every npm dist-tag, plus the tag carrying it. Queried from the user's configured registry first, then the official registry, with a mirror fallback; 10-minute TTL, a 2.5s timeout per candidate, and in-flight dedupe. The `latest` dist-tag alone is not enough — an install taken from `next`/`alpha` can be newer than `latest` — so the popover compares versions instead of testing equality.
- Failures yield `null` and never break the response.

Core packages are never touched.

## Installation

The package carries both faces (`main` = host half, `exports["./client"]` = client half, `dsh.client.platform: "web"`). Install it into the web profile's node_modules and register it through the profile's plugin patch file (e.g. `cordis.patch.yml`):

```yaml
- insert:
    - id: ui-version-check
      name: '@deepseek-ai/dsh-client-ui-version-check'
```

Adding the plugin for the first time requires a server restart (plugin-set changes enter the loader on restart). For later content updates: **host-half changes need a restart**, while client-half changes are hot-swapped by `dsh-client-hmr` (or picked up by a browser Ctrl+F5, which fetches the new `rev`) — see *Activation boundary* above.

## Model Experience

None; the plugin only serves a version endpoint and reads the GitHub releases API in the browser. Nothing reaches a model request.

#### KV Cache effect

None; this package neither assembles nor sends a provider request.

## Known Limitations and Deferred Work

- **Latest-version lookup is host-side only** — the client renders whatever the host endpoint reports; on dsh >= 0.1.5 that endpoint exists only while this plugin is loaded (the upstream `host.describe` placeholder of dsh <= 0.1.4 is gone).
- **Release notes come from GitHub** — offline or CORS-blocked environments show "Could not fetch release notes" with a Retry button.
- **Brand button detection is structural** — it targets the sidebar's brand button by `aria-label` + nested-span shape; a future layout change could require updating `isBrandButton`.
- **An installed copy is not immutable** — the client bundle is hot-swapped purely on file mtime/size changes, so any process able to rewrite that file makes the browser load new code within roughly a second.
- **Deferred** — a full changelog rendering (markdown) instead of the plain-text summary extraction.
