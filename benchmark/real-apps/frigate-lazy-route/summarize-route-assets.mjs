import assert from "node:assert/strict";
import { brotliCompressSync, constants } from "node:zlib";
import { readFile, writeFile } from "node:fs/promises";
import { resolve, relative } from "node:path";

const [distArg, traceArg, outputArg] = process.argv.slice(2);
if (!distArg || !traceArg || !outputArg) {
	throw new Error("Usage: node summarize-route-assets.mjs DIST_DIR TRACE.json OUTPUT.json");
}
const dist = resolve(distArg);
const trace = JSON.parse(await readFile(traceArg, "utf8"));
const html = await readFile(resolve(dist, "index.html"), "utf8");
const preloads = [...html.matchAll(/<link[^>]+rel="modulepreload"[^>]+href="([^"]+)"[^>]*>/g)].map((m) => m[1]);
const paths = new Set(["index.html"]);
for (const asset of trace.assets ?? []) paths.add(asset.path.replace(/^\//, ""));
for (const resource of trace.timing?.fontResources ?? []) paths.add(resource.url.replace(/^\//, ""));
for (const resource of trace.timing?.locale ?? []) paths.add(resource.url.replace(/^\//, ""));

const assets = [];
for (const path of [...paths].sort()) {
	const contents = await readFile(resolve(dist, path));
	const brotli = brotliCompressSync(contents, {
		params: { [constants.BROTLI_PARAM_QUALITY]: 4 },
	});
	assets.push({ path, rawBytes: contents.length, brotliQ4Bytes: brotli.length });
}
const output = {
	path: trace.path,
	documentLanguage: trace.documentLanguage,
	modulePreloadCount: preloads.length,
	modulePreloads: preloads,
	requestedJsCount: new Set((trace.timing?.jsResources ?? []).map((r) => r.url)).size,
	requestedJsCssCount: (trace.assets ?? []).length,
	requestedLocaleCount: (trace.requests ?? []).length,
	requestedAssetPaths: assets.map((asset) => asset.path),
	rawBytes: assets.reduce((sum, asset) => sum + asset.rawBytes, 0),
	brotliQ4Bytes: assets.reduce((sum, asset) => sum + asset.brotliQ4Bytes, 0),
	assets,
};
assert.ok(output.modulePreloadCount > 0, "expected modulepreload tags in built index.html");
await writeFile(outputArg, `${JSON.stringify(output, null, 2)}\n`);
console.log(JSON.stringify({ modulePreloadCount: output.modulePreloadCount, requestedJsCount: output.requestedJsCount, rawBytes: output.rawBytes, brotliQ4Bytes: output.brotliQ4Bytes }, null, 2));
