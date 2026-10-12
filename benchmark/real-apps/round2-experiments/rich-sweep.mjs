import fs from "node:fs/promises";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { createHash } from "node:crypto";
import { gzipSync, brotliCompressSync, constants } from "node:zlib";
import { parse } from "acorn";
import MagicString from "magic-string";
import { packDispatchMatrixChunk } from "../../../dist/bundler-plugins/dispatch-matrix-packer.js";
const repo = process.cwd(),
	generated = path.resolve(
		".real-apps/round2/anything-migration/frontend/src/paraglide"
	);
const bundles = JSON.parse(
	await fs.readFile(".real-apps/round2/anything-migration/bundles.json", "utf8")
);
const rich = bundles
	.filter((b) =>
		b.messages.some((m) =>
			m.variants.some((v) => v.pattern.some((p) => p.type.startsWith("markup")))
		)
	)
	.map((b) => b.id);
const formatted = bundles
	.filter((b) =>
		b.messages.some((m) =>
			m.variants.some((v) => v.pattern.some((p) => p.type === "expression"))
		)
	)
	.map((b) => b.id);
const all = bundles.map((b) => b.id);
const scopes = {
	rich,
	formatted,
	mixed: [...new Set([...rich, ...formatted, ...all.slice(0, 160)])],
};
const inputs = Object.fromEntries(
	bundles.flatMap((b) =>
		b.declarations
			.filter((d) => d.type === "input-variable")
			.map((d) => [d.name, d.name === "count" ? 2 : "Ada"])
	)
);
const versions = {
	vite8: "./node_modules/vite/dist/node/index.js",
	vite6: "./benchmark/node_modules/vite/dist/node/index.js",
};
const modes = [
	"baseline",
	"text-factory",
	"tag-factory",
	"all-factories",
	"tuple-expand",
	"numeric-tuple-expand",
];
const helper = `export const text=value=>({type:'text',value}); export const tag=(type,name,options,attributes)=>({type,name,options,attributes}); export const expand=rows=>rows.map(p=>p.length===1?text(p[0]):tag(p[0],p[1],p[2],p[3])); export const numeric=rows=>rows.map(p=>p[0]===0?text(p[1]):tag(['','markup-start','markup-end','markup-standalone'][p[0]],p[1],p[2],p[3]));`;
function walk(n, f) {
	if (!n || typeof n !== "object") return;
	if (n.type) f(n);
	for (const v of Object.values(n)) {
		if (Array.isArray(v)) v.forEach((x) => walk(x, f));
		else if (v && typeof v === "object") walk(v, f);
	}
}
function transform(code, mode) {
	if (mode === "baseline") return code;
	const ast = parse(code, { ecmaVersion: "latest", sourceType: "module" }),
		s = new MagicString(code);
	let edits = 0;
	const cut = (n) => code.slice(n.start, n.end);
	const fields = (n) =>
		n.type === "ObjectExpression"
			? Object.fromEntries(
					n.properties
						.filter(
							(p) => p.type === "Property" && !p.computed && p.kind === "init"
						)
						.map((p) => [p.key.name ?? p.key.value, p.value])
				)
			: {};
	walk(ast, (n) => {
		if (["tuple-expand", "numeric-tuple-expand"].includes(mode)) {
			if (n.type !== "ArrayExpression" || !n.elements.length) return;
			const parts = n.elements.map(fields);
			if (
				!parts.every(
					(p) =>
						p.type?.type === "Literal" &&
						[
							"text",
							"markup-start",
							"markup-end",
							"markup-standalone",
						].includes(p.type.value)
				)
			)
				return;
			const numeric = mode === "numeric-tuple-expand";
			const rows = parts.map((p) =>
				p.type.value === "text"
					? numeric
						? `[0,${cut(p.value)}]`
						: `[${cut(p.value)}]`
					: `[${numeric ? ["", "markup-start", "markup-end", "markup-standalone"].indexOf(p.type.value) : cut(p.type)},${cut(p.name)},${cut(p.options)},${cut(p.attributes)}]`
			);
			s.overwrite(
				n.start,
				n.end,
				`${numeric ? "__numeric" : "__expand"}([${rows.join(",")}])`
			);
			edits++;
			return;
		}
		const p = fields(n);
		if (p.type?.type !== "Literal") return;
		if (
			p.type.value === "text" &&
			p.value &&
			["text-factory", "all-factories"].includes(mode)
		) {
			s.overwrite(n.start, n.end, `__text(${cut(p.value)})`);
			edits++;
		} else if (
			["markup-start", "markup-end", "markup-standalone"].includes(
				p.type.value
			) &&
			p.name &&
			p.options &&
			p.attributes &&
			["tag-factory", "all-factories"].includes(mode)
		) {
			s.overwrite(
				n.start,
				n.end,
				`__tag(${cut(p.type)},${cut(p.name)},${cut(p.options)},${cut(p.attributes)})`
			);
			edits++;
		}
	});
	return edits
		? `import {text as __text,tag as __tag,expand as __expand,numeric as __numeric} from '../rich-helpers.js';\n${s}`
		: code;
}
const results = [];
for (const [version, module] of Object.entries(versions)) {
	const { build } = await import(pathToFileURL(path.resolve(module)));
	for (const [scope, ids] of Object.entries(scopes)) {
		let reference;
		for (const mode of modes) {
			const dir = path.resolve(
				".real-apps/round2/experiments/sweep",
				version,
				scope,
				mode
			);
			await fs.mkdir(dir, { recursive: true });
			await fs.cp(generated, path.join(dir, "pg"), { recursive: true });
			await fs.writeFile(path.join(dir, "pg/rich-helpers.js"), helper);
			for (const file of await fs.readdir(path.join(dir, "pg/messages"))) {
				if (!file.endsWith(".js")) continue;
				const p = path.join(dir, "pg/messages", file);
				await fs.writeFile(p, transform(await fs.readFile(p, "utf8"), mode));
			}
			await fs.writeFile(
				path.join(dir, "entry.js"),
				`import * as m from './pg/messages.js';const messages=[${ids.map((id) => `m.${id}`).join(",")}];export const check=(locale,inputs)=>messages.map(f=>({text:f(inputs,{locale}),parts:f.parts?.(inputs,{locale})}));`
			);
			await build({
				configFile: false,
				logLevel: "silent",
				root: dir,
				plugins: [
					{
						name: "actual-dispatch-pass",
						renderChunk: {
							order: "pre",
							handler: (code) => packDispatchMatrixChunk(code),
						},
					},
				],
				build: {
					target: "esnext",
					minify: true,
					rollupOptions: {
						input: path.join(dir, "entry.js"),
						preserveEntrySignatures: "strict",
						output: { entryFileNames: "entry.mjs" },
					},
				},
			});
			const file = path.join(dir, "dist/entry.mjs"),
				code = await fs.readFile(file);
			const compiled = await import(pathToFileURL(file));
			const outputs = JSON.stringify(
				["en", "fr", "zh", "unknown"].map((l) => compiled.check(l, inputs))
			);
			if (mode === "baseline") reference = outputs;
			else if (outputs !== reference)
				throw Error(`Parity failure ${version}/${scope}/${mode}`);
			const r = {
				version,
				scope,
				mode,
				keys: ids.length,
				raw: code.length,
				gzip: gzipSync(code).length,
				brotliQ4: brotliCompressSync(code, {
					params: { [constants.BROTLI_PARAM_QUALITY]: 4 },
				}).length,
				brotliQ11: brotliCompressSync(code).length,
				sha256: createHash("sha256").update(code).digest("hex"),
				parity: true,
			};
			results.push(r);
			await fs.writeFile(
				".real-apps/round2/experiments/rich-sweep-results.json",
				JSON.stringify(results, null, 2)
			);
			console.log(JSON.stringify(r));
		}
	}
}
