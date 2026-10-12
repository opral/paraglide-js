import fs from "node:fs/promises";
import path from "node:path";
import { pathToFileURL } from "node:url";

const repo = path.resolve(".");
const checkout = path.resolve(".real-apps/anything-migration");
const sourceFrontend = path.resolve(".real-apps/anything-llm-source/frontend");
const compilerDist = process.env.PARAGLIDE_COMPILER_DIST;
if (!compilerDist) {
	throw new Error(
		"Set PARAGLIDE_COMPILER_DIST to the built Paraglide dist directory"
	);
}
const compiler = path.resolve(compilerDist);
const load = async (relative) =>
	import(pathToFileURL(path.join(compiler, relative)).href);
const [{ resources }, compile, output, runtime, registry, options] =
	await Promise.all([
		import(
			pathToFileURL(path.join(sourceFrontend, "src/locales/resources.js")).href
		),
		load("compiler/compile-bundle.js"),
		load("compiler/output-structure/message-modules.js"),
		load("compiler/runtime/create-runtime.js"),
		load("compiler/registry.js"),
		load("compiler/compiler-options.js"),
	]);

const flatten = (object, prefix = "", result = {}) => {
	for (const [key, value] of Object.entries(object)) {
		const full = prefix ? `${prefix}.${key}` : key;
		if (typeof value === "string") result[full] = value;
		else if (value && typeof value === "object" && !Array.isArray(value)) {
			flatten(value, full, result);
		} else {
			throw new Error(`Unsupported resource value ${full}: ${typeof value}`);
		}
	}
	return result;
};

const originals = Object.fromEntries(
	Object.entries(resources).map(([locale, value]) => [locale, value.common])
);
const catalogs = Object.fromEntries(
	Object.entries(originals).map(([locale, value]) => [locale, flatten(value)])
);
const locales = Object.keys(catalogs);
const sourceKeys = [
	...new Set(Object.values(catalogs).flatMap(Object.keys)),
].sort();

const pluralBases = sourceKeys
	.filter((key) => key.endsWith("_one"))
	.map((oneKey) => {
		const base = oneKey.slice(0, -4);
		const otherKey = `${base}_other`;
		const values = locales.flatMap((locale) => [
			catalogs[locale][oneKey],
			catalogs[locale][otherKey],
		]);
		return values.some(
			(value) => typeof value === "string" && /\{\{\s*count\s*\}\}/.test(value)
		)
			? { base, oneKey, otherKey }
			: undefined;
	})
	.filter(Boolean);

const transKeys = new Set([
	"agent.mcp.tool-count-warning",
	"agent.skill.filesystem.warning",
	"agent.skill.gmail.description",
	"agent.skill.googleCalendar.description",
	"agent.skill.outlook.description",
	"model-router.chat.routed-to",
	"model-router.chat.routed-to-rule",
	"model-router.rules.calculated-multi-condition",
	"model-router.rules.calculated-no-conditions",
	"model-router.rules.calculated-single-condition",
	"model-router.rules.llm-rule-body",
	"telegram.setup.step1.description",
	"telegram.setup.step1.instruction-2",
	"chat.mode.automatic.description",
	"chat.mode.chat.description",
	"chat.mode.query.description",
]);

const toPattern = (text, markup) => {
	const pattern = [];
	const tokens = markup
		? /<\/?[A-Za-z][\w-]*(?:\s*\/)?\s*>|\{\{\s*([^{}]+?)\s*\}\}/g
		: /\{\{\s*([^{}]+?)\s*\}\}/g;
	let offset = 0;
	for (const match of text.matchAll(tokens)) {
		if (match.index > offset)
			pattern.push({ type: "text", value: text.slice(offset, match.index) });
		const token = match[0];
		if (token.startsWith("{{")) {
			pattern.push({
				type: "expression",
				arg: { type: "variable-reference", name: match[1].trim() },
			});
		} else if (/^<\//.test(token)) {
			const name = token.match(/^<\/([A-Za-z][\w-]*)/)[1];
			pattern.push({ type: "markup-end", name, options: [], attributes: [] });
		} else if (/\/>$/.test(token)) {
			const name = token.match(/^<([A-Za-z][\w-]*)/)[1];
			pattern.push({
				type: "markup-standalone",
				name,
				options: [],
				attributes: [],
			});
		} else {
			const name = token.match(/^<([A-Za-z][\w-]*)/)[1];
			pattern.push({ type: "markup-start", name, options: [], attributes: [] });
		}
		offset = match.index + token.length;
	}
	if (offset < text.length || pattern.length === 0) {
		pattern.push({ type: "text", value: text.slice(offset) });
	}
	return pattern;
};

const declarationsFor = (texts, includeCount = false) => {
	const names = new Set();
	for (const text of texts) {
		for (const match of text.matchAll(/\{\{\s*([^{}]+?)\s*\}\}/g))
			names.add(match[1].trim());
	}
	if (includeCount) names.add("count");
	return [...names].map((name) => ({ type: "input-variable", name }));
};

