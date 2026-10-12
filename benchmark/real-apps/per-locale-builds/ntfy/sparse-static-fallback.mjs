import fs from "node:fs";
import path from "node:path";
import { parse } from "espree";

const localeIdPrefix = "\0paraglide:client-locale-split:locale:";
const coreId = "\0paraglide:client-locale-split:core";

/**
 * Benchmark-only sparse locale prototype. It stores static locale strings that
 * exactly equal the base locale as array holes, then fills those holes once
 * while loading the selected locale. Dynamic functions and markup are intact.
 */
export function ntfySparseStaticFallback({ metadataPath }) {
	let metadata;
	const reportedLocales = new Set();
	const readMetadata = () => {
		metadata ??= JSON.parse(fs.readFileSync(metadataPath, "utf8"));
		return metadata;
	};

	return {
		name: "ntfy-sparse-static-fallback-prototype",
		enforce: "post",
		transform(code, id) {
			if (id === coreId) {
				const data = readMetadata();
				const messageCount = data.messages.length;
				const strictProbe = `!Array.isArray(messages) || messages.length !== ${messageCount} || messages.some((message) => typeof message !== "string" && typeof message !== "function")`;
				const sparseProbe = `!Array.isArray(messages) || messages.length !== ${messageCount} || messages.some((message) => message !== undefined && typeof message !== "string" && typeof message !== "function")`;
				if (!code.includes(strictProbe) || !code.includes("pending = loadModule(normalized).then((module) => {")) {
					throw new Error("Sparse static fallback prototype no longer matches the locale-split core module; refusing a partial transform.");
				}
				let transformed = code
					.replace(strictProbe, sparseProbe)
					.replace("pending = loadModule(normalized).then((module) => {", "pending = loadModule(normalized).then(async (module) => {");
				const storeLine = "\t\t\tloadedLocales.set(normalized, messages);";
				if (!transformed.includes(storeLine)) {
					throw new Error("Sparse static fallback prototype could not find locale cache insertion; refusing to build.");
				}
				transformed = transformed.replace(storeLine, `			if (normalized !== baseLocale) {
					await loadLocale(baseLocale);
					const baseMessages = loadedLocales.get(baseLocale);
					if (!baseMessages) throw new Error("Paraglide base locale was not loaded before selected locale fallback materialization.");
					for (let index = 0; index < messages.length; index++) {
						if (messages[index] === undefined) messages[index] = baseMessages[index];
					}
					if (messages.some((message) => typeof message !== "string" && typeof message !== "function")) {
						throw new Error("Sparse Paraglide locale still has unresolved message slots after base fallback.");
					}
				}
			loadedLocales.set(normalized, messages);`);
				return { code: transformed, map: null };
			}

			if (!id.startsWith(localeIdPrefix)) return;
			const data = readMetadata();
			const locale = decodeURIComponent(id.slice(localeIdPrefix.length));
			if (locale === data.baseLocale) return;
			const sparseIndexes = [];
			for (let index = 0; index < data.messages.length; index++) {
				const texts = data.messages[index].staticTexts ?? {};
				if (Object.hasOwn(texts, locale) && texts[locale] === texts[data.baseLocale]) {
					sparseIndexes.push(index);
				}
			}
			if (sparseIndexes.length === 0) return;

			const ast = parse(code, { ecmaVersion: "latest", sourceType: "module", range: true });
			const defaultExport = ast.body.find((node) => node.type === "ExportDefaultDeclaration");
			if (defaultExport?.declaration?.type !== "ArrayExpression" || defaultExport.declaration.elements.length !== data.messages.length) {
				throw new Error(`Sparse static fallback expected a ${data.messages.length}-entry locale array for ${locale}.`);
			}
			const edits = [];
			for (const index of sparseIndexes) {
				const element = defaultExport.declaration.elements[index];
				if (element?.type !== "Literal" || typeof element.value !== "string" || element.value !== data.messages[index].staticTexts[locale]) {
					throw new Error(`Sparse static fallback expected static string at ${locale}[${index}]; refusing to alter dynamic output.`);
				}
				edits.push({ start: element.range[0], end: element.range[1] });
			}
			let transformed = code;
			for (const { start, end } of edits.sort((left, right) => right.start - left.start)) {
				transformed = `${transformed.slice(0, start)}undefined${transformed.slice(end)}`;
			}
			if (!reportedLocales.has(locale)) {
				reportedLocales.add(locale);
				console.log(`[ntfy sparse prototype] ${locale}: omitted ${edits.length} static entries equal to ${data.baseLocale}`);
			}
			return { code: transformed, map: null };
		},
	};
}
