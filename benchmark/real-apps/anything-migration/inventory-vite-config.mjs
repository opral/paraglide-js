import fs from "node:fs/promises";
import path from "node:path";
import { pathToFileURL } from "node:url";

const baseConfigPath = process.env.ANYTHING_BASE_CONFIG;
const reportPath = process.env.ANYTHING_MODULE_REPORT;
if (!baseConfigPath || !reportPath)
	throw new Error("Set ANYTHING_BASE_CONFIG and ANYTHING_MODULE_REPORT");

function isChunk(item) {
	return (
		item &&
		item.type === "chunk" &&
		item.modules &&
		typeof item.fileName === "string"
	);
}

const inventoryPlugin = {
	name: "anything-main-chunk-module-inventory",
	async generateBundle(_options, bundle) {
		const chunks = Object.values(bundle)
			.filter(isChunk)
			.map((chunk) => ({
				fileName: chunk.fileName,
				name: chunk.name,
				isEntry: chunk.isEntry,
				isDynamicEntry: chunk.isDynamicEntry,
				facadeModuleId: chunk.facadeModuleId,
				codeBytes: Buffer.byteLength(chunk.code),
				modules: Object.entries(chunk.modules)
					.map(([id, info]) => ({
						id,
						renderedLength: info.renderedLength,
						originalLength: info.originalLength,
						removedExports: info.removedExports,
					}))
					.sort((a, b) => b.renderedLength - a.renderedLength),
			}));
		const main =
			chunks.find((chunk) => chunk.isEntry && chunk.fileName === "index.js") ??
			chunks.find((chunk) => chunk.isEntry);
		const report = {
			baseConfig: baseConfigPath,
			mainChunk: main?.fileName,
			mainChunkBytes: main?.codeBytes,
			chunks,
			mainModules: main?.modules ?? [],
		};
		await fs.mkdir(path.dirname(reportPath), { recursive: true });
		await fs.writeFile(reportPath, JSON.stringify(report, null, 2));
	},
};

export default async (env) => {
	const imported = await import(pathToFileURL(baseConfigPath).href);
	const config =
		typeof imported.default === "function"
			? await imported.default(env)
			: imported.default;
	return {
		...config,
		plugins: [
			...(config.plugins ?? []).filter(
				(plugin) => plugin?.name !== "visualizer"
			),
			inventoryPlugin,
		],
	};
};
