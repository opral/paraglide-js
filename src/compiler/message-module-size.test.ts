import { expect, test } from "vitest";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { createRequire } from "node:module";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import type { BundleNested, Declaration, Match, Pattern } from "@inlang/sdk";
import { createProject, ts } from "@ts-morph/bootstrap";
import virtual from "@rollup/plugin-virtual";
import { rolldown } from "rolldown";
import { compileCatalog, type CatalogInput } from "./compile-project.js";
import type { CompilerOptions } from "./compiler-options.js";
import { compileBundle } from "./compile-bundle.js";
import { getFallbackMap } from "./compile-project.js";
import { messageReferenceExpression } from "./output-structure/message-modules.js";
import { perLocaleBuildStaticLocaleExpression } from "./per-locale-build.js";

function bundle(
	id: string,
	messages: Record<string, Pattern>,
	declarations: Declaration[] = []
): BundleNested {
	return {
		id,
		declarations,
		messages: Object.entries(messages).map(([locale, pattern]) => ({
			id: `${id}_${locale}`,
			bundle_id: id,
			locale,
			selectors: [],
			variants: [
				{
					id: `${id}_${locale}_v`,
					message_id: `${id}_${locale}`,
					matches: [],
					pattern,
				},
			],
		})),
	};
}
const text = (value: string): Pattern => [{ type: "text", value }];
const input = (name: string): Pattern[number] => ({
	type: "expression",
	arg: { type: "variable-reference", name },
});
const catalog: CatalogInput = {
	settings: { baseLocale: "en", locales: ["en", "de", "de-AT"] },
	bundles: [
		bundle(
			"foo",
			{ en: [{ type: "text", value: "EN_FALLBACK " }, input("name")] },
			[{ type: "input-variable", name: "name" }]
		),
		// This export collides with foo's en helper if modules are concatenated.
		bundle("en_foo", {
			en: text("HELPER_COLLISION"),
			de: text("HILFSFUNKTION"),
		}),
		bundle("greeting.unsafe", { en: [input("user-name")] }, [
			{ type: "input-variable", name: "user-name" },
		]),
		bundle("class", { en: text("RESERVED") }),
		bundle(
			"markup",
			{
				en: [
					{ type: "markup-start", name: "strong", options: [], attributes: [] },
					input("name"),
					{ type: "markup-end", name: "strong" },
					{
						type: "markup-standalone",
						name: "icon",
						options: [],
						attributes: [],
					},
				],
				de: [input("name")],
			},
			[{ type: "input-variable", name: "name" }]
		),
		bundle("unused_markup", {
			en: [
				{ type: "markup-start", name: "b", options: [], attributes: [] },
				{ type: "text", value: "UNUSED_MARKUP_SENTINEL" },
				{ type: "markup-end", name: "b" },
			],
		}),
	],
};
const plural = bundle("items", { en: text("") }, [
	{ type: "input-variable", name: "count" },
	{
		type: "local-variable",
		name: "category",
		value: {
			type: "expression",
			arg: { type: "variable-reference", name: "count" },
			annotation: { type: "function-reference", name: "plural", options: [] },
		},
	},
]);
plural.messages[0]!.selectors = [
	{ type: "variable-reference", name: "category" },
];
plural.messages[0]!.variants = [
	{
		matches: [
			{ type: "literal-match", key: "category", value: "one" },
		] as Match[],
		pattern: text("ONE_ITEM"),
	},
	{
		matches: [{ type: "catchall-match", key: "category" }] as Match[],
		pattern: [input("count"), { type: "text" as const, value: "_ITEMS" }],
	},
].map((variant, index) => ({
	...variant,
	id: `items_${index}`,
	message_id: "items_en",
}));
catalog.bundles.push(plural);

const fullyTranslated: CatalogInput = {
	settings: { baseLocale: "en", locales: ["en", "de"] },
	bundles: catalog.bundles.map((entry) => ({
		...structuredClone(entry),
		messages: ["en", "de"].map((locale) => {
			const source =
				entry.messages.find((message) => message.locale === locale) ??
				entry.messages[0]!;
			return {
				...structuredClone(source),
				id: `${entry.id}_${locale}`,
				locale,
			};
		}),
	})),
};
fullyTranslated.bundles.find(
	(entry) => entry.id === "foo"
)!.messages[1]!.variants[0]!.pattern = [
	{ type: "text", value: "DE_COMPLETE " },
	input("name"),
];

