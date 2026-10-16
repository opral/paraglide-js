import { afterEach, beforeEach, expect, test, vi } from "vitest";
import consola from "consola";
import { memfs } from "memfs";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import type { UnpluginBuildContext, UnpluginOptions } from "unplugin";
import { unpluginFactory } from "./unplugin.js";
import { paraglideEsbuildPlugin } from "./esbuild.js";

beforeEach(() => {
	consola.mockTypes(() => vi.fn());
});

afterEach(() => {
	vi.unstubAllEnvs();
	vi.restoreAllMocks();
});

async function createFixture(checkTranslations = true, watchMode?: boolean) {
	const fs = memfs({
		"/project.inlang/settings.json": JSON.stringify({
			baseLocale: "en",
			locales: ["en", "de"],
			modules: ["./plugin.js"],
			"plugin.inlang.messageFormat": {
				pathPattern: "./messages/{locale}.json",
			},
		}),
		"/plugin.js": readFileSync(
			createRequire(import.meta.url).resolve("@inlang/plugin-message-format"),
			"utf8"
		),
		"/messages/en.json": JSON.stringify({ hello: "Hello" }),
		"/messages/de.json": "{}",
		"/output/messages.js": "previous output",
	}).fs as unknown as typeof import("node:fs");
	const options = {
		project: "/project.inlang",
		outdir: "/output",
		checkTranslations,
		watchMode,
		emitReadme: false,
		fs,
	};
	const plugin = unpluginFactory(options) as UnpluginOptions;
	return { fs, plugin, options };
}

async function esbuildStart(
	options: Parameters<typeof paraglideEsbuildPlugin>[0]
) {
	let start: (() => unknown) | undefined;
	const plugin = paraglideEsbuildPlugin(options);
	await plugin.setup({
		initialOptions: {},
		onStart: (callback: () => unknown) => {
			start = callback;
		},
	} as Parameters<typeof plugin.setup>[0]);
	expect(start).toBeTypeOf("function");
	return () => start!();
}

function context(watchMode = false): UnpluginBuildContext {
	return {
		addWatchFile: vi.fn(),
		meta: { watchMode },
	} as unknown as UnpluginBuildContext;
}

function beforeRun(plugin: UnpluginOptions, bundler: "webpack" | "rspack") {
	let run: (() => Promise<void>) | undefined;
	const compiler = {
		context: "/",
		options: {},
		hooks: {
			beforeRun: {
				tapPromise: (_name: string, callback: () => Promise<void>) => {
					run = callback;
				},
			},
		},
	};
	if (bundler === "webpack") {
		plugin.webpack!(
			compiler as unknown as Parameters<
				NonNullable<UnpluginOptions["webpack"]>
			>[0]
		);
	} else {
		plugin.rspack!(
			compiler as unknown as Parameters<
				NonNullable<UnpluginOptions["rspack"]>
			>[0]
		);
	}
	expect(run).toBeTypeOf("function");
	return () => run!();
}

test.each([undefined, "development", "production"])(
	"strict builds reject incomplete translations with NODE_ENV=%s",
	async (nodeEnv) => {
		vi.stubEnv("NODE_ENV", nodeEnv);
		for (const hook of ["buildStart", "webpack", "rspack"] as const) {
			const { plugin, fs } = await createFixture();
			const run =
				hook === "buildStart"
					? () => plugin.buildStart!.call(context())
					: beforeRun(plugin, hook);
			await expect(run()).rejects.toThrow(/missing-translation.*hello.*de/s);
			expect(fs.readFileSync("/output/messages.js", "utf8")).toBe(
				"previous output"
			);
		}
	}
);

