// @deepseek-ai/dsh-client-ui-version-check (host half)
//
// Host half: enrich `host.describe` so the client can show the real installed
// dsh version plus the latest published version (update availability).
// Mechanism: wrap apiProxy.host.describe at runtime (UNARY_ROUTES dispatches
// through that property at call time), before the response is returned.
// Core packages are never touched.
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { homedir } from "node:os";

const require = createRequire(import.meta.url);

/** Resolve the installed harness version from @deepseek-ai/dsh's package.json. */
function installedVersion() {
	try {
		return JSON.parse(readFileSync(require.resolve("@deepseek-ai/dsh/package.json"), "utf8")).version;
	} catch {
		return "0.0.1";
	}
}

const LATEST_TTL_MS = 10 * 60 * 1000;
const LATEST_TIMEOUT_MS = 2500;
let latestCache = { value: null, at: 0 };
let latestInFlight = null;

/** The user's configured npm registry (env / ~/.npmrc), or undefined when unreadable. */
function configuredRegistry() {
	try {
		if (typeof process.env.npm_config_registry === "string" && process.env.npm_config_registry !== "") {
			return process.env.npm_config_registry.replace(/\/+$/, "");
		}
		const npmrc = readFileSync(`${homedir()}/.npmrc`, "utf8");
		for (const line of npmrc.split(/\r?\n/)) {
			const m = line.match(/^\s*registry\s*=\s*(\S+)\s*$/);
			if (m !== null && m[1] !== "") return m[1].replace(/\/+$/, "");
		}
		return void 0;
	} catch {
		return void 0;
	}
}

/**
* Registry candidates in preference order: the user's configured registry
* first, then the official npm registry, then the npmmirror fallback (so
* international users hit the official source and CN users still work).
*/
function registryCandidates() {
	const candidates = [];
	const configured = configuredRegistry();
	if (configured !== void 0) candidates.push(configured);
	candidates.push("https://registry.npmjs.org");
	candidates.push("https://registry.npmmirror.com");
	return [...new Set(candidates)];
}

/** Query the first reachable registry for the latest published dsh version; never throws. */
async function fetchLatestVersion() {
	for (const registry of registryCandidates()) {
		try {
			const controller = new AbortController();
			const timer = setTimeout(() => controller.abort(), LATEST_TIMEOUT_MS);
			try {
				const response = await fetch(`${registry}/@deepseek-ai/dsh/latest`, { signal: controller.signal });
				if (!response.ok) throw new Error(`registry HTTP ${response.status}`);
				const body = await response.json();
				const value = typeof body?.version === "string" ? body.version : null;
				latestCache = { value, at: Date.now() };
				return value;
			} finally {
				clearTimeout(timer);
			}
		} catch {
			// try the next registry candidate
		}
	}
	latestCache = { value: null, at: Date.now() };
	return null;
}

/** Cached latest version: fresh cache resolves synchronously; cold cache dedupes one fetch. */
function latestVersion() {
	if (Date.now() - latestCache.at < LATEST_TTL_MS) return latestCache.value;
	if (latestInFlight === null) {
		latestInFlight = fetchLatestVersion().finally(() => {
			latestInFlight = null;
		});
	}
	return latestInFlight;
}

export function apply(ctx) {
	ctx.inject(["apiProxy"], () => {
		const apiProxy = ctx.get("apiProxy");
		const original = apiProxy?.host?.describe;
		if (typeof original !== "function") return;
		apiProxy.host.describe = async (request) => {
			try {
				const base = await original(request);
				if (base?.result?.ok === true && base.result.value && typeof base.result.value === "object") {
					base.result.value = {
						...base.result.value,
						version: installedVersion(),
						latestVersion: await latestVersion()
					};
				}
				return base;
			} catch {
				return original(request);
			}
		};
	});
}
