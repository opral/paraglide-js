import type { ResolvedConfig, UserConfig } from "vite";
import type { PerLocaleBuildFramework } from "../types.js";
import {
	createSvelteKitFramework,
	hasSvelteKitConfig,
	hasSvelteKitSetupPlugin,
} from "./sveltekit.js";
import {
	configureTanStackStartBuild,
	createTanStackStartFramework,
	isTanStackStartConfig,
} from "./tanstack-start.js";

export function configurePerLocaleBuild(config: UserConfig) {
	if (hasSvelteKitConfig(config)) {
		return {};
	}
	return configureTanStackStartBuild(config);
}

export function detectPerLocaleBuildFramework(
	config: Pick<ResolvedConfig, "plugins" | "define">
): PerLocaleBuildFramework {
	const hasTanStackStart = isTanStackStartConfig(config);
	const hasSvelteKit = hasSvelteKitSetupPlugin(config);
	if (hasTanStackStart && hasSvelteKit) {
		throw new Error(
			"experimentalPerLocaleBuild found both TanStack Start and SvelteKit Vite plugins. Use it with exactly one supported framework."
		);
	}
	if (hasTanStackStart) return createTanStackStartFramework();
	if (hasSvelteKit) return createSvelteKitFramework(config);
	throw new Error(
		"experimentalPerLocaleBuild supports TanStack Start and SvelteKit. Add one of their Vite plugins, or disable this flag."
	);
}
