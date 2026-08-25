import * as v from "valibot";
import type { CompilerOptions } from "../../compiler/compiler-options.js";
import type { Runtime } from "../../compiler/runtime/type.js";

/**
 * The schema of a `paraglide.config.js/ts` file inside the project
 * directory.
 *
 * The config cannot specify `project` — it lives inside the inlang project
 * directory and therefore cannot name it. Values that are not provided
 * fall back to the bundler plugin options / command line flags and
 * ultimately to the built-in defaults.
 */
export type ParaglideConfig = Partial<Omit<CompilerOptions, "fs" | "project">>;

/**
 * Strategy names that are built into the runtime. Custom strategies are
 * prefixed with `custom-` and are matched separately.
 */
const BUILTIN_STRATEGY_NAMES = [
	"cookie",
	"baseLocale",
	"globalVariable",
	"url",
	"preferredLanguage",
	"localStorage",
] as const satisfies readonly Exclude<
	Runtime["strategy"][number],
	`custom-${string}`
>[];

// Fails to compile when the runtime gains a strategy name that is neither
// built-in above nor a `custom-` prefixed name.
type UncoveredStrategies = Exclude<
	Runtime["strategy"][number],
	(typeof BUILTIN_STRATEGY_NAMES)[number] | `custom-${string}`
>;
export type AllStrategiesCovered = [UncoveredStrategies] extends [never]
	? true
	: never;

// Value-position pins so the type-level asserts below are actually
// evaluated by tsc — an unused alias resolving to `never` would compile.
export const allStrategiesCovered: AllStrategiesCovered = true;

/**
 * Matches strategy names like `custom-myStrategy`.
 *
 * The pattern mirrors the runtime's `isCustomStrategy` check
 * (`custom-[A-Za-z0-9_-]+`) so the config file rejects names the runtime
 * would refuse.
 *
 * Valibot has no template-literal schema, so the regex-checked string
 * schema is narrowed to the compiler's type here.
 */
const customStrategySchema = v.pipe(
	v.string(),
	v.regex(
		/^custom-[A-Za-z0-9_-]+$/,
		'Custom strategies must match "custom-" followed by alphanumeric characters, hyphens, or underscores.'
	)
) as v.BaseSchema<
	string,
	`custom-${string}`,
	v.StringIssue | v.RegexIssue<string>
>;

export const strategyNameSchema = v.union([
	v.picklist(BUILTIN_STRATEGY_NAMES),
	customStrategySchema,
]);

const routeStrategySchema = v.union([
	v.object({
		match: v.string(),
		strategy: v.array(strategyNameSchema),
		exclude: v.optional(v.never()),
	}),
	v.object({
		match: v.string(),
		exclude: v.literal(true),
		strategy: v.optional(v.never()),
	}),
]);

/**
 * The valibot schema behind {@link ParaglideConfig}.
 *
 * Every option is optional — values that are not provided fall back to
 * the bundler plugin options / command line flags and ultimately to
 * `defaultCompilerOptions`.
 */
export const paraglideConfigSchema = v.object({
	outdir: v.optional(
		v.pipe(v.string(), v.nonEmpty('"outdir" must not be empty'))
	),
	strategy: v.optional(v.array(strategyNameSchema)),
	routeStrategies: v.optional(v.array(routeStrategySchema)),
	experimentalMiddlewareLocaleSplitting: v.optional(v.boolean()),
	localStorageKey: v.optional(v.string()),
	isServer: v.optional(v.string()),
	experimentalStaticLocale: v.optional(v.string()),
	cookieName: v.optional(v.string()),
	cookieMaxAge: v.optional(v.number()),
	cookieDomain: v.optional(v.string()),
	additionalFiles: v.optional(v.record(v.string(), v.string())),
	emitPrettierIgnore: v.optional(v.boolean()),
	emitReadme: v.optional(v.boolean()),
	emitTsDeclarations: v.optional(v.boolean()),
	urlPatterns: v.optional(
		v.array(
			v.object({
				pattern: v.string(),
				localized: v.array(v.tuple([v.string(), v.string()])),
			})
		)
	),
	trailingSlash: v.optional(v.picklist(["always", "never"])),
	includeEslintDisableComment: v.optional(v.boolean()),
	disableAsyncLocalStorage: v.optional(v.boolean()),
	emitGitIgnore: v.optional(v.boolean()),
	outputStructure: v.optional(
		v.picklist(["message-modules", "locale-modules"])
	),
	cleanOutdir: v.optional(v.boolean()),
});

// Fails to compile when the schema and the compiler options drift apart:
// every compiler option (except the internal `fs` and the `project` path,
// which the config cannot specify about itself) must be represented in the
// schema, the schema must not contain extra options, and the parsed
// values must match the compiler option types in both directions — a
// schema narrower than a widened compiler option would wrongly reject
// valid values.
type SchemaOutput = v.InferOutput<typeof paraglideConfigSchema>;
// `keyof ParaglideConfig` already excludes `fs` and `project` (see its
// definition) — this assertion is the only place that needs the
// configurable-keys view.
export type SchemaMatchesCompilerOptions = [keyof ParaglideConfig] extends [
	keyof SchemaOutput,
]
	? [keyof SchemaOutput] extends [keyof ParaglideConfig]
		? SchemaOutput extends ParaglideConfig
			? ParaglideConfig extends SchemaOutput
				? true
				: never
			: never
		: never
	: never;

export const schemaMatchesCompilerOptions: SchemaMatchesCompilerOptions = true;
