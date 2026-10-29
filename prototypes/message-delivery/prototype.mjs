import fs from "node:fs/promises";
import path from "node:path";
import ts from "typescript";
import { generateCatalog } from "../../dist/compiler/incremental-output.js";
import { writeOutput } from "../../dist/services/file-handling/write-output.js";

export const variants = [
	{ name: "disk-message", size: 1 },
	{ name: "disk-group-16", size: 16 },
	{ name: "disk-group-64", size: 64 },
	{ name: "disk-group-256", size: 256 },
	{ name: "disk-locale", size: 1, layout: "locale-modules" },
	{ name: "virtual-message", size: 1, virtual: true },
	{ name: "virtual-message-types-64", size: 1, virtual: true, typeGroup: 64 },
	{ name: "virtual-group-64", size: 64, virtual: true },
];

export function fixture(count, locales = ["en", "de", "fr"], shape = "plain") {
	const catalog = {
		settings: { baseLocale: "en", locales, modules: [] },
		bundles: Array.from({ length: count }, (_, index) => {
			const id = `message_${index}`;
			return {
				id,
				declarations: [{ type: "input-variable", name: "name" }],
				messages: locales.map((locale) => ({
					id: `${id}_${locale}`,
					bundle_id: id,
					locale,
					selectors: [],
					variants: [
						{
							id: `${id}_${locale}_v`,
							message_id: `${id}_${locale}`,
							matches: [],
							pattern: [
								{ type: "text", value: `${locale}_SENTINEL_${index}_ ` },
								{
									type: "expression",
									arg: { type: "variable-reference", name: "name" },
								},
							],
						},
					],
				})),
			};
		}),
	};
	if (shape === "mixed") {
		for (const [index, bundle] of catalog.bundles.entries()) {
			if (index % 4 === 1) {
				bundle.declarations = [];
				for (const message of bundle.messages)
					message.variants[0].pattern.pop();
			} else if (index % 4 === 2) {
				for (const message of bundle.messages) {
					message.variants[0].pattern.unshift({
						type: "markup-start",
						name: "strong",
						options: [],
						attributes: [],
					});
					message.variants[0].pattern.push({
						type: "markup-end",
						name: "strong",
						options: [],
						attributes: [],
					});
				}
			} else if (index % 4 === 3) {
				bundle.declarations = [
					{ type: "input-variable", name: "count" },
					{
						type: "local-variable",
						name: "category",
						value: {
							type: "expression",
							arg: { type: "variable-reference", name: "count" },
							annotation: {
								type: "function-reference",
								name: "plural",
								options: [],
							},
						},
					},
				];
				for (const message of bundle.messages) {
					message.selectors = [
						{ type: "variable-reference", name: "category" },
					];
					const variant = message.variants[0];
					variant.pattern[1].arg.name = "count";
					variant.matches = [{ type: "catchall-match", key: "category" }];
					message.variants.unshift({
						...structuredClone(variant),
						id: variant.id + "_one",
						matches: [{ type: "literal-match", key: "category", value: "one" }],
					});
				}
			}
		}
	}
	return catalog;
}

// Keep all public declaration signatures, changing only their file grouping.
// Deep imports into individual message modules are intentionally unsupported
// in this prototype mode; consumers keep importing messages.js.
export function groupDeclarations(output, size) {
	const result = Object.fromEntries(
		Object.entries(output).filter(
			([name]) => !name.startsWith("messages/") || !name.endsWith(".d.ts")
		)
	);
	const files = Object.entries(output).filter(
		([name]) =>
			name.startsWith("messages/") &&
			name.endsWith(".d.ts") &&
			name !== "messages/_index.d.ts"
	);
	const localizedString =
		'export type LocalizedString = import("../runtime.js").LocalizedString;';
	const names = [];
	for (let start = 0; start < files.length; start += size) {
		const name = `_types_${names.length}`;
		names.push(name);
		result[`messages/${name}.d.ts`] =
			localizedString +
			"\n" +
			files
				.slice(start, start + size)
				.map(([, code]) => code.replace(localizedString, ""))
				.join("\n");
	}
	result["messages/_index.d.ts"] = names
		.map((name) => `export * from './${name}.js';`)
		.join("\n");
	return result;
}

export async function generate(catalog, variant, previous, previousCatalog) {
	const options = {
		project: "/prototype/project.inlang",
		outdir: "/prototype/output",
		outputStructure: variant.layout ?? "message-modules",
		messageModuleSize: variant.size,
		emitTsDeclarations: true,
		emitGitIgnore: false,
		emitPrettierIgnore: false,
		emitReadme: false,
		includeEslintDisableComment: false,
		strategy: ["baseLocale"],
	};
	const changed = catalog.bundles.filter(
		(bundle, index) => bundle !== previousCatalog?.bundles[index]
	);
	return generateCatalog({
		catalog,
		options,
		previous,
		previousCatalog,
		update: previous
			? {
					type: "update",
					bundles: changed,
					removedBundleIds: [],
					diagnostics: [],
				}
			: { type: "reset", ...catalog, diagnostics: [] },
	});
}

