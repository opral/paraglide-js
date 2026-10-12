#!/usr/bin/env node
/** Derive route-asset attribution from frozen Playwright traces and build manifests. */
import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const resultDir = path.join(root, "benchmark/real-apps/results");
const sampleSources = {
	nativeFull: { file: "openwebui-auth-ab-corrected-10pairs.json", variant: "native-es2022" },
	nativeScoped: { file: "openwebui-auth-ab-native-scoped-smoke.json", variant: "native-scoped" },
	paraglideSplit: { file: "openwebui-auth-ab-corrected-10pairs.json", variant: "paraglide-auth-es2022" },
	paraglideDefault: { file: "openwebui-auth-ab-default-vs-split-smoke.json", variant: "paraglide-default" },
};
const appRoots = {
	nativeFull: path.join(root, ".real-apps/openwebui-native-ab"),
	nativeScoped: path.join(root, ".real-apps/openwebui-i18next-auth-scoped"),
	paraglideSplit: path.join(root, ".real-apps/openwebui-paraglide-ab-corrected"),
	paraglideDefault: path.join(root, ".real-apps/openwebui-paraglide-auth-default"),
};
const readJson = async (filename) => JSON.parse(await fs.readFile(filename, "utf8"));
const median = (values) => {
	const sorted = [...values].sort((a, b) => a - b);
	const middle = Math.floor(sorted.length / 2);
	return sorted.length % 2 ? sorted[middle] : (sorted[middle - 1] + sorted[middle]) / 2;
};
const isShippedAsset = (resource) =>
	resource.name.startsWith("/_app/") || resource.name.startsWith("/assets/") || resource.name.startsWith("/static/");

const traceGroups = {};
for (const [name, { file, variant }] of Object.entries(sampleSources)) {
	const report = await readJson(path.join(resultDir, file));
	const samples = report.samples.filter((sample) => sample.variant === variant);
	if (!samples.length) throw new Error(`No ${variant} samples in ${file}`);
	const metrics = samples.map((sample) => {
		const assets = sample.resources.filter(isShippedAsset);
		const nonAssets = sample.resources.filter((resource) => !isShippedAsset(resource));
		return {
			assets,
			nonAssets,
			fullRoute: {
				encodedBodyBytes: sample.encodedBodyBytes,
				transferBytes: sample.transferBytes,
				decodedBodyBytes: sample.decodedBodyBytes,
				resourceCount: sample.resourceCount,
				translatedReadyMs: sample.translatedReadyMs,
			},
			staticAssets: {
				encodedBodyBytes: assets.reduce((sum, resource) => sum + (resource.encodedBytes || 0), 0),
				transferBytes: assets.reduce((sum, resource) => sum + (resource.transferBytes || 0), 0),
				decodedBodyBytes: assets.reduce((sum, resource) => sum + (resource.decodedBytes || 0), 0),
				resourceCount: assets.length,
			},
		};
	});
	const summaryOf = (field) => Object.fromEntries(Object.keys(metrics[0][field]).map((key) => [key, median(metrics.map((metric) => metric[field][key]))]));
	const omitted = new Map();
	for (const metric of metrics) for (const resource of metric.nonAssets) {
		const key = resource.name.split("?")[0];
		const entry = omitted.get(key) ?? { endpoint: key, samples: 0, encodedBodyBytes: [], transferBytes: [] };
		entry.samples++;
		entry.encodedBodyBytes.push(resource.encodedBytes || 0);
		entry.transferBytes.push(resource.transferBytes || 0);
		omitted.set(key, entry);
	}
	traceGroups[name] = {
		traceFile: file,
		variant,
		trialCount: samples.length,
		fullRoute: summaryOf("fullRoute"),
		staticShippedAssets: summaryOf("staticAssets"),
		otherEndpointResponses: [...omitted.values()].map((entry) => ({
			endpoint: entry.endpoint,
			requestCountAcrossSamples: entry.samples,
			medianEncodedBodyBytes: median(entry.encodedBodyBytes),
			medianTransferBytes: median(entry.transferBytes),
		})),
	};
}

