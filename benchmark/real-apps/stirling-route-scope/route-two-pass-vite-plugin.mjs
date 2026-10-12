import { createHash } from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { createRequire } from "node:module";

const DUMMY_SOURCE = "virtual:paraglide/route-probe-messages";
const DUMMY_ID = "\0paraglide:route-probe-messages";
const CORE_SOURCE = "virtual:paraglide/route-two-pass/core";
const CORE_ID = "\0paraglide:route-two-pass:core";
const PRELOAD_SOURCE = "virtual:paraglide/route-two-pass/preload";
const PRELOAD_ID = "\0paraglide:route-two-pass:preload";
const GROUP_SOURCE_PREFIX = "virtual:paraglide/route-two-pass/group/";
const GROUP_ID_PREFIX = "\0paraglide:route-two-pass:group:";
const LOADER_SOURCE_PREFIX = "virtual:paraglide/route-two-pass/loader/";
const LOADER_ID_PREFIX = "\0paraglide:route-two-pass:loader:";
const PAYLOAD_SOURCE_PREFIX = "virtual:paraglide/route-two-pass/payload/";
const PAYLOAD_ID_PREFIX = "\0paraglide:route-two-pass:payload:";

const frontendRoot = process.env.STIRLING_FRONTEND_ROOT;
if (!frontendRoot) throw new Error("Set STIRLING_FRONTEND_ROOT for the route prototype.");
const requireFromApp = createRequire(path.join(frontendRoot, "package.json"));
const ts = requireFromApp("typescript");
const MagicString = requireFromApp("magic-string");

