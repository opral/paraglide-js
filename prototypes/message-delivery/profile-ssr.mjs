import fs from "node:fs/promises";
import path from "node:path";
import { Session } from "node:inspector";
import { promisify } from "node:util";
import assert from "node:assert/strict";
import { createServer } from "vite";
import { paraglideVitePlugin } from "../../dist/index.js";
import { optimizationPrototype } from "./optimization-plugin.mjs";
const directory = path.resolve(process.argv[2]);
const mode = process.argv[3] ?? "baseline";
const destination = process.argv[4] ?? "/tmp/paraglide-ssr-profiles";
await fs.mkdir(destination, { recursive: true });
const file = path.join(directory, "messages/en.json");
const messages = JSON.parse(await fs.readFile(file, "utf8"));
messages.message_0 = "en_SENTINEL_0_ {name}";
await fs.writeFile(file, JSON.stringify(messages));
const outdir = path.join(directory, "src/paraglide");
const plugins = paraglideVitePlugin({
	project: path.join(directory, "project.inlang"),
	outdir,
	emitTsDeclarations: true,
	outputStructure: "message-modules",
	experimentalVirtualMessages: true,
	strategy: ["baseLocale"],
	emitReadme: false,
	emitGitIgnore: false,
	emitPrettierIgnore: false,
});
const extra =
	mode === "baseline" ? [] : optimizationPrototype({ outdir, mode });
const server = await createServer({
	root: directory,
	configFile: false,
	logLevel: "silent",
	plugins: [extra, plugins],
	optimizeDeps: { noDiscovery: true },
	server: { watch: null, port: 0 },
});
try {
	await server.listen();
	await server.pluginContainer.buildStart({});
	await fs.writeFile(
		path.join(directory, "src/profile-entry.js"),
		'import {m} from "./paraglide/messages.js"; export const value=m.message_0({name:"Ada"});'
	);
	const session = new Session();
	session.connect();
	const post = promisify(session.post.bind(session));
	await post("Profiler.enable");
	await post("Profiler.start");
	const start = performance.now();
	const actual = await server.ssrLoadModule("/src/profile-entry.js");
	const ms = performance.now() - start;
	const { profile } = await post("Profiler.stop");
	session.disconnect();
	assert.equal(actual.value, "en_SENTINEL_0_ Ada");
	const modules = [...server.environments.ssr.moduleGraph.idToModuleMap.keys()];
	const result = {
		mode,
		ms,
		modules: modules.length,
		messageModules: modules.filter((id) => id.includes("virtual:paraglide"))
			.length,
		stats: extra.find((p) => p.api)?.api.stats,
	};
	await fs.writeFile(
		path.join(destination, `${mode}.cpuprofile`),
		JSON.stringify(profile)
	);
	await fs.writeFile(
		path.join(destination, `${mode}.json`),
		JSON.stringify(result, null, 2)
	);
	console.log(JSON.stringify(result));
} finally {
	await server.close();
}
