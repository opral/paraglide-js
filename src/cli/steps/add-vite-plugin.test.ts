import { expect, test } from "vitest";
import { addVitePlugin, updateViteConfig } from "./add-vite-plugin.js";
import { memfs } from "memfs";

test("updates a vite.config.ts", async () => {
	const config = `import { sveltekit } from "@sveltejs/kit/vite"
import { defineConfig } from "vite"

export default defineConfig({
	plugins: [sveltekit()],
})
`;

	const fs = memfs({
		"/vite.config.ts": config,
	}).fs as unknown as typeof import("node:fs");

	await addVitePlugin({
		fs: fs.promises,
		outdir: "./src/paraglide",
		projectPath: "./project.inlang",
		configPath: "/vite.config.ts",
	});

	const updatedConfig = await fs.promises.readFile("/vite.config.ts", {
		encoding: "utf-8",
	});

	expect(updatedConfig).toMatchInlineSnapshot(`
		"import { paraglideVitePlugin } from '@inlang/paraglide-js'
		import { sveltekit } from "@sveltejs/kit/vite"
		import { defineConfig } from "vite"

		export default defineConfig({
			plugins: [paraglideVitePlugin({ project: "./project.inlang", outdir: "./src/paraglide" }),sveltekit()],
		})
		"
	`);
});

test("doesn't update configs where the paraglide plugin is already present", async () => {
	const config = `
        import { sveltekit } from "@sveltejs/kit/vite"
        import { paraglideVitePlugin } from "@inlang/paraglide-js"
        import { visualizer } from "rollup-plugin-visualizer"
        import { defineConfig } from "vite"
        
        export default defineConfig({
            plugins: [
                paraglideVitePlugin({
                    project: "./project.inlang",
                    outdir: "./src/paraglide",
                }),
                sveltekit(),
                visualizer({
                    filename: "stats.html",
                    emitFile: true,
                }),
            ],
        })        
`;
	const fs = memfs({
		"/vite.config.ts": config,
	}).fs as unknown as typeof import("node:fs");
	await addVitePlugin({
		fs: fs.promises,
		outdir: "./src/paraglide",
		projectPath: "./project.inlang",
		configPath: "/vite.config.ts",
	});

	const updatedConfig = await fs.promises.readFile("/vite.config.ts", {
		encoding: "utf-8",
	});

	expect(updatedConfig).toMatch(config);
});

test("existing integration must match requested paths before unattended reuse", () => {
	const config =
		'import {paraglideVitePlugin} from "@inlang/paraglide-js"; export default {plugins:[paraglideVitePlugin({project:"./project.inlang",outdir:"./src/paraglide"})]}';
	expect(
		updateViteConfig({
			config,
			projectPath: "./project.inlang",
			outdir: "./src/different",
		})
	).toMatchObject({
		ok: false,
		reason:
			"Existing Vite plugin paths differ from the requested project/outdir",
	});
	expect(
		updateViteConfig({
			config:
				'import {compile} from "@inlang/paraglide-js"; export default {plugins:[]}',
			projectPath: "./project.inlang",
			outdir: "./src/paraglide",
		})
	).toMatchObject({ ok: false });
});
