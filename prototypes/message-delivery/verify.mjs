import { test } from "node:test";
import ts from "typescript";
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { createRequire } from "node:module";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { createServer } from "vite";
import {
	fixture,
	generate,
	transport,
	publish,
	virtualMessages,
	variants,
	crawl,
} from "./prototype.mjs";

async function workspace(operation) {
	const directory = await fs.realpath(
		await fs.mkdtemp(path.join(os.tmpdir(), "paraglide-virtual-test-"))
	);
	try {
		return await operation(directory);
	} finally {
		await fs.rm(directory, { recursive: true, force: true });
	}
}

for (const mode of ["virtual-message", "virtual-message-single-types"]) {
	test(`${mode}: executes SSR and invalidates changed, added and removed exports`, async () => {
		await workspace(async (directory) => {
			const catalog = fixture(8);
			// Exercise a relative registry import from a virtual message to a disk file.
			catalog.bundles[1].messages[0].variants[0].pattern = [
				{
					type: "expression",
					arg: { type: "variable-reference", name: "name" },
					annotation: {
						type: "function-reference",
						name: "number",
						options: [],
					},
				},
			];
			const variant = variants.find((variant) => variant.name === mode);
			const generated = await generate(catalog, variant);
			const files = transport(generated.output, variant);
			const outdir = path.join(directory, "src/paraglide");
			let hashes = await publish(outdir, files.disk);
			await fs.writeFile(
				path.join(directory, "package.json"),
				'{"type":"module"}'
			);
			await fs.writeFile(
				path.join(directory, "src/entry.js"),
				'export { m } from "./paraglide/messages.js";'
			);
			assert.ok(files.disk["runtime.js"]);
			assert.ok(files.disk["server.js"]);
			assert.ok(files.disk["registry.js"]);
			assert.ok(files.disk["messages.d.ts"]);
			assert.equal(files.disk["messages/message_0.js"], undefined);
			const plugin = virtualMessages(outdir, files.virtual);
			const server = await createServer({
				root: directory,
				configFile: false,
				logLevel: "silent",
				plugins: [plugin],
				optimizeDeps: { noDiscovery: true },
				server: { watch: null, preTransformRequests: false },
			});
			const reloads = [];
			const send = server.ws.send;
			server.ws.send = (payload) => reloads.push(payload);
			try {
				assert.ok((await crawl(server)).modules >= 12);
				let module = await server.ssrLoadModule("/src/entry.js");
				assert.equal(module.m.message_0({ name: "Ada" }), "en_SENTINEL_0_ Ada");
				assert.equal(
					module.m.message_0({ name: "Ada" }, { locale: "de" }),
					"de_SENTINEL_0_ Ada"
				);
				assert.equal(module.m.message_1({ name: 123 }), "123");
				const next = structuredClone(catalog);
				next.bundles[0].messages[0].variants[0].pattern[0].value = "EDITED ";
				next.bundles.splice(7, 1);
				const added = fixture(9).bundles[8];
				next.bundles.push(added);
				// Full reset tests added/removed export surfaces, independently of the
				// incremental compiler implementation used in the timing harness.
				const nextGenerated = await generate(next, variant);
				const nextFiles = transport(nextGenerated.output, variant);
				hashes = await publish(outdir, nextFiles.disk, hashes);
				const changed = plugin.api.update(nextFiles.virtual);
				assert.ok(changed.includes("messages/_index.js"));
				module = await server.ssrLoadModule("/src/entry.js");
				assert.equal(module.m.message_0({ name: "Ada" }), "EDITED Ada");
				assert.equal(module.m.message_7, undefined);
				assert.equal(module.m.message_8({ name: "Ada" }), "en_SENTINEL_8_ Ada");
				assert.deepEqual(reloads, [{ type: "full-reload" }]);
				assert.deepEqual(plugin.api.update(nextFiles.virtual), []);
				assert.equal(reloads.length, 1);
				// A separate generated tree with identical relative paths is not captured.
				assert.equal(
					plugin.resolveId(
						"../other/messages/message_0.js",
						path.join(outdir, "messages.js")
					),
					null
				);
			} finally {
				server.ws.send = send;
				await server.close();
			}
		});
	});
}

