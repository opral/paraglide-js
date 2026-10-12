import nodeFs from "node:fs";
import { dirname, isAbsolute, join, resolve } from "node:path";
import type { Plugin, ResolvedConfig } from "vite";
import type { ViteClientLocaleSplitState } from "../unplugin.js";

const rootVirtualId = "virtual:paraglide/client-locale-split/root";
const coreVirtualId = "virtual:paraglide/client-locale-split/core";
const loaderVirtualId = "virtual:paraglide/client-locale-split/loader";
const preloadVirtualId = "virtual:paraglide/client-locale-split/preload";
const localeVirtualPrefix = "virtual:paraglide/client-locale-split/locale/";
const rootId = "\0paraglide:client-locale-split:root";
const coreId = "\0paraglide:client-locale-split:core";
const loaderId = "\0paraglide:client-locale-split:loader";
const preloadId = "\0paraglide:client-locale-split:preload";
const localeIdPrefix = "\0paraglide:client-locale-split:locale:";
const metadataFilename = "client-locale-split.json";

type MessageMetadata = {
	safeName: string;
	publicName: string;
	hasInputs: boolean;
	hasMarkup: boolean;
	staticTexts?: Record<string, string>;
};

type SplitMetadata = {
	baseLocale: string;
	locales: string[];
	messages: MessageMetadata[];
};

