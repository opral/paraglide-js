import { describe, expect, test } from "vitest";
import fs from "node:fs";
import { emitSupportingDeclarations } from "./emit-supporting-declarations.js";
import { createRuntimeFile } from "./runtime/create-runtime.js";
import { createServerFile } from "./server/create-server-file.js";
import { createRegistry } from "./registry.js";
import {
	defaultCompilerOptions,
	type CompilerOptions,
} from "./compiler-options.js";
import { perLocaleBuildStaticLocaleExpression } from "./per-locale-build.js";

const referenceUrl = new URL(
	"../../test-support/emit-ts-declarations.ts",
	import.meta.url
).href;
const emitTsDeclarations = (await import(referenceUrl)).emitTsDeclarations as (
	output: Record<string, string>,
	options?: { allowNativeAlias?: boolean }
) => Promise<Record<string, string>>;

describe("supporting declaration templates", () => {
	test.each<{
		name: string;
		baseLocale: string;
		locales: string[];
		options: Partial<CompilerOptions>;
	}>([
		{ name: "defaults", baseLocale: "en", locales: ["en", "de"], options: {} },
		{
			name: "custom locale tuple and routing",
			baseLocale: "pt-BR",
			locales: ["pt-BR", "ar", "zh-Hant"],
			options: {
				strategy: ["url", "custom-example"],
				routeStrategies: [
					{ match: "/private/:path(.*)?", exclude: true },
					{ match: "/app/:path(.*)?", strategy: ["cookie", "baseLocale"] },
				],
				cookieName: "custom",
				cookieDomain: "example.com",
				cookieMaxAge: 1234,
				cookieSameSite: "none",
				cookieSecure: "auto",
				trailingSlash: "always",
				localStorageKey: "CUSTOM",
				urlPatterns: [],
			},
		},
		{
			name: "route strategy index without custom URL patterns",
			baseLocale: "en",
			locales: ["en", "de"],
			options: {
				routeStrategies: [{ match: "/api/:path(.*)?", exclude: true }],
			},
		},
		{
			name: "middleware splitting and disabled async local storage",
			baseLocale: "de",
			locales: ["de"],
			options: {
				disableAsyncLocalStorage: true,
				experimentalMiddlewareLocaleSplitting: true,
				isServer: "true",
				experimentalStaticLocale: '"de"',
			},
		},
		{
			name: "client and per-locale build expression",
			baseLocale: "en",
			locales: ["en", "de"],
			options: {
				isServer: "false",
				experimentalStaticLocale: perLocaleBuildStaticLocaleExpression,
			},
		},
		{
			name: "custom boolean typeof comparison",
			baseLocale: "en",
			locales: ["en", "de"],
			options: {
				isServer: "typeof document !== 'undefined'",
				cookieSameSite: "strict",
				cookieSecure: true,
				trailingSlash: "never",
			},
		},
		{
			name: "bundler expressions",
			baseLocale: "en",
			locales: ["en", "de"],
			options: {
				isServer: "import.meta.env.SSR",
				experimentalStaticLocale: "import.meta.env.LOCALE",
			},
		},
	])(
		"matches TypeScript's public API: $name",
		async ({ baseLocale, locales, options }) => {
			const compilerOptions = { ...defaultCompilerOptions, ...options };
			const output = {
				"runtime.js": createRuntimeFile({
					baseLocale,
					locales,
					compilerOptions,
				}),
				"server.js": createServerFile({ compiledBundles: [], compilerOptions }),
				"registry.js": createRegistry(),
			};
			const reference = await emitTsDeclarations(output, {
				allowNativeAlias: false,
			});
			const direct = emitSupportingDeclarations({
				baseLocale,
				locales,
				compilerOptions,
			});
			for (const file of Object.keys(reference)) {
				// Tuple whitespace is the only deliberate formatting difference.
				expect(direct[file]?.replace(/\s+/g, "")).toBe(
					reference[file]?.replace(/\s+/g, "")
				);
			}
			expect(Object.keys(direct)).toEqual(Object.keys(reference));
		}
	);

	test("templates cannot shadow implementation JavaScript during type checking", () => {
		for (const name of ["runtime", "server", "registry", "routing-index"]) {
			expect(
				fs.existsSync(new URL(`./declarations/${name}.d.ts`, import.meta.url))
			).toBe(false);
			expect(
				fs.existsSync(
					new URL(`./declarations/${name}.d.ts.template`, import.meta.url)
				)
			).toBe(true);
		}
	});
});
