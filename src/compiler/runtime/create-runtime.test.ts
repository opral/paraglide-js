import { afterEach, expect, test } from "vitest";
import { newProject } from "@inlang/sdk";
import { createProject, ts } from "@ts-morph/bootstrap";
import { createParaglide } from "../create-paraglide.js";
import { compileCatalog } from "../compile-project.js";

const originalWindow = globalThis.window;
const originalDocument = globalThis.document;
const originalLocalStorage = globalThis.localStorage;
afterEach(() => {
	globalThis.window = originalWindow;
	globalThis.document = originalDocument;
	globalThis.localStorage = originalLocalStorage;
});

test("string options keep their exact value in the runtime", async () => {
	// quotes, backslashes and replacement patterns like `$&` and `$'`
	const localStorageKey = 'app"locale\\$&';
	const cookieName = "site$&locale";
	const cookieDomain = "$'example.com";
	const runtime = await createParaglide({
		blob: await newProject({
			settings: { baseLocale: "en", locales: ["en", "de"] },
		}),
		strategy: ["localStorage", "cookie", "baseLocale"],
		localStorageKey,
		cookieName,
		cookieDomain,
		isServer: "false",
	});

	// @ts-expect-error - global variable definition
	globalThis.window = {};
	const stored = new Map([[localStorageKey, "de"]]);
	// @ts-expect-error - global variable definition
	globalThis.localStorage = {
		getItem: (key: string) => stored.get(key) ?? null,
		setItem: (key: string, value: string) => stored.set(key, value),
	};
	const cookies: string[] = [`${cookieName}=de`];
	// @ts-expect-error - global variable definition
	globalThis.document = {
		get cookie() {
			return cookies.join("; ");
		},
		set cookie(value: string) {
			cookies.push(value);
		},
	};

	expect(runtime.getLocale()).toBe("de");
	expect(runtime.cookieName).toBe(cookieName);
	expect(runtime.extractLocaleFromCookie()).toBe("de");
	await runtime.setLocale("en", { reload: false });
	expect(stored.get(localStorageKey)).toBe("en");
	expect(cookies.at(-1)).toContain(`; domain=${cookieDomain}`);
});

/** Compiles an empty catalog and imports its runtime.js. */
async function compiledRuntime(
	compilerOptions: Parameters<typeof compileCatalog>[0]["compilerOptions"]
) {
	const output = await compileCatalog({
		catalog: {
			settings: { baseLocale: "en", locales: ["en", "de"] },
			bundles: [],
		},
		compilerOptions: { strategy: ["baseLocale"], ...compilerOptions },
	});
	const code = output["runtime.js"]!;
	return {
		code,
		runtime: await import(
			`data:text/javascript;base64,${Buffer.from(code).toString("base64")}`
		),
	};
}

test("an option value that looks like a template placeholder stays exact", async () => {
	const { runtime } = await compiledRuntime({
		cookieName: "<cookie-domain>",
		cookieDomain: "example.com",
	});
	expect([runtime.cookieName, runtime.cookieDomain]).toEqual([
		"<cookie-domain>",
		"example.com",
	]);
	const { runtime: maxAge } = await compiledRuntime({
		cookieName: "60 * 60 * 24 * 400",
		cookieMaxAge: 100,
	});
	expect([maxAge.cookieName, maxAge.cookieMaxAge]).toEqual([
		"60 * 60 * 24 * 400",
		100,
	]);
});

test("explicitly undefined string options stay the string they were", async () => {
	const { code, runtime } = await compiledRuntime({
		strategy: ["cookie", "localStorage", "baseLocale"],
		cookieName: undefined,
		cookieDomain: undefined,
		localStorageKey: undefined,
		isServer: "true",
	});
	expect([
		runtime.cookieName,
		runtime.cookieDomain,
		runtime.localStorageKey,
		runtime.getLocale(),
	]).toEqual(["undefined", "undefined", "undefined", "en"]);
	const project = await createProject({
		useInMemoryFileSystem: true,
		compilerOptions: {
			strict: true,
			allowJs: true,
			checkJs: true,
			noEmit: true,
			module: ts.ModuleKind.Node16,
		},
	});
	project.createSourceFile("runtime.js", code);
	expect(
		ts
			.getPreEmitDiagnostics(project.createProgram())
			.map((diagnostic) =>
				ts.flattenDiagnosticMessageText(diagnostic.messageText, "\n")
			)
	).toEqual([]);
});
