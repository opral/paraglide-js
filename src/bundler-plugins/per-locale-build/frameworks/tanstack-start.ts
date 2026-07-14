import type { ResolvedConfig } from "vite";
import type { PerLocaleBuildFramework } from "../types.js";
import { getPerLocaleBuildLocaleId } from "../locale-id.js";

export const PER_LOCALE_BUILD_ASSET_PREFIX = "/__paraglide";

export function getPerLocaleBuildPrefix(locale: string): string {
	return `${PER_LOCALE_BUILD_ASSET_PREFIX}/${getPerLocaleBuildLocaleId(locale)}`;
}

export function prefixPerLocaleAssetUrl(url: string, prefix: string): string {
	if (url.startsWith("//") || /^[A-Za-z][A-Za-z\d+.-]*:/.test(url)) {
		throw new Error(
			"experimentalPerLocaleBuild supports only root-relative and relative TanStack Start asset URLs."
		);
	}
	if (prefix === "") return url;
	return `${prefix}/${url.replace(/^\/+/, "")}`;
}

export function getTanStackStartEffectiveRequestUrl(request: Request): URL {
	const requestUrl = new URL(request.url);
	if (request.headers.get("x-tsr-serverFn") !== "true") return requestUrl;
	const referer = request.headers.get("Referer");
	if (referer === null) return requestUrl;
	try {
		const refererUrl = new URL(referer);
		return refererUrl.origin === requestUrl.origin ? refererUrl : requestUrl;
	} catch {
		return requestUrl;
	}
}

export function isTanStackStartConfig(
	config: Pick<ResolvedConfig, "plugins">
): boolean {
	return config.plugins.some(
		(plugin) => plugin.name === "tanstack-start-core:config"
	);
}

export function createTanStackStartFramework(): PerLocaleBuildFramework {
	return {
		generatedFiles: {
			"tanstack-start.server.js": tanstackStartServerRuntime,
		},
		layout: {
			getLocalePrefix(locale, baseLocale) {
				return locale === baseLocale ? "" : getPerLocaleBuildPrefix(locale);
			},
			getLocalizedFileName(fileName, locale, baseLocale) {
				if (locale === baseLocale) return fileName;
				return `${getPerLocaleBuildPrefix(locale).replace(/^\//, "")}/${fileName}`;
			},
		},
	};
}

export function configureTanStackStartBuild(config: {
	experimental?: { renderBuiltUrl?: unknown };
}) {
	if (config.experimental?.renderBuiltUrl) {
		throw new Error(
			"experimentalPerLocaleBuild cannot be combined with experimental.renderBuiltUrl because locale asset trees require relative client URLs and canonical SSR URLs."
		);
	}
	return {
		base: "",
		experimental: {
			renderBuiltUrl(filename: string, context: { ssr?: boolean }) {
				if (context.ssr) return `/${filename.replace(/^\/+/, "")}`;
				return { relative: true as const };
			},
		},
	};
}

const tanstackStartServerRuntime = String.raw`
// @ts-nocheck -- generated only for experimentalPerLocaleBuild on TanStack Start
import {
	createStartHandler,
	defaultStreamHandler,
} from "@tanstack/react-start/server";
import { baseLocale, getLocale } from "./runtime.js";
import { paraglideMiddleware } from "./server.js";

const getPerLocaleBuildLocaleId = ${getPerLocaleBuildLocaleId.toString()};
const PER_LOCALE_BUILD_ASSET_PREFIX = "/__paraglide";
const getLocalePrefix = ${getPerLocaleBuildPrefix.toString()};
const prefixAssetUrl = ${prefixPerLocaleAssetUrl.toString()};
const getEffectiveRequestUrl = ${getTanStackStartEffectiveRequestUrl.toString()};

const fetch = createStartHandler({
	handler: defaultStreamHandler,
	transformAssets: {
		cache: false,
		createTransform() {
			const locale = getLocale();
			const prefix =
				import.meta.env?.PROD === true && locale !== baseLocale
					? getLocalePrefix(locale)
					: "";
			return ({ url }) => prefixAssetUrl(url, prefix);
		},
	},
});

export default {
	fetch(request, ...args) {
		return paraglideMiddleware(
			request,
			() => fetch(request, ...args),
			{ effectiveRequestUrl: getEffectiveRequestUrl(request) },
		);
	},
};
`.trimStart();
