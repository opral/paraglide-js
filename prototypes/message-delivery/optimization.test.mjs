import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { createServer, build } from "vite";
import { gzipSync } from "node:zlib";
import {
	optimizationPrototype,
	rewriteStaticMessages,
} from "./optimization-plugin.mjs";
import {
	fixture,
	generate,
	transport,
	publish,
	variants,
	virtualMessages,
} from "./prototype.mjs";
const params = {
	exports: new Set(["hello", "greeting.hello", "m", "class"]),
	publicPrefix: "virtual:test/",
	importSources: new Set(["./messages.js"]),
};
test("static rewrite handles aliases, quoted keys and named imports with a source map", () => {
	const source = `import {m as messages, hello as greet} from './messages.js'; const __pg_message_0=0; export const result=[messages.hello(),messages['greeting.hello'](),messages.m(),messages.class(),greet(),__pg_message_0];`;
	const result = rewriteStaticMessages(source, "entry.js", params);
	assert.ok(result);
	assert.equal(result.rewrites, 5);
	assert.ok(result.code.includes("virtual:test/messages/greeting_hello.js"));
	assert.ok(result.code.includes("as __pg_message_1"));
	assert.ok(result.map.mappings);
	assert.equal(result.map.sourcesContent[0], source);
});
for (const expression of [
	"m[key]()",
	"Object.keys(m)",
	"({...m})",
	"m.unknown",
	"(m.hello = other)",
	"delete m.hello",
	"m.hello++",
	"m?.hello()",
])
	test(`fallback preserves ${expression}`, () => {
		assert.equal(
			rewriteStaticMessages(
				`import {m} from './messages.js'; const key='hello'; export const value=${expression};`,
				"entry.js",
				params
			),
			null
		);
	});
