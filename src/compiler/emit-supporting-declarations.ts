import fs from "node:fs";
import type { CompilerOptions } from "./compiler-options.js";

// Templates deliberately do not use a .d.ts suffix: declarations adjacent to
// the runtime implementation would shadow its JavaScript during type checks.
let templates: Record<string, string> | undefined;

function getTemplates(): Record<string, string> {
	return (templates ??= Object.fromEntries(
		["runtime", "server", "registry", "routing-index"].map((name) => [
			name,
			fs.readFileSync(
				new URL(`./declarations/${name}.d.ts.template`, import.meta.url),
				"utf8"
			),
		])
	));
}

/** Emits the stable runtime API with the project's locale and flag types. */
export function emitSupportingDeclarations(args: {
	baseLocale: string;
	locales: string[];
	compilerOptions: Pick<
		CompilerOptions,
		| "disableAsyncLocalStorage"
		| "isServer"
		| "isDevelopment"
		| "urlPatterns"
		| "routeStrategies"
	>;
}): Record<string, string> {
	const templates = getTemplates();
	const substitutions: Record<string, string> = {
		BASE_LOCALE: JSON.stringify(args.baseLocale),
		ROUTING_INDEX_TYPES:
			args.compilerOptions.urlPatterns !== undefined ||
			(args.compilerOptions.routeStrategies?.length ?? 0) > 0
				? templates["routing-index"]!
				: "",
		LOCALES: JSON.stringify(args.locales),
		DISABLE_ASYNC_LOCAL_STORAGE: String(
			args.compilerOptions.disableAsyncLocalStorage ?? false
		),
		// isServer accepts arbitrary bundler expressions, whose environment is
		// unknown at compile time (e.g. import.meta.env.SSR). Keep those open,
		// matching the old declaration emitter's unresolved-expression behavior.
		IS_SERVER: isServerType(args.compilerOptions.isServer),
		IS_DEVELOPMENT: isServerType(args.compilerOptions.isDevelopment ?? "true"),
	};
	return {
		"runtime.d.ts": templates.runtime!.replace(
			/\{\{([A-Z_]+)\}\}/g,
			(_, key: string) => substitutions[key]!
		),
		"server.d.ts": templates.server!,
		"registry.d.ts": templates.registry!,
	};
}

function isServerType(expression: string | undefined): string {
	const trimmed = expression?.trim();
	if (trimmed === "true" || trimmed === "false") return trimmed;
	if (
		trimmed === undefined ||
		/^typeof\s+[A-Za-z_$][\w$]*(?:\.[A-Za-z_$][\w$]*)*\s*(?:===|!==|==|!=)\s*(['"])(?:undefined|function|object|boolean|number|bigint|string|symbol)\1$/.test(
			trimmed
		)
	)
		return "boolean";
	return "any";
}
