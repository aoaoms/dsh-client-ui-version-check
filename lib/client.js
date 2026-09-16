window.__ModuleLoader__.load({
	id: "@deepseek-ai/dsh-client-ui-version-check",
	factory: (require) => {
		var module = { exports: {} };
		var exports = module.exports;
		Object.defineProperty(exports, Symbol.toStringTag, { value: "Module" });
		//#region lib/types/client/index.js
		/**
		* Hover the top-left brand logo to float the installed dsh version plus
		* the latest updatable version. Non-invasive by design:
		* - NO core slot is registered (the sidebar brand slots stay owned by
		*   dsh-client-ui-brand-official);
		* - the rendered brand button is located via DOM observation (structure:
		*   button[aria-label="新建会话"/"New session"] whose first child is a span
		*   containing nested spans — the New Session button's first child is the
		*   SVG icon, so the two never collide);
		* - the popover is a `position: fixed` element appended to document.body,
		*   so it escapes the sidebar column's overflow clipping; it is interactive
		*   (hovering it keeps it open) and carries a Refresh and a Details button;
		* - version data comes from a raw POST to the plugin's own
		*   /api/dsh-version-check route (falling back to the legacy dotted
		*   /api/host.describe of dsh <= 0.1.4), bypassing the core client-side
		*   schema, with a 60s cache that Refresh bypasses;
		* - details come from the GitHub releases API (CORS-open) filtered to the
		*   installed version and newer, shown in a centered modal that closes via
		*   the button, a backdrop click, or Escape.
		*/
		const inject = [];

		/** Brand button aria-label values (zh/en from the sidebar dictionary). */
		const BRAND_LABELS = new Set(["新建会话", "New session"]);

		/** Distinguish the brand (logo) button from the New Session button. */
		function isBrandButton(button) {
			if (button === null || button.tagName !== "BUTTON") return false;
			const label = button.getAttribute("aria-label");
			if (label === null || !BRAND_LABELS.has(label)) return false;
			const first = button.firstElementChild;
			if (first === null || first.tagName !== "SPAN") return false;
			// brand identity: <span><span>mark</span><span>name</span></span>
			return first.querySelector("span") !== null;
		}

		const zh = {
			title: "DeepSeek Harness",
			version: "dsh 版本",
			latest: "可更新版本",
			update: "有新版本可更新",
			upToDate: "已是最新",
			unknown: "获取最新版本失败",
			unknownVersion: "无法读取已装版本",
			loading: "…",
			refresh: "刷新",
			details: "详情",
			detailsTitle: "版本更新记录",
			detailsSubtitle: "当前版本及后续版本",
			enSummary: "英文摘要",
			released: "发布于",
			prerelease: "预发布",
			noDetails: "无法获取更新摘要",
			retry: "重试",
			close: "关闭",
			empty: "暂无更新记录",
			loadingDetails: "正在获取更新摘要…"
		};
		const en = {
			title: "DeepSeek Harness",
			version: "dsh version",
			latest: "Latest version",
			update: "Update available",
			upToDate: "Up to date",
			unknown: "Could not check latest version",
			unknownVersion: "Could not read installed version",
			loading: "…",
			refresh: "Refresh",
			details: "Details",
			detailsTitle: "Version history",
			detailsSubtitle: "Installed and newer",
			enSummary: "English summary",
			released: "Released",
			prerelease: "Pre-release",
			noDetails: "Could not fetch release notes",
			retry: "Retry",
			close: "Close",
			empty: "No release notes yet",
			loadingDetails: "Fetching release notes…"
		};

		let texts = en;
		try {
			if (typeof navigator !== "undefined" && /^zh/i.test(navigator.language ?? "")) texts = zh;
		} catch {}

		const POPOVER_STYLE = {
			position: "fixed",
			zIndex: 10000,
			minWidth: "220px",
			maxWidth: "min(340px, calc(100vw - 24px))",
			boxSizing: "border-box",
			padding: "10px 12px",
			borderRadius: "10px",
			border: "1px solid var(--dsw-alias-border-l2, rgba(128,128,128,.35))",
			background: "var(--dsw-alias-bg-layer-2, rgba(30,30,32,.97))",
			boxShadow: "0 8px 24px rgba(0,0,0,.25)",
			color: "var(--dsw-alias-label-primary)",
			fontSize: "12px",
			lineHeight: "18px",
			flexDirection: "column",
			gap: "4px",
			display: "flex"
		};
		const ROW_STYLE = { whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" };
		const STATUS_UPDATE_STYLE = { color: "var(--dsw-alias-state-error-primary, #e5534b)", fontWeight: 600 };
		const STATUS_OK_STYLE = { color: "var(--dsw-alias-state-success-primary, #3fb950)", fontWeight: 600 };
		const STATUS_MUTED_STYLE = { color: "var(--dsw-alias-label-tertiary)" };
		const ACTION_ROW_STYLE = { flexDirection: "row", gap: "8px", justifyContent: "flex-end", marginTop: "2px", display: "flex" };
		const ACTION_BUTTON_STYLE = {
			font: "inherit",
			cursor: "pointer",
			background: "var(--dsw-alias-bg-layer-1, transparent)",
			color: "var(--dsw-alias-label-secondary)",
			border: "1px solid var(--dsw-alias-border-l2, rgba(128,128,128,.35))",
			borderRadius: "6px",
			padding: "3px 10px",
			fontSize: "12px",
			lineHeight: "18px"
		};
		const ACTION_BUTTON_HOVER_STYLE = {
			borderColor: "var(--dsw-alias-state-business-primary)",
			color: "var(--dsw-alias-state-business-primary)"
		};

		/** 60s cache of the version payload; null means "not fetched yet". */
		let cache = { at: 0, value: null };
		const CACHE_TTL_MS = 60 * 1000;

		/**
		* Version endpoints in preference order: this plugin's own route, which
		* dsh >= 0.1.5 dispatches through the shared /api Fetch-route registry,
		* then the dotted host.describe route that dsh <= 0.1.4 exposed through
		* `apiProxy`. Each candidate is a raw POST that bypasses the core
		* client-side schema (which would strip the plugin-added fields).
		*/
		const VERSION_ENDPOINTS = ["/api/dsh-version-check", "/api/host.describe"];

		/** Raw POST one candidate endpoint; returns its version value or null. */
		async function postVersion(path) {
			try {
				const body = JSON.stringify({
					type: "client-request",
					rpcId: `brand-version-${Date.now()}`,
					method: path.replace(/^\/api\//, ""),
					payload: {}
				});
				const response = await fetch(path, {
					method: "POST",
					headers: { "content-type": "application/json" },
					body
				});
				if (!response.ok) return null;
				const data = await response.json();
				const value = data?.result?.ok === true ? data.result.value : null;
				// Accept the payload whenever it carries either fact: an unreadable
				// installed version still lets the popover report the newest one.
				if (value === null || typeof value !== "object") return null;
				if (typeof value.version !== "string" && typeof value.latestVersion !== "string") return null;
				return value;
			} catch {
				return null;
			}
		}

		async function fetchVersion() {
			for (const path of VERSION_ENDPOINTS) {
				const value = await postVersion(path);
				if (value !== null) return value;
			}
			return null;
		}

		async function versionPayload(force) {
			if (!force && Date.now() - cache.at < CACHE_TTL_MS && cache.value !== null) return cache.value;
			const value = await fetchVersion();
			if (value !== null) cache = { at: Date.now(), value };
			return value;
		}

		// ---------- version comparison (x.y.z[-rc.n]) ----------
		function parseVersion(v) {
			const m = String(v ?? "").trim().match(/^(\d+)\.(\d+)\.(\d+)(?:-(.+))?$/);
			if (m === null) return null;
			return { major: +m[1], minor: +m[2], patch: +m[3], pre: m[4] ?? null };
		}
		function compareVersions(a, b) {
			const pa = parseVersion(a);
			const pb = parseVersion(b);
			if (pa === null || pb === null) return String(a).localeCompare(String(b));
			if (pa.major !== pb.major) return pa.major - pb.major;
			if (pa.minor !== pb.minor) return pa.minor - pb.minor;
			if (pa.patch !== pb.patch) return pa.patch - pb.patch;
			if (pa.pre === pb.pre) return 0;
			if (pa.pre === null) return 1;
			if (pb.pre === null) return -1;
			return pa.pre.localeCompare(pb.pre);
		}

		// ---------- release details (GitHub API) ----------
		/** 5-minute cache of fetched releases; null = not fetched / failed. */
		let releaseCache = { at: 0, value: null, failed: false };
		const RELEASE_CACHE_TTL_MS = 5 * 60 * 1000;
		const GITHUB_RELEASES_URL = "https://api.github.com/repos/deepseek-ai/deepseek-harness/releases?per_page=50";

		async function fetchReleases() {
			const response = await fetch(GITHUB_RELEASES_URL, { signal: AbortSignal.timeout(8000) });
			if (!response.ok) throw new Error(`HTTP ${response.status}`);
			const list = await response.json();
			if (!Array.isArray(list)) throw new Error("bad payload");
			return list.map((rel) => ({
				tag: String(rel.tag_name ?? ""),
				version: String(rel.tag_name ?? "").replace(/^dsh-?v?/i, ""),
				publishedAt: rel.published_at ?? null,
				prerelease: rel.prerelease === true,
				body: String(rel.body ?? "")
			}));
		}

		/** Strip HTML tags and normalize line endings from a section. */
		function cleanSummary(text) {
			return text
				.replace(/<[^>]+>/g, "")
				.replace(/\r\n/g, "\n")
				.trim();
		}

		/** Raw Simplified-Chinese section of a release body, or null. */
		function zhSection(body) {
			const source = String(body ?? "");
			const m = source.match(/<h3 id="cn[^"]*">([\s\S]*?)(?=<h3 id="en|$)/);
			return m === null ? null : m[1];
		}

		/** Raw English section of a release body, or null. */
		function enSection(body) {
			const source = String(body ?? "");
			const m = source.match(/<h3 id="en[^"]*">([\s\S]*)$/);
			return m === null ? null : m[1];
		}

		/** Chinese summary text; falls back to the whole body only when the body
		* has no language sections (legacy bodies). An English-only release leaves
		* the Chinese block empty instead of duplicating its content in both
		* blocks. */
		function zhSummary(body) {
			const zh = zhSection(body);
			if (zh !== null) return cleanSummary(zh);
			if (enSection(body) !== null) return "";
			return cleanSummary(String(body ?? ""));
		}

		/** English summary text (mirror of zhSummary). */
		function enSummary(body) {
			const en = enSection(body);
			return en === null ? "" : cleanSummary(en);
		}

		// ---------- link-aware summary rendering ----------
		/** Bare http(s) URL inside plain text; the character class excludes
		* whitespace, quotes, angle brackets, parens, and CJK ranges (a bare URL
		* followed by Chinese punctuation/prose must not swallow it — raw CJK
		* URLs should come as markdown links instead). */
		const BARE_URL_RE = /https?:\/\/[^\s<>"'()\u3000-\u303f\u4e00-\u9fff\uff00-\uffef]+/g;
		/** Markdown-style link: [label](https://url). */
		const MARKDOWN_LINK_RE = /\[([^\]]*)\]\((https?:\/\/[^\s)]+)\)/g;
		/** Elements whose content must never render in a summary. */
		const SUMMARY_SKIP_TAGS = new Set(["script", "style", "iframe", "object", "embed", "noscript", "form", "input", "button"]);

		/** New-tab anchor (http(s) only reach this helper). */
		function makeSummaryAnchor(href, label) {
			const a = document.createElement("a");
			a.href = href;
			a.target = "_blank";
			a.rel = "noopener noreferrer";
			a.textContent = label;
			return a;
		}

		/** Append `text`, turning bare URLs into new-tab links (trailing punctuation trimmed). */
		function appendPlainTextWithLinks(parent, text) {
			let cursor = 0;
			for (const match of String(text).matchAll(BARE_URL_RE)) {
				const start = match.index;
				if (start > cursor) parent.appendChild(document.createTextNode(text.slice(cursor, start)));
				const url = match[0].replace(/[.,;:!?)\]}"']+$/, "");
				parent.appendChild(makeSummaryAnchor(url, url));
				cursor = start + match[0].length;
			}
			if (cursor < text.length) parent.appendChild(document.createTextNode(text.slice(cursor)));
		}

		/** Append `text`, converting markdown links and bare URLs to new-tab links. */
		function appendSummaryText(parent, text) {
			let cursor = 0;
			for (const match of String(text).matchAll(MARKDOWN_LINK_RE)) {
				const start = match.index;
				if (start > cursor) appendPlainTextWithLinks(parent, text.slice(cursor, start));
				parent.appendChild(makeSummaryAnchor(match[2], match[1] || match[2]));
				cursor = start + match[0].length;
			}
			if (cursor < text.length) appendPlainTextWithLinks(parent, text.slice(cursor));
		}

		/**
		* Render a raw summary section to a fragment with clickable links (new
		* tab). Raw-HTML anchors, markdown links, and bare URLs become <a>; every
		* other element is unwrapped to its text (scripts, styles, images and
		* forms are dropped), so third-party release bodies can never inject
		* markup, external fetches, or scripts into the host page.
		*/
		function renderSummary(html) {
			const fragment = document.createDocumentFragment();
			const doc = new DOMParser().parseFromString(String(html ?? ""), "text/html");
			const walk = (node) => {
				if (node.nodeType === Node.TEXT_NODE) {
					appendSummaryText(fragment, node.nodeValue);
					return;
				}
				if (node.nodeType !== Node.ELEMENT_NODE) return;
				const tag = node.tagName.toLowerCase();
				if (SUMMARY_SKIP_TAGS.has(tag)) return;
				if (tag === "a") {
					const href = node.getAttribute("href") ?? "";
					if (/^https?:\/\//i.test(href)) {
						fragment.appendChild(makeSummaryAnchor(href, node.textContent ?? ""));
					} else {
						for (const child of node.childNodes) walk(child);
					}
					return;
				}
				for (const child of node.childNodes) walk(child);
			};
			for (const child of doc.body.childNodes) walk(child);
			return fragment;
		}

		async function releaseNotes(installedVersion, force) {
			if (!force && Date.now() - releaseCache.at < RELEASE_CACHE_TTL_MS && releaseCache.value !== null) {
				return releaseCache.value;
			}
			let releases;
			try {
				releases = await fetchReleases();
			} catch {
				releaseCache = { at: Date.now(), value: null, failed: true };
				return null;
			}
			// current version and newer, newest first
			const filtered = releases
				.filter((rel) => rel.version !== "" && compareVersions(rel.version, installedVersion) >= 0)
				.sort((a, b) => compareVersions(b.version, a.version));
			const notes = filtered.map((rel) => {
				const zh = zhSection(rel.body);
				const en = enSection(rel.body);
				return {
					version: rel.version,
					publishedAt: rel.publishedAt,
					prerelease: rel.prerelease,
					summary: zhSummary(rel.body),
					summaryEn: enSummary(rel.body),
					// raw sections for link-aware rendering (legacy bodies: whole body)
					summaryHtml: zh !== null ? zh : (en === null ? String(rel.body ?? "") : ""),
					summaryEnHtml: en !== null ? en : ""
				};
			});
			releaseCache = { at: Date.now(), value: notes, failed: false };
			return notes;
		}

		// ---------- popover ----------
		let popover = null;
		let attachedButton = null;
		let hoverBrand = false;
		let hoverPopover = false;
		let hideTimer = null;
		let popoverActions = null; // { refresh, details } after render

		function ensurePopover() {
			if (popover !== null) return;
			popover = document.createElement("div");
			for (const [key, value] of Object.entries(POPOVER_STYLE)) popover.style[key] = value;
			popover.addEventListener("pointerenter", () => {
				hoverPopover = true;
				cancelHide();
			});
			popover.addEventListener("pointerleave", () => {
				hoverPopover = false;
				scheduleHide();
			});
			document.body.appendChild(popover);
		}

		function cancelHide() {
			if (hideTimer !== null) {
				clearTimeout(hideTimer);
				hideTimer = null;
			}
		}

		function scheduleHide() {
			cancelHide();
			hideTimer = setTimeout(() => {
				hideTimer = null;
				if (!hoverBrand && !hoverPopover) hidePopover();
			}, 120);
		}

		function hidePopover() {
			if (popover !== null) popover.style.display = "none";
		}

		function muted(row, extra) {
			const node = document.createElement("div");
			node.textContent = row;
			Object.assign(node.style, ROW_STYLE, STATUS_MUTED_STYLE, extra ?? {});
			return node;
		}

		function actionButton(label, onClick) {
			const button = document.createElement("button");
			button.type = "button";
			button.textContent = label;
			Object.assign(button.style, ACTION_BUTTON_STYLE);
			button.addEventListener("pointerenter", () => {
				Object.assign(button.style, ACTION_BUTTON_HOVER_STYLE);
			});
			button.addEventListener("pointerleave", () => {
				for (const key of Object.keys(ACTION_BUTTON_HOVER_STYLE)) delete button.style[key];
			});
			button.addEventListener("click", onClick);
			return button;
		}

		function setPopoverContent(value) {
			const title = document.createElement("div");
			title.textContent = texts.title;
			title.style.fontWeight = "600";
			title.style.fontSize = "13px";
			title.style.lineHeight = "20px";

			const versionRow = document.createElement("div");
			versionRow.appendChild(document.createTextNode(`${texts.version} `));
			versionRow.appendChild(muted(typeof value.version === "string" ? value.version : texts.unknownVersion, {}));
			Object.assign(versionRow.style, ROW_STYLE);

			const latestRow = document.createElement("div");
			Object.assign(latestRow.style, ROW_STYLE);
			latestRow.appendChild(document.createTextNode(`${texts.latest} `));
			const latest = value.latestVersion;
			if (latest === null || latest === undefined) {
				latestRow.appendChild(muted(texts.unknown, {}));
			} else {
				// The release channel carrying the newest build (`next`/`alpha`/…)
				// explains why a version newer than the `latest` tag is offered.
				const tag = typeof value.latestTag === "string" && value.latestTag !== "" && value.latestTag !== "latest" ? ` (${value.latestTag})` : "";
				latestRow.appendChild(muted(`${latest}${tag}`, {}));
				// Compare rather than test equality: an install from a channel tag
				// (`next`) can be NEWER than the newest published version.
				if (typeof value.version === "string") {
					const outdated = compareVersions(latest, value.version) > 0;
					latestRow.appendChild(document.createTextNode(" · "));
					latestRow.appendChild(muted(outdated ? texts.update : texts.upToDate, outdated ? STATUS_UPDATE_STYLE : STATUS_OK_STYLE));
				}
			}

			const actionRow = document.createElement("div");
			Object.assign(actionRow.style, ACTION_ROW_STYLE);
			const refreshButton = actionButton(texts.refresh, () => {
				refreshPopover();
			});
			const detailsButton = actionButton(texts.details, () => {
				openDetails(value.version ?? "");
			});
			actionRow.append(refreshButton, detailsButton);
			popoverActions = { refresh: refreshButton, details: detailsButton };

			popover.replaceChildren(title, versionRow, latestRow, actionRow);
		}

		function positionPopover() {
			const rect = attachedButton?.getBoundingClientRect();
			if (rect === undefined || rect === null) return;
			popover.style.top = `${rect.bottom + 8}px`;
			popover.style.left = `${Math.max(8, rect.left)}px`;
		}

		async function showPopover() {
			ensurePopover();
			positionPopover();
			popover.style.display = "flex";
			const value = await versionPayload(false);
			if (popover === null || popover.style.display === "none") return;
			setPopoverContent(value === null ? { version: undefined, latestVersion: null } : value);
		}

		async function refreshPopover() {
			if (popover === null || popover.style.display === "none") return;
			const value = await versionPayload(true);
			if (popover === null) return;
			setPopoverContent(value === null ? { version: undefined, latestVersion: null } : value);
		}

		// ---------- modal styles (self-contained, no external CSS) ----------
		/** Scoped stylesheet injected once; every rule is prefixed with the
		* plugin root attribute and uses dsh theme tokens, so the modal follows
		* the host theme (light/dark) with zero third-party dependencies. */
		function ensureStyles() {
			if (document.querySelector("style[data-brand-version-css]") !== null) return;
			const style = document.createElement("style");
			style.dataset.brandVersionCss = "true";
			style.textContent = [
				"[data-brand-version-root].bv-modal{",
				"  position:fixed;inset:0;z-index:20000;",
				"  background:rgba(0,0,0,.45);",
				"  display:flex;align-items:center;justify-content:center;",
				"  padding:24px;box-sizing:border-box;",
				"}",
				"[data-brand-version-root] .bv-panel{",
				"  box-sizing:border-box;",
				"  width:min(640px,100%);max-height:80vh;",
				"  display:flex;flex-direction:column;",
				"  font-size:inherit;",
				"  line-height:inherit;",
				"  background-color:var(--dsw-alias-bg-layer-2, #1e1e20);",
				"  color:var(--dsw-alias-label-primary, #f9fafb);",
				"  border:1px solid var(--dsw-alias-border-l2, rgba(128,128,128,.35));",
				"  border-radius:12px;",
				"  box-shadow:0 16px 48px rgba(0,0,0,.4);",
				"  overflow:hidden;",
				"}",
				"[data-brand-version-root] .bv-header{",
				"  display:flex;align-items:flex-start;justify-content:space-between;gap:12px;",
				"  padding:14px 16px 10px;",
				"  border-bottom:1px solid var(--dsw-alias-border-l2, rgba(128,128,128,.25));",
				"}",
				"[data-brand-version-root] .bv-title{",
				"  margin:0;font-size:1.0625em;font-weight:600;line-height:1.4;",
				"  color:var(--dsw-alias-label-primary);",
				"}",
				"[data-brand-version-root] .bv-subtitle{",
				"  margin-top:2px;font-size:.875em;line-height:1.4;",
				"  color:var(--dsw-alias-label-tertiary);",
				"}",
				"[data-brand-version-root] .bv-close{",
				"  flex:none;width:28px;height:28px;",
				"  font:inherit;font-size:16px;line-height:1;",
				"  cursor:pointer;",
				"  color:var(--dsw-alias-label-secondary);",
				"  background:transparent;",
				"  border:1px solid transparent;border-radius:8px;",
				"  display:inline-flex;align-items:center;justify-content:center;",
				"}",
				"[data-brand-version-root] .bv-close:hover{",
				"  color:var(--dsw-alias-label-primary);",
				"  background:var(--dsw-alias-interactive-bg-hover, rgba(128,128,128,.15));",
				"}",
				"[data-brand-version-root] .bv-body{",
				"  flex:1;min-height:0;overflow-y:auto;",
				"  padding:12px 16px 16px;",
				"  color:var(--dsw-alias-label-secondary);",
				"  scrollbar-width:thin;",
				"}",
				"[data-brand-version-root] .bv-body::-webkit-scrollbar{width:8px}",
				"[data-brand-version-root] .bv-body::-webkit-scrollbar-thumb{",
				"  background:var(--dsw-alias-scrollbar-bg-l2, rgba(128,128,128,.4));",
				"  border-radius:999px;",
				"}",
				"[data-brand-version-root] .bv-item{",
				"  display:flex;flex-direction:column;gap:4px;",
				"  margin-bottom:16px;",
				"}",
				"[data-brand-version-root] .bv-item-head{",
				"  display:flex;align-items:center;gap:8px;flex-wrap:wrap;",
				"}",
				"[data-brand-version-root] .bv-version{",
				"  font-size:1em;font-weight:600;line-height:1.4;",
				"  color:var(--dsw-alias-label-primary);",
				"}",
				"[data-brand-version-root] .bv-badge{",
				"  font-size:.75em;line-height:1.6;",
				"  padding:0 7px;border-radius:999px;",
				"  background:var(--dsw-static-amber-100, rgba(240,180,41,.16));",
				"  color:var(--dsw-static-amber-500, #f0b429);",
				"  white-space:nowrap;",
				"}",
				"[data-brand-version-root] .bv-meta{",
				"  font-size:.875em;line-height:1.4;",
				"  color:var(--dsw-alias-label-tertiary);",
				"}",
				"[data-brand-version-root] .bv-summary{",
				"  font-size:1em;line-height:1.5;",
				"  white-space:pre-wrap;overflow-wrap:anywhere;",
				"  color:var(--dsw-alias-label-secondary);",
				"}",
				"[data-brand-version-root] .bv-en-label{",
				"  margin-top:10px;",
				"}",
				"[data-brand-version-root] .bv-summary-en{",
				"  margin-top:2px;padding-top:6px;",
				"  border-top:1px solid var(--dsw-alias-border-l2, rgba(128,128,128,.25));",
				"}",
				"[data-brand-version-root] .bv-summary a{",
				"  color:var(--dsw-alias-state-business-primary);",
				"  text-decoration:underline;",
				"  overflow-wrap:anywhere;",
				"}",
				"[data-brand-version-root] .bv-summary a:hover{",
				"  text-decoration:none;",
				"}",
				"[data-brand-version-root] .bv-muted{",
				"  font-size:1em;line-height:1.5;",
				"  color:var(--dsw-alias-label-tertiary);",
				"}",
				"[data-brand-version-root] .bv-btn{",
				"  font:inherit;font-size:.875em;line-height:1.4;",
				"  cursor:pointer;",
				"  align-self:flex-start;",
				"  padding:4px 10px;border-radius:6px;",
				"  color:var(--dsw-alias-label-secondary);",
				"  background:var(--dsw-alias-bg-layer-1, transparent);",
				"  border:1px solid var(--dsw-alias-border-l2, rgba(128,128,128,.35));",
				"}",
				"[data-brand-version-root] .bv-btn:hover{",
				"  border-color:var(--dsw-alias-state-business-primary);",
				"  color:var(--dsw-alias-state-business-primary);",
				"}"
			].join("\n");
			document.head.appendChild(style);
		}

		// ---------- details modal ----------
		let modal = null;

		function ensureModal() {
			if (modal !== null) return modal;
			ensureStyles();
			modal = document.createElement("div");
			modal.className = "bv-modal";
			modal.dataset.brandVersionRoot = "true";
			modal.addEventListener("click", (event) => {
				if (event.target === modal) closeModal();
			});
			const panel = document.createElement("div");
			panel.className = "bv-panel";
			modal.appendChild(panel);
			document.body.appendChild(modal);
			return modal;
		}

		function closeModal() {
			if (modal !== null) modal.style.display = "none";
		}

		function escapeListener(event) {
			if (event.key === "Escape") closeModal();
		}

		async function openDetails(installedVersion) {
			ensureModal();
			const panel = modal.firstElementChild;
			modal.style.display = "flex";
			document.addEventListener("keydown", escapeListener);

			// header
			const header = document.createElement("div");
			header.className = "bv-header";
			const titleBlock = document.createElement("div");
			const title = document.createElement("h2");
			title.className = "bv-title";
			title.textContent = texts.detailsTitle;
			const subtitle = document.createElement("div");
			subtitle.className = "bv-subtitle";
			subtitle.textContent = `${texts.detailsSubtitle} · dsh ${installedVersion || "?"}`;
			titleBlock.append(title, subtitle);
			const closeButton = document.createElement("button");
			closeButton.type = "button";
			closeButton.className = "bv-close";
			closeButton.setAttribute("aria-label", texts.close);
			closeButton.textContent = "✕";
			closeButton.addEventListener("click", closeModal);
			header.append(titleBlock, closeButton);

			// body
			const body = document.createElement("div");
			body.className = "bv-body";

			const loading = document.createElement("div");
			loading.className = "bv-muted";
			loading.textContent = texts.loadingDetails;
			body.appendChild(loading);
			panel.replaceChildren(header, body);

			const notes = await releaseNotes(installedVersion, false);
			if (modal === null || modal.style.display === "none") return;
			if (notes === null) {
				body.replaceChildren();
				const fail = document.createElement("div");
				fail.className = "bv-muted";
				fail.textContent = texts.noDetails;
				const retry = document.createElement("button");
				retry.type = "button";
				retry.className = "bv-btn";
				retry.textContent = texts.retry;
				retry.addEventListener("click", () => openDetails(installedVersion));
				body.append(fail, retry);
				return;
			}
			if (notes.length === 0) {
				body.replaceChildren();
				const empty = document.createElement("div");
				empty.className = "bv-muted";
				empty.textContent = texts.empty;
				body.appendChild(empty);
				return;
			}
			body.replaceChildren();
			for (const note of notes) {
				const item = document.createElement("div");
				item.className = "bv-item";
				const itemHeader = document.createElement("div");
				itemHeader.className = "bv-item-head";
				const versionLabel = document.createElement("span");
				versionLabel.className = "bv-version";
				versionLabel.textContent = `dsh ${note.version}`;
				itemHeader.append(versionLabel);
				if (note.prerelease) {
					const badge = document.createElement("span");
					badge.className = "bv-badge";
					badge.textContent = texts.prerelease;
					itemHeader.append(badge);
				}
				if (note.publishedAt) {
					const meta = document.createElement("span");
					meta.className = "bv-meta";
					meta.textContent = `${texts.released} ${note.publishedAt.replace("T", " ").slice(0, 16)}`;
					itemHeader.append(meta);
				}
				const summary = document.createElement("div");
				summary.className = "bv-summary";
				const summaryFragment = renderSummary(note.summaryHtml ?? "");
				if (summaryFragment.childNodes.length > 0) summary.appendChild(summaryFragment);
				else summary.textContent = note.summary || "—";
				item.append(itemHeader, summary);
				if (note.summaryEn) {
					const enLabel = document.createElement("div");
					enLabel.className = "bv-meta bv-en-label";
					enLabel.textContent = texts.enSummary;
					const summaryEn = document.createElement("div");
					summaryEn.className = "bv-summary bv-summary-en";
					const enFragment = renderSummary(note.summaryEnHtml ?? "");
					if (enFragment.childNodes.length > 0) summaryEn.appendChild(enFragment);
					else summaryEn.textContent = note.summaryEn;
					item.append(enLabel, summaryEn);
				}
				body.appendChild(item);
			}
		}

		// ---------- attach / observe ----------
		function attach(button) {
			attachedButton = button;
			button.addEventListener("pointerenter", () => {
				hoverBrand = true;
				cancelHide();
				showPopover();
			}, { passive: true });
			button.addEventListener("pointerleave", () => {
				hoverBrand = false;
				scheduleHide();
			}, { passive: true });
		}

		function scan() {
			if (attachedButton !== null && attachedButton.isConnected) return;
			attachedButton = null;
			const buttons = document.querySelectorAll("button");
			for (const button of buttons) {
				if (isBrandButton(button)) {
					attach(button);
					return;
				}
			}
		}

		/**
		* Plugin body: observe the DOM (the sidebar renders after the client
		* boots), locate the brand button, and tear everything down on dispose.
		* @param ctx - client root context.
		*/
		function apply(ctx) {
			ctx.effect(() => {
				scan();
				const observer = new MutationObserver(() => scan());
				observer.observe(document.documentElement, { childList: true, subtree: true });
				return () => {
					observer.disconnect();
					cancelHide();
					hidePopover();
					popover?.remove();
					popover = null;
					popoverActions = null;
					modal?.remove();
					modal = null;
					document.removeEventListener("keydown", escapeListener);
					if (attachedButton !== null) {
						attachedButton.removeEventListener("pointerenter", attach);
						attachedButton = null;
					}
				};
			}, "ui-brand-version: logo hover");
		}
		//#endregion
		exports.apply = apply;
		exports.inject = inject;
		return module.exports;
	}
});
