import fs from "node:fs/promises";
import nodeFs from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";

const experimentRoot = path.resolve(".real-apps/anything-migration");
const projectRoot = path.join(experimentRoot, "public-plugin-project");
const projectPath = path.join(projectRoot, "project.inlang");
const compilerWorktree = path.resolve(
	process.env.PARAGLIDE_PUBLIC_COMPILER_WORKTREE ?? "."
);
const bundlePath = path.join(experimentRoot, "bundles.json");
const bundles = JSON.parse(await fs.readFile(bundlePath, "utf8"));
const sdkUrl = pathToFileURL(
  path.join(compilerWorktree, "node_modules/@inlang/sdk/dist/index.js")
).href;
const pluginUrl = pathToFileURL(
  path.join(compilerWorktree, "node_modules/@inlang/plugin-message-format/dist/index.js")
).href;
const { insertBundleNested, loadProjectInMemory, newProject, saveProjectToDirectory, selectBundleNested } = await import(sdkUrl);
const messageFormatModule = await import(pluginUrl);

await fs.rm(projectRoot, { recursive: true, force: true });
await fs.mkdir(projectPath, { recursive: true });
await fs.symlink(path.join(compilerWorktree, "node_modules"), path.join(projectRoot, "node_modules"));
const locales = Object.keys(JSON.parse(await fs.readFile(path.join(experimentRoot, "catalogs.json"), "utf8")).catalogs);
const project = await loadProjectInMemory({
  blob: await newProject({
    settings: {
      baseLocale: "en",
      locales,
      modules: ["./node_modules/@inlang/plugin-message-format/dist/index.js"],
      "plugin.inlang.messageFormat": { pathPattern: "./messages/{locale}.json" },
    },
  }),
  providePlugins: [messageFormatModule.default],
});
for (const bundle of bundles) await insertBundleNested(project.db, bundle);
const storedBundles = await selectBundleNested(project.db).execute();
const loadedPlugins = await project.plugins.get();
console.log(JSON.stringify({ storedBundles: storedBundles.length, plugins: loadedPlugins.map((plugin) => ({ key: plugin.key, exportFiles: typeof plugin.exportFiles })) }));
await saveProjectToDirectory({ project, path: projectPath, fs: nodeFs.promises });
await project.close();
console.log(JSON.stringify({ projectPath, locales: locales.length, bundles: bundles.length }, null, 2));
