// @deepseek-ai/dsh-client-ui-version-check (host half)
//
// Host half: answer the client's version query with the real installed dsh
// version plus the newest published version (update availability).
//
// Two transports, the modern one first:
// - dsh >= 0.1.5: the plugin owns the exact `/api/dsh-version-check` Fetch
//   route on the shared Connection `/api` channel. Core dropped both the
//   `apiProxy` service and the dotted `host.describe` route when the /api
//   channel moved to `<namespace>/<method>` Typert endpoints, so the legacy
//   mechanism below silently stopped matching anything.
// - dsh <= 0.1.4: wrap `apiProxy.host.describe` at runtime (UNARY_ROUTES
//   dispatched through that property at call time) and merge the same fields
//   into its response.
// Core packages are never touched.
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { homedir } from "node:os";
import { dirname, join } from "node:path";

const require = createRequire(import.meta.url);

/** Registry package whose published versions are reported. */
const PACKAGE = "@deepseek-ai/dsh";
/** Exact shared-channel route this plugin owns (dsh >= 0.1.5). */
const VERSION_ENDPOINT = "/api/dsh-version-check";
/** Legacy dotted RPC method enriched through `apiProxy` (dsh <= 0.1.4). */
const LEGACY_ENDPOINT = "/api/host.describe";

/**
* Candidate dsh package manifests, most authoritative first: normal module
* resolution from this package, then the directories above the running CLI
* entry (`…/@deepseek-ai/dsh/lib/bin.js`) for compositions whose plugin root
* has no `@deepseek-ai/dsh` link.
*/
function* manifestCandidates() {
	try {
		yield require.resolve(`${PACKAGE}/package.json`);
	} catch {
		// fall through to the entry-point walk
	}
	const entry = process.argv[1];
	if (typeof entry === "string" && entry !== "") {
		const dir = dirname(entry);
		yield join(dir, "..", "package.json");
		yield join(dir, "..", "..", "package.json");
	}
}

/**
* Resolve the installed harness version from @deepseek-ai/dsh's package.json.
* @returns the installed version, or null when no candidate identifies itself
* as the harness package (callers render "unknown" rather than a fake version).
*/
function installedVersion() {
	for (const manifest of manifestCandidates()) {
		try {
			const parsed = JSON.parse(readFileSync(manifest, "utf8"));
			if (parsed?.name === PACKAGE && typeof parsed.version === "string") return parsed.version;
		} catch {
			// try the next candidate
		}
	}
	return null;
}

// ---------- version comparison (x.y.z[-pre]) ----------
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

const LATEST_TTL_MS = 10 * 60 * 1000;
const LATEST_TIMEOUT_MS = 2500;
/** Cache entry: `{ version, tag }` of the newest published release, or null. */
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

/** One registry JSON GET under a hard timeout; resolves null on any failure. */
async function registryJson(url) {
	try {
		const response = await fetch(url, { signal: AbortSignal.timeout(LATEST_TIMEOUT_MS) });
		if (!response.ok) return null;
		return await response.json();
	} catch {
		return null;
	}
}

/**
* Newest published version across every dist-tag, with the tag carrying it.
* The `latest` dist-tag alone is not enough: a user installed from `next` (or
* any other channel) can sit on a version NEWER than `latest`, which would
* otherwise be reported as an available update.
* @param tags - the registry's dist-tags document.
* @returns the winning `{ version, tag }`, or null when nothing parses.
*/
function newestTaggedVersion(tags) {
	if (typeof tags !== "object" || tags === null) return null;
	let best = null;
	for (const [tag, version] of Object.entries(tags)) {
		if (typeof version !== "string" || parseVersion(version) === null) continue;
		if (best === null || compareVersions(version, best.version) > 0) best = { version, tag };
	}
	return best;
}

