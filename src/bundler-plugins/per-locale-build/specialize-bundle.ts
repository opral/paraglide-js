import type { OutputBundle } from "rolldown";
import path from "node:path";
import {
	PER_LOCALE_BUILD_DEFINE,
	PER_LOCALE_BUILD_MANIFEST,
	PER_LOCALE_BUILD_MARKER,
} from "./constants.js";
import type {
	PerLocaleBuildLayout,
	PerLocaleBuildManifest,
	PerLocaleBuildSettings,
	ViteOxcApi,
} from "./types.js";

export async function specializePerLocaleBundle(args: {
	bundle: OutputBundle;
	layout: PerLocaleBuildLayout;
	settings: PerLocaleBuildSettings;
	vite: ViteOxcApi;
}): Promise<{
	manifest: PerLocaleBuildManifest;
	assets: Array<{ fileName: string; source: string | Uint8Array }>;
}> {
	const settings = validatePerLocaleBuildSettings(args.settings);
	assertVite8OxcApi(args.vite);

	const originals = Object.entries(args.bundle)
		.filter(([fileName]) => fileName !== PER_LOCALE_BUILD_MANIFEST)
		.sort(([left], [right]) => left.localeCompare(right))
		.map(([fileName, output]) => ({
			fileName,
			output,
			// Base-locale specialization mutates the canonical OutputChunk. Every
			// locale must nevertheless start from this immutable source graph.
			code: output.type === "chunk" ? output.code : undefined,
		}));
	const originalFileNames = originals.map(({ fileName }) => fileName);
	const originalFileNameSet = new Set(originalFileNames);
	for (const { fileName, output } of originals) {
		args.layout.validateOutput?.(fileName, output.type);
	}
	for (const { fileName, output } of originals) {
		if (output.type !== "asset" || !fileName.endsWith(".css")) continue;
		output.source = rewriteCssPublicAssetReferences({
			source: output.source,
			fileName,
			originalFileNames: originalFileNameSet,
		});
	}

	const manifest: PerLocaleBuildManifest = {
		version: 1,
		baseLocale: settings.baseLocale,
		locales: {},
	};
	for (const locale of settings.locales) {
		manifest.locales[locale] = {
			prefix: args.layout.getLocalePrefix(locale, settings.baseLocale),
			assets: Object.fromEntries(
				originalFileNames.map((fileName) => [
					`/${fileName}`,
					`/${args.layout.getLocalizedFileName(fileName, locale, settings.baseLocale)}`,
				])
			),
		};
	}
	const localizedAssets: Array<{
		fileName: string;
		source: string | Uint8Array;
	}> = [];
	const emittedFileNames = new Set(Object.keys(args.bundle));

	for (const locale of settings.locales) {
		const specializedChunks = new Map<string, string>();
		await Promise.all(
			originals.map(async ({ fileName, output, code }) => {
				if (output.type !== "chunk") return;
				specializedChunks.set(
					fileName,
					await specializeChunk({
						code: code!,
						fileName,
						locale,
						vite: args.vite,
					})
				);
			})
		);

		for (const { fileName, output } of originals) {
			const specializedCode =
				output.type === "chunk" ? specializedChunks.get(fileName) : undefined;
			if (output.type === "chunk" && specializedCode === undefined) {
				throw new Error(`Failed to specialize Vite chunk ${fileName}.`);
			}

			if (locale === settings.baseLocale) {
				if (output.type === "chunk") {
					output.code = specializedCode!;
					output.map = null;
				}
				continue;
			}

			const localizedFileName = args.layout.getLocalizedFileName(
				fileName,
				locale,
				settings.baseLocale
			);
			if (localizedFileName === fileName) continue;
			if (emittedFileNames.has(localizedFileName)) {
				throw new Error(
					`experimentalPerLocaleBuild cannot emit ${localizedFileName} because another Vite plugin already emitted that file.`
				);
			}
			emittedFileNames.add(localizedFileName);
			localizedAssets.push({
				fileName: localizedFileName,
				source: output.type === "chunk" ? specializedCode! : output.source,
			});
		}
	}

	return { manifest, assets: localizedAssets };
}

