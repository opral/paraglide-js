#!/usr/bin/env node
/**
 * Rebuild the pinned Open WebUI checkout in an isolated worktree with an
 * auth-route-only Paraglide adapter. The app remains i18next on every other
 * route and whenever backend-provided translation overrides are configured.
 */
import fs from "node:fs/promises";
import { createRequire } from "node:module";
import path from "node:path";
import { fileURLToPath } from "node:url";

const repo = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const appRoot = path.resolve(process.env.OPENWEBUI_CANDIDATE ?? path.join(repo, ".real-apps/openwebui-paraglide-ab"));
const sourceRoot = path.resolve(process.env.OPENWEBUI_SOURCE ?? path.join(repo, ".real-apps/open-webui-source"));
const capturePath = path.resolve(process.env.OPENWEBUI_CAPTURE ?? path.join(repo, "benchmark/real-apps/results/native-openweb-auth-fixture.json"));
const compilerRoot = path.resolve(process.env.PARAGLIDE_COMPILER_ROOT ?? "/root/repos-iii/paraglide-client-split-current-api");
const compilerEntry = path.join(compilerRoot, "dist/index.js");
const clientLocaleSplit = process.env.OPENWEBUI_CLIENT_LOCALE_SPLIT === "1";
const enableSwitchHook = process.env.OPENWEBUI_ENABLE_SWITCH_HOOK === "1";
const strategy = ["localStorage", "baseLocale"];
const scratch = path.join(repo, ".real-apps/openwebui-auth-generated");
const keyPattern = /(?:\$i18n|\bi18n)\.t\s*\(/g;
const pluralSuffixes = ["zero", "one", "two", "few", "many", "other"];
const readJson = async (filename) => JSON.parse(await fs.readFile(filename, "utf8"));

async function collectAuthRoute() {
	const capture = await readJson(capturePath);
	const resources = capture.apps[0].routeCapture.runs[0].resources;
	const sources = new Map();
	for (const resource of resources) {
		if (!resource.name.endsWith(".js")) continue;
		const mapPath = path.join(sourceRoot, "build", `${resource.name.slice(1)}.map`);
		try {
			const map = await readJson(mapPath);
			for (let index = 0; index < map.sources.length; index++) {
				const source = map.sources[index];
				const contents = map.sourcesContent?.[index];
				if (source?.includes("/src/") && typeof contents === "string") sources.set(source, contents);
			}
		} catch {
			// A few runtime-only chunks do not have source maps.
		}
	}
	const calls = [];
	const dynamicCalls = [];
	for (const [source, contents] of sources) {
		for (const match of contents.matchAll(keyPattern)) {
			let cursor = match.index + match[0].length;
			while (/\s/.test(contents[cursor] ?? "")) cursor++;
			const quote = contents[cursor];
			const line = contents.slice(0, match.index).split("\n").length;
			if (quote !== "'" && quote !== '"' && quote !== "`") {
				dynamicCalls.push({ source, line });
				continue;
			}
			let end = cursor + 1;
			let escaped = false;
			for (; end < contents.length; end++) {
				const char = contents[end];
				if (escaped) escaped = false;
				else if (char === "\\") escaped = true;
				else if (char === quote) break;
			}
			const raw = contents.slice(cursor + 1, end);
			if (quote === "`" && raw.includes("${")) {
				dynamicCalls.push({ source, line });
				continue;
			}
			calls.push({ key: raw.replace(/\\([\\'"`])/g, "$1"), source, line });
		}
	}
	const keys = [...new Set(calls.map(({ key }) => key))].sort();
	const sourceModules = [...new Set(calls.map(({ source }) => source))].sort();
	if (dynamicCalls.length) throw new Error(`Auth route has non-literal translation calls: ${JSON.stringify(dynamicCalls)}`);
	if (keys.length !== 106 || calls.length !== 115 || sourceModules.length !== 10) {
		throw new Error(`Auth route inventory changed: ${keys.length} keys, ${calls.length} call sites, ${sourceModules.length} source modules`);
	}
	return { capture, calls, keys, sourceModules };
}

function normalizeInterpolation(value) {
	return value.replace(/\{\{\s*([^{}]+?)\s*\}\}/g, "{$1}");
}

function sampleCountForCategory(locale, category) {
	const rules = new Intl.PluralRules(locale);
	const candidates = [
		...Array.from({ length: 10001 }, (_, count) => count),
		-100, -21, -5, -2, -1, -0.5, 0.1, 0.5, 1.2, 1.5, 2.5, 21.5, 1000, 1_000_000,
	];
	for (const count of candidates) {
		if (rules.select(count) === category) return count;
	}
	return null;
}

async function makeCatalogs(route) {
	const inputLocaleRoot = path.join(sourceRoot, "src/lib/i18n/locales");
	const dirs = (await fs.readdir(inputLocaleRoot, { withFileTypes: true }))
		.filter((entry) => entry.isDirectory())
		.map((entry) => entry.name)
		.sort();
	if (dirs.length !== 64 || !dirs.includes("en-US") || !dirs.includes("fr-FR")) {
		throw new Error(`Expected 64 pinned locale directories, found ${dirs.length}`);
	}
	const catalogs = new Map();
	for (const locale of dirs) catalogs.set(locale, await readJson(path.join(inputLocaleRoot, locale, "translation.json")));
	const base = catalogs.get("en-US");
	for (const locale of dirs) {
		for (const suffix of pluralSuffixes) {
			const value = catalogs.get(locale)[`Starting in {{count}} minutes_${suffix}`];
			if (typeof value === "string" && /\d/.test(value.replace(/\{\{\s*count\s*\}\}/g, ""))) {
				throw new Error(`Unexpected fixed digit in ${locale} plural form ${suffix}; safe count templating needs review`);
			}
		}
	}
	const requireFromApp = createRequire(path.join(sourceRoot, "package.json"));
	const nativeI18next = requireFromApp("i18next").createInstance();
	const nativeResources = Object.fromEntries(dirs.map((locale) => [locale, { translation: catalogs.get(locale) }]));
	await nativeI18next.init({
		lng: "en-US",
		resources: nativeResources,
		fallbackLng: { fr: ["fr-FR"], default: ["en-US"] },
		ns: "translation",
		keySeparator: false,
		nsSeparator: false,
		returnEmptyString: false,
		interpolation: { escapeValue: false },
	});
	const keyToId = Object.fromEntries(route.keys.map((key, index) => [key, `k${index}`]));
	const pluralKeys = route.keys.filter((key) => dirs.some((locale) =>
		pluralSuffixes.some((suffix) => `${key}_${suffix}` in catalogs.get(locale)),
	));
	if (pluralKeys.length !== 1 || pluralKeys[0] !== "Starting in {{count}} minutes") {
		throw new Error(`Unexpected plural families in auth route: ${JSON.stringify(pluralKeys)}`);
	}
	const projectMessages = path.join(scratch, "messages");
	await fs.rm(scratch, { recursive: true, force: true });
	await fs.mkdir(projectMessages, { recursive: true });
	for (const locale of dirs) {
		const catalog = catalogs.get(locale);
		await nativeI18next.changeLanguage(locale);
		const entries = {};
		for (const key of route.keys) {
			const id = keyToId[key];
			if (pluralKeys.includes(key)) {
				const categories = new Intl.PluralRules(locale).resolvedOptions().pluralCategories;
				const match = {};
				const nativePattern = (count) => String(nativeI18next.t(key, { count })).split(String(count)).join("{count}");
				match["countPluralExact=0, countPlural=*"] = nativePattern(0);
				for (const category of categories) {
					const sample = sampleCountForCategory(locale, category);
					if (sample === null) throw new Error(`Could not find a representative count for ${locale}/${category}`);
					match[`countPluralExact=*, countPlural=${category}`] = nativePattern(sample);
				}
				const fallbackSample = sampleCountForCategory(locale, "other") ?? 2;
				match["countPluralExact=*, countPlural=*"] = nativePattern(fallbackSample);
				entries[id] = [{
					declarations: ["input count", "local countPluralExact = count", "local countPlural = count: plural"],
					selectors: ["countPluralExact", "countPlural"],
					match,
				}];
				continue;
			}
			const own = catalog[key];
			const resolved = typeof own === "string" && own.length ? own : (base[key] || key);
			entries[id] = normalizeInterpolation(resolved);
		}
		await fs.writeFile(path.join(projectMessages, `${locale}.json`), `${JSON.stringify(entries, null, 2)}\n`);
	}
	const modulePath = path.join(compilerRoot, "node_modules/@inlang/plugin-message-format/dist/index.js");
	await fs.mkdir(path.join(scratch, "project.inlang"), { recursive: true });
	await fs.writeFile(path.join(scratch, "project.inlang/settings.json"), `${JSON.stringify({
		$schema: "https://inlang.com/schema/project-settings",
		baseLocale: "en-US",
		locales: dirs,
		modules: [modulePath],
		"plugin.inlang.messageFormat": { pathPattern: "./messages/{locale}.json" },
	}, null, 2)}\n`);
	const projectRoot = path.join(appRoot, "project.inlang");
	await fs.rm(projectRoot, { recursive: true, force: true });
	await fs.cp(path.join(scratch, "project.inlang"), projectRoot, { recursive: true });
	await fs.rm(path.join(appRoot, "messages"), { recursive: true, force: true });
	await fs.cp(projectMessages, path.join(appRoot, "messages"), { recursive: true });
	await fs.writeFile(path.join(appRoot, "project.inlang/paraglide.config.js"), `import { defineConfig } from ${JSON.stringify(new URL(`file://${compilerEntry}`).href)};\nexport default defineConfig({ outdir: "./src/lib/paraglide-auth", outputStructure: "locale-modules", strategy: ${JSON.stringify(strategy)}, localStorageKey: "locale", emitTsDeclarations: false });\n`);
	return { locales: dirs, keyToId, pluralKeys };
}

async function installAppAdapter(route, catalogs) {
	const projectRoot = path.join(appRoot, "project.inlang");
	const layoutPath = path.join(appRoot, "src/routes/+layout.svelte");
	const layout = await fs.readFile(layoutPath, "utf8");
	const oldImport = "import i18n, { initI18n, getLanguages, changeLanguage } from '$lib/i18n';";
	if (!layout.includes(oldImport)) throw new Error("Expected +layout i18n import was not found");
	let nextLayout = layout.replace(oldImport, "import { writable } from 'svelte/store';\n\timport languages from '$lib/i18n/locales/languages.json';");
	const contextAnchor = "\tsetContext('i18n', i18n);";
	if (!nextLayout.includes(contextAnchor)) throw new Error("Expected i18n context setter was not found");
	nextLayout = nextLayout.replace(contextAnchor, `\tconst i18n = writable({ language: 'en-US', t: (key) => key });\n\tsetContext('i18n', i18n);`);
	const initAnchor = "\t\tawait initI18n(backendConfig?.default_locale, backendConfig?.i18n ?? {});\n\t\tif (!localStorage.locale) {\n\t\t\tconst languages = await getLanguages();\n\t\t\tconst browserLanguages = navigator.languages\n\t\t\t\t? navigator.languages\n\t\t\t\t: [navigator.language || navigator.userLanguage];\n\t\t\tconst lang = backendConfig?.default_locale\n\t\t\t\t? backendConfig.default_locale\n\t\t\t\t: bestMatchingLanguage(languages, browserLanguages, 'en-US');\n\t\t\tawait changeLanguage(lang);\n\t\t}";
	if (!nextLayout.includes(initAnchor)) throw new Error("Expected i18next initialization block was not found");
	const candidateSwitchHook = enableSwitchHook ? `\n\t\t\twindow.__benchmarkSetLocale = async (requestedLocale) => {\n\t\t\t\tconst switchedLocale = await setAuthLocale(requestedLocale);\n\t\t\t\ti18n.set(createAuthI18n(switchedLocale));\n\t\t\t\treturn switchedLocale;\n\t\t\t};` : "";
	const nativeSwitchHook = enableSwitchHook ? `\n\t\t\twindow.__benchmarkSetLocale = async (locale) => {\n\t\t\t\tawait native.changeLanguage(locale);\n\t\t\t\treturn native.default.language;\n\t\t\t};` : "";
	const initReplacement = `\t\tconst backendI18nOverrides = backendConfig?.i18n ?? {};\n\t\tconst authRoute = window.location.pathname === '/auth';\n\t\tif (authRoute && Object.keys(backendI18nOverrides).length === 0) {\n\t\t\tconst queryLocale = new URL(window.location.href).searchParams.get('lang');\n\t\t\tconst storedLocale = localStorage.getItem('locale');\n\t\t\tconst browserLanguages = navigator.languages ? navigator.languages : [navigator.language || navigator.userLanguage];\n\t\t\tconst requested = queryLocale || storedLocale || backendConfig?.default_locale || bestMatchingLanguage(languages, browserLanguages, 'en-US');\n\t\t\tconst { createAuthI18n, setAuthLocale } = await import('$lib/i18n/paraglide-auth');\n\t\t\tconst locale = await setAuthLocale(requested);\n\t\t\ti18n.set(createAuthI18n(locale));${candidateSwitchHook}\n\t\t} else {\n\t\t\tconst native = await import('$lib/i18n');\n\t\t\tawait native.initI18n(backendConfig?.default_locale, backendI18nOverrides);\n\t\t\tif (!localStorage.locale) {\n\t\t\t\tconst browserLanguages = navigator.languages ? navigator.languages : [navigator.language || navigator.userLanguage];\n\t\t\t\tconst lang = backendConfig?.default_locale ? backendConfig.default_locale : bestMatchingLanguage(languages, browserLanguages, 'en-US');\n\t\t\t\tawait native.changeLanguage(lang);\n\t\t\t}\n\t\t\tnative.default.subscribe((value) => i18n.set(value));${nativeSwitchHook}\n\t\t}`;
	nextLayout = nextLayout.replace(initAnchor, initReplacement);
	await fs.writeFile(layoutPath, nextLayout);

	const metadata = { keyToId: catalogs.keyToId, pluralKeys: catalogs.pluralKeys };
	const localeStateCode = process.env.OPENWEBUI_PRESERVE_REQUESTED_LOCALE === "0"
		? `export const setAuthLocale = async (requested: string) => {\n  const bundle = toBundleCode(requested);\n  const exact = locales.find((locale) => locale.toLowerCase() === bundle.toLowerCase());\n  const resolved = exact ?? 'en-US';\n  await setLocale(resolved, { reload: false });\n  localStorage.setItem('locale', resolved);\n  document.documentElement.setAttribute('lang', resolved);\n  return getLocale();\n};`
		: `export const setAuthLocale = async (requested: string) => {\n  const requestedBundle = toBundleCode(requested);\n  const exact = locales.find((locale) => locale.toLowerCase() === requestedBundle.toLowerCase());\n  const resolved = exact ?? 'en-US';\n  await setLocale(resolved, { reload: false });\n  // i18next keeps the requested language/cache while resolving unknown locales via en-US.\n  localStorage.setItem('locale', requestedBundle);\n  document.documentElement.setAttribute('lang', requestedBundle);\n  return requestedBundle;\n};`;
	const adapterPath = path.join(appRoot, "src/lib/i18n/paraglide-auth.ts");
	await fs.writeFile(adapterPath, `import { m } from '../paraglide-auth/messages.js';\nimport { locales, getLocale, setLocale } from '../paraglide-auth/runtime.js';\nimport languages from './locales/languages.json';\n\nconst keyToId = ${JSON.stringify(metadata.keyToId)} as const;\nconst languageCodes = languages.map(({ code }) => code);\n\nconst toBundleCode = (code: string) => {\n  const ownBundle = languageCodes.find((bundle) => bundle.toLowerCase() === code.toLowerCase());\n  if (ownBundle) return ownBundle;\n  const baseLanguage = code.split('-')[0].toLowerCase();\n  const primaryBundle = \u0060\u0024{baseLanguage}-\u0024{baseLanguage.toUpperCase()}\u0060;\n  if (languageCodes.includes(primaryBundle)) return primaryBundle;\n  if (code.includes('-')) return code;\n  return languageCodes.find((bundle) => bundle.toLowerCase().startsWith(\u0060\u0024{baseLanguage}-\u0060)) ?? code;\n};\n\n${localeStateCode}\n\nconst translate = (key: string, options: Record<string, unknown> = {}) => {\n  const id = keyToId[key as keyof typeof keyToId];\n  const message = id && m[id as keyof typeof m];\n  if (typeof message !== 'function') return key;\n  const inputs = Object.fromEntries(Object.entries(options).filter(([name]) => !['defaultValue', 'lng', 'locale'].includes(name)));\n  return message(inputs as never);\n};\n\nexport const createAuthI18n = (locale = getLocale()) => ({ language: locale, t: translate });\n`);
	const vitePath = path.join(appRoot, "vite.config.ts");
	let vite = await fs.readFile(vitePath, "utf8");
	if (!vite.includes("from 'vite'")) throw new Error("Could not find Vite import in vite.config.ts");
	if (vite.includes("paraglideVitePlugin")) throw new Error("Candidate vite.config.ts is already modified");
	vite = vite.replace("import { defineConfig } from 'vite';", `import { defineConfig } from 'vite';\nimport { paraglideVitePlugin } from ${JSON.stringify(compilerEntry)};`);
	const pluginOptions = { project: "./project.inlang", outdir: "./src/lib/paraglide-auth", outputStructure: "locale-modules", strategy, localStorageKey: "locale", emitTsDeclarations: false, ...(clientLocaleSplit ? { experimentalClientLocaleSplit: true } : {}) };
	vite = vite.replace("plugins: [\n\t\tsveltekit(),", `plugins: [\n\t\tparaglideVitePlugin(${JSON.stringify(pluginOptions)}),\n\t\tsveltekit(),`);
	const buildAnchor = "build: {\n\t\tsourcemap: true";
	if (!vite.includes(buildAnchor)) throw new Error("Expected build.sourcemap config was not found");
	vite = vite.replace(buildAnchor, "build: {\n\t\ttarget: 'es2022',\n\t\tsourcemap: true");
	if (vite === await fs.readFile(vitePath, "utf8")) throw new Error("Failed to add Paraglide Vite plugin");
	await fs.writeFile(vitePath, vite);
	await fs.rm(path.join(appRoot, "openwebui-paraglide-precompile.html"), { force: true });
	await fs.rm(path.join(appRoot, "openwebui-paraglide-precompile.config.mjs"), { force: true });
	await fs.writeFile(path.join(appRoot, "openwebui-paraglide-auth-inventory.json"), `${JSON.stringify({
		pinnedCommit: route.capture.apps[0].sha,
		route: "/auth?lang=fr-FR",
		literalKeyCount: route.keys.length,
		callSiteCount: route.calls.length,
		translatedSourceModules: route.sourceModules,
		dynamicCalls: [],
		localeCount: catalogs.locales.length,
		pluralKeys: catalogs.pluralKeys,
		pluralConversion: "native i18next 23.16.8 resolved output compiled as structured countPlural/countPluralExact variants with dynamic {count}; exact zero and category fallback mirror the pinned resolver",
		clientLocaleSplit,
		switchHookEnabled: enableSwitchHook,
		adapterScope: "auth route only; backend i18n overrides use native i18next; other routes retain native i18next",
	}, null, 2)}\n`);
}

const route = await collectAuthRoute();
const catalogs = await makeCatalogs(route);
await installAppAdapter(route, catalogs);
console.log(JSON.stringify({ appRoot, compilerRoot, localeCount: catalogs.locales.length, literalKeys: route.keys.length, callSites: route.calls.length, modules: route.sourceModules.length }, null, 2));