/** Query the first reachable registry for the newest published version; never throws. */
async function fetchLatest() {
	for (const registry of registryCandidates()) {
		const tagged = newestTaggedVersion(await registryJson(`${registry}/-/package/${PACKAGE}/dist-tags`));
		if (tagged !== null) {
			latestCache = { value: tagged, at: Date.now() };
			return tagged;
		}
		const latest = await registryJson(`${registry}/${PACKAGE}/latest`);
		if (typeof latest?.version === "string") {
			const value = { version: latest.version, tag: "latest" };
			latestCache = { value, at: Date.now() };
			return value;
		}
	}
	latestCache = { value: null, at: Date.now() };
	return null;
}

/** Cached latest version: fresh cache resolves synchronously; cold cache dedupes one fetch. */
function latestVersion() {
	if (Date.now() - latestCache.at < LATEST_TTL_MS) return latestCache.value;
	if (latestInFlight === null) {
		latestInFlight = fetchLatest().finally(() => {
			latestInFlight = null;
		});
	}
	return latestInFlight;
}

/** The version payload both transports report. */
async function versionPayload() {
	const latest = await latestVersion();
	return {
		version: installedVersion(),
		latestVersion: latest?.version ?? null,
		latestTag: latest?.tag ?? null
	};
}

/** Envelope-shaped failure, mirroring the Connection RPC contract. */
function rpcFailure(rpcId, message) {
	return {
		type: "server-response",
		rpcId,
		result: {
			ok: false,
			error: { code: "version-check/internal", message, details: {} }
		}
	};
}

/**
* Exact-route handler for {@link VERSION_ENDPOINT}: accepts the shared
* channel's `client-request` envelope and answers with `server-response`.
* @param request - the buffered Fetch request routed here.
* @returns the version payload, or an envelope-carried failure.
*/
async function handleVersionRequest(request) {
	if (request.method !== "POST") return new Response("method not allowed", { status: 405 });
	let body;
	try {
		body = await request.json();
	} catch {
		return new Response("body is not JSON", { status: 400 });
	}
	const rpcId = typeof body?.rpcId === "string" ? body.rpcId : "invalid-request";
	try {
		return Response.json({ type: "server-response", rpcId, result: { ok: true, value: await versionPayload() } });
	} catch (error) {
		return Response.json(rpcFailure(rpcId, error instanceof Error ? error.message : String(error)));
	}
}

/** @param ctx - host plugin context. */
export function apply(ctx) {
	// Modern transport (dsh >= 0.1.5): own an exact route on the shared /api
	// channel. Registration is scoped to this plugin's context, so a reload
	// disposes the route before the new load registers it again.
	ctx.inject(["connection"], (connectionCtx) => {
		const connection = connectionCtx.connection;
		if (connection === void 0 || typeof connection.fetch?.register !== "function") return;
		try {
			connection.fetch.register({
				path: VERSION_ENDPOINT,
				methods: ["POST"],
				requestBody: "buffered",
				fetch: handleVersionRequest
			});
		} catch (error) {
			console.warn(`ui-version-check: could not register ${VERSION_ENDPOINT} because ${String(error)}`);
		}
	});

	// Legacy transport (dsh <= 0.1.4): enrich host.describe in place.
	ctx.inject(["apiProxy"], () => {
		const apiProxy = ctx.get("apiProxy");
		const original = apiProxy?.host?.describe;
		if (typeof original !== "function") return;
		apiProxy.host.describe = async (request) => {
			try {
				const base = await original(request);
				if (base?.result?.ok === true && base.result.value && typeof base.result.value === "object") {
					const payload = await versionPayload();
					const merged = { ...base.result.value, latestVersion: payload.latestVersion, latestTag: payload.latestTag };
					if (payload.version !== null) merged.version = payload.version;
					base.result.value = merged;
				}
				return base;
			} catch {
				return original(request);
			}
		};
	});
}

/** Wire paths the client tries, newest transport first. */
export { LEGACY_ENDPOINT, VERSION_ENDPOINT };