test("shadowed bindings, escaped namespaces and unrelated imports are preserved", () => {
	for (const source of [
		`import {m} from './messages.js'; function f(m){return m.hello()} export const value=m.hello();`,
		`import {m} from './messages.js'; export {m};`,
		`import {m} from './unrelated.js'; export const value=m.hello();`,
		`import * as m from './messages.js'; export const value=m.hello();`,
	])
		assert.equal(rewriteStaticMessages(source, "entry.js", params), null);
});
const variant = variants.find((v) => v.singleTypes);
for (const mode of ["direct", "direct-indexed", "fused-64"])
	test(`${mode} preserves mixed messages, dynamic fallback, tree shaking and updates`, async () => {
		const directory = await fs.realpath(
			await fs.mkdtemp(path.join(os.tmpdir(), "paraglide-optimize-test-"))
		);
		let server;
		try {
			let catalog = fixture(130, ["en", "de", "fr"], "mixed");
			for (const [index, id] of [
				[0, "greeting.hello"],
				[1, "class"],
				[2, "m"],
			]) {
				catalog.bundles[index].id = id;
				for (const message of catalog.bundles[index].messages)
					message.bundle_id = id;
			}
			const files = transport(
				(await generate(catalog, variant)).output,
				variant
			);
			const outdir = path.join(directory, "src/paraglide");
			let hashes = await publish(outdir, files.disk);
			await fs.writeFile(
				path.join(directory, "package.json"),
				'{"type":"module"}'
			);
			const entry = `import {m} from './paraglide/messages.js'; export const result=[m['greeting.hello']({name:'Ada'},{locale:'de'}),m.class(),m.m.parts({name:'Ada'}),m.message_3({count:2})];`;
			await fs.writeFile(path.join(directory, "src/entry.js"), entry);
			await fs.writeFile(
				path.join(directory, "src/dynamic.js"),
				`import {m} from './paraglide/messages.js';const key='greeting.hello';export const value=m[key]({name:'Ada'});export const keys=Object.keys(m);`
			);
			const make = () => {
				const base = {
					...virtualMessages(outdir, files.virtual),
					name: "paraglide-virtual-messages",
				};
				const compiler = {
					name: "unplugin-paraglide-js",
					async watchChange() {
						const next = transport(
							(await generate(catalog, variant)).output,
							variant
						);
						hashes = await publish(outdir, next.disk, hashes);
						base.api.update(next.virtual);
					},
				};
				return {
					base,
					plugins: [optimizationPrototype({ outdir, mode }), base, compiler],
				};
			};
			const made = make();
			server = await createServer({
				root: directory,
				configFile: false,
				logLevel: "silent",
				plugins: made.plugins,
				optimizeDeps: { noDiscovery: true },
				server: { watch: null },
			});
			const actual = await server.ssrLoadModule("/src/entry.js");
			assert.equal(actual.result[0], "de_SENTINEL_0_ Ada");
			assert.ok(Array.isArray(actual.result[2]));
			const dynamic = await server.ssrLoadModule("/src/dynamic.js");
			assert.equal(dynamic.value, "en_SENTINEL_0_ Ada");
			assert.equal(dynamic.keys.length, 130);
			if (mode === "direct-indexed") {
				const stats = made.plugins[0].find((plugin) => plugin.api)?.api.stats;
				await server.pluginContainer.watchChange(
					path.join(directory, "messages.json"),
					{ event: "update" }
				);
				const before = stats.indexReads;
				for (let i = 0; i < 20; i++)
					await fs.writeFile(
						path.join(directory, `src/parallel_${i}.js`),
						`import {m} from './paraglide/messages.js';export const value=m.class();`
					);
				await Promise.all(
					Array.from({ length: 20 }, (_, i) =>
						server.transformRequest(`/src/parallel_${i}.js`)
					)
				);
				assert.equal(
					stats.indexReads - before,
					1,
					"Parallel consumers must share one declaration-index read"
				);
			}
			// Edit, add and remove exports in one publication, then re-evaluate consumers.
			catalog = structuredClone(catalog);
			catalog.bundles[0].messages[0].variants[0].pattern[0].value = "UPDATED ";
			catalog.bundles.pop();
			catalog.bundles.push(fixture(132).bundles[131]);
			await server.pluginContainer.watchChange(
				path.join(directory, "messages.json"),
				{ event: "update" }
			);
			const updated = await server.ssrLoadModule("/src/dynamic.js");
			assert.equal(updated.value, "UPDATED Ada");
			assert.ok(updated.keys.includes("message_131"));
			assert.ok(!updated.keys.includes("message_129"));
			await server.close();
			server = undefined;
			// Recreate the original fixture for a production bundle comparison.
			catalog = fixture(130, ["en", "de", "fr"], "mixed");
			const plain = transport(
				(await generate(catalog, variant)).output,
				variant
			);
			await publish(outdir, plain.disk, hashes);
			await fs.writeFile(
				path.join(directory, "src/entry.js"),
				`import {m} from './paraglide/messages.js';export const result=[m.message_0({name:'Ada'}),m.message_2.parts({name:'Ada'}),m.message_3({count:2})];`
			);
			const outputs = [];
			for (const optimize of [false, true]) {
				const base = {
					...virtualMessages(outdir, plain.virtual),
					name: "paraglide-virtual-messages",
				};
				const plugins = [
					...(optimize ? optimizationPrototype({ outdir, mode }) : []),
					base,
					{ name: "unplugin-paraglide-js" },
				];
				const result = await build({
					root: directory,
					configFile: false,
					logLevel: "silent",
					plugins,
					build: {
						write: false,
						target: "es2022",
						rolldownOptions: {
							input: path.join(directory, "src/entry.js"),
							preserveEntrySignatures: "strict",
						},
					},
				});
				const code = result.output
					.filter((chunk) => chunk.type === "chunk")
					.map((chunk) => chunk.code)
					.join("\n");
				assert.ok(!code.includes("_SENTINEL_129_"));
				const actual = await import(
					"data:text/javascript;base64," + Buffer.from(code).toString("base64")
				);
				outputs.push({ value: actual.result, gzip: gzipSync(code).length });
			}
			assert.deepEqual(outputs[1].value, outputs[0].value);
			if (mode.startsWith("direct"))
				assert.ok(
					outputs[1].gzip <= outputs[0].gzip + 20,
					JSON.stringify(outputs)
				);
		} finally {
			await server?.close();
			await fs.rm(directory, { recursive: true, force: true });
		}
	});
