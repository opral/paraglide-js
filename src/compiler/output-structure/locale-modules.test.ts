import { test, expect } from "vitest";
import {
	generateOutput,
	messageReferenceExpression,
} from "./locale-modules.js";
import type { Bundle, Message, ProjectSettings } from "@inlang/sdk";
import type { CompiledBundleWithMessages } from "../compile-bundle.js";

test("should emit per locale message files", () => {
	const bundles: CompiledBundleWithMessages[] = [
		{
			bundle: {
				code: 'console.log("bundle code");',
				node: {
					id: "happy_elephant",
				} as unknown as Bundle,
			},
			messages: {
				en: {
					code: 'console.log("message in English");',
					node: {} as unknown as Message,
					registryFunctions: [],
				},
				de: {
					code: 'console.log("message in German");',
					node: {} as unknown as Message,
					registryFunctions: [],
				},
			},
			matchTypes: new Map(),
		},
	];

	const settings: Pick<ProjectSettings, "locales" | "baseLocale"> = {
		locales: ["en", "de"],
		baseLocale: "en",
	};

	const fallbackMap: Record<string, string | undefined> = {
		en: "de",
		de: "en",
	};

	const output = generateOutput(bundles, settings, fallbackMap);

	expect(output).toHaveProperty("messages/en.js");
	expect(output).toHaveProperty("messages/de.js");

	expect(output["messages/en.js"]).toContain(
		`console.log("message in English");`
	);
});

test("the files should include files for each locale, even if there are no messages", () => {
	const bundles: CompiledBundleWithMessages[] = [
		{
			bundle: {
				code: 'console.log("bundle code");',
				node: {
					id: "happy_elephant",
				} as unknown as Bundle,
			},
			messages: {},
			matchTypes: new Map(),
		},
	];

	const settings: Pick<ProjectSettings, "locales" | "baseLocale"> = {
		locales: ["en", "de", "fr"],
		baseLocale: "en",
	};

	const fallbackMap: Record<string, string | undefined> = {
		en: "de",
		de: "en",
	};

	const output = generateOutput(bundles, settings, fallbackMap);

	expect(output).toHaveProperty("messages/en.js");
	expect(output).toHaveProperty("messages/de.js");
	expect(output).toHaveProperty("messages/fr.js");
});

test("should handle case sensitivity in message IDs correctly", () => {
	const bundles: CompiledBundleWithMessages[] = [
		{
			bundle: {
				code: 'console.log("bundle code");',
				node: {
					id: "sad_penguin_bundle",
				} as unknown as Bundle,
			},
			messages: {
				en: {
					code: 'console.log("sad_penguin_bundle");',
					node: {} as unknown as Message,
					registryFunctions: [],
				},
			},
			matchTypes: new Map(),
		},
		{
			bundle: {
				code: 'console.log("bundle code");',
				node: {
					id: "Sad_penguin_bundle",
				} as unknown as Bundle,
			},
			messages: {
				en: {
					code: 'console.log("Sad_penguin_bundle");',
					node: {} as unknown as Message,
					registryFunctions: [],
				},
			},
			matchTypes: new Map(),
		},
	];

	const settings: Pick<ProjectSettings, "locales" | "baseLocale"> = {
		locales: ["en"],
		baseLocale: "en",
	};

	const fallbackMap: Record<string, string | undefined> = {};

	const output = generateOutput(bundles, settings, fallbackMap);

	// Check that the output exists
	expect(output).toHaveProperty("messages/_index.js");
	expect(output).toHaveProperty("messages/en.js");

	// The exported constants should not conflict
	const content = output["messages/en.js"];
	expect(content).toContain("export const sad_penguin_bundle");
	expect(content).toContain("export const sad_penguin_bundle1"); // or some other unique name
});

test("prefixes locale imports to avoid message name collisions", () => {
	// https://github.com/opral/paraglide-js/issues/492
	const bundles: CompiledBundleWithMessages[] = [
		{
			bundle: {
				code: "const no = () => 'No';",
				node: {
					id: "no",
				} as unknown as Bundle,
			},
			messages: {
				no: {
					code: "const no = () => 'Nei';",
					node: {} as unknown as Message,
					registryFunctions: [],
				},
			},
			matchTypes: new Map(),
		},
	];

	const settings: Pick<ProjectSettings, "locales" | "baseLocale"> = {
		locales: ["no"],
		baseLocale: "no",
	};

	const output = generateOutput(bundles, settings, {});

	expect(output["messages/_index.js"]).toContain(
		`import * as __no from "./no.js"`
	);
	expect(output["messages/_index.js"]).not.toContain(
		`import * as no from "./no.js"`
	);
	expect(messageReferenceExpression("no", "no")).toBe("__no.no");
});

test("emits minimal runtime imports in index when middleware splitting is disabled", () => {
	const bundles: CompiledBundleWithMessages[] = [
		{
			bundle: {
				code: "export const happy_elephant = () => __en.happy_elephant()",
				node: {
					id: "happy_elephant",
				} as unknown as Bundle,
			},
			messages: {
				en: {
					code: '() => "happy"',
					node: {} as unknown as Message,
					registryFunctions: [],
				},
			},
			matchTypes: new Map(),
		},
	];

	const output = generateOutput(
		bundles,
		{ locales: ["en"], baseLocale: "en" },
		{},
		false
	);

	expect(output["messages/_index.js"]).toContain(
		'import { getLocale, experimentalStaticLocale } from "../runtime.js"'
	);
	expect(output["messages/_index.js"]).not.toContain("trackMessageCall");
	expect(output["messages/_index.js"]).not.toContain(
		"experimentalMiddlewareLocaleSplitting"
	);
	expect(output["messages/_index.js"]).not.toContain("isServer");
});

test("imports the registry only when a message calls it, not when the text mentions it", () => {
	const bundle = (
		id: string,
		code: string,
		registryFunctions: string[]
	): CompiledBundleWithMessages => ({
		bundle: {
			code: `export const ${id} = () => en_${id}()`,
			node: { id } as unknown as Bundle,
		},
		messages: {
			en: { code, node: {} as unknown as Message, registryFunctions },
		},
		matchTypes: new Map(),
	});
	const settings: Pick<ProjectSettings, "locales" | "baseLocale"> = {
		locales: ["en"],
		baseLocale: "en",
	};
	const registryImport =
		/import \* as registry from ['"]\.\.\/registry\.js['"]/;

	const textOnly = generateOutput(
		[bundle("registry_text", "() => `Open the registry. Now.`", [])],
		settings,
		{ en: undefined }
	);
	for (const [fileName, code] of Object.entries(textOnly)) {
		if (fileName.startsWith("messages/")) {
			expect(code).not.toMatch(registryImport);
		}
	}

	const withNumber = generateOutput(
		[
			bundle("amount", '(i) => `${registry.number("en", i?.amount, {})}`', [
				"number",
			]),
		],
		settings,
		{ en: undefined }
	);
	expect(
		Object.values(withNumber).some((code) => registryImport.test(code))
	).toBe(true);
});