async function compile(
	options: Partial<CompilerOptions> = {},
	inputCatalog = catalog
) {
	return compileCatalog({
		catalog: inputCatalog,
		compilerOptions: {
			strategy: ["baseLocale"],
			emitTsDeclarations: true,
			...options,
		},
	});
}

test("shared factories preserve names, arity, runtime dispatch and invalid-locale fallback", async () => {
	const output = await compile({ messageModuleSize: 100 }, fullyTranslated);
	const shard = Object.entries(output)
		.filter(([name]) => name.startsWith("messages/") && name.endsWith(".js"))
		.map(([, code]) => code)
		.join("\n");
	expect(shard).toContain("function __paraglideMessage(");
	expect(shard).toContain("function __paraglideOptionalMessage(");
	const { module } = await bundled(
		output,
		'export * from "./paraglide/messages.js";'
	);
	expect(module.foo.name).toBe("foo");
	expect(module.foo.length).toBe(1);
	expect(module.en_foo.name).toBe("en_foo");
	expect(module.en_foo.length).toBe(0);
	expect(module.foo({ name: "Ada" }, { locale: "de" })).toBe("DE_COMPLETE Ada");
	expect(module.foo({ name: "Ada" }, { locale: "unknown" })).toBe(
		"EN_FALLBACK Ada"
	);
	expect(module.en_foo(undefined, { locale: "unknown" })).toBe(
		"HELPER_COLLISION"
	);
});

test("shared factories honor the static locale before explicit locale options", async () => {
	const output = await compile(
		{ messageModuleSize: 100, experimentalStaticLocale: '"de"' },
		fullyTranslated
	);
	const { module } = await bundled(
		output,
		'export * from "./paraglide/messages.js";'
	);
	expect(module.foo({ name: "Ada" }, { locale: "en" })).toBe("DE_COMPLETE Ada");
	expect(module.en_foo({}, { locale: "en" })).toBe("HILFSFUNKTION");
});

test("shared factory calls remain independently removable within one shard", async () => {
	const { code, module } = await bundled(
		await compile({ messageModuleSize: 100 }, fullyTranslated),
		'import { foo } from "./paraglide/messages.js"; export const result = foo({ name: "Ada" });'
	);
	expect(module.result).toBe("EN_FALLBACK Ada");
	expect(code).not.toContain("UNUSED_MARKUP_SENTINEL");
	expect(code).not.toContain("HELPER_COLLISION");
	expect(code).not.toContain("ONE_ITEM");
});

test("middleware keeps full helpers for otherwise factory-eligible messages", async () => {
	const output = await compile(
		{ messageModuleSize: 100, experimentalMiddlewareLocaleSplitting: true },
		fullyTranslated
	);
	const shards = Object.entries(output)
		.filter(([name]) => name.startsWith("messages/") && name.endsWith(".js"))
		.map(([, code]) => code)
		.join("\n");
	expect(shards).not.toContain("function __paraglideMessage(");
	expect(output["server.js"]).toContain("EN_FALLBACK");
	expect(output["server.js"]).toContain("DE_COMPLETE");
});

