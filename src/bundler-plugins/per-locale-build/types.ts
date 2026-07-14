export type PerLocaleBuildSettings = {
	baseLocale: string;
	locales: string[];
};

export type PerLocaleBuildManifest = {
	version: 1;
	baseLocale: string;
	locales: Record<
		string,
		{
			/** Public URL prefix. Empty for the canonical/base-locale build. */
			prefix: string;
			/** Canonical public URL to locale-specific public URL. */
			assets: Record<string, string>;
		}
	>;
};

export type ViteOxcApi = Pick<
	typeof import("vite"),
	"version" | "transformWithOxc" | "minify"
>;

/** Framework-neutral description of a client bundle's output namespace. */
export type PerLocaleBuildLayout = {
	/** Reject unsupported framework output before specialization begins. */
	validateOutput?: (fileName: string, type: "asset" | "chunk") => void;
	getLocalePrefix: (locale: string, baseLocale: string) => string;
	/** Returning the original filename keeps that output locale-neutral. */
	getLocalizedFileName: (
		fileName: string,
		locale: string,
		baseLocale: string
	) => string;
};

export type PerLocaleBuildServerIntegration = {
	resolveId: (id: string) => string | undefined;
	load: (id: string) => string | undefined;
	transform: (
		code: string,
		id: string
	) => { code: string; map: null } | undefined;
	assertPatched: () => void;
};

/** Framework policy consumed by the Vite lifecycle orchestrator. */
export type PerLocaleBuildFramework = {
	layout: PerLocaleBuildLayout;
	generatedFiles?: Record<string, string>;
	createServerIntegration?: (args: {
		root: string;
		generatedDirectory: string;
	}) => PerLocaleBuildServerIntegration;
};
