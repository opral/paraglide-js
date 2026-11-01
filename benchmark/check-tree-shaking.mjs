import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { compile } from "@inlang/paraglide-js";
import { build } from "vite";

const benchmarkDir = path.dirname(fileURLToPath(import.meta.url));
const workspace = path.join(benchmarkDir, ".work/tree-shaking-probe");
await fs.rm(workspace, { recursive: true, force: true });
await fs.mkdir(path.join(workspace, "project.inlang"), { recursive: true });
await fs.mkdir(path.join(workspace, "messages"));
await fs.copyFile(
	path.join(benchmarkDir, "node_modules/@inlang/plugin-i18next/dist/index.js"),
	path.join(workspace, "plugin.js")
);
await fs.writeFile(
	path.join(workspace, "project.inlang/settings.json"),
	JSON.stringify({
		baseLocale: "en",
		locales: ["en", "de"],
		modules: ["./plugin.js"],
		"plugin.inlang.i18next": { pathPattern: "./messages/{locale}.json" },
	})
);
await fs.writeFile(
	path.join(workspace, "index.html"),
	'<script type="module" src="./entry.js"></script>'
);
await fs.writeFile(
	path.join(workspace, "entry.js"),
	'import { m } from "./paraglide/messages.js"; document.body.textContent = m.greeting({ name: "World" });'
);

const sentinels = [
	"UNUSED_TREE_SHAKING_PROBE_EN",
	"UNUSED_TREE_SHAKING_PROBE_DE",
];
async function buildVariant(withUnused) {
	for (const [index, locale] of ["en", "de"].entries()) {
		await fs.writeFile(
			path.join(workspace, "messages", `${locale}.json`),
			JSON.stringify({
				greeting: locale === "en" ? "Hello {{name}}!" : "Hallo {{name}}!",
				...(withUnused ? { unused_probe: sentinels[index] } : {}),
			})
		);
	}
	await compile({
		project: path.join(workspace, "project.inlang"),
		outdir: path.join(workspace, "paraglide"),
		isServer: "false",
		strategy: ["globalVariable", "baseLocale"],
	});
	const outDir = path.join(workspace, withUnused ? "after" : "before");
	await build({
		root: workspace,
		configFile: false,
		logLevel: "error",
		build: { outDir, target: "es2022", sourcemap: false },
	});
	const hashes = {};
	let productionText = "";
	for (const file of (await fs.readdir(outDir, { recursive: true })).sort()) {
		if (!file.endsWith(".js")) continue;
		const bytes = await fs.readFile(path.join(outDir, file));
		productionText += bytes.toString("utf8");
		for (const sentinel of sentinels)
			assert.ok(!bytes.includes(sentinel), `Unused text retained in ${file}`);
		hashes[file] = createHash("sha256").update(bytes).digest("hex");
	}
	assert.ok(Object.keys(hashes).length > 0, "Expected production JavaScript");
	assert.ok(
		productionText.includes("Hello"),
		"Expected used English translation"
	);
	assert.ok(
		productionText.includes("Hallo"),
		"Expected used German translation"
	);
	return hashes;
}

const before = await buildVariant(false);
const after = await buildVariant(true);
const generated = await fs.readFile(
	path.join(workspace, "paraglide/messages/unused_probe.js"),
	"utf8"
);
for (const sentinel of sentinels) assert.ok(generated.includes(sentinel));
assert.deepEqual(
	after,
	before,
	"Adding an unused message changed production JS"
);
const ignore = await fs.readFile(
	path.join(workspace, "paraglide/.gitignore"),
	"utf8"
);
assert.ok(
	ignore.split(/\r?\n/).includes("*"),
	"Expected default generated ignore rule"
);
const summary = {
	locales: ["en", "de"],
	unusedMessagePresentInGeneratedSource: true,
	unusedTextPresentInProductionJavaScript: false,
	productionJavaScriptHashesUnchanged: true,
	defaultGeneratedGitIgnore: true,
	productionJavaScriptHashes: after,
};
await fs.writeFile(
	path.join(workspace, "summary.json"),
	JSON.stringify(summary, null, 2) + "\n"
);
console.log(JSON.stringify(summary, null, 2));