const selectedLocaleAssets = {};
for (const name of ["nativeFull", "nativeScoped"]) {
	const buildRoot = appRoots[name];
	const manifest = await readJson(path.join(buildRoot, ".svelte-kit/output/client/.vite/manifest.json"));
	const prefix = name === "nativeFull" ? "src/lib/i18n/locales" : "src/lib/i18n/auth-locales";
	const trace = await readJson(path.join(resultDir, sampleSources[name].file));
	const sample = trace.samples.find((entry) => entry.variant === sampleSources[name].variant);
	const localeAssets = [];
	for (const locale of ["fr-FR", "en-US"]) {
		const key = `${prefix}/${locale}/translation.json`;
		const file = manifest[key]?.file;
		if (!file) throw new Error(`Missing manifest entry ${key} in ${buildRoot}`);
		const requestPath = `/${file}`;
		const resource = sample.resources.find((entry) => entry.name === requestPath);
		if (!resource) throw new Error(`Expected locale resource ${requestPath} in ${name} route trace`);
		localeAssets.push({ locale, requestPath, encodedBodyBytes: resource.encodedBytes, transferBytes: resource.transferBytes });
	}
	selectedLocaleAssets[name] = { localesLoaded: localeAssets, encodedBodyBytes: localeAssets.reduce((sum, entry) => sum + entry.encodedBodyBytes, 0) };
}

for (const name of ["paraglideSplit", "paraglideDefault"]) {
	const buildRoot = appRoots[name];
	const mapDir = path.join(buildRoot, "build/_app/immutable/chunks");
	const trace = await readJson(path.join(resultDir, sampleSources[name].file));
	const sample = trace.samples.find((entry) => entry.variant === sampleSources[name].variant);
	const chunksByLocale = new Map();
	for (const mapName of await fs.readdir(mapDir)) {
		if (!mapName.endsWith(".js.map")) continue;
		const map = await readJson(path.join(mapDir, mapName));
		const locales = ["fr-FR", "en-US"].filter((locale) => (map.sources ?? []).some((source) => source.endsWith(`/paraglide-auth/messages/${locale}.js`)));
		if (!locales.length) continue;
		const file = mapName.slice(0, -4);
		const requestPath = `/_app/immutable/chunks/${file}`;
		const resource = sample.resources.find((entry) => entry.name === requestPath);
		if (!resource) continue;
		for (const locale of locales) {
			const entry = chunksByLocale.get(locale) ?? { locale, chunks: [] };
			entry.chunks.push({ requestPath, encodedBodyBytes: resource.encodedBytes, transferBytes: resource.transferBytes });
			chunksByLocale.set(locale, entry);
		}
	}
	const uniqueFiles = new Map();
	for (const entry of chunksByLocale.values()) for (const chunk of entry.chunks) uniqueFiles.set(chunk.requestPath, chunk);
	selectedLocaleAssets[name] = {
		localeChunks: [...chunksByLocale.values()],
		uniqueLocaleChunkFiles: [...uniqueFiles.values()],
		encodedBodyBytes: [...uniqueFiles.values()].reduce((sum, entry) => sum + entry.encodedBodyBytes, 0),
	};
}

const percentReduction = (left, right) => Number(((left - right) / left * 100).toFixed(3));
const staticBytes = Object.fromEntries(Object.entries(traceGroups).map(([name, value]) => [name, value.staticShippedAssets.encodedBodyBytes]));
const report = {
	createdAt: new Date().toISOString(),
	method: "Recomputed from frozen Playwright resource traces. Static shipped assets include /_app/, /assets/, and /static/ resources; document HTML, mocked /api/config, and the harness's /ws/socket.io response are excluded. Full-route totals remain in parallel. All bytes use Brotli Q4 local server encoding from the original traces.",
	controls: traceGroups,
	selectedLocaleMessagePayload: selectedLocaleAssets,
	staticAssetReductionPercent: {
		nativeFullToNativeScoped: percentReduction(staticBytes.nativeFull, staticBytes.nativeScoped),
		nativeScopedToParaglideSplit: percentReduction(staticBytes.nativeScoped, staticBytes.paraglideSplit),
		nativeFullToParaglideSplit: percentReduction(staticBytes.nativeFull, staticBytes.paraglideSplit),
		paraglideDefaultToParaglideSplit: percentReduction(staticBytes.paraglideDefault, staticBytes.paraglideSplit),
	},
	interpretation: "The original full-native→split comparison combines auth-route catalog scoping and compiler/runtime integration. Against the same manually scoped 106-key native catalog, the measured split route is below the strict 10% byte threshold. The default-vs-split result is a single graph diagnostic, not a performance sample. Socket polling is served the SPA index fallback; an extra polling request adds an extra copy of the 2.8 KB HTML body and is excluded from static-asset attribution.",
};
const outputFile = path.join(resultDir, "openwebui-route-asset-attribution.json");
await fs.writeFile(outputFile, `${JSON.stringify(report, null, 2)}\n`);
console.log(JSON.stringify({ outputFile, staticAssetReductionPercent: report.staticAssetReductionPercent, staticShippedAssets: Object.fromEntries(Object.entries(traceGroups).map(([key, value]) => [key, value.staticShippedAssets])), selectedLocaleMessagePayload: Object.fromEntries(Object.entries(selectedLocaleAssets).map(([key, value]) => [key, value.encodedBodyBytes])) }, null, 2));