const normalBundle = (key, id) => {
	const messages = locales
		.filter((locale) => catalogs[locale][key] !== undefined)
		.map((locale) => {
			const value = catalogs[locale][key];
			return {
				id: `${id}-${locale}`,
				bundle_id: id,
				locale,
				selectors: [],
				variants: [
					{
						id: `${id}-${locale}-variant`,
						message_id: `${id}-${locale}`,
						matches: [],
						pattern: toPattern(value, transKeys.has(key)),
					},
				],
			};
		});
	return {
		id,
		declarations: declarationsFor(
			messages.flatMap((m) => m.variants.map((v) => catalogs[m.locale][key]))
		),
		messages,
	};
};

const pluralBundle = ({ base, oneKey, otherKey }, id) => {
	const declarations = [
		{ type: "input-variable", name: "count" },
		{
			type: "local-variable",
			name: "countPlural",
			value: {
				type: "expression",
				arg: { type: "variable-reference", name: "count" },
				annotation: { type: "function-reference", name: "plural", options: [] },
			},
		},
	];
	const messages = locales
		.filter(
			(locale) =>
				catalogs[locale][oneKey] !== undefined ||
				catalogs[locale][otherKey] !== undefined
		)
		.map((locale) => {
			// i18next does not use `_other` as a catch-all for CLDR categories
			// absent from the locale catalog. For example, Russian `few` and
			// `many` fall back to English. Encode every CLDR category explicitly.
			const categories = new Intl.PluralRules(locale).resolvedOptions()
				.pluralCategories;
			const variants = categories.map((category) => {
				const sourceKey = category === "one" ? oneKey : otherKey;
				const value =
					category === "one" || category === "other"
						? (catalogs[locale][sourceKey] ?? catalogs.en[sourceKey])
						: catalogs.en[otherKey];
				return {
					id: `${id}-${locale}-${category}`,
					message_id: `${id}-${locale}`,
					matches: [
						{ type: "literal-match", key: "countPlural", value: category },
					],
					pattern: toPattern(value, false),
				};
			});
			return {
				id: `${id}-${locale}`,
				bundle_id: id,
				locale,
				selectors: [{ type: "variable-reference", name: "countPlural" }],
				variants,
			};
		});
	return { id, declarations, messages };
};

const groupedPluralKeys = new Set(
	pluralBases.flatMap(({ oneKey, otherKey }) => [oneKey, otherKey])
);
const messageKeys = [
	...new Set([...sourceKeys, ...pluralBases.map(({ base }) => base)]),
].sort();
const mapping = Object.fromEntries(
	messageKeys.map((key, index) => [key, `k${index}`])
);
const pluralByBase = new Map(
	pluralBases.map((plural) => [plural.base, plural])
);
const bundles = messageKeys.map((key) => {
	const plural = pluralByBase.get(key);
	if (plural) return pluralBundle(plural, mapping[key]);
	if (groupedPluralKeys.has(key)) {
		const sourceKey = key;
		return normalBundle(sourceKey, mapping[key]);
	}
	return normalBundle(key, mapping[key]);
});

const fallbackMap = Object.fromEntries(
	locales.map((locale) => [locale, locale === "en" ? undefined : "en"])
);
const settings = { baseLocale: "en", locales };
const compileBundleForVite =
	compile.compileBundleForVite ?? compile.compileBundle;
const compiled = bundles.map((bundle) =>
	compileBundleForVite({
		bundle,
		fallbackMap,
		settings,
		inlineMessages: true,
		messageReferenceExpression: output.messageReferenceExpression,
	})
);
const files = {
	...output.generateOutput(compiled, settings, fallbackMap),
	"runtime.js": runtime.createRuntimeFile({
		...settings,
		compilerOptions: {
			...options.defaultCompilerOptions,
			strategy: ["globalVariable", "baseLocale"],
		},
	}),
	"registry.js": registry.createRegistry(),
	"messages.js": "export * from './messages/_index.js'\n",
	"package.json": '{"type":"module"}\n',
};
const outputDirectory = path.join(checkout, "frontend/src/paraglide");
await fs.rm(outputDirectory, { recursive: true, force: true });
for (const [filename, code] of Object.entries(files)) {
	const destination = path.join(outputDirectory, filename);
	await fs.mkdir(path.dirname(destination), { recursive: true });
	await fs.writeFile(destination, code);
}
await fs.writeFile(
	path.join(checkout, "mapping.json"),
	JSON.stringify(mapping, null, 2)
);
await fs.writeFile(
	path.join(checkout, "catalogs.json"),
	JSON.stringify({ locales, catalogs, pluralBases, transKeys: [...transKeys] })
);
console.log(
	JSON.stringify(
		{
			locales: locales.length,
			sourceKeys: sourceKeys.length,
			messageKeys: messageKeys.length,
			pluralBases,
			transKeys: [...transKeys],
			outputFiles: Object.keys(files).length,
		},
		null,
		2
	)
);