function rewriteCssPublicAssetReferences(args: {
	source: string | Uint8Array;
	fileName: string;
	originalFileNames: Set<string>;
}): string | Uint8Array {
	let css: string;
	if (typeof args.source === "string") {
		css = args.source;
	} else {
		css = new TextDecoder().decode(args.source);
	}
	const rewrite = (reference: string): string => {
		if (!isRelativeCssReference(reference)) return reference;
		const suffixIndex = reference.search(/[?#]/);
		const pathname =
			suffixIndex === -1 ? reference : reference.slice(0, suffixIndex);
		const suffix = suffixIndex === -1 ? "" : reference.slice(suffixIndex);
		const canonicalPath = path.posix.normalize(
			path.posix.join("/", path.posix.dirname(args.fileName), pathname)
		);
		if (args.originalFileNames.has(canonicalPath.replace(/^\//, ""))) {
			return reference;
		}
		return `${canonicalPath}${suffix}`;
	};
	css = css.replace(
		/url\(\s*(?:(["'])(.*?)\1|([^"')]+))\s*\)/g,
		(
			full: string,
			quote: string | undefined,
			quoted: string,
			unquoted: string
		) => {
			const reference = (quote ? quoted : unquoted).trim();
			const rewritten = rewrite(reference);
			return rewritten === reference
				? full
				: `url(${quote ?? ""}${rewritten}${quote ?? ""})`;
		}
	);
	css = css.replace(
		/@import\s+(["'])(.*?)\1/g,
		(full: string, quote: string, reference: string) => {
			const rewritten = rewrite(reference);
			return rewritten === reference
				? full
				: `@import ${quote}${rewritten}${quote}`;
		}
	);
	return typeof args.source === "string" ? css : new TextEncoder().encode(css);
}

function isRelativeCssReference(reference: string): boolean {
	return (
		reference !== "" &&
		!reference.startsWith("/") &&
		!reference.startsWith("#") &&
		!reference.startsWith("?") &&
		!reference.startsWith("//") &&
		!reference.startsWith("var(") &&
		!reference.startsWith("data:") &&
		!/^[A-Za-z][A-Za-z\d+.-]*:/.test(reference)
	);
}

async function specializeChunk(args: {
	code: string;
	fileName: string;
	locale: string;
	vite: ViteOxcApi;
}): Promise<string> {
	const transformed = await args.vite.transformWithOxc(
		args.code,
		args.fileName,
		{
			lang: "js",
			sourceType: "module",
			define: {
				[PER_LOCALE_BUILD_DEFINE]: JSON.stringify(args.locale),
			},
			sourcemap: false,
		}
	);
	const minified = await args.vite.minify(args.fileName, transformed.code, {
		module: true,
		compress: true,
		mangle: true,
	});
	if (minified.errors.length > 0) {
		throw new Error(
			`Oxc failed to minify ${args.fileName} for locale ${JSON.stringify(args.locale)}: ${minified.errors.map((error) => error.message).join("\n")}`
		);
	}
	if (minified.code.includes(PER_LOCALE_BUILD_MARKER)) {
		throw new Error(
			`Oxc left ${PER_LOCALE_BUILD_MARKER} in ${args.fileName} for locale ${JSON.stringify(args.locale)}.`
		);
	}
	return minified.code;
}

export async function loadViteOxcApi(): Promise<ViteOxcApi> {
	try {
		return await import("vite");
	} catch (error) {
		throw new Error(
			"experimentalPerLocaleBuild requires Vite 8 to be installed in the application.",
			{ cause: error }
		);
	}
}

export function assertVite8OxcApi(
	vite: Partial<ViteOxcApi>
): asserts vite is ViteOxcApi {
	const major = Number.parseInt(vite.version?.split(".")[0] ?? "", 10);
	if (
		!Number.isFinite(major) ||
		major !== 8 ||
		typeof vite.transformWithOxc !== "function" ||
		typeof vite.minify !== "function"
	) {
		throw new Error(
			`experimentalPerLocaleBuild requires Vite 8 with the Oxc transform and minify APIs (received ${vite.version ?? "an unknown version"}).`
		);
	}
}

export function validatePerLocaleBuildSettings(
	settings: PerLocaleBuildSettings
): PerLocaleBuildSettings {
	if (!settings.baseLocale) {
		throw new Error(
			"experimentalPerLocaleBuild requires the inlang project to define a baseLocale."
		);
	}
	if (!Array.isArray(settings.locales) || settings.locales.length === 0) {
		throw new Error(
			"experimentalPerLocaleBuild requires the inlang project to define at least one locale."
		);
	}
	if (!settings.locales.includes(settings.baseLocale)) {
		throw new Error(
			`experimentalPerLocaleBuild baseLocale ${JSON.stringify(settings.baseLocale)} is not present in the project's locales.`
		);
	}
	if (new Set(settings.locales).size !== settings.locales.length) {
		throw new Error(
			"experimentalPerLocaleBuild requires every project locale to be unique."
		);
	}
	return settings;
}
