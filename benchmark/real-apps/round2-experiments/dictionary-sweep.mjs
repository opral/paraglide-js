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
	{ minLength: Infinity, minFrequency: 2 },
	...[32, 128, 512, 2048].flatMap((minLength) =>
		[2, 4, 8].map((minFrequency) => ({ minLength, minFrequency }))
	),
];
const results = [];
for (const app of ["drawdb", "memos", "anything-llm"]) {
	const root = `${process.cwd()}/.real-apps/${app}/dispatch-matrix`;
	let reference;
	for (const config of variants) {
		const dir = path.resolve(
			".real-apps/round2/experiments/dictionary",
			app,
			`${config.minLength}-${config.minFrequency}`
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
							if (config.minLength === Infinity) return { code, map: null };
							const ast = parse(code, {
									ecmaVersion: "latest",
									sourceType: "module",
								}),
								found = new Map();
							walk(ast, (n) => {
								if (
									n.type !== "VariableDeclarator" ||
									!n.id.name?.startsWith("__paraglide_dispatch_matrix_") ||
									n.init?.type !== "ArrayExpression"
								)
									return;
								walk(n.init, (x) => {
									if (
										x.type !== "Literal" ||
										typeof x.value !== "string" ||
										x.value.length < config.minLength
									)
										return;
									const nodes = found.get(x.value) ?? [];
									nodes.push(x);
									found.set(x.value, nodes);
								});
							});
							const s = new MagicString(code),
								declarations = [];
							let i = 0;
							for (const [value, nodes] of found) {
								if (nodes.length < config.minFrequency) continue;
								const name = `__experiment_pool_${i++}`;
								declarations.push(`const ${name}=${JSON.stringify(value)};`);
								for (const n of nodes) s.overwrite(n.start, n.end, name);
								pooled += nodes.length;
							}
							s.prepend(declarations.join("\n") + "\n");
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
		if (config.minLength === Infinity) reference = valuesJSON;
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
			".real-apps/round2/experiments/dictionary-sweep-results.json",
			JSON.stringify(results, null, 2)
		);
		console.log(JSON.stringify(r));
	}
}
