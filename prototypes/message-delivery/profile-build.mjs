import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createRequire } from "node:module";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
const directory = path.resolve(process.argv[2]);
const label = process.argv[3];
const destination = process.argv[4] ?? "/tmp/paraglide-build-profiles";
await fs.mkdir(destination, { recursive: true });
const local = createRequire(path.join(directory, "package.json"));
const vite = path.join(
	path.dirname(local.resolve("vite/package.json")),
	"bin/vite.js"
);
const configFile = path.join(directory, "vite.config.ts");
const original = await fs.readFile(configFile, "utf8");
const hooks = path.join(destination, label + ".hooks.jsonl");
await fs.rm(hooks, { force: true });
const instrumented =
	`import {profileCompilerHooks} from ${JSON.stringify(fileURLToPath(new URL("./profile-plugin.mjs", import.meta.url)))};\n` +
	original.replace(
		"plugins:[",
		`plugins:[profileCompilerHooks(${JSON.stringify(hooks)}),`
	);
for (const artifact of [
	"src/paraglide",
	"src/lib/paraglide",
	".svelte-kit",
	"dist",
	".output",
	".tanstack",
])
	await fs.rm(path.join(directory, artifact), { recursive: true, force: true });
try {
	await fs.writeFile(configFile, instrumented);
	const start = performance.now();
	const result = await promisify(execFile)(
		process.execPath,
		[
			"--cpu-prof",
			`--cpu-prof-dir=${destination}`,
			`--cpu-prof-name=${label}.cpuprofile`,
			vite,
			"build",
		],
		{
			cwd: directory,
			timeout: 180000,
			maxBuffer: 32 * 1024 * 1024,
			env: { ...process.env, NO_COLOR: "1" },
		}
	);
	const ms = performance.now() - start;
	await fs.writeFile(
		path.join(destination, label + ".log"),
		result.stdout + result.stderr
	);
	console.log(
		JSON.stringify({
			label,
			ms,
			compilerHooks: JSON.parse(
				"[" +
					(await fs.readFile(hooks, "utf8")).trim().split("\n").join(",") +
					"]"
			),
		})
	);
} finally {
	await fs.writeFile(configFile, original);
}
