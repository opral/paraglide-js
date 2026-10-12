import fs from "node:fs/promises";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { gzipSync, brotliCompressSync, constants } from "node:zlib";
import { parse } from "acorn";
import MagicString from "magic-string";
import { packDispatchMatrixChunk } from "../../../dist/bundler-plugins/dispatch-matrix-packer.js";
import { build } from "../../../node_modules/vite/dist/node/index.js";
const walk = (n, f) => {
	if (!n || typeof n !== "object") return;
	if (n.type) f(n);
	for (const v of Object.values(n)) {
		if (Array.isArray(v)) v.forEach((x) => walk(x, f));
		else if (v && typeof v === "object") walk(v, f);
	}
};
const variants = [
	"baseline",
	"json-rows",
	"delimiter-rows",
	"json-flat",
	"delimiter-flat",
].map((mode) => ({ mode }));
const results = [];
for (const app of ["drawdb", "memos", "anything-llm"]) {
	const root = `${process.cwd()}/.real-apps/${app}/dispatch-matrix`;
	let reference;
	for (const config of variants) {
		const dir = path.resolve(
			".real-apps/round2/experiments/serialization",
			app,
			config.mode
		);
		await fs.mkdir(dir, { recursive: true });
		let pooled = 0;
		await build({
			configFile: false,
			root,
			logLevel: "silent",
			plugins: [
				{
					name: "dictionary-experiment",
					renderChunk: {
						order: "pre",
						handler(code) {
							code = packDispatchMatrixChunk(code)?.code ?? code;
							if (config.mode === "baseline") return { code, map: null };
							const ast = parse(code, {
									ecmaVersion: "latest",
									sourceType: "module",
								}),
								s = new MagicString(code),
								matrices = new Map();
							walk(ast, (n) => {
								if (
									n.type !== "VariableDeclarator" ||
									!n.id.name?.startsWith("__paraglide_dispatch_matrix_") ||
									n.init?.type !== "ArrayExpression"
								)
									return;
								const rows = n.init.elements.map((row) =>
									row.elements.map((x) => x.value)
								);
								if (rows.some((row) => row.some((x) => typeof x !== "string")))
									throw Error("Nonstatic matrix");
								const flat = config.mode.endsWith("flat"),
									values = flat ? rows.flat() : rows;
								let expression;
								if (config.mode.startsWith("json"))
									expression = `JSON.parse(${JSON.stringify(JSON.stringify(values))})`;
								else {
									if (
										rows
											.flat()
											.some((x) => x.includes("\x1e") || x.includes("\x1f"))
									)
										throw Error("Delimiter collision");
									expression = flat
										? `${JSON.stringify(values.join("\x1e"))}.split('\x1e')`
										: `${JSON.stringify(rows.map((row) => row.join("\x1e")).join("\x1f"))}.split('\x1f').map(row=>row.split('\x1e'))`;
								}
								s.overwrite(n.init.start, n.init.end, expression);
								if (flat) matrices.set(n.id.name, rows[0].length);
								pooled += rows.length * rows[0].length;
							});
							if (matrices.size)
								walk(ast, (n) => {
									if (
										n.type !== "MemberExpression" ||
										n.object?.type !== "MemberExpression" ||
										n.object.object?.type !== "Identifier" ||
										!matrices.has(n.object.object.name)
									)
										return;
									const name = n.object.object.name,
										width = matrices.get(name);
									s.overwrite(
										n.start,
										n.end,
										`${name}[(${code.slice(n.object.property.start, n.object.property.end)})*${width}+(${code.slice(n.property.start, n.property.end)})]`
									);
								});
							return { code: s.toString(), map: null };
						},
					},
				},
			],
			build: {
				outDir: dir,
				emptyOutDir: true,
				target: "esnext",
				minify: true,
				rollupOptions: {
					input: path.join(root, "paraglide-entry.js"),
					preserveEntrySignatures: "strict",
					output: { entryFileNames: "entry.mjs" },
				},
			},
		});
		const bytes = await fs.readFile(path.join(dir, "entry.mjs"));
		const mod = await import(pathToFileURL(path.join(dir, "entry.mjs")));
		const catalogs = JSON.parse(
			await fs.readFile(path.join(root, "catalogs.json"), "utf8")
		);
		const inputs = JSON.parse(
			await fs.readFile(path.join(root, "inputs.json"), "utf8")
		);
		const excluded = new Set(
			JSON.parse(
				await fs.readFile(path.join(root, "results.json"), "utf8")
			).excluded.map((x) => (typeof x === "string" ? x : x.key))
		);
		const mapping = JSON.parse(
			await fs.readFile(path.join(root, "mapping.json"), "utf8")
		);
		const values = [];
		for (const locale of Object.keys(catalogs)) {
			mod.setLocale(locale, { reload: false });
			for (const key of Object.keys(catalogs[locale]).filter(
				(k) => mapping[k] !== undefined && !excluded.has(k)
			))
				values.push(mod.translate(key, inputs));
		}
		const valuesJSON = JSON.stringify(values);
		if (config.mode === "baseline") reference = valuesJSON;
		else if (valuesJSON !== reference) throw Error(`Parity ${app}`);
		const r = {
			app,
			...config,
			pooled,
			raw: bytes.length,
			gzip: gzipSync(bytes).length,
			brotliQ4: brotliCompressSync(bytes, {
				params: { [constants.BROTLI_PARAM_QUALITY]: 4 },
			}).length,
			parityChecks: values.length,
		};
		results.push(r);
		await fs.writeFile(
			".real-apps/round2/experiments/serialization-sweep-results.json",
			JSON.stringify(results, null, 2)
		);
		console.log(JSON.stringify(r));
	}
}