test("default fused simple code matches the general compiler's frozen output", () => {
	const fixtures = [
		bundle("plain", { en: text("Plain\r\nline"), de: text("Einfach") }),
		bundle(
			"required",
			{
				en: [input("name")],
				de: [{ type: "text", value: "Hallo " }, input("name")],
			},
			[{ type: "input-variable", name: "name" }]
		),
		bundle("literal", {
			en: [
				{ type: "expression", arg: { type: "literal", value: 'literal $` "' } },
			],
			de: text("Literal"),
		}),
	];
	const settings = fullyTranslated.settings;
	for (const fixture of fixtures) {
		const args = {
			bundle: fixture,
			settings,
			fallbackMap: getFallbackMap(settings.locales, settings.baseLocale),
			inlineMessages: true,
			messageReferenceExpression,
		};
		const general = compileBundle({ ...args, fuseInlineMessages: false }).bundle
			.code;
		expect(
			compileBundle({ ...args, fuseInlineMessages: true }).bundle.code
		).toBe(general);
		expect(general).toMatchSnapshot(fixture.id);
	}
	const invalid = bundle("invalid", {
		en: [input("missing")],
		de: [input("missing")],
	});
	const args = {
		bundle: invalid,
		settings,
		fallbackMap: getFallbackMap(settings.locales, settings.baseLocale),
		inlineMessages: true,
		messageReferenceExpression,
	};
	for (const fuseInlineMessages of [false, true])
		expect(() => compileBundle({ ...args, fuseInlineMessages })).toThrow(
			/missing/
		);
	const malformed = structuredClone(fixtures[0]!);
	delete (malformed.messages[0] as { bundle_id?: string }).bundle_id;
	for (const fuseInlineMessages of [false, true])
		expect(() =>
			compileBundle({ ...args, bundle: malformed, fuseInlineMessages })
		).toThrow(/no bundle id/);
});

test("messageModuleSize one preserves the default output byte for byte", async () => {
	expect(await compile({ messageModuleSize: 1 })).toEqual(await compile());
});

test.each([0, -1, 1.5, NaN, Infinity])(
	"rejects invalid messageModuleSize %s",
	async (messageModuleSize) => {
		await expect(compile({ messageModuleSize })).rejects.toThrow(
			/messageModuleSize/
		);
	}
);

test("rejects grouping for locale modules", async () => {
	await expect(
		compile({ outputStructure: "locale-modules", messageModuleSize: 2 })
	).rejects.toThrow(
		/messageModuleSize.*message-modules|message-modules.*messageModuleSize/
	);
});

test("groups JS and declarations into bounded modules and keeps the public barrel", async () => {
	const output = await compile({ messageModuleSize: 3 });
	const js = Object.keys(output).filter(
		(name) =>
			name.startsWith("messages/") &&
			name.endsWith(".js") &&
			!name.endsWith("/_index.js")
	);
	expect(js).toHaveLength(Math.ceil(catalog.bundles.length / 3));
	for (const name of js)
		expect(output).toHaveProperty(name.replace(/\.js$/, ".d.ts"));
	expect(JSON.parse(output["messages/package.json"]!)).toEqual({
		type: "module",
		sideEffects: false,
	});
	const { module } = await bundled(
		output,
		'export * from "./paraglide/messages.js";'
	);
	for (const id of catalog.bundles.map((entry) => entry.id)) {
		expect(module[id]).toBeTypeOf("function");
		expect(module.m[id]).toBe(module[id]);
	}
	expect(module.foo({ name: "Ada" }, { locale: "de-AT" })).toBe(
		"EN_FALLBACK Ada"
	);
	expect(module.en_foo({}, { locale: "de" })).toBe("HILFSFUNKTION");
	expect(module["greeting.unsafe"]({ "user-name": "Ada" })).toBe("Ada");
	expect(module.class()).toBe("RESERVED");
	expect(module.items({ count: 1 })).toBe("ONE_ITEM");
	expect(module.items({ count: 3 })).toBe("3_ITEMS");
	expect(module.markup.parts({ name: "Ada" })).toMatchObject([
		{ type: "markup-start", name: "strong" },
		{ type: "text", value: "Ada" },
		{ type: "markup-end", name: "strong" },
		{ type: "markup-standalone", name: "icon" },
	]);
	expect(module.markup.parts({ name: "Ada" }, { locale: "de" })).toEqual([
		{ type: "text", value: "Ada" },
	]);
});

