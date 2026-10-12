#!/usr/bin/env node
import fs from "node:fs";
import { createHash } from "node:crypto";

const [scopedPath, mergedPath, bucketPath, ownerManifestPath, mergedManifestPath, bucketManifestPath, outputPath] = process.argv.slice(2);
if (![scopedPath, mergedPath, bucketPath, ownerManifestPath, mergedManifestPath, bucketManifestPath, outputPath].every(Boolean)) {
	console.error("Usage: node summarize-stirling-route-scope.mjs <consumer-scope-10pair.json> <two-pass-merged-smoke.json> <two-pass-bucket8-smoke.json> <owner-manifest.json> <merged-manifest.json> <bucket8-manifest.json> <output.json>");
	process.exit(2);
}

const readJson = (file) => JSON.parse(fs.readFileSync(file, "utf8"));
const sha256 = (file) => createHash("sha256").update(fs.readFileSync(file)).digest("hex");
const compactResult = (result) => ({
	label: result.label,
	median: result.median,
	runs: result.runs.map(({ trial, locale, fcpMs, lcpMs, longTaskMs, resourceCount, transferBytes, encodedBytes, decodedBytes, frenchUiParity, parityWaitError }) => ({
		trial, locale, fcpMs, lcpMs, longTaskMs, resourceCount, transferBytes, encodedBytes, decodedBytes, frenchUiParity, parityWaitError,
	})),
});
const compactManifest = (file) => {
	const manifest = readJson(file);
	const reachableIndices = new Set(manifest.groups.flatMap((group) => group.indices));
	return {
		locales: manifest.locales.length,
		entryCount: manifest.entryCount,
		graphModuleCount: manifest.graphModuleCount,
		consumerCount: manifest.consumerCount,
		unsafeConsumerCount: manifest.unsafeConsumerCount,
		reachableKeyCount: reachableIndices.size,
		groups: manifest.groups.map((group) => ({
			key: group.key,
			ownerCount: group.owners.length,
			moduleCount: group.modules.length,
			keyCount: group.indices.length,
		})),
		routePromotion: manifest.routePromotion,
	};
};

const scoped = readJson(scopedPath);
const merged = readJson(mergedPath);
const bucket8 = readJson(bucketPath);
const output = {
	app: scoped.app,
	sourceCommit: scoped.sourceCommit,
	i18nextVersion: scoped.i18nextVersion,
	compilerCommit: scoped.compilerCommit,
	measurementMethod: scoped.method,
	inputs: Object.fromEntries([
		["consumerScope10Pair", scopedPath],
		["twoPassMergedSmoke", mergedPath],
		["twoPassBucket8Smoke", bucketPath],
		["ownerManifest", ownerManifestPath],
		["mergedManifest", mergedManifestPath],
		["bucket8Manifest", bucketManifestPath],
	].map(([label, file]) => [label, { file: file.split(/[\\/]/).at(-1), sha256: sha256(file) }])),
	consumerScope10Pair: {
		results: scoped.results.map(compactResult),
	},
	twoPassDiagnosticSmokes: {
		measurementMethod: merged.method,
		mergedInitial: merged.results.map(compactResult),
		bucket8: bucket8.results.map(compactResult),
	},
	manifests: {
		ownerSets: compactManifest(ownerManifestPath),
		mergedInitial: compactManifest(mergedManifestPath),
		bucket8: compactManifest(bucketManifestPath),
	},
};
fs.writeFileSync(outputPath, `${JSON.stringify(output, null, 2)}\n`);
console.log(`Wrote ${outputPath}`);
