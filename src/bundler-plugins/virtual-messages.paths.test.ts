import { test, expect, vi } from "vitest";
import path from "node:path";
import { rolldown } from "rolldown";
import { compileCatalog } from "../compiler/compile-project.js";

// Uses real generated messages/runtime/middleware and the real virtual resolver.
// Only the resolver's node:path dependency and the bundler's filesystem are
// simulated, so Windows module identities can be exercised on macOS/Linux.
test("Windows virtual messages share the middleware request locale with application imports", async () => {
	const output = await compileCatalog({
		catalog: {
			settings: { baseLocale: "de", locales: ["de", "en"] },
			bundles: [
				{
					id: "greeting",
					declarations: [],
					messages: [
						["de", "Hallo Welt"],
						["en", "Hello world"],
					].map(([locale, value]) => ({
						id: `greeting_${locale}`,
						bundle_id: "greeting",
						locale: locale!,
						selectors: [],
						variants: [
							{
								id: `greeting_${locale}_v`,
								message_id: `greeting_${locale}`,
								matches: [],
								pattern: [{ type: "text" as const, value: value! }],
							},
						],
					})),
				},
			],
		},
		compilerOptions: {
			strategy: ["url", "baseLocale"],
			isDevelopment: "false",
			emitTsDeclarations: true,
		},
	});

	vi.resetModules();
	vi.doMock("node:path", () => ({ ...path.win32, default: path.win32 }));
	try {
		const { virtualMessages, virtualMessagePrefix, virtualMessageOutput } =
			await import("./virtual-messages.js");
		const directory = "C:/repro/src/lib/paraglide";
		const packed = virtualMessageOutput(output, directory, undefined);
		const prefix = virtualMessagePrefix(directory);
		const transport = virtualMessages(directory, packed.implementations);
		const importer = "\0" + prefix + "messages/greeting.js";
		const rawId = transport.resolveId("../runtime.js", importer);
		const canonicalId = directory + "/runtime.js";
		expect(rawId).toBe(canonicalId);

		async function bundleAndRender() {
			const runtimeIds = new Set<string>();
			const entry = "C:/repro/entry.js";
			const entryCode = `
        import { greeting } from ${JSON.stringify(prefix + "messages/greeting.js")};
        import { getLocale } from ${JSON.stringify(canonicalId)};
        import { paraglideMiddleware } from ${JSON.stringify(directory + "/server.js")};
        export const result = await paraglideMiddleware(new Request("https://example.com/en"),
          ({ locale }) => ({ middlewareLocale: locale, locale: getLocale(), message: greeting() }));
      `;
			const bundle = await rolldown({
				input: entry,
				external: ["async_hooks", "node:async_hooks"],
				plugins: [
					{
						name: "windows-filesystem-and-vite-resolution",
						resolveId(source, parent) {
							if (source === entry) return entry;
							const resolved = transport.resolveId(source, parent);
							if (resolved) return resolved;
							// Vite normalizes ordinary application and middleware file imports.
							if (source.startsWith(".") && parent)
								return path.win32
									.resolve(path.win32.dirname(parent), source)
									.replaceAll("\\", "/");
							if (path.win32.isAbsolute(source))
								return source.replaceAll("\\", "/");
							return null;
						},
						load(id) {
							if (id === entry) return entryCode;
							const virtual = transport.load(id);
							if (virtual) return virtual;
							if (id.endsWith("runtime.js")) runtimeIds.add(id);
							// A Windows filesystem reads either spelling as the same file,
							// while the bundler caches each exact ID as a separate module.
							const name = path.win32
								.relative(directory, id)
								.replaceAll("\\", "/");
							return output[name] ?? null;
						},
					},
				],
			});
			try {
				const generated = await bundle.generate({
					format: "esm",
					minify: false,
				});
				const code = generated.output
					.filter((chunk) => chunk.type === "chunk")
					.map((chunk) => chunk.code)
					.join("\n");
				const { result } = await import(
					"data:text/javascript;base64," + Buffer.from(code).toString("base64")
				);
				return { runtimeIds: [...runtimeIds], ...result };
			} finally {
				await bundle.close();
			}
		}

		const rendered = await bundleAndRender();
		expect(rendered.runtimeIds).toEqual([canonicalId]);
		expect(rendered).toMatchObject({
			middlewareLocale: "en",
			locale: "en",
			message: "Hello world",
		});
	} finally {
		vi.doUnmock("node:path");
		vi.resetModules();
	}
}, 30_000);

// Native Windows path operations also accept Vite's slash-separated IDs.
test.each([
	{
		name: "Windows with forward slashes",
		paths: path.win32,
		directory: "C:/repro/src/paraglide",
	},
	{
		name: "Windows with backslashes",
		paths: path.win32,
		directory: "C:\\repro\\src\\paraglide",
	},
	{
		name: "Windows UNC share",
		paths: path.win32,
		directory: "\\\\server\\share\\src\\paraglide",
	},
	{ name: "POSIX", paths: path.posix, directory: "/repro/src/paraglide" },
])(
	"virtual filesystem IDs use forward slashes on $name",
	async ({ paths, directory }) => {
		vi.resetModules();
		vi.doMock("node:path", () => ({ ...paths, default: paths }));
		try {
			const { virtualMessages, virtualMessagePrefix } =
				await import("./virtual-messages.js");
			const prefix = "\0" + virtualMessagePrefix(directory);
			const transport = virtualMessages(directory, {
				"messages/greeting.js": "",
				"messages/_index.js": "",
			});
			const importer = prefix + "messages/greeting.js";
			for (const source of [
				"../runtime.js",
				"../server.js",
				"../../shared.js",
			]) {
				expect(transport.resolveId(source, importer)).toBe(
					paths
						.resolve(directory, "messages", source)
						.split(paths.sep)
						.join("/")
				);
			}
			expect(transport.resolveId("./_index.js", importer)).toBe(
				prefix + "messages/_index.js"
			);
			expect(
				transport.resolveId(
					"../runtime.js",
					paths.join(directory, "messages", "greeting.js")
				)
			).toBeNull();
		} finally {
			vi.doUnmock("node:path");
			vi.resetModules();
		}
	}
);