/** Replaces only the client facade; Vite SSR keeps the compiler output. */
export function createClientLocaleSplitPlugin(args: {
	state: ViteClientLocaleSplitState;
}): Plugin {
	let config: ResolvedConfig | undefined;
	let metadata: SplitMetadata | undefined;
	let metadataPath: string | undefined;
	let preloadEntry: string | undefined;

	const readMetadata = async (): Promise<SplitMetadata> => {
		const compilerOptions = args.state.compilerOptions;
		if (!compilerOptions) {
			throw new Error(
				"Paraglide client locale splitting could not resolve the compiler output directory."
			);
		}
		const currentMetadataPath = resolve(
			compilerOptions.outdir,
			metadataFilename
		);
		if (metadata && metadataPath === currentMetadataPath) return metadata;

		const fs = compilerOptions.fs ?? nodeFs;
		const source = await fs.promises.readFile(currentMetadataPath, "utf8");
		const parsed = JSON.parse(source) as Partial<SplitMetadata>;
		if (
			typeof parsed.baseLocale !== "string" ||
			!Array.isArray(parsed.locales) ||
			parsed.locales.some((locale) => typeof locale !== "string") ||
			!Array.isArray(parsed.messages) ||
			parsed.messages.some(
				(message) =>
					typeof message !== "object" ||
					message === null ||
					typeof message.safeName !== "string" ||
					typeof message.publicName !== "string" ||
					typeof message.hasInputs !== "boolean" ||
					typeof message.hasMarkup !== "boolean" ||
					(message.staticTexts !== undefined &&
						(typeof message.staticTexts !== "object" ||
							message.staticTexts === null ||
							Array.isArray(message.staticTexts) ||
							Object.values(message.staticTexts).some(
								(value) => typeof value !== "string"
							)))
			)
		) {
			throw new Error(
				`Invalid generated Paraglide client locale metadata at ${currentMetadataPath}. Re-run the Paraglide compiler.`
			);
		}
		if (!parsed.locales.includes(parsed.baseLocale)) {
			throw new Error(
				`Invalid generated Paraglide client locale metadata: base locale ${JSON.stringify(parsed.baseLocale)} is not in the locale list.`
			);
		}
		metadata = parsed as SplitMetadata;
		metadataPath = currentMetadataPath;
		return metadata;
	};

	const localeVirtualId = (locale: string) =>
		`${localeVirtualPrefix}${encodeURIComponent(locale)}`;

	return {
		name: "paraglide-vite-client-locale-split",
		enforce: "pre",
		configResolved(resolved) {
			config = resolved;
			if (
				resolved.command === "build" &&
				!resolved.build.ssr &&
				!supportsTopLevelAwait(resolved.build.target)
			) {
				throw new Error(
					"experimentalClientLocaleSplit requires an explicit Vite build.target of es2022 or newer (or esnext), because the client message facade awaits the selected locale before app modules execute."
				);
			}
		},
		buildStart: {
			// Rollup runs buildStart hooks in parallel unless a hook explicitly
			// waits for preceding plugins. Metadata is written by the compiler.
			sequential: true,
			async handler() {
				const data = await readMetadata();
				const compilerOptions = args.state.compilerOptions;
				metadataPath = join(compilerOptions!.outdir, metadataFilename);
				this.addWatchFile?.(metadataPath);
				if (config?.command === "build" && !config.build.ssr) {
					preloadEntry = this.emitFile({
						type: "chunk",
						id: preloadVirtualId,
						name: "paraglide-locale-preload",
					});
				}
				void data;
			},
		},
		transformIndexHtml: {
			order: "pre",
			handler(html) {
				if (config?.command !== "serve") return html;
				const base = config.base.startsWith("/") ? config.base : "/";
				const prefix = base.endsWith("/") ? base : `${base}/`;
				return html.replace(
					/<head(?:\s[^>]*)?>/i,
					(head) =>
						`${head}<script type="module" src="${prefix}@id/__x00__paraglide:client-locale-split:preload"></script>`
				);
			},
		},
		resolveId: {
			order: "pre",
			async handler(source, importer, options) {
				if (source === rootVirtualId) return rootId;
				if (source === coreVirtualId) return coreId;
				if (source === loaderVirtualId) return loaderId;
				if (source === preloadVirtualId) return preloadId;
				if (source.startsWith(localeVirtualPrefix)) {
					const locale = decodeURIComponent(
						source.slice(localeVirtualPrefix.length)
					);
					const data = await readMetadata();
					return data.locales.includes(locale)
						? `${localeIdPrefix}${encodeURIComponent(locale)}`
						: null;
				}

				if (options?.ssr) return null;
				const compilerOptions = args.state.compilerOptions;
				if (!compilerOptions || !importer) return null;
				const outdir = compilerOptions.outdir;
				const messagesEntry = resolve(outdir, "messages.js");
				const loaderEntry = resolve(outdir, "locale-loader.js");
				let target = resolveGeneratedImport(source, importer, outdir);
				if (
					!target &&
					importer &&
					/(?:^|\/)(?:messages|locale-loader)(?:\.js)?(?:[?#]|$)/.test(source)
				) {
					const resolved = await this.resolve(source, importer, {
						skipSelf: true,
					});
					if (resolved) {
						target = resolveGeneratedImport(resolved.id, importer, outdir);
					}
				}
				if (target === resolve(outdir, "messages")) target = messagesEntry;
				if (target === resolve(outdir, "locale-loader")) target = loaderEntry;
				if (target === messagesEntry) {
					await readMetadata();
					return rootId;
				}
				if (target === loaderEntry) {
					await readMetadata();
					return loaderId;
				}
				return null;
			},
		},
		async load(id) {
			const data = await readMetadata();
			if (id === preloadId) {
				return createPreloadModule();
			}
			if (id === loaderId) {
				return `export { loadLocale } from ${JSON.stringify(coreVirtualId)};\n`;
			}
			if (id === coreId) {
				return createCoreModule(
					data,
					localeVirtualId,
					resolve(args.state.compilerOptions!.outdir, "runtime.js")
				);
			}
			if (id === rootId) {
				return createMessageFacade(data);
			}
			if (id.startsWith(localeIdPrefix)) {
				const locale = decodeURIComponent(id.slice(localeIdPrefix.length));
				if (!data.locales.includes(locale)) {
					throw new Error(
						`Unknown Paraglide locale ${JSON.stringify(locale)}.`
					);
				}
				const dynamic = data.messages.flatMap((message, index) =>
					Object.hasOwn(message.staticTexts ?? {}, locale)
						? []
						: [`${message.safeName} as message${index}`]
				);
				const values = data.messages.map((message, index) =>
					Object.hasOwn(message.staticTexts ?? {}, locale)
						? JSON.stringify(message.staticTexts![locale])
						: `message${index}`
				);
				const imports = dynamic.length
					? `import { ${dynamic.join(", ")} } from ${JSON.stringify(resolve(args.state.compilerOptions!.outdir, "messages", `${locale}.js`))};\n`
					: "";
				return `${imports}export default [${values.join(",")}];\n`;
			}
			return null;
		},
		generateBundle: {
			order: "post",
			handler(_outputOptions, bundle) {
				if (!preloadEntry) return;
				const html = bundle["index.html"];
				if (!html || html.type !== "asset") return;
				const source =
					typeof html.source === "string"
						? html.source
						: Buffer.from(html.source).toString("utf8");
				const fileName = this.getFileName(preloadEntry);
				const base = config?.base.endsWith("/")
					? config.base
					: `${config?.base ?? "/"}/`;
				const src = `${base}${fileName}`;
				html.source = source.replace(
					/<head(?:\s[^>]*)?>/i,
					(head) => `${head}<script type="module" src="${src}"></script>`
				);
			},
		},
		handleHotUpdate(context) {
			if (metadataPath !== resolve(context.file)) return;
			metadata = undefined;
			for (const module of context.server.moduleGraph.idToModuleMap.values()) {
				if (
					module.id === rootId ||
					module.id === coreId ||
					module.id === loaderId ||
					module.id === preloadId ||
					module.id?.startsWith(localeIdPrefix)
				) {
					context.server.moduleGraph.invalidateModule(module);
				}
			}
			context.server.ws.send({ type: "full-reload" });
			return [];
		},
	};
}

function resolveGeneratedImport(
	source: string,
	importer: string,
	outdir: string
): string | undefined {
	const cleanSource = source.split(/[?#]/, 1)[0]!;
	const cleanImporter = importer.split(/[?#]/, 1)[0]!;
	if (isAbsolute(cleanSource)) return resolve(cleanSource);
	if (!cleanSource.startsWith(".") || !isAbsolute(cleanImporter))
		return undefined;
	const resolved = resolve(dirname(cleanImporter), cleanSource);
	return resolved.startsWith(`${resolve(outdir)}/`) ? resolved : undefined;
}

function supportsTopLevelAwait(target: string | string[] | false): boolean {
	if (target === false) return true;
	const targets = Array.isArray(target) ? target : [target];
	return (
		targets.length > 0 &&
		targets.every(
			(item) =>
				item === "esnext" ||
				(/^es20(2[2-9]|[3-9]\d)$/.test(item) && Number(item.slice(2)) >= 2022)
		)
	);
}

function createPreloadModule(): string {
	return `import { startupLocalePromise } from ${JSON.stringify(coreVirtualId)};\nawait startupLocalePromise;\n`;
}

function createMessageFacade(metadata: SplitMetadata): string {
	const imports = `import { selectedMessageLocale, requireLoadedLocale } from ${JSON.stringify(coreVirtualId)};`;
	const startup = `import { startupLocalePromise } from ${JSON.stringify(coreVirtualId)};\nawait startupLocalePromise;`;
	const wrapperDeclarations = metadata.messages
		.map(({ publicName, hasInputs, hasMarkup }, index) => {
			const inputParameter = hasInputs ? "inputs" : "inputs = {}";
			const parts = hasMarkup
				? `\n__paraglideMessage${index}.parts = (${inputParameter}, options = {}) => { const locale = selectedMessageLocale(options.locale); const message = requireLoadedLocale(locale)[${index}]; return typeof message === "string" ? [{ type: "text", value: message }] : typeof message.parts === "function" ? message.parts(inputs) : [{ type: "text", value: message(inputs) }]; };`
				: "";
			const directExport =
				publicName === "m" || publicName === "default"
					? ""
					: `\nexport { __paraglideMessage${index} as ${JSON.stringify(publicName)} };`;
			return `const __paraglideMessage${index} = (${inputParameter}, options = {}) => { const locale = selectedMessageLocale(options.locale); const message = requireLoadedLocale(locale)[${index}]; return typeof message === "string" ? message : message(inputs); };${parts}${directExport}`;
		})
		.join("\n");
	const namespaceProperties = metadata.messages
		.map((message, index) => ({ message, index }))
		.sort((left, right) =>
			left.message.publicName < right.message.publicName
				? -1
				: left.message.publicName > right.message.publicName
					? 1
					: 0
		)
		.map(
			({ message, index }) =>
				`__paraglideMessages[${JSON.stringify(message.publicName)}] = __paraglideMessage${index};`
		)
		.join("\n");
	return `${imports}\n${startup}\n${wrapperDeclarations}\nconst __paraglideMessages = Object.create(null);\n${namespaceProperties}\nObject.defineProperty(__paraglideMessages, Symbol.toStringTag, { value: "Module" });\nObject.freeze(__paraglideMessages);\nexport { __paraglideMessages as m };\n`;
}

function createCoreModule(
	metadata: SplitMetadata,
	localeVirtualId: (locale: string) => string,
	runtimePath: string
): string {
	const importCases = metadata.locales
		.map(
			(locale) =>
				`locale === ${JSON.stringify(locale)} ? import(${JSON.stringify(localeVirtualId(locale))}) : `
		)
		.join("");
	const probeCheck = `!Array.isArray(messages) || messages.length !== ${metadata.messages.length} || messages.some((message) => typeof message !== "string" && typeof message !== "function")`;
	return `import { baseLocale, getLocale, setLocale, overwriteSetLocale, toLocale } from ${JSON.stringify(runtimePath)};
const locales = ${JSON.stringify(metadata.locales)};
const loadedLocales = new Map();
const loadingLocales = new Map();
const canonicalLocale = (locale) => { const normalized = toLocale(locale); return normalized && locales.includes(normalized) ? normalized : undefined; };
const loadModule = (locale) => (${importCases}Promise.reject(new Error("Unsupported Paraglide locale: " + locale)));
export function loadLocale(locale) {
	const normalized = canonicalLocale(locale);
	if (!normalized) return Promise.reject(new Error("Unsupported Paraglide locale: " + locale));
	if (loadedLocales.has(normalized)) return Promise.resolve();
	let pending = loadingLocales.get(normalized);
	if (!pending) {
		pending = loadModule(normalized).then((module) => {
			const messages = module.default;
			if (!messages || ${probeCheck}) throw new Error("Loading Paraglide locale " + JSON.stringify(normalized) + " did not return its generated message exports.");
			loadedLocales.set(normalized, messages);
			loadingLocales.delete(normalized);
		}).catch((error) => { loadingLocales.delete(normalized); throw error; });
		loadingLocales.set(normalized, pending);
	}
	return pending;
}
const originalSetLocale = setLocale;
let latestLocaleIntent = 0;
overwriteSetLocale((locale, options) => {
	const intent = ++latestLocaleIntent;
	if (options?.reload !== false) return originalSetLocale(locale, options);
	const normalized = canonicalLocale(locale) ?? baseLocale;
	return loadLocale(normalized).then(() => {
		if (intent !== latestLocaleIntent) return;
		return originalSetLocale(normalized, options);
	});
});
export const selectedMessageLocale = (locale) => locale === undefined ? (canonicalLocale(getLocale()) ?? baseLocale) : (locales.includes(locale) ? locale : baseLocale);
export function requireLoadedLocale(locale) {
	const messages = loadedLocales.get(locale);
	if (!messages) throw new Error("Paraglide locale " + JSON.stringify(locale) + " is not loaded. Await loadLocale() before calling its synchronous messages.");
	return messages;
}
export const startupLocalePromise = Promise.all([
	loadLocale(baseLocale),
	loadLocale(canonicalLocale(getLocale()) ?? baseLocale)
]).then(() => undefined);
`;
}
