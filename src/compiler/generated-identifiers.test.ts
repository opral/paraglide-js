import { expect, test } from "vitest";
import type { BundleNested, Declaration, Pattern } from "@inlang/sdk";
import virtual from "@rollup/plugin-virtual";
import { rolldown } from "rolldown";
import { createProject, ts } from "@ts-morph/bootstrap";
import { compileCatalog } from "./compile-project.js";
import { compileBundle } from "./compile-bundle.js";
import type { CompilerOptions } from "./compiler-options.js";

const layouts = [
	{ outputStructure: "message-modules", messageModuleSize: 1 },
	{ outputStructure: "locale-modules", messageModuleSize: 1 },
	{ outputStructure: "message-modules", messageModuleSize: 2 },
] satisfies Partial<CompilerOptions>[];

const text = (value: string): Pattern => [{ type: "text", value }];
const reference = (name: string): Pattern => [
	{ type: "expression", arg: { type: "variable-reference", name } },
];
const formatted = (name: string): Pattern => [
	{
		type: "expression",
		arg: { type: "variable-reference", name },
		annotation: { type: "function-reference", name: "number", options: [] },
	},
];

function bundle(
	id: string,
	patterns: Record<string, Pattern>,
	declarations: Declaration[] = []
): BundleNested {
	return {
		id,
		declarations,
		messages: Object.entries(patterns).map(([locale, pattern]) => ({
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

async function compile(
	bundles: BundleNested[],
	options: Partial<CompilerOptions> = {}
) {
	return compileCatalog({
		catalog: { settings: { baseLocale: "en", locales: ["en", "de"] }, bundles },
		compilerOptions: { strategy: ["baseLocale"], ...options },
	});
}

/** Compiles the bundles in every physical layout and evaluates `read` with `m`. */
async function readInEveryLayout(bundles: BundleNested[], read: string) {
	const results = [];
	for (const layout of layouts) {
		const output = await compile(bundles, layout);
		const build = await rolldown({
			input: ["main.js"],
			plugins: [
				// @ts-expect-error Rollup plugin types differ from Rolldown's public types.
				virtual({
					...Object.fromEntries(
						Object.entries(output)
							.filter(([name]) => name.endsWith(".js"))
							.map(([name, code]) => [`paraglide/${name}`, code])
					),
					"main.js": `import { m } from "./paraglide/messages.js";\nexport const result = ${read};`,
				}),
			],
		});
		try {
			const { output: chunks } = await build.generate({ format: "esm" });
			const module = await import(
				`data:text/javascript;base64,${Buffer.from(chunks[0].code).toString("base64")}`
			);
			results.push(module.result);
		} finally {
			await build.close();
		}
	}
	return results;
}

test("messages whose keys share a safe module id keep their own text", async () => {
	const bundles = [
		bundle("a.b", { en: text("dot"), de: text("Punkt") }),
		bundle("a_b", { en: text("underscore"), de: text("Unterstrich") }),
		bundle("a-b", { en: text("dash"), de: text("Strich") }),
	];
	expect(
		await readInEveryLayout(
			bundles,
			'[m["a.b"](), m.a_b(), m["a-b"](), m["a.b"]({}, { locale: "de" })]'
		)
	).toEqual(Array(layouts.length).fill(["dot", "underscore", "dash", "Punkt"]));
});

test("messages named like a binding the generated modules declare keep working", async () => {
	const count: Declaration[] = [{ type: "input-variable", name: "count" }];
	const bundles = [
		bundle(
			"registry",
			{ en: formatted("count"), de: formatted("count") },
			count
		),
		bundle("__en", { en: text("namespace"), de: text("Namensraum") }),
		bundle("eval", { en: text("eval"), de: text("eval") }),
		bundle("arguments", { en: text("arguments"), de: text("Argumente") }),
	];
	expect(
		await readInEveryLayout(
			bundles,
			'[m.registry({ count: 1234 }), m.registry({ count: 1234 }, { locale: "de" }), m.__en(), m.eval(), m.arguments()]'
		)
	).toEqual(
		Array(layouts.length).fill([
			"1,234",
			"1.234",
			"namespace",
			"eval",
			"arguments",
		])
	);
});

test("local variables named like a binding the message function reads or forbids keep working", async () => {
	const locals = ["i", "registry", "String", "class", "a-b"];
	const declarations: Declaration[] = [
		{ type: "input-variable", name: "count" },
		...locals.map(
			(name): Declaration => ({
				type: "local-variable",
				name,
				value: {
					type: "expression",
					arg: { type: "variable-reference", name: "count" },
					annotation: {
						type: "function-reference",
						name: "number",
						options: [],
					},
				},
			})
		),
	];
	const pattern: Pattern = locals.flatMap((name) => [
		...reference(name),
		{ type: "text", value: " " },
	]);
	const bundles = [
		bundle("price", { en: pattern, de: pattern }, declarations),
		// `.parts()` reads `String`
		bundle(
			"rich",
			{
				en: [
					{ type: "markup-standalone", name: "b", options: [], attributes: [] },
					...reference("String"),
				],
				de: reference("String"),
			},
			declarations
		),
	];
	const expected = "1,234 ".repeat(locals.length);
	expect(
		await readInEveryLayout(
			bundles,
			"[m.price({ count: 1234 }), m.rich.parts({ count: 1234 })[1]]"
		)
	).toEqual(
		Array(layouts.length).fill([expected, { type: "text", value: "1,234" }])
	);
});

test("a message named _index is not replaced by the message barrel", async () => {
	const bundles = [bundle("_index", { en: text("hello"), de: text("hallo") })];
	expect(await readInEveryLayout(bundles, "m._index()")).toEqual(
		Array(layouts.length).fill("hello")
	);
});

test("declarations keep every message under its key", async () => {
	const bundles = [
		bundle("a.b", { en: text("dot") }),
		bundle("a_b", { en: text("underscore") }),
		bundle("_index", { en: text("hello") }),
		bundle("registry", { en: formatted("count") }, [
			{ type: "input-variable", name: "count" },
		]),
		// `default` and `_default` share the safe module id `_default`
		bundle("default", { en: text("default") }),
		bundle("_default", { en: text("_default") }),
	];
	for (const layout of layouts) {
		const output = await compile(bundles, {
			...layout,
			emitTsDeclarations: true,
		});
		const consumer = await createProject({
			useInMemoryFileSystem: true,
			compilerOptions: {
				strict: true,
				module: ts.ModuleKind.Node16,
				moduleResolution: ts.ModuleResolutionKind.Node16,
			},
		});
		for (const [name, code] of Object.entries(output))
			if (name.endsWith(".d.ts")) consumer.createSourceFile(name, code);
		consumer.createSourceFile(
			"consumer.ts",
			`import { m } from "./messages.js";
			m["a.b"]() satisfies string;
			m.a_b() satisfies string;
			m._index() satisfies string;
			m.registry({ count: 1 }) satisfies string;
			// @ts-expect-error required input
			m.registry();
			m._default() satisfies string;${
				// like their JavaScript barrels, message modules leave out the
				// value of a message named "default"
				layout.outputStructure === "message-modules"
					? `
			// @ts-expect-error no default value
			m.default();`
					: ""
			}`
		);
		expect(
			ts
				.getPreEmitDiagnostics(consumer.createProgram())
				.map((diagnostic) => diagnostic.messageText),
			JSON.stringify(layout)
		).toEqual([]);
	}
});

test("grouped modules name types within their shard and keep the barrel unambiguous", async () => {
	const input = (key: string, name: string) =>
		bundle(key, { en: reference(name) }, [{ type: "input-variable", name }]);
	// a.b and a-b share a_b but sit in different shards
	const bundles = [
		input("a.b", "dot"),
		input("filler", "value"),
		input("a-b", "dash"),
		input("default", "value"),
	];
	const output = await compile(bundles, {
		messageModuleSize: 2,
		emitTsDeclarations: true,
	});
	const consumer = await createProject({
		useInMemoryFileSystem: true,
		compilerOptions: {
			strict: true,
			module: ts.ModuleKind.Node16,
			moduleResolution: ts.ModuleResolutionKind.Node16,
		},
	});
	for (const [name, code] of Object.entries(output))
		if (name.endsWith(".d.ts")) consumer.createSourceFile(name, code);
	consumer.createSourceFile(
		"consumer.ts",
		`import { "a.b" as dot, type A_BInputs as DotInputs } from "./messages/_shard_0.js";
		import { "a-b" as dash, type A_BInputs as DashInputs } from "./messages/_shard_1.js";
		import { m, type FillerInputs, type Message$a$2e$bInputs, type Message$a$2d$bInputs } from "./messages.js";
		dot({ dot: "x" } satisfies DotInputs) satisfies string;
		dash({ dash: "y" } satisfies DashInputs) satisfies string;
		m["a.b"]({ dot: "x" } satisfies Message$a$2e$bInputs) satisfies string;
		m["a-b"]({ dash: "y" } satisfies Message$a$2d$bInputs) satisfies string;
		m.filler({ value: "z" } satisfies FillerInputs) satisfies string;
		// @ts-expect-error no default value
		m.default();
		// @ts-expect-error the shared name is left out of the barrel
		type Ambiguous = m.A_BInputs;`
	);
	expect(
		ts
			.getPreEmitDiagnostics(consumer.createProgram())
			.map((diagnostic) => diagnostic.messageText)
	).toEqual([]);
});

test("keys without a collision keep their files, exports and type names", async () => {
	const bundles = ["registry", "Eval", "Arguments", "a.b", "class"].map((key) =>
		bundle(key, { en: text(key), de: text(key) })
	);
	const messageModules = await compile(bundles, { emitTsDeclarations: true });
	for (const [file, alias] of [
		["registry", "RegistryInputs"],
		["eval1", "Eval1Inputs"],
		["arguments1", "Arguments1Inputs"],
		["a_b", "A_BInputs"],
		["_class", "_ClassInputs"],
	]) {
		expect(messageModules).toHaveProperty(`messages/${file}.js`);
		expect(messageModules[`messages/${file}.d.ts`]).toContain(
			`export type ${alias} =`
		);
	}
	const localeModules = await compile(bundles, {
		outputStructure: "locale-modules",
	});
	expect(
		[...localeModules["messages/en.js"]!.matchAll(/export const (\S+) =/g)].map(
			([, name]) => name
		)
	).toEqual(["registry", "eval1", "arguments1", "a_b", "_class"]);
});

test("adding or removing a key moves only the keys that share its safe module id", async () => {
	// each message's text names its key, to find the file it is compiled into
	const files = async (keys: string[]) => {
		const output = await compile(
			keys.map((key) => bundle(key, { en: text(`<${key}>`) }))
		);
		return new Map(
			keys.map((key) => [
				key,
				Object.keys(output).find(
					(name) =>
						name.startsWith("messages/") && output[name]!.includes(`<${key}>`)
				),
			])
		);
	};
	const keys = ["a.b", "a_b", "x.y", "registry", "_index"];
	const before = await files(keys);
	const after = await files([...keys, "a_b_1", "registry_1", "x-y"]);
	for (const key of keys)
		if (key !== "x.y") expect(after.get(key), key).toBe(before.get(key));
	// x.y and x-y share x_y
	expect(after.get("x.y")).not.toBe(before.get("x.y"));
	expect(await files(keys)).toEqual(before);
});

test("renamed local variables work as selectors and in other locals", async () => {
	const declarations: Declaration[] = [
		{ type: "input-variable", name: "count" },
		{
			type: "local-variable",
			name: "i",
			value: {
				type: "expression",
				arg: { type: "variable-reference", name: "count" },
				annotation: { type: "function-reference", name: "plural", options: [] },
			},
		},
		// reads the renamed local i
		{
			type: "local-variable",
			name: "class",
			value: {
				type: "expression",
				arg: { type: "variable-reference", name: "i" },
			},
		},
	];
	const items = bundle("items", {}, declarations);
	items.messages = ["en", "de"].map((locale) => ({
		id: `items_${locale}`,
		bundle_id: "items",
		locale,
		selectors: [{ type: "variable-reference", name: "class" }],
		variants: [
			{
				id: `items_${locale}_one`,
				message_id: `items_${locale}`,
				matches: [{ type: "literal-match", key: "class", value: "one" }],
				pattern: [{ type: "text", value: "one " }, ...reference("count")],
			},
			{
				id: `items_${locale}_other`,
				message_id: `items_${locale}`,
				matches: [{ type: "catchall-match", key: "class" }],
				pattern: [{ type: "text", value: "other " }, ...reference("count")],
			},
		],
	}));
	expect(
		await readInEveryLayout(
			[items],
			"[m.items({ count: 1 }), m.items({ count: 5 })]"
		)
	).toEqual(Array(layouts.length).fill(["one 1", "other 5"]));
});

test("compileBundle passes message references the key and the module id", () => {
	const references: string[][] = [];
	compileBundle({
		bundle: bundle("a.b", { en: reference("name") }, [
			{ type: "input-variable", name: "name" },
		]),
		moduleId: "$a$2e$b",
		fallbackMap: { en: undefined },
		messageReferenceExpression: (...reference) => {
			references.push(reference);
			return "message";
		},
	});
	expect(references).toContainEqual(["en", "a.b", "$a$2e$b"]);
});
