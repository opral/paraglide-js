import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { gzipSync } from "node:zlib";
import { createServer, build, version as viteVersion } from "vite";
import {
	fixture,
	variants,
	generate,
	transport,
	publish,
	virtualMessages,
	crawl,
} from "./prototype.mjs";

const args = process.argv.slice(2);
const option = (name, fallback) =>
	args.find((arg) => arg.startsWith(`--${name}=`))?.split("=")[1] ?? fallback;
const sizes = option("sizes", "1000,6400,20000").split(",").map(Number);
const rounds = Number(option("rounds", "3"));
const shape = option("shape", "plain");
const selected = option(
	"variants",
	variants.map((v) => v.name).join(",")
).split(",");
const destination = path.resolve(
	option("output", "/tmp/paraglide-message-delivery-results.json")
);

if (
	sizes.some((count) => !Number.isSafeInteger(count) || count < 1) ||
	!Number.isSafeInteger(rounds) ||
	rounds < 1
) {
	throw new Error("sizes and rounds must be positive safe integers");
}
if (!["plain", "mixed"].includes(shape))
	throw new Error("shape must be plain or mixed");
if (
	!selected.length ||
	selected.some((name) => !variants.some((variant) => variant.name === name))
) {
	throw new Error("variants must name supported scenarios");
}
const results = [];
const root = await fs.realpath(
	await fs.mkdtemp(path.join(os.tmpdir(), "paraglide-message-delivery-"))
);
const timed = async (operation) => {
	const start = performance.now();
	const value = await operation();
	return { ms: performance.now() - start, value };
};
const countFiles = (files) => ({
	total: Object.keys(files).length,
	js: Object.keys(files).filter((name) => name.endsWith(".js")).length,
	declarations: Object.keys(files).filter((name) => name.endsWith(".d.ts"))
		.length,
	bytes: Object.values(files).reduce(
		(sum, code) => sum + Buffer.byteLength(code),
		0
	),
});
function entry(count, fraction = 0) {
	const used = fraction ? Math.max(1, Math.floor(count * fraction)) : 1;
	return `import { m } from './paraglide/messages.js';\nexport const result = [${Array.from({ length: used }, (_, i) => `m.message_${i}({name:'Ada',count:2})`).join(",")}];\n`;
}
const config = (directory, plugin) => ({
	configFile: false,
	root: directory,
	logLevel: "silent",
	plugins: plugin ? [plugin] : [],
	cacheDir: path.join(directory, ".vite"),
	optimizeDeps: { noDiscovery: true, include: [] },
	server: { watch: null, preTransformRequests: false },
});
async function bundle(directory, plugin, filename) {
	const built = await build({
		...config(directory, plugin),
		build: {
			write: false,
			minify: true,
			target: "es2022",
			reportCompressedSize: false,
			rolldownOptions: {
				preserveEntrySignatures: "strict",
				input: path.join(directory, "src", filename),
				output: { format: "es", entryFileNames: "entry.mjs" },
			},
		},
	});
	const outputs = (Array.isArray(built) ? built : [built]).flatMap(
		(result) => result.output
	);
	const chunks = outputs.filter((output) => output.type === "chunk");
	const code = chunks.map((chunk) => chunk.code).join("\n");
	// Execution checks are separate from timing: minifier output must still run.
	return {
		bytes: Buffer.byteLength(code),
		gzipBytes: gzipSync(code).byteLength,
		code,
	};
}
try {
	// One unreported compiler warmup; all scenarios then use the same process.
	await generate(fixture(16), variants[0]);
	for (const count of sizes) {
		const catalog = fixture(count, ["en", "de", "fr"], shape);
		const changedCatalog = { ...catalog, bundles: [...catalog.bundles] };
		changedCatalog.bundles[0] = structuredClone(catalog.bundles[0]);
		changedCatalog.bundles[0].messages[0].variants[0].pattern[0].value =
			"EDITED ";
		for (let round = 0; round < rounds; round++) {
			// Rotate scenario order between rounds to reduce systematic warmup bias.
			const scenarios = variants.filter((variant) =>
				selected.includes(variant.name)
			);
			const order = [
				...scenarios.slice(round % scenarios.length),
				...scenarios.slice(0, round % scenarios.length),
			];
			for (const variant of order) {
				const directory = path.join(root, `${count}-${round}-${variant.name}`);
				const outdir = path.join(directory, "src/paraglide");
				await fs.mkdir(path.join(directory, "src"), { recursive: true });
				await fs.writeFile(
					path.join(directory, "package.json"),
					'{"type":"module"}'
				);
				await fs.writeFile(path.join(directory, "src/entry.js"), entry(count));
				await fs.writeFile(
					path.join(directory, "src/many.js"),
					entry(count, 0.1)
				);
				const generated = await timed(() => generate(catalog, variant));
				const prepared = await timed(async () =>
					transport(generated.value.output, variant)
				);
				const files = prepared.value;
				const written = await timed(() => publish(outdir, files.disk));
				const plugin = variant.virtual
					? virtualMessages(outdir, files.virtual)
					: undefined;
				const started = await timed(() =>
					createServer(config(directory, plugin))
				);
				const server = started.value;
				let dev, edit;
				try {
					dev = await timed(() => crawl(server));
					const warm = await timed(() => crawl(server));
					const unchanged = await timed(() =>
						generate(catalog, variant, generated.value, catalog)
					);
					const next = await timed(() =>
						generate(changedCatalog, variant, generated.value, catalog)
					);
					const nextPrepared = await timed(async () =>
						transport(next.value.output, variant)
					);
					const editedWrite = await timed(async () => {
						await publish(outdir, nextPrepared.value.disk, written.value);
						if (plugin) plugin.api.update(nextPrepared.value.virtual);
					});
					// Both transports request fresh transformed modules after an edit.
					// File watcher scheduling is excluded from this controlled measurement.
					server.moduleGraph.invalidateAll();
					const updated = await timed(() => crawl(server));
					edit = {
						noOpCompileMs: unchanged.ms,
						compileMs: next.ms,
						prepareMs: nextPrepared.ms,
						writeAndInvalidateMs: editedWrite.ms,
						graphMs: updated.ms,
						warmGraphMs: warm.ms,
					};
				} finally {
					await server.close();
				}
				// Restore cold contents for production build comparisons.
				await publish(outdir, files.disk);
				if (plugin) plugin.api.update(files.virtual);
				const one = await timed(() => bundle(directory, plugin, "entry.js"));
				const many = await timed(() => bundle(directory, plugin, "many.js"));
				for (const [name, result, expectedLength] of [
					["one", one.value, 1],
					["many", many.value, Math.max(1, Math.floor(count * 0.1))],
				]) {
					if (
						[...result.code.matchAll(/_SENTINEL_(\d+)_/g)].some(
							(match) => Number(match[1]) >= expectedLength
						)
					)
						throw new Error(
							`${variant.name}: unused message retained in ${name}`
						);
					const modulePath = path.join(directory, `${name}.mjs`);
					await fs.writeFile(modulePath, result.code);
					const actual = await import(pathToFileURL(modulePath).href);
					if (
						actual.result?.length !== expectedLength ||
						actual.result[0] !== "en_SENTINEL_0_ Ada"
					)
						throw new Error(
							`${variant.name}: incorrect ${name} bundle: ${JSON.stringify(actual)}`
						);
				}
				const record = {
					count,
					shape,
					round,
					variant: variant.name,
					generateMs: generated.ms,
					prepareMs: prepared.ms,
					writeMs: written.ms,
					disk: countFiles(files.disk),
					virtual: countFiles(files.virtual),
					serverStartMs: started.ms,
					devGraphMs: dev.ms,
					dev: dev.value,
					edit,
					buildOneMs: one.ms,
					bundleOneBytes: one.value.bytes,
					bundleOneGzipBytes: one.value.gzipBytes,
					buildManyMs: many.ms,
					bundleManyBytes: many.value.bytes,
					bundleManyGzipBytes: many.value.gzipBytes,
				};
				results.push(record);
				console.log(JSON.stringify(record));
				await fs.writeFile(
					destination,
					JSON.stringify(
						{
							metadata: {
								node: process.version,
								vite: viteVersion,
								platform: process.platform,
								arch: process.arch,
								cpus: os.cpus()[0]?.model,
								sizes,
								rounds,
								shape,
								locales: catalog.settings.locales,
								note: "Same-process medians; cold means new Vite graph/output directory, not OS cache eviction. SDK loading, browser network, watcher delivery, declaration checking, and memory excluded.",
							},
							results,
						},
						null,
						2
					) + "\n"
				);
				await fs.rm(directory, { recursive: true, force: true });
			}
		}
	}
} finally {
	await fs.rm(root, { recursive: true, force: true });
}
console.log(`Saved ${destination}`);