for (const [fixtureName, inputCatalog] of [
	["fallback", catalog],
	["fully translated factory", fullyTranslated],
] as const) {
	for (const emitTsDeclarations of [false, true]) {
		test(`grouped ${fixtureName} output preserves strict consumer types (declarations: ${emitTsDeclarations})`, async () => {
			const output = await compile(
				{ messageModuleSize: 100, emitTsDeclarations },
				inputCatalog
			);
			const project = await createProject({
				useInMemoryFileSystem: true,
				compilerOptions: {
					strict: true,
					allowJs: true,
					checkJs: true,
					noUnusedParameters: true,
					noEmit: true,
					module: ts.ModuleKind.Node16,
					moduleResolution: ts.ModuleResolutionKind.Node16,
				},
			});
			for (const [name, code] of Object.entries(output)) {
				if (name.endsWith(".js") || name.endsWith(".d.ts"))
					project.createSourceFile(name, code);
			}
			project.createSourceFile(
				"consumer.ts",
				`
			import { m, "greeting.unsafe" as unsafe } from "./messages.js";
			import type { FooInputs, LocalizedString } from "./messages.js";
			const args: FooInputs = { name: "Ada" };
			m.foo(args, { locale: "de" }) satisfies LocalizedString;
			unsafe({ "user-name": "Ada" });
			m.markup.parts({ name: "Ada" });
			type Meta = NonNullable<typeof m.markup.__paraglide>;
			const inlineTag: Meta["markup"]["icon"] = { options: {}, attributes: {}, children: false };
			const pairedTag: Meta["markup"]["strong"] = { options: {}, attributes: {}, children: true };
			void inlineTag; void pairedTag;
			// @ts-expect-error standalone tag cannot have children
			const invalid: Meta["markup"]["icon"] = { options: {}, attributes: {}, children: true };
			void invalid;
			// @ts-expect-error required input is checked
			m.foo();
			// @ts-expect-error locale is checked
			m.foo(args, { locale: "fr" });
			// @ts-expect-error unsafe input remains required
			unsafe({ name: "Ada" });
			// @ts-expect-error plain messages have no parts API
			m.foo.parts(args);
		`
			);
			const diagnostics = ts
				.getPreEmitDiagnostics(project.createProgram())
				.filter(
					(d) =>
						!ts
							.flattenDiagnosticMessageText(d.messageText, "\n")
							.includes("Cannot find module 'async_hooks'")
				);
			expect(
				diagnostics.map(
					(d) =>
						`${d.file?.fileName}: ${ts.flattenDiagnosticMessageText(d.messageText, "\n")}`
				)
			).toEqual([]);
		});
	}
}

test("TypeScript 7 validates grouped declarations and rejects invalid consumers", async () => {
	for (const inputCatalog of [catalog, fullyTranslated]) {
		const output = await compile({ messageModuleSize: 100 }, inputCatalog);
		const directory = await fs.mkdtemp(
			path.join(os.tmpdir(), "paraglide-shard-consumer-")
		);
		try {
			for (const [name, code] of Object.entries(output)) {
				if (!name.endsWith(".d.ts")) continue;
				await fs.mkdir(path.dirname(path.join(directory, name)), {
					recursive: true,
				});
				await fs.writeFile(path.join(directory, name), code);
			}
			await fs.writeFile(
				path.join(directory, "package.json"),
				'{"type":"module"}'
			);
			await fs.writeFile(
				path.join(directory, "consumer.ts"),
				`
			import { m, "greeting.unsafe" as quoted } from "./messages.js";
			import type { FooInputs, LocalizedString } from "./messages.js";
			const input: FooInputs = { name: "Ada" };
			m.foo(input, { locale: "de" }) satisfies LocalizedString;
			quoted({ "user-name": "Ada" });
			m.markup.parts(input);
			type Markup = NonNullable<typeof m.markup.__paraglide>["markup"];
			const paired: Markup["strong"]["children"] = true;
			void paired;
			// @ts-expect-error grouped declarations retain required input
			m.foo();
			// @ts-expect-error grouped declarations retain locale checking
			m.foo(input, { locale: "fr" });
			// @ts-expect-error standalone markup remains distinct
			const invalid: Markup["icon"]["children"] = true;
			void invalid;
		`
			);
			await fs.writeFile(
				path.join(directory, "tsconfig.json"),
				JSON.stringify({
					compilerOptions: {
						strict: true,
						noEmit: true,
						target: "ES2022",
						module: "NodeNext",
						moduleResolution: "NodeNext",
						types: [],
						lib: ["ESNext", "DOM"],
					},
					files: ["consumer.ts"],
				})
			);
			const compiler = path.join(
				path.dirname(
					createRequire(import.meta.url).resolve("typescript-go/package.json")
				),
				"lib/tsc.js"
			);
			try {
				await promisify(execFile)(
					process.execPath,
					[compiler, "-p", path.join(directory, "tsconfig.json")],
					{ env: { ...process.env, ELECTRON_RUN_AS_NODE: "1" } }
				);
			} catch (error) {
				throw new Error(
					`TypeScript 7 grouped consumer failed: ${(error as { stdout?: string }).stdout ?? error}`,
					{ cause: error }
				);
			}
		} finally {
			await fs.rm(directory, { recursive: true, force: true });
		}
	}
});

