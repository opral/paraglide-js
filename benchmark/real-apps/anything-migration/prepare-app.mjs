import fs from "node:fs/promises";
import path from "node:path";
import { createRequire } from "node:module";

const root = path.resolve(".real-apps/anything-migration");
const frontend = path.join(root, "frontend");
const source = path.join(frontend, "src");
const require = createRequire(path.join(frontend, "package.json"));
const { parse } = require("@babel/parser");
const traverse = require("@babel/traverse").default;
const mapping = JSON.parse(
	await fs.readFile(path.join(root, "mapping.json"), "utf8")
);
const data = JSON.parse(
	await fs.readFile(path.join(root, "catalogs.json"), "utf8")
);
const pluralKeys = new Set(data.pluralBases.map(({ base }) => base));
const transKeys = new Set(data.transKeys);

async function sourceFiles(directory) {
	const files = [];
	for (const entry of await fs.readdir(directory, { withFileTypes: true })) {
		const filename = path.join(directory, entry.name);
		if (entry.isDirectory()) {
			if (entry.name !== "locales" && entry.name !== "paraglide") {
				files.push(...(await sourceFiles(filename)));
			}
		} else if (/\.(?:js|jsx|ts|tsx)$/.test(entry.name)) {
			files.push(filename);
		}
	}
	return files;
}

const allKeys = Object.keys(mapping);
const dynamicKeys = new Set([
	...data.transKeys,
	...allKeys.filter((key) =>
		[
			"keyboard-shortcuts.shortcuts.",
			"chat.reasoning_effort.levels.",
			"scheduledJobs.status.",
			"model-router.rules.quantifier-",
		].some((prefix) => key.startsWith(prefix))
	),
	...allKeys.filter(
		(key) => key.startsWith("chat.mode.") && key.endsWith(".title")
	),
	...data.pluralBases.map(({ base }) => base),
	...allKeys.filter((key) => key.startsWith("main-page.greetings.")),
]);

const ids = [
	...new Set([...dynamicKeys].map((key) => mapping[key]).filter(Boolean)),
].sort((a, b) => Number(a.slice(1)) - Number(b.slice(1)));
const importAliases = new Map(ids.map((id) => [id, `__pg_${id}`]));
const mappingEntries = [...dynamicKeys]
	.filter((key) => mapping[key])
	.sort()
	.map((key) => `\t${JSON.stringify(key)}: ${importAliases.get(mapping[key])},`)
	.join("\n");
const greetingEntries = [...dynamicKeys]
	.filter((key) => key.startsWith("main-page.greetings.") && mapping[key])
	.sort()
	.map((key) => `\t${JSON.stringify(key)}: ${importAliases.get(mapping[key])},`)
	.join("\n");
const greetingOrderByLocale = Object.fromEntries(
	Object.entries(data.catalogs).map(([locale, catalog]) => [
		locale,
		Object.keys(catalog).filter((key) =>
			key.startsWith("main-page.greetings.")
		),
	])
);
await fs.writeFile(
	path.join(source, "paraglide/dynamic-messages.js"),
	`import { ${ids.map((id) => `${id} as ${importAliases.get(id)}`).join(", ")} } from "./messages.js";\n` +
		`export const dynamicMessages = {\n${mappingEntries}\n};\n` +
		`export const greetingMessages = {\n${greetingEntries}\n};\n` +
		`export const greetingOrderByLocale = ${JSON.stringify(greetingOrderByLocale)};\n`
);