for (const mode of [
	"virtual-message-types-64",
	"virtual-message-single-types",
]) {
	test(`${mode}: preserves quoted exports, markup, locale and input checking`, async () => {
		await workspace(async (directory) => {
			const catalog = fixture(130);
			catalog.bundles[0].id = "greeting.hello";
			for (const message of catalog.bundles[0].messages)
				message.bundle_id = "greeting.hello";
			for (const [index, id] of [
				[2, "class"],
				[3, "m"],
			]) {
				catalog.bundles[index].id = id;
				for (const message of catalog.bundles[index].messages)
					message.bundle_id = id;
			}
			for (const message of catalog.bundles[1].messages) {
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
			const variant = variants.find((variant) => variant.name === mode);
			const generated = await generate(catalog, variant);
			const files = transport(generated.output, variant);
			const outdir = path.join(directory, "paraglide");

			if (variant.singleTypes) {
				const previous = transport(
					generated.output,
					variants.find((item) => item.name === "virtual-message-types-64")
				);
				const hashes = await publish(outdir, previous.disk);
				await publish(outdir, files.disk, hashes);
				await assert.rejects(
					fs.access(path.join(outdir, "messages/_types_0.d.ts"))
				);
				await assert.rejects(fs.access(path.join(outdir, "messages.js")));
			} else await publish(outdir, files.disk);
			assert.equal(
				Object.keys(files.disk).filter(
					(name) => name.startsWith("messages/") && name.endsWith(".d.ts")
				).length,
				variant.singleTypes
					? 0
					: Math.ceil(catalog.bundles.length / variant.typeGroup) + 1
			);
			if (variant.singleTypes) {
				assert.equal(Object.keys(files.disk).length, 7);
				assert.equal(files.disk["messages.js"], undefined);
				assert.ok(files.virtual["messages.js"]);
				assert.equal(files.disk["messages/package.json"], undefined);
			}
			await fs.writeFile(
				path.join(directory, "package.json"),
				'{"type":"module"}'
			);
			await fs.writeFile(
				path.join(directory, "consumer.ts"),
				`
      import { m, "greeting.hello" as hello, "class" as reserved } from "./paraglide/messages.js";
      hello({ name: "Ada" }, { locale: "de" }) satisfies string;
      const inputs: m.Greeting_HelloInputs = { name: "Ada" };
      m["greeting.hello"](inputs);
      reserved({ name: "Ada" });
      m.class({ name: "Ada" });
      m.m({ name: "Ada" });
      // @ts-expect-error the m message is a function, not a recursive namespace
      m.m.m;
      m.message_1.parts({ name: "Ada" });
      // @ts-expect-error required inputs must remain checked
      hello();
      // @ts-expect-error locales must remain checked
      hello({ name: "Ada" }, { locale: "invalid" });
      // @ts-expect-error ordinary messages have no parts method
      m.message_4.parts({ name: "Ada" });
    `
			);
			await fs.writeFile(
				path.join(directory, "tsconfig.json"),
				JSON.stringify({
					compilerOptions: {
						strict: true,
						noEmit: true,
						module: "NodeNext",
						moduleResolution: "NodeNext",
						target: "ES2022",
						types: [],
						skipLibCheck: false,
					},
					files: ["consumer.ts"],
				})
			);
			const compiler = createRequire(import.meta.url).resolve(
				"typescript/bin/tsc"
			);
			try {
				await promisify(execFile)(
					process.execPath,
					[compiler, "-p", path.join(directory, "tsconfig.json")],
					{ env: { ...process.env, ELECTRON_RUN_AS_NODE: "1" } }
				);
			} catch (error) {
				throw new Error(error.stdout || error.message, { cause: error });
			}
		});
	});
}

test("virtual facade uses explicit virtual IDs and type-checks applications without suppression comments", async () => {
	await workspace(async (directory) => {
		const variant = variants.find((item) => item.singleTypes);
		const files = transport(
			(await generate(fixture(3), variant)).output,
			variant
		).disk;
		const outdir = path.join(directory, "paraglide");
		await publish(outdir, files);
		await fs.writeFile(
			path.join(directory, "package.json"),
			'{"type":"module"}'
		);
		await fs.writeFile(
			path.join(directory, "consumer.ts"),
			`
			import { m } from "./paraglide/messages.js";
			m.message_0({ name: "Ada" });
			// @ts-expect-error application types must still reject missing inputs
			m.message_0();
			// @ts-expect-error application types must still enforce the locale union
			m.message_0({ name: "Ada" }, { locale: "invalid" });
		`
		);
		await fs.writeFile(
			path.join(directory, "consumer.js"),
			`
			import { m } from "./paraglide/messages.js";
			m.message_1({ name: "Ada" });
			// @ts-expect-error JS consumers must remain typed with checkJs
			m.message_1();
		`
		);
		const nodeTypes = path.dirname(
			path.dirname(
				createRequire(import.meta.url).resolve("@types/node/package.json")
			)
		);
		const config = ts.parseJsonConfigFileContent(
			{
				compilerOptions: {
					strict: true,
					noEmit: true,
					allowJs: true,
					checkJs: true,
					module: "NodeNext",
					moduleResolution: "NodeNext",
					target: "ES2022",
					types: ["node"],
					typeRoots: [nodeTypes],
					skipLibCheck: false,
				},
				include: ["**/*.ts", "**/*.js"],
			},
			ts.sys,
			directory
		);
		assert.equal(
			config.fileNames.includes(path.join(outdir, "messages.js")),
			false
		);
		assert.ok(config.fileNames.includes(path.join(outdir, "messages.d.ts")));
		assert.ok(
			Object.values(files).every((code) => !/@ts-(?:nocheck|ignore)/.test(code))
		);
		const plugin = virtualMessages(
			outdir,
			transport((await generate(fixture(3), variant)).output, variant).virtual
		);
		const id = plugin.resolveId(
			"./paraglide/messages.js",
			path.join(directory, "consumer.js")
		);
		assert.ok(id.startsWith("\0virtual:paraglide/"));
		assert.match(plugin.load(id).code, /export \* from "virtual:paraglide\//);
		const diagnostics = ts.getPreEmitDiagnostics(
			ts.createProgram(config.fileNames, config.options)
		);
		assert.deepEqual(
			diagnostics.map((item) =>
				ts.flattenDiagnosticMessageText(item.messageText, " ")
			),
			[]
		);
		// Test consumer-only roots and whole-output inclusion independently.
		let checked = 0;
		for (const [module, moduleResolution] of [
			["Node16", "Node16"],
			["NodeNext", "NodeNext"],
			["ESNext", "Bundler"],
		])
			for (const [allowJs, checkJs] of [
				[false, false],
				[true, false],
				[true, true],
			])
				for (const skipLibCheck of [false, true])
					for (const wholeOutput of [false, true]) {
						const parsed = ts.parseJsonConfigFileContent(
							{
								compilerOptions: {
									...config.raw.compilerOptions,
									module,
									moduleResolution,
									allowJs,
									checkJs,
									skipLibCheck,
									noUnusedLocals: true,
									verbatimModuleSyntax: true,
									noUncheckedSideEffectImports: true,
									isolatedModules: true,
									noUncheckedIndexedAccess: true,
									exactOptionalPropertyTypes: true,
								},
								...(wholeOutput
									? { include: ["**/*.ts", "**/*.js"] }
									: {
											files: allowJs
												? ["consumer.ts", "consumer.js"]
												: ["consumer.ts"],
										}),
							},
							ts.sys,
							directory
						);
						const diagnostics = [
							...parsed.errors,
							...ts.getPreEmitDiagnostics(
								ts.createProgram(parsed.fileNames, parsed.options)
							),
						];
						assert.deepEqual(
							diagnostics.map((item) =>
								ts.flattenDiagnosticMessageText(item.messageText, " ")
							),
							[],
							JSON.stringify({
								moduleResolution,
								allowJs,
								checkJs,
								skipLibCheck,
								wholeOutput,
							})
						);
						checked++;
					}
		assert.equal(checked, 36);
	});
});
