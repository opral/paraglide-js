import { test, expect } from "vitest";
import fs from "node:fs/promises";
import path from "node:path";
import os from "node:os";
import { build } from "vite";
import { paraglideVitePlugin } from "./vite.js";

test.each([false, true])(
	"virtual messages share the request runtime through a symlinked outdir (preserveSymlinks=%s)",
	async (preserveSymlinks) => {
		const root = await fs.realpath(
			await fs.mkdtemp(path.join(os.tmpdir(), "paraglide-symlink-"))
		);
		try {
			const real = path.join(root, "real");
			const linked = path.join(root, "linked");
			const project = path.join(root, "project.inlang");
			await fs.mkdir(real);
			await fs.mkdir(project);
			await fs.symlink(real, linked, "junction");
			await fs.writeFile(path.join(root, "package.json"), '{"type":"module"}');
			await fs.writeFile(
				path.join(project, "settings.json"),
				JSON.stringify({
					baseLocale: "de",
					locales: ["de", "en"],
					modules: ["./fixture-plugin.js"],
				})
			);
			await fs.writeFile(
				path.join(root, "fixture-plugin.js"),
				`export default {
        key:"plugin.fixture.symlinks",
        toBeImportedFiles:async()=>["de","en"].map(locale=>({path:locale+".json",locale})),
        importFiles:({files})=>({
          bundles:[{id:"greeting"}],
          messages:files.map(file=>({bundleId:"greeting",locale:file.locale})),
          variants:files.map(file=>({messageBundleId:"greeting",messageLocale:file.locale,
            pattern:[{type:"text",value:JSON.parse(new TextDecoder().decode(file.content)).greeting}]})),
        }),
      };`
			);
			await fs.writeFile(
				path.join(root, "de.json"),
				JSON.stringify({ greeting: "Hallo Welt" })
			);
			await fs.writeFile(
				path.join(root, "en.json"),
				JSON.stringify({ greeting: "Hello world" })
			);
			const entry = path.join(root, "entry.js");
			await fs.writeFile(
				entry,
				`
        import { greeting } from "./linked/messages.js";
        import { getLocale } from "./linked/runtime.js";
        import { paraglideMiddleware } from "./linked/server.js";
        export const render = () => paraglideMiddleware(new Request("https://example.com/en"),
          ({locale}) => ({middlewareLocale:locale, locale:getLocale(), message:greeting()}));
      `
			);
			const runtimeIds: string[] = [];
			const built = await build({
				root,
				configFile: false,
				logLevel: "silent",
				resolve: { preserveSymlinks },
				plugins: [
					paraglideVitePlugin({
						project,
						outdir: linked,
						strategy: ["url", "baseLocale"],
						emitGitIgnore: false,
						emitPrettierIgnore: false,
						emitReadme: false,
					}),
					{
						name: "record-runtime-ids",
						generateBundle() {
							runtimeIds.push(
								...[...this.getModuleIds()].filter((id) =>
									id.endsWith("/runtime.js")
								)
							);
						},
					},
				],
				build: { ssr: entry, write: false, minify: false },
			});
			const code = (Array.isArray(built) ? built : [built])
				.flatMap((result) => ("output" in result ? result.output : []))
				.filter((chunk) => chunk.type === "chunk")
				.map((chunk) => chunk.code)
				.join("\n");
			const { render } = await import(
				"data:text/javascript;base64," + Buffer.from(code).toString("base64")
			);
			const result = await render();
			expect(runtimeIds).toHaveLength(1);
			expect(runtimeIds[0]).toBe(
				path
					.join(preserveSymlinks ? linked : real, "runtime.js")
					.split(path.sep)
					.join("/")
			);
			expect(result).toEqual({
				middlewareLocale: "en",
				locale: "en",
				message: "Hello world",
			});
		} finally {
			await fs.rm(root, { recursive: true, force: true });
		}
	},
	30_000
);