const i18nSource = `import { getLocale, locales, setLocale } from "./runtime.js";
import { dynamicMessages, greetingMessages, greetingOrderByLocale } from "./dynamic-messages.js";

const listeners = new Set();
const eventListeners = new Map();
let version = 0;
let language = detectLanguage();
let resolvedLanguage = resolveLocale(language);
setLocale(resolvedLanguage, { reload: false });

function resolveLocale(input) {
  const normalized = String(input || "en").replaceAll("_", "-").toLowerCase();
  if (locales.includes(normalized)) return normalized;
  const base = normalized.split("-")[0];
  return locales.includes(base) ? base : "en";
}

function detectLanguage() {
  if (typeof window === "undefined") return "en";
  const params = new URLSearchParams(window.location.search);
  const query = params.get("lng");
  if (query) return query.toLowerCase();
  const cookie = document.cookie.match(/(?:^|;\\s*)i18next=([^;]+)/)?.[1];
  if (cookie) return decodeURIComponent(cookie).toLowerCase();
  try {
    const stored = window.localStorage.getItem("i18nextLng");
    if (stored) return stored.toLowerCase();
  } catch {}
  try {
    const stored = window.sessionStorage.getItem("i18nextLng");
    if (stored) return stored.toLowerCase();
  } catch {}
  const browserLanguage = window.navigator.languages?.[0] || window.navigator.language;
  if (browserLanguage) return browserLanguage.toLowerCase();
  return document.documentElement.lang?.toLowerCase() || "en";
}

export function subscribe(listener) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function getVersion() { return version; }

export function t(key, options = {}) {
  if (typeof options === "string") options = { defaultValue: options };
  const textKey = String(key ?? "");
  if (options?.returnObjects && textKey.startsWith("main-page.greetings.")) {
    const values = {};
    const prefix = textKey + ".";
    const order = greetingOrderByLocale[resolvedLanguage] || greetingOrderByLocale.en || [];
    for (const fullKey of order) {
      if (!fullKey.startsWith(prefix)) continue;
      const relativeKey = fullKey.slice(prefix.length);
      const segments = relativeKey.split(".");
      let cursor = values;
      for (const segment of segments.slice(0, -1)) cursor = cursor[segment] ??= {};
      const message = greetingMessages[fullKey];
      if (message) cursor[segments.at(-1)] = message(options);
    }
    return Object.keys(values).length ? values : options.defaultValue ?? textKey;
  }
  const message = dynamicMessages[textKey];
  if (!message) return options.defaultValue ?? textKey;
  if (pluralKeys.has(textKey) && typeof options.count !== "number") {
    return options.defaultValue ?? textKey;
  }
  return message(options);
}

const pluralKeys = new Set(${JSON.stringify([...pluralKeys])});
const i18n = {
  get language() { return language; },
  get resolvedLanguage() { return resolvedLanguage; },
  get isInitialized() { return true; },
  t,
  changeLanguage(nextLanguage) {
    const next = String(nextLanguage || "en").replaceAll("_", "-").toLowerCase();
    language = next;
    resolvedLanguage = resolveLocale(next);
    setLocale(resolvedLanguage, { reload: false });
    version++;
    for (const listener of listeners) listener();
    for (const listener of eventListeners.get("languageChanged") || []) listener(language);
    try { window.localStorage.setItem("i18nextLng", language); } catch {}
    return Promise.resolve(i18n);
  },
  on(event, listener) {
    const callbacks = eventListeners.get(event) || new Set();
    callbacks.add(listener);
    eventListeners.set(event, callbacks);
    return i18n;
  },
  off(event, listener) {
    eventListeners.get(event)?.delete(listener);
    return i18n;
  },
  exists(key, options) { return Boolean(dynamicMessages[key] || options?.defaultValue); },
  getFixedT(_language, _namespace, keyPrefix) {
    return (key, options) => t(keyPrefix ? keyPrefix + "." + key : key, options);
  },
};
export default i18n;
`;
await fs.writeFile(path.join(source, "paraglide/i18n.js"), i18nSource);
await fs.writeFile(
	path.join(source, "paraglide/react-compat.js"),
	`import React, { useSyncExternalStore } from "react";
import i18n, { getVersion, subscribe, t } from "./i18n.js";
import { dynamicMessages } from "./dynamic-messages.js";

export function useTranslation() {
  useSyncExternalStore(subscribe, getVersion, getVersion);
  return { t, i18n, ready: true };
}

function renderParts(parts, components = {}) {
  const root = [];
  const stack = [{ name: null, component: null, children: root }];
  let keyIndex = 0;
  const makeElement = (name, part, children) => {
    const supplied = components?.[name];
    const props = { ...(part.attributes || {}), ...(part.options || {}), key: "paraglide-trans-" + keyIndex++ };
    if (React.isValidElement(supplied)) return React.cloneElement(supplied, props, ...(children || []));
    return React.createElement(name, props, ...(children || []));
  };
  for (const part of parts) {
    if (part.type === "text") stack.at(-1).children.push(part.value);
    else if (part.type === "markup-start") {
      const frame = { name: part.name, part, children: [] };
      stack.at(-1).children.push(frame);
      stack.push(frame);
    } else if (part.type === "markup-end") {
      const frame = stack.at(-1);
      if (stack.length > 1 && frame.name === part.name) {
        stack.pop();
        const parent = stack.at(-1).children;
        parent[parent.length - 1] = makeElement(frame.name, frame.part, frame.children);
      }
    } else if (part.type === "markup-standalone") {
      stack.at(-1).children.push(makeElement(part.name, part, []));
    }
  }
  while (stack.length > 1) {
    const frame = stack.pop();
    const parent = stack.at(-1).children;
    parent[parent.length - 1] = makeElement(frame.name, frame.part, frame.children);
  }
  return root;
}

export function Trans(props) {
  useTranslation();
  const key = props.i18nKey || props.i18nKey?.toString?.();
  if (!key) return props.children ?? null;
  const message = dynamicMessages[key];
  if (!message) return props.defaultValue ?? key;
  const values = { ...(props.values || {}) };
  if (props.count !== undefined) values.count = props.count;
  if (props.parent === null) return message(values);
  if (typeof message.parts !== "function") return message(values);
  const content = renderParts(message.parts(values), props.components || {});
  return React.createElement(React.Fragment, null, ...content);
}

export function I18nextProvider({ children }) { return children; }
`
);
await fs.writeFile(
	path.join(source, "paraglide/i18next-compat.js"),
	`export { default } from "./i18n.js";\nexport { t } from "./i18n.js";\n`
);
await fs.writeFile(
	path.join(source, "i18n.js"),
	`export { default } from "./paraglide/i18n.js";\n`
);