const cleanId = (id) => id.split(/[?#]/, 1)[0];
const isMessageSource = (source) =>
	source === "@paraglide/messages.js" ||
	source === DUMMY_SOURCE ||
	source.endsWith("/paraglide/messages.js");

export function createRouteTwoPassPlugin({ mode, outdir, manifestPath }) {
	if (mode !== "discover" && mode !== "apply") {
		throw new Error(`Unknown route-prototype mode: ${mode}`);
	}
	const splitMetadata = JSON.parse(
		fs.readFileSync(path.join(outdir, "client-locale-split.json"), "utf8")
	);
	const mapping = JSON.parse(fs.readFileSync(path.join(outdir, "mapping.json"), "utf8"));
	const indexBySafeName = new Map(
		splitMetadata.messages.map((message, index) => [message.safeName, index])
	);
	const messageByIndex = splitMetadata.messages;
	const dummyModule = createDummyMessages(mapping, splitMetadata.messages);
	const usesByModule = new Map();
	let manifest = mode === "apply" ? JSON.parse(fs.readFileSync(manifestPath, "utf8")) : undefined;
	const groupByKey = new Map(manifest?.groups?.map((group) => [group.key, group]) ?? []);
	const payloadIds = new Map();
	const emittedPreload = { id: undefined };

	const groupSource = (key) => `${GROUP_SOURCE_PREFIX}${key}`;
	const loaderSource = (key) => `${LOADER_SOURCE_PREFIX}${key}`;
	const payloadSource = (key, locale) =>
		`${PAYLOAD_SOURCE_PREFIX}${key}/${encodeURIComponent(locale)}`;
	const localePath = (locale) => path.join(outdir, "messages", `${locale}.js`);

	return {
		name: `stirling-route-two-pass-${mode}`,
		enforce: "post",
		configResolved(config) {
			if (config.command === "build" && mode === "apply" && !config.build.ssr) {
				emittedPreload.id = undefined;
			}
		},
		buildStart() {
			usesByModule.clear();
			payloadIds.clear();
			if (mode === "apply" && manifest.groups.length > 0) {
				emittedPreload.id = this.emitFile({
					type: "chunk",
					id: PRELOAD_SOURCE,
					name: "paraglide-route-locale-preload",
				});
			}
		},
		resolveId: {
			order: "pre",
			handler(source) {
				if (mode === "discover" && source === DUMMY_SOURCE) return DUMMY_ID;
				if (mode !== "apply") return null;
				if (source === CORE_SOURCE) return CORE_ID;
				// Vite's HTML build pipeline may resolve the already encoded virtual ID
				// after transformIndexHtml injected it. Accept it idempotently.
				if (source === PRELOAD_ID) return PRELOAD_ID;
				if (source === PRELOAD_SOURCE) return PRELOAD_ID;
				if (source.startsWith(LOADER_SOURCE_PREFIX)) {
					const key = source.slice(LOADER_SOURCE_PREFIX.length);
					return groupByKey.has(key) ? `${LOADER_ID_PREFIX}${key}` : null;
				}
				if (source.startsWith(GROUP_SOURCE_PREFIX)) {
					const key = source.slice(GROUP_SOURCE_PREFIX.length);
					return groupByKey.has(key) ? `${GROUP_ID_PREFIX}${key}` : null;
				}
				if (source.startsWith(PAYLOAD_SOURCE_PREFIX)) {
					const raw = source.slice(PAYLOAD_SOURCE_PREFIX.length);
					const slash = raw.indexOf("/");
					const key = raw.slice(0, slash);
					const locale = decodeURIComponent(raw.slice(slash + 1));
					if (!groupByKey.has(key) || !splitMetadata.locales.includes(locale)) return null;
					return `${PAYLOAD_ID_PREFIX}${key}:${encodeURIComponent(locale)}`;
				}
				return null;
			},
		},
		load(id) {
			if (mode === "discover" && id === DUMMY_ID) return dummyModule;
			if (mode !== "apply") return null;
			if (id === CORE_ID) return createCoreModule(splitMetadata, manifest, loaderSource, outdir);
			if (id === PRELOAD_ID) {
				return `import { startupLocalePromise } from ${JSON.stringify(CORE_SOURCE)};\nawait startupLocalePromise;\n`;
			}
			if (id.startsWith(GROUP_ID_PREFIX)) {
				const key = id.slice(GROUP_ID_PREFIX.length);
				const group = groupByKey.get(key);
				return group && createGroupModule(group, splitMetadata, CORE_SOURCE, loaderSource);
			}
			if (id.startsWith(LOADER_ID_PREFIX)) {
				const key = id.slice(LOADER_ID_PREFIX.length);
				const group = groupByKey.get(key);
				return group && createGroupLoaderModule(group, splitMetadata, payloadSource);
			}
			if (id.startsWith(PAYLOAD_ID_PREFIX)) {
				const remainder = id.slice(PAYLOAD_ID_PREFIX.length);
				const splitAt = remainder.lastIndexOf(":");
				const key = remainder.slice(0, splitAt);
				const locale = decodeURIComponent(remainder.slice(splitAt + 1));
				const group = groupByKey.get(key);
				return group && createPayloadModule(group, splitMetadata, locale, outdir);
			}
			return null;
		},
		transform: {
			order: "post",
			handler(code, id) {
			if (!code.includes("@paraglide/messages.js")) return null;
				const filename = cleanId(id);
				const sourceFile = ts.createSourceFile(
					filename,
					code,
					ts.ScriptTarget.Latest,
					true,
					filename.endsWith("x") ? ts.ScriptKind.TSX : ts.ScriptKind.TS
				);
				const imports = sourceFile.statements.filter(ts.isImportDeclaration);
				const relevant = imports.filter((statement) => {
					const source = statement.moduleSpecifier;
					return ts.isStringLiteral(source) && isMessageSource(source.text);
				});
				if (relevant.length === 0) return null;
				const result = collectNamedMessageImports(relevant, indexBySafeName);
				if (mode === "discover") {
					usesByModule.set(filename, result);
					return null;
				}
				const consumer = manifest.consumers[filename];
				if (!consumer?.safe || !consumer.group) return null;
				const group = groupByKey.get(consumer.group);
				if (!group || !result.safe) return null;
				const magic = new MagicString(code, { filename });
				for (const statement of relevant) {
					magic.overwrite(
						statement.moduleSpecifier.getStart(sourceFile),
						statement.moduleSpecifier.end,
						JSON.stringify(groupSource(group.key))
					);
				}
				return {
					code: magic.toString(),
					map: magic.generateMap({ hires: true, includeContent: true, source: filename }),
				};
			},
		},
		buildEnd() {
			if (mode === "discover") {
				const graph = [...this.getModuleIds()].map((id) => {
					const info = this.getModuleInfo(id);
					return {
						id,
						staticImports: info?.importedIds ?? [],
						dynamicImports: info?.dynamicallyImportedIds ?? [],
						isEntry: info?.isEntry ?? false,
					};
				});
				const owners = analyzeOwners(graph);
				const initial = new Set(owners.initialEntries);
				const groups = new Map();
				const consumers = {};
				for (const [moduleId, usage] of usesByModule) {
					const moduleOwners = owners.ownersByModule.get(moduleId) ?? [];
					if (!usage.safe || usage.indices.length === 0 || moduleOwners.length === 0) {
						consumers[moduleId] = { safe: false, reason: usage.reason ?? "module has no statically analyzable Vite entry owner", owners: moduleOwners };
						continue;
					}
					const initialOwners = moduleOwners.filter((owner) => initial.has(owner));
					const ownerSet = initialOwners.length > 0 ? ["initial"] : moduleOwners;
					const ownerSignature = JSON.stringify(ownerSet);
					const key = initialOwners.length > 0
						? "initial"
						: createHash("sha256").update(ownerSignature).digest("hex").slice(0, 14);
					let group = groups.get(key);
					if (!group) {
						group = { key, ownerSignature, owners: ownerSet, modules: [], indexSet: new Set() };
						groups.set(key, group);
					}
					group.modules.push(moduleId);
					for (const index of usage.indices) group.indexSet.add(index);
					consumers[moduleId] = { safe: true, group: key, indices: usage.indices, owners: moduleOwners };
				}
				const outputGroups = [...groups.values()].map((group) => ({
					key: group.key,
					ownerSignature: group.ownerSignature,
					owners: group.owners,
					moduleCount: group.modules.length,
					modules: group.modules.sort(),
					indices: [...group.indexSet].sort((a, b) => a - b),
				})).sort((a, b) => a.key.localeCompare(b.key));
				const manifest = {
					version: 1,
					metadata: path.join(outdir, "client-locale-split.json"),
					locales: splitMetadata.locales,
					baseLocale: splitMetadata.baseLocale,
					initialEntries: owners.initialEntries,
					entryCount: owners.entryIds.length,
					graphModuleCount: graph.length,
					consumerCount: usesByModule.size,
					unsafeConsumerCount: Object.values(consumers).filter((item) => !item.safe).length,
					groups: outputGroups,
					consumers,
				};
				fs.mkdirSync(path.dirname(manifestPath), { recursive: true });
				fs.writeFileSync(manifestPath, JSON.stringify(manifest));
				const fullIndex = new Set(outputGroups.flatMap((group) => group.indices));
				const initialGroup = outputGroups.find((group) => group.key === "initial");
				console.log(`[route-two-pass] discovered ${manifest.consumerCount} message consumers; ${manifest.graphModuleCount} graph modules; ${manifest.entryCount} entries; ${outputGroups.length} groups (${outputGroups.filter((g) => g.key === "initial").length} initial); ${manifest.unsafeConsumerCount} consumers fall back to full facade; ${fullIndex.size} union message IDs.`);
				if (initialGroup) console.log(`[route-two-pass] initial group: ${initialGroup.moduleCount} modules, ${initialGroup.indices.length} message IDs, ${initialGroup.owners.length} initial entry roots`);
				return;
			}
		},
		generateBundle: {
			order: "post",
			handler(_options, bundle) {
				if (!emittedPreload.id) return;
				const src = `${this.getFileName(emittedPreload.id)}`;
				for (const output of Object.values(bundle)) {
					if (output.type !== "asset" || !output.fileName.endsWith(".html")) continue;
					const contents = typeof output.source === "string" ? output.source : Buffer.from(output.source).toString("utf8");
					if (!/<head(?:\s[^>]*)?>/i.test(contents)) continue;
					const preload = `<script type="module" src="/${src}"></script>`;
					output.source = contents.replace(/<head(?:\s[^>]*)?>/i, (head) => `${head}${preload}`);
				}
			},
		},
	};
}

function collectNamedMessageImports(imports, indexBySafeName) {
	const indices = new Set();
	for (const statement of imports) {
		if (!statement.importClause || statement.importClause.name || !statement.importClause.namedBindings || !ts.isNamedImports(statement.importClause.namedBindings)) {
			return { safe: false, reason: "namespace/default/side-effect import from messages facade", indices: [] };
		}
		for (const specifier of statement.importClause.namedBindings.elements) {
			const importedName = (specifier.propertyName ?? specifier.name).text;
			const index = indexBySafeName.get(importedName);
			if (index === undefined) return { safe: false, reason: `unknown generated message export ${importedName}`, indices: [] };
			indices.add(index);
		}
	}
	return { safe: true, indices: [...indices].sort((a, b) => a - b) };
}

function createDummyMessages(mapping, messages) {
	const usedNames = new Set(Object.values(mapping));
	const declarations = [];
	let index = 0;
	for (const message of messages) {
		if (!usedNames.has(message.safeName)) continue;
		const local = `__routeProbe${index++}`;
		const args = message.hasInputs ? "inputs, options = {}" : "inputs = {}, options = {}";
		declarations.push(`const ${local} = (${args}) => globalThis.__paraglideRouteProbe(${JSON.stringify(message.safeName)}, inputs, options);`);
		if (message.hasMarkup) declarations.push(`${local}.parts = (${args}) => globalThis.__paraglideRouteProbeParts(${JSON.stringify(message.safeName)}, inputs, options);`);
		declarations.push(`export { ${local} as ${message.safeName} };`);
	}
	return `${declarations.join("\n")}\n`;
}

function analyzeOwners(graph) {
	const nodes = new Map(graph.map((node) => [node.id, node]));
	const dynamicRoots = new Set(graph.flatMap((node) => node.dynamicImports));
	const initialEntries = graph.filter((node) => node.isEntry && !dynamicRoots.has(node.id)).map((node) => node.id).sort();
	const entryIds = [...new Set([...graph.filter((node) => node.isEntry).map((node) => node.id), ...dynamicRoots])].filter((id) => nodes.has(id)).sort();
	const ownersByModule = new Map();
	for (const entry of entryIds) {
		const seen = new Set();
		const stack = [entry];
		while (stack.length) {
			const id = stack.pop();
			if (!nodes.has(id) || seen.has(id)) continue;
			seen.add(id);
			const owners = ownersByModule.get(id) ?? [];
			owners.push(entry);
			ownersByModule.set(id, owners);
			for (const imported of nodes.get(id).staticImports) stack.push(imported);
		}
	}
	for (const [id, owners] of ownersByModule) ownersByModule.set(id, [...new Set(owners)].sort());
	return { initialEntries, entryIds, ownersByModule };
}

function createGroupModule(group, metadata, coreSource, loaderSource) {
	const exports = group.indices.map((index) => metadata.messages[index]);
	const definitions = exports.map((message, index) => {
		const local = `__routeMessage${index}`;
		return `const ${local} = getMessageFunction(${JSON.stringify(group.key)}, ${group.indices[index]}, ${message.hasInputs}, ${message.hasMarkup});\nexport { ${local} as ${message.safeName} };`;
	}).join("\n");
	return `import { getMessageFunction, registerRouteGroup, registerRoutePayload } from ${JSON.stringify(coreSource)};\nimport { loadRouteValues } from ${JSON.stringify(loaderSource(group.key))};\n${definitions}\nconst loadRouteLocale = (locale) => loadRouteValues(locale).then((values) => registerRoutePayload(${JSON.stringify(group.key)}, locale, values));\nawait registerRouteGroup(${JSON.stringify(group.key)}, ${JSON.stringify(group.indices)}, loadRouteLocale);\nexport { loadRouteLocale };\n`;
}

function createGroupLoaderModule(group, metadata, payloadSource) {
	const localeCases = metadata.locales.map((locale) =>
		`locale === ${JSON.stringify(locale)} ? import(${JSON.stringify(payloadSource(group.key, locale))}).then((module) => module.default) : `
	).join("");
	return `export const loadRouteValues = (locale) => (${localeCases}Promise.reject(new Error("Unsupported locale: " + locale)));\n`;
}

function createPayloadModule(group, metadata, locale, outdir) {
	const imports = [];
	const values = group.indices.map((index) => {
		const message = metadata.messages[index];
		if (!message.hasMarkup && Object.hasOwn(message.staticTexts ?? {}, locale)) return JSON.stringify(message.staticTexts[locale]);
		const local = `__routeValue${index}`;
		imports.push(`${message.safeName} as ${local}`);
		return local;
	});
	const importLine = imports.length ? `import { ${imports.join(", ")} } from ${JSON.stringify(path.join(outdir, "messages", `${locale}.js`))};\n` : "";
	return `${importLine}export default [${values.join(",")}];\n`;
}

function createCoreModule(metadata, manifest, loaderSource, outdir) {
	const groupIds = manifest.groups.map((group) => group.key);
	const groupLoaderCases = manifest.groups.map((group) =>
		`group === ${JSON.stringify(group.key)} ? import(${JSON.stringify(loaderSource(group.key))}).then((module) => module.loadRouteValues(locale)).then((values) => registerRoutePayload(${JSON.stringify(group.key)}, locale, values)) : `
	).join("");
	const initialGroups = manifest.groups.filter((group) => group.key === "initial").map((group) => group.key);
	return `import { getLocale, setLocale, overwriteSetLocale, toLocale } from ${JSON.stringify(path.join(outdir, "runtime.js"))};
const base = ${JSON.stringify(metadata.baseLocale)};
const locales = ${JSON.stringify(metadata.locales)};
const knownGroups = ${JSON.stringify(groupIds)};
const initialGroups = ${JSON.stringify(initialGroups)};
const valuesByLocale = new Map();
const groupStates = new Map(${JSON.stringify(manifest.groups.map((group) => [group.key, group.indices]))}.map(([key, indices]) => [key, { indices, loaded: new Set() }]));
const registeredGroups = new Set();
const pending = new Map();
const loading = new Map();
let version = 0;
const normalize = (locale) => { const normalized = toLocale(locale); return normalized && locales.includes(normalized) ? normalized : undefined; };
const selected = (locale) => { const requested = locale ?? getLocale(); return locales.includes(requested) ? requested : base; };
function loadGroup(group, locale) {
	const state = groupStates.get(group);
	if (!state) return Promise.reject(new Error("Unknown route group: " + group));
	if (state.loaded.has(locale)) return Promise.resolve();
	if (!state.loader) return Promise.reject(new Error("Route group has not registered its loader: " + group));
	const key = group + "\\0" + locale;
	let promise = pending.get(key);
	if (!promise) {
		promise = state.loader(locale).then(() => {
			if (!state.loaded.has(locale)) throw new Error("Route payload did not register: " + group + "/" + locale);
		}).finally(() => pending.delete(key));
		pending.set(key, promise);
	}
	return promise;
}
function loadGroupPayload(group, locale) {
	return (${groupLoaderCases}Promise.reject(new Error("Unknown route group: " + group)));
}
export function registerRoutePayload(group, locale, values) {
	const state = groupStates.get(group);
	if (!state || !Array.isArray(values) || values.length !== state.indices.length) throw new Error("Invalid route payload for " + group + "/" + locale);
	let localeValues = valuesByLocale.get(locale);
	if (!localeValues) { localeValues = new Map(); valuesByLocale.set(locale, localeValues); }
	state.indices.forEach((index, offset) => localeValues.set(index, values[offset]));
	state.loaded.add(locale);
}
export async function registerRouteGroup(group, indices, loader) {
	const state = groupStates.get(group);
	if (!state || state.indices.length !== indices.length) throw new Error("Unknown route group: " + group);
	state.loader = loader;
	if (!registeredGroups.has(group)) { registeredGroups.add(group); version++; }
	const locale = normalize(getLocale()) ?? base;
	await Promise.all([...new Set([base, locale])].map((item) => loadGroup(group, item)));
}
async function loadRegistered(locale) {
	let observed;
	do {
		observed = version;
		await Promise.all([...registeredGroups].map((group) => loadGroup(group, locale)));
	} while (observed !== version);
}
export function loadLocale(locale) {
	const normalized = normalize(locale);
	if (!normalized) return Promise.reject(new Error("Unsupported locale: " + locale));
	if (loading.has(normalized)) return loading.get(normalized);
	const promise = Promise.all(knownGroups.map((group) => loadGroupPayload(group, normalized))).then(() => undefined).catch((error) => { loading.delete(normalized); throw error; });
	loading.set(normalized, promise);
	return promise;
}
const originalSetLocale = setLocale;
let latestIntent = 0;
overwriteSetLocale((locale, options) => {
	const intent = ++latestIntent;
	if (options?.reload !== false) return originalSetLocale(locale, options);
	const normalized = normalize(locale) ?? base;
	return loadRegistered(normalized).then(() => {
		if (intent !== latestIntent) return;
		return originalSetLocale(normalized, options);
	});
});
export function getMessageFunction(group, index, hasInputs, hasMarkup) {
	let cached = messageFunctions.get(index);
	if (cached) return cached;
	const make = hasInputs ? (inputs, options = {}) => read(index, selected(options.locale), inputs) : (inputs = {}, options = {}) => read(index, selected(options.locale), inputs);
	if (hasMarkup) make.parts = hasInputs ? (inputs, options = {}) => readParts(index, selected(options.locale), inputs) : (inputs = {}, options = {}) => readParts(index, selected(options.locale), inputs);
	messageFunctions.set(index, make);
	return make;
}
const messageFunctions = new Map();
function lookup(index, locale) {
	const message = valuesByLocale.get(locale)?.get(index);
	if (message !== undefined) return message;
	throw new Error("Message " + index + " is not loaded for " + JSON.stringify(locale) + ". Await loadLocale() or import its route before calling it.");
}
function read(index, locale, inputs) { const message = lookup(index, locale); return typeof message === "string" ? message : message(inputs); }
function readParts(index, locale, inputs) { const message = lookup(index, locale); return typeof message === "string" ? [{ type: "text", value: message }] : typeof message.parts === "function" ? message.parts(inputs) : [{ type: "text", value: message(inputs) }]; }
const initialLoad = (() => { let active = base; try { const current = getLocale(); if (locales.includes(current)) active = current; } catch {} return Promise.all(initialGroups.flatMap((group) => [...new Set([base, active])].map((locale) => loadGroupPayload(group, locale)))).then(() => undefined); })();
export const startupLocalePromise = initialLoad;
`;
}
