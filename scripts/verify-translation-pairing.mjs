#!/usr/bin/env node
// Verify that README.md and README.zh.md match the hashes recorded in
// README.i18n.yaml (the bilingual-pair consistency record). Mirrors the
// official `verify-translation-pairing` behavior: after editing either side,
// bring the other along and run with --write to re-record the hashes.
import { createHash } from "node:crypto";
import { readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const write = process.argv.includes("--write");

/** git blob hash: sha1("blob <len>\0" + content). */
function blobHash(content) {
	return createHash("sha1").update(`blob ${Buffer.byteLength(content)}\0${content}`).digest("hex");
}

function loadRecord() {
	const text = readFileSync(join(root, "README.i18n.yaml"), "utf8");
	const record = {};
	for (const line of text.split("\n")) {
		const m = line.match(/^(README\.(?:md|zh\.md)):\s*([0-9a-f]{40})$/);
		if (m) record[m[1]] = m[2];
	}
	return record;
}

const record = loadRecord();
const failures = [];
for (const file of ["README.md", "README.zh.md"]) {
	const content = readFileSync(join(root, file), "utf8");
	const actual = blobHash(content);
	const expected = record[file];
	if (expected === undefined) {
		failures.push(`${file}: no recorded hash in README.i18n.yaml`);
	} else if (actual !== expected) {
		failures.push(`${file}: hash mismatch (recorded ${expected}, actual ${actual})`);
	} else {
		console.log(`${file}: OK`);
	}
}

if (failures.length > 0) {
	if (write) {
		const lines = [];
		for (const file of ["README.md", "README.zh.md"]) {
			lines.push(`${file}: ${blobHash(readFileSync(join(root, file), "utf8"))}`);
		}
		const header = [
			"# Bilingual-pair consistency record (docs/i18n/README.md): the git blob hash of each",
			"# side as of the last confirmed-consistent state. Both languages carry equal authority;",
			"# after editing either side, bring the other along and re-record with:",
			"#   pnpm run verify-translation-pairing --write packages/client/ui-version-check/README.md"
		];
		writeFileSync(join(root, "README.i18n.yaml"), header.join("\n") + "\n" + lines.join("\n") + "\n");
		console.log("README.i18n.yaml re-recorded");
		process.exit(0);
	}
	console.error(failures.join("\n"));
	console.error("Run with --write after updating both README sides.");
	process.exit(1);
}