let changedCalls = 0;
let changedFiles = 0;
let unsupported = [];
for (const filename of await sourceFiles(source)) {
	let code = await fs.readFile(filename, "utf8");
	code = code
		.replaceAll('from "react-i18next"', 'from "@/paraglide/react-compat.js"')
		.replaceAll("from 'react-i18next'", "from '@/paraglide/react-compat.js'")
		.replaceAll('from "i18next"', 'from "@/paraglide/i18next-compat.js"')
		.replaceAll("from 'i18next'", "from '@/paraglide/i18next-compat.js'");
	let ast;
	try {
		ast = parse(code, { sourceType: "module", plugins: ["jsx", "typescript"] });
	} catch {
		continue;
	}
	const edits = [];
	const usedNames = new Set();
	const calls = [];
	let lastImportEnd = 0;
	traverse(ast, {
		Identifier(p) {
			usedNames.add(p.node.name);
		},
		ImportDeclaration(p) {
			lastImportEnd = Math.max(lastImportEnd, p.node.end);
		},
		CallExpression(p) {
			const node = p.node;
			if (node.callee.type !== "Identifier" || node.callee.name !== "t") return;
			const binding = p.scope.getBinding("t");
			const fromTranslationHook =
				binding?.path.isVariableDeclarator() &&
				binding.path.node.init?.callee?.name === "useTranslation";
			const fromDirectI18next =
				binding?.path.isImportSpecifier() &&
				binding.path.parentPath.node.source.value ===
					"@/paraglide/i18next-compat.js";
			if (!fromTranslationHook && !fromDirectI18next) return;
			const arg = node.arguments[0];
			const key =
				arg?.type === "StringLiteral"
					? arg.value
					: arg?.type === "TemplateLiteral" && arg.expressions.length === 0
						? arg.quasis[0].value.cooked
						: undefined;
			if (!key) return;
			// Unknown static keys intentionally stay on the compatibility adapter:
			// i18next returns the key or its defaultValue for these too.
			if (!mapping[key]) return;
			if (pluralKeys.has(key) || transKeys.has(key)) return;
			const second = node.arguments[1];
			if (
				node.arguments.length > 2 ||
				(second &&
					second.type !== "ObjectExpression" &&
					second.type !== "StringLiteral")
			) {
				unsupported.push(
					`${path.relative(source, filename)}:${node.loc.start.line} argument shape ${second?.type}`
				);
				return;
			}
			calls.push({ node, key, id: mapping[key], second });
		},
	});
	if (!calls.length) {
		if (code !== (await fs.readFile(filename, "utf8"))) {
			await fs.writeFile(filename, code);
			changedFiles++;
		}
		continue;
	}
	const aliases = new Map();
	for (const { id } of calls) {
		if (aliases.has(id)) continue;
		let alias = `__pg_${id}`;
		let suffix = 0;
		while (usedNames.has(alias)) alias = `__pg_${id}_${++suffix}`;
		usedNames.add(alias);
		aliases.set(id, alias);
	}
	for (const { node, id, second } of calls) {
		const forwarded =
			second?.type === "ObjectExpression"
				? code.slice(second.start, second.end)
				: "";
		edits.push({
			start: node.start,
			end: node.end,
			value: `${aliases.get(id)}(${forwarded})`,
		});
	}
	const imports = [...aliases]
		.map(([id, alias]) => `${id} as ${alias}`)
		.join(", ");
	edits.push({
		start: lastImportEnd,
		end: lastImportEnd,
		value: `\nimport { ${imports} } from "@/paraglide/messages.js";`,
	});
	edits.sort((a, b) => b.start - a.start);
	for (const edit of edits)
		code = code.slice(0, edit.start) + edit.value + code.slice(edit.end);
	await fs.writeFile(filename, code);
	changedCalls += calls.length;
	changedFiles++;
}