export function transport(output, variant) {
	const files = variant.typeGroup
		? groupDeclarations(output, variant.typeGroup)
		: output;
	const disk = {},
		virtual = {};
	for (const [name, code] of Object.entries(files)) {
		if (variant.virtual && name.startsWith("messages/") && name.endsWith(".js"))
			virtual[name] = code;
		else disk[name] = code;
	}
	return { disk, virtual };
}

export async function publish(directory, files, previous) {
	return writeOutput({
		directory,
		output: files,
		fs,
		cleanDirectory: false,
		previousOutputHashes: previous,
	});
}

// Normal facade/runtime imports remain on disk. Only message implementations
// use Vite's \0 virtual IDs. Relative imports must resolve in the original
// generated directory, not relative to the artificial virtual namespace.
export function virtualMessages(directory, initial) {
	const prefix = "\0paraglide-prototype:" + directory + ":";
	let files = initial;
	let server;
	const virtualName = (id) =>
		id?.startsWith(prefix) ? id.slice(prefix.length) : undefined;
	const relativeName = (id) => {
		const absolute = path.resolve(id);
		const relative = path
			.relative(directory, absolute)
			.split(path.sep)
			.join("/");
		return relative.startsWith("../") ? undefined : relative;
	};
	return {
		name: "paraglide-message-delivery-prototype",
		enforce: "pre",
		configureServer(value) {
			server = value;
		},
		resolveId(source, importer) {
			const ownName = virtualName(source);
			if (ownName !== undefined)
				return Object.hasOwn(files, ownName) ? source : null;
			const parent = virtualName(importer);
			let absolute;
			if (source.startsWith(".")) {
				absolute = path.resolve(
					parent !== undefined
						? path.dirname(path.join(directory, parent))
						: path.dirname(importer ?? directory),
					source
				);
			} else if (path.isAbsolute(source)) absolute = source;
			else return null;
			const name = relativeName(absolute);
			if (name !== undefined && Object.hasOwn(files, name))
				return prefix + name;
			if (parent !== undefined && source.startsWith(".")) return absolute;
			return null;
		},
		load(id) {
			const name = virtualName(id);
			if (name !== undefined && Object.hasOwn(files, name))
				return { code: files[name], map: null, moduleSideEffects: false };
			return null;
		},
		api: {
			// Explicit updates isolate transport costs from SDK loading/watching.
			// A production plugin must connect this to its existing compile queue.
			update(next) {
				const changed = [
					...new Set([...Object.keys(files), ...Object.keys(next)]),
				].filter((name) => files[name] !== next[name]);
				files = next;
				if (server) {
					// Invalidate every importer: re-export barrels must not keep stale
					// transformed bindings when a message's exports change.
					const seen = new Set();
					const invalidate = (module) => {
						if (!module || seen.has(module)) return;
						seen.add(module);
						for (const importer of module.importers) invalidate(importer);
						server.moduleGraph.invalidateModule(module);
					};
					for (const name of changed)
						invalidate(server.moduleGraph.getModuleById(prefix + name));
					if (changed.length) server.ws.send({ type: "full-reload" });
				}
				return changed;
			},
		},
	};
}

export function imports(code) {
	const source = ts.createSourceFile(
		"module.js",
		code,
		ts.ScriptTarget.Latest,
		true,
		ts.ScriptKind.JS
	);
	return source.statements.flatMap((statement) =>
		(ts.isImportDeclaration(statement) || ts.isExportDeclaration(statement)) &&
		statement.moduleSpecifier &&
		ts.isStringLiteral(statement.moduleSpecifier)
			? [statement.moduleSpecifier.text]
			: []
	);
}

// This measures Vite's entire static dev graph, not just entry transform time.
// It is an in-process crawl, not a browser navigation/network benchmark.
export async function crawl(server, entry = "/src/entry.js") {
	const seen = new Set();
	let bytes = 0;
	let queue = [entry];
	while (queue.length) {
		const batch = queue.splice(0, 8).filter((url) => {
			if (seen.has(url)) return false;
			seen.add(url);
			return true;
		});
		await Promise.all(
			batch.map(async (url) => {
				const id = url.startsWith("/@id/")
					? url.slice(5).replace("__x00__", "\0")
					: url;
				const result = await server.transformRequest(id);
				if (!result) throw new Error(`Missing transform: ${url}`);
				bytes += Buffer.byteLength(result.code);
				for (const specifier of imports(result.code)) {
					if (specifier.startsWith("/")) queue.push(specifier);
					else if (specifier.startsWith("."))
						queue.push(new URL(specifier, "http://prototype" + url).pathname);
				}
			})
		);
	}
	return { modules: seen.size, bytes };
}
