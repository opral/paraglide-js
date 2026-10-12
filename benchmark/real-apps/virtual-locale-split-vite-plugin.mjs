import fs from "node:fs/promises";
import path from "node:path";

const VIRTUAL_MESSAGES = "virtual:paraglide/split-messages";

/**
 * Prototype only: replace the client message index with a sync facade over
 * locale-specific dynamic chunks. SSR deliberately keeps the generated index.
 */
export function virtualLocaleSplit({ generatedDirectory, enabled = true }) {
	if (!enabled) return { name: "paraglide-virtual-locale-split-disabled" };
	const generated = path.resolve(generatedDirectory);
	const rootId = "\0paraglide:virtual-root";
	const preloadId = "\0paraglide:virtual-preload";
	const variantPrefix = "\0paraglide:virtual-locale:";
	let originalIndex;
	let locales;
	let exports;
	let hasParts;
	let runtimePath;
	let generatedFiles = new Set();
	let resolvedConfig;
	let preloadEntry;

	const loadMetadata = async () => {
		if (originalIndex) return;
			runtimePath = path.join(generated, "runtime.js");
		const indexPath = path.join(generated, "messages/_index.js");
		originalIndex = await fs.readFile(
			indexPath,
			"utf8"
		);
		locales = [...originalIndex.matchAll(/^import \* as (\w+) from "\.\/([^"/]+)\.js"$/gm)].map(
			([, binding, locale]) => ({ binding, locale })
		);
		exports = [...originalIndex.matchAll(/^export const (\w+) =/gm)].map(([, name]) => name);
		hasParts = new Map(
			exports.map((name) => {
				const start = originalIndex.indexOf(`export const ${name} =`);
				const next = originalIndex.indexOf("\nexport const ", start + 1);
				const body = originalIndex.slice(start, next < 0 ? undefined : next);
				return [name, /\n\s*parts:/.test(body)];
			})
		);
		if (!locales.length || !exports.length) {
			throw new Error(
				`Could not read the generated locale-modules index in ${generated}`
			);
		}
		generatedFiles = new Set([
			runtimePath,
			indexPath,
			...locales.map(({ locale }) => path.join(generated, "messages", `${locale}.js`)),
		]);
	};

	return {
		name: "paraglide-virtual-locale-split-prototype",
		enforce: "pre",
		configResolved(config) {
			resolvedConfig = config;
		},
		buildStart() {
			if (resolvedConfig.command === "build" && !resolvedConfig.build.ssr) {
				preloadEntry = this.emitFile({
					type: "chunk",
					id: preloadId,
					name: "paraglide-locale-preload",
				});
			}
		},
		transformIndexHtml: {
			order: "pre",
			handler(html) {
				if (resolvedConfig.command !== "serve") return html;
				return html.replace(
					/<head(?:\s[^>]*)?>/i,
					(head) =>
						`${head}<script type="module" src="/@id/__x00__paraglide:virtual-preload"></script>`
				);
			},
		},
		async resolveId(source, importer, options) {
			if (source === preloadId) return preloadId;
			if (
				!options?.ssr &&
				((source === "./messages.js" && importer?.includes("/paraglide/")) ||
					source === "@/paraglide/messages.js" ||
					source.endsWith("/paraglide/messages.js") ||
					path.resolve(source) === path.join(generated, "messages.js"))
			) {
				await loadMetadata();
				return rootId;
			}
			if (source === VIRTUAL_MESSAGES) {
				await loadMetadata();
				if (options?.ssr) return null;
				return rootId;
			}
			if (source.startsWith(`${VIRTUAL_MESSAGES}/`)) {
				await loadMetadata();
				const locale = decodeURIComponent(source.slice(`${VIRTUAL_MESSAGES}/`.length));
				if (locales.some((item) => item.locale === locale)) {
					return `${variantPrefix}${locale}`;
				}
			}
		},
		async load(id) {
			await loadMetadata();
			if (id === preloadId) {
				const chooseImport = locales
					.map(
						({ locale }) =>
							`locale === ${JSON.stringify(locale)} ? import(${JSON.stringify(`${VIRTUAL_MESSAGES}/${encodeURIComponent(locale)}`)}) : `
					)
					.join("");
				return `
import { baseLocale, getLocale } from ${JSON.stringify(runtimePath)};
const locales = ${JSON.stringify(locales.map(({ locale }) => locale))};
const load = (locale) => (${chooseImport}Promise.resolve());
let startupLocale = baseLocale;
try { const detected = getLocale(); if (locales.includes(detected)) startupLocale = detected; } catch {}
void Promise.all([load(baseLocale), load(startupLocale)]).catch(() => {});
`;
			}
			if (id === rootId) {
				const chooseImport = locales
					.map(
						({ locale }) =>
							`locale === ${JSON.stringify(locale)} ? import(${JSON.stringify(`${VIRTUAL_MESSAGES}/${encodeURIComponent(locale)}`)}) : `
					)
					.join("");
				const unsupported = `Promise.reject(new Error(\`Unsupported Paraglide locale: \${locale}\`))`;
				// Validate one deterministic generated export. Checking every name
				// defeats Rollup's static tree shaking and retains the full catalog
				// in every selected-locale chunk.
				const probeExport = exports[0];
				const wrappers = exports
					.map((name) => {
						const parts = hasParts.get(name)
							? `\n${name}.parts = (...args) => { const locale = args[1]?.locale ?? getLocale(); const message = requireLoadedLocale(locale).${name}; return message.parts ? message.parts(...args) : [{ type: "text", value: message(...args) }]; };`
							: "";
						return `export const ${name} = (...args) => requireLoadedLocale(args[1]?.locale ?? getLocale()).${name}(...args);${parts}`;
					})
					.join("\n");
				return `
import { baseLocale, getLocale, setLocale, overwriteSetLocale, toLocale } from ${JSON.stringify(runtimePath)};
const locales = ${JSON.stringify(locales.map(({ locale }) => locale))};
const canonicalLocale = (locale) => { const normalized = toLocale(locale); return normalized && locales.includes(normalized) ? normalized : undefined; };
const loadedLocales = new Map();
const loadingLocales = new Map();
const originalSetLocale = setLocale;
const startupLocale = getLocale();
let latestLocaleIntent = 0;
async function loadLocale(locale) {
	const normalized = canonicalLocale(locale);
	if (!normalized) throw new Error(\`Unsupported Paraglide locale: \${locale}\`);
	locale = normalized;
	if (loadedLocales.has(locale)) return;
	let loading = loadingLocales.get(locale);
			if (!loading) {
				loading = (${chooseImport}${unsupported})
					.then((messages) => {
						if (!messages || typeof messages !== "object" || typeof messages[${JSON.stringify(probeExport)}] !== "function") {
							throw new Error(\`Loading Paraglide locale "\${locale}" did not return its generated message exports. Reload the page to retry the failed module request.\`);
						}
						loadedLocales.set(locale, messages);
						loadingLocales.delete(locale);
					})
			.catch((error) => { loadingLocales.delete(locale); throw error; });
		loadingLocales.set(locale, loading);
	}
	await loading;
}
overwriteSetLocale((locale, options) => {
	if (options?.reload !== false) return originalSetLocale(locale, options);
	const intent = ++latestLocaleIntent;
	const resolvedLocale = canonicalLocale(locale) ?? baseLocale;
	return loadLocale(resolvedLocale).then(() => {
		if (intent !== latestLocaleIntent) return;
		return originalSetLocale(resolvedLocale, options);
	});
});
function requireLoadedLocale(locale) {
	const resolvedLocale = canonicalLocale(locale) ?? baseLocale;
	const loaded = loadedLocales.get(resolvedLocale);
	if (!loaded) throw new Error(\`Paraglide locale \"\${locale}\" is not loaded. Await loadLocale(\"\${locale}\") before calling its synchronous messages.\`);
	return loaded;
}
await Promise.all([loadLocale(baseLocale), loadLocale(startupLocale)]);
${wrappers}
`;
			}
			if (id.startsWith(variantPrefix)) {
				const locale = id.slice(variantPrefix.length);
				const selected = locales.find((item) => item.locale === locale);
				if (!selected) throw new Error(`Unknown Paraglide locale ${locale}`);
				return `export * from ${JSON.stringify(path.join(generated, "messages", `${selected.locale}.js`))};\n`;
			}
		},
		generateBundle: {
			order: "post",
			handler(_options, bundle) {
				if (!preloadEntry) return;
				const html = bundle["index.html"];
				if (!html || html.type !== "asset") return;
				const source =
					typeof html.source === "string"
						? html.source
						: Buffer.from(html.source).toString("utf8");
				const fileName = this.getFileName(preloadEntry);
				const base = resolvedConfig.base.endsWith("/")
					? resolvedConfig.base
					: `${resolvedConfig.base}/`;
				const src = `${base}${fileName}`;
				html.source = source.replace(
					/<head(?:\s[^>]*)?>/i,
					(head) => `${head}<script type="module" src="${src}"></script>`
				);
			},
		},
		async configureServer(server) {
			await loadMetadata();
			server.watcher.add([generated, ...generatedFiles]);
		},
		async handleHotUpdate(context) {
			if (!generatedFiles.has(path.resolve(context.file))) return;
			originalIndex = undefined;
			locales = undefined;
			exports = undefined;
			hasParts = undefined;
			generatedFiles = new Set();
			await loadMetadata();
			context.server.watcher.add([...generatedFiles]);
			for (const module of context.server.moduleGraph.idToModuleMap.values()) {
				if (module.id === rootId || module.id === preloadId || module.id.startsWith(variantPrefix)) {
					context.server.moduleGraph.invalidateModule(module);
				}
			}
			context.server.ws.send({ type: "full-reload" });
			return [];
		},
	};
}