const languageOptionsPath = path.join(source, "hooks/useLanguageOptions.js");
let languageOptions = await fs.readFile(languageOptionsPath, "utf8");
const nativeResourceImport =
	'import { resources as languages } from "@/locales/resources";';
if (languageOptions.includes(nativeResourceImport)) {
	languageOptions = languageOptions
		.replace(
			nativeResourceImport,
			'import { locales } from "@/paraglide/runtime";'
		)
		.replace(
			"const supportedLanguages = Object.keys(languages);",
			"const supportedLanguages = [...locales];"
		)
		.replace(
			"if (!Object.keys(languages).includes(newLang))",
			"if (!locales.includes(newLang))"
		);
	if (
		languageOptions.includes(nativeResourceImport) ||
		languageOptions.includes("Object.keys(languages)")
	) {
		throw new Error(
			"Could not replace the language picker resource metadata with Paraglide locales"
		);
	}
	await fs.writeFile(languageOptionsPath, languageOptions);
	changedFiles++;
} else if (
	!languageOptions.includes('import { locales } from "@/paraglide/runtime";')
) {
	throw new Error(
		"The language picker must source its locale IDs from Paraglide runtime"
	);
}
if (unsupported.length) {
	throw new Error(
		`Unconverted static calls:\n${unsupported.slice(0, 40).join("\n")}`
	);
}
console.log(
	JSON.stringify(
		{
			staticCallsConverted: changedCalls,
			filesChanged: changedFiles,
			dynamicMessages: dynamicKeys.size,
			transMessages: data.transKeys.length,
			dynamicPluralBaseKeys: data.pluralBases.map(({ base }) => base),
		},
		null,
		2
	)
);