test.each(["rollup", "vite", "webpack", "rspack"])(
	"%s watch contexts preserve output and recover after strict checks fail",
	async (bundler) => {
		vi.stubEnv("NODE_ENV", undefined);
		const { plugin, fs } = await createFixture();
		const buildContext = context(bundler === "rollup");
		if (bundler === "vite") {
			const hook = plugin.vite!.configResolved as {
				handler: (config: { command: string }) => void;
			};
			hook.handler({ command: "serve" });
		} else if (bundler === "webpack" || bundler === "rspack") {
			buildContext.getNativeBuildContext = () =>
				({
					framework: bundler,
					compiler: { watchMode: true },
				}) as ReturnType<
					NonNullable<UnpluginBuildContext["getNativeBuildContext"]>
				>;
		}
		await expect(
			plugin.buildStart!.call(buildContext)
		).resolves.toBeUndefined();
		expect(fs.readFileSync("/output/messages.js", "utf8")).toBe(
			"previous output"
		);
		await fs.promises.writeFile(
			"/messages/de.json",
			JSON.stringify({ hello: "Hallo" })
		);
		await plugin.watchChange!.call(buildContext, "/messages/de.json", {
			event: "update",
		});
		expect(fs.readFileSync("/output/messages.js", "utf8")).not.toBe(
			"previous output"
		);
	}
);

test("builds still allow locale fallback when translation checks are disabled", async () => {
	vi.stubEnv("NODE_ENV", undefined);
	const { plugin, fs } = await createFixture(false);
	await expect(plugin.buildStart!.call(context())).resolves.toBeUndefined();
	expect(fs.readFileSync("/output/messages.js", "utf8")).not.toBe(
		"previous output"
	);
});

test.each([undefined, "development"])(
	"esbuild watchMode preserves output and recovers with NODE_ENV=%s",
	async (nodeEnv) => {
		vi.stubEnv("NODE_ENV", nodeEnv);
		const { fs, options } = await createFixture(true, true);
		const run = await esbuildStart(options);
		await expect(run()).resolves.toBeUndefined();
		expect(fs.readFileSync("/output/messages.js", "utf8")).toBe(
			"previous output"
		);
		await fs.promises.writeFile(
			"/messages/de.json",
			JSON.stringify({ hello: "Hallo" })
		);
		await expect(run()).resolves.toBeUndefined();
		const generated = fs.readFileSync("/output/messages.js", "utf8");
		const translated = fs.readFileSync("/output/messages/de.js", "utf8");
		expect(generated).not.toBe("previous output");
		expect(translated).toContain("Hallo");
		await fs.promises.writeFile("/messages/de.json", "{}");
		await expect(run()).resolves.toBeUndefined();
		expect(fs.readFileSync("/output/messages.js", "utf8")).toBe(generated);
		expect(fs.readFileSync("/output/messages/de.js", "utf8")).toBe(translated);
		await fs.promises.writeFile(
			"/messages/de.json",
			JSON.stringify({ hello: "Hallo again" })
		);
		await expect(run()).resolves.toBeUndefined();
		expect(fs.readFileSync("/output/messages/de.js", "utf8")).toContain(
			"Hallo again"
		);
	}
);

test.each([undefined, false])(
	"esbuild builds stay strict with watchMode=%s",
	async (watchMode) => {
		vi.stubEnv("NODE_ENV", undefined);
		const { fs, options } = await createFixture(true, watchMode);
		const run = await esbuildStart(options);
		await expect(run()).rejects.toThrow(/missing-translation.*hello.*de/s);
		expect(fs.readFileSync("/output/messages.js", "utf8")).toBe(
			"previous output"
		);
	}
);

test("production esbuild builds stay strict with watchMode enabled", async () => {
	vi.stubEnv("NODE_ENV", "production");
	const { options } = await createFixture(true, true);
	const run = await esbuildStart(options);
	await expect(run()).rejects.toThrow(/missing-translation.*hello.*de/s);
});

test("an explicit watchMode overrides bundler watch detection", async () => {
	vi.stubEnv("NODE_ENV", undefined);
	const { plugin } = await createFixture(true, false);
	await expect(plugin.buildStart!.call(context(true))).rejects.toThrow(
		/missing-translation.*hello.*de/s
	);
});