test.each([
	'import { foo } from "./paraglide/messages.js"; export const result = foo({ name: "Ada" });',
	'import { m } from "./paraglide/messages.js"; export const result = m.foo({ name: "Ada" });',
])(
	"tree shakes unused functions and markup within a shared module: %s",
	async (entry) => {
		const { code, module } = await bundled(
			await compile({ messageModuleSize: 100 }),
			entry
		);
		expect(module.result).toBe("EN_FALLBACK Ada");
		expect(code).not.toContain("UNUSED_MARKUP_SENTINEL");
		expect(code).not.toContain("HELPER_COLLISION");
		expect(code).not.toContain("ONE_ITEM");
	}
);

test("grouped client dispatchers preserve middleware message and parts lookups", async () => {
	const output = await compile({
		messageModuleSize: 100,
		experimentalMiddlewareLocaleSplitting: true,
		isServer: "false",
	});
	const { module } = await bundled(
		output,
		`
		import { foo, markup } from "./paraglide/messages.js";
		export const result = (() => {
			const previous = globalThis.__paraglide;
			globalThis.__paraglide = { ssr: {
				foo: ({ name }) => "SERVER " + name,
				markup: Object.assign(({ name }) => "SERVER MARKUP " + name, { parts: ({ name }) => [{ type: "text", value: "SERVER PARTS " + name }] })
			} };
			try { return [foo({ name: "Ada" }), markup.parts({ name: "Ada" })]; }
			finally { globalThis.__paraglide = previous; }
		})();
	`
	);
	expect(module.result).toEqual([
		"SERVER Ada",
		[{ type: "text", value: "SERVER PARTS Ada" }],
	]);
});

test("empty grouped catalog still has importable JS and declarations", async () => {
	const output = await compileCatalog({
		catalog: { ...catalog, bundles: [] },
		compilerOptions: { messageModuleSize: 10, emitTsDeclarations: true },
	});
	const { module } = await bundled(
		output,
		'export * from "./paraglide/messages.js";'
	);
	expect(Object.keys(module.m ?? {})).toEqual([]);
	expect(output["messages.d.ts"]).toBeDefined();
});

test("rejects grouping for locale-specialized builds before producing unsafe source maps", async () => {
	await expect(
		compile({
			messageModuleSize: 10,
			experimentalStaticLocale: perLocaleBuildStaticLocaleExpression,
		})
	).rejects.toThrow(/messageModuleSize.*locale|locale.*messageModuleSize/);
});

async function bundled(
	output: Record<string, string>,
	entry: string,
	sourcemap = false
) {
	const generated = {
		...output,
		"runtime.js": output["runtime.js"]!.replace(
			'import "@inlang/paraglide-js/urlpattern-polyfill";',
			"const URLPattern = globalThis.URLPattern;"
		),
	};
	const build = await rolldown({
		input: ["main.js"],
		plugins: [
			// @ts-expect-error Rollup plugin types differ from Rolldown's public types.
			virtual({
				...Object.fromEntries(
					Object.entries(generated)
						.filter(([name]) => name.endsWith(".js"))
						.map(([name, code]) => [`paraglide/${name}`, code])
				),
				"main.js": entry,
			}),
		],
	});
	try {
		const result = await build.generate({ format: "esm", sourcemap });
		const chunk = result.output[0]!;
		const code = chunk.code;
		const module = await import(
			`data:text/javascript;base64,${Buffer.from(code).toString("base64")}`
		);
		return { code, map: JSON.stringify(chunk.map), module };
	} finally {
		await build.close();
	}
}
