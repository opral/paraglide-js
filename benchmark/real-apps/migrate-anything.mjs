import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { execFileSync, spawn } from "node:child_process";

const repo = path.resolve(
	path.dirname(fileURLToPath(import.meta.url)),
	"../.."
);
process.chdir(repo);
const playwrightModule = path.join(
	repo,
	"benchmark/node_modules/playwright/index.mjs"
);
await fs.access(playwrightModule).catch(() => {
	throw Error(
		`Missing benchmark Playwright dependency at ${playwrightModule}; install benchmark dependencies before generating migration artifacts.`
	);
});
const compiler = path.resolve(process.env.PARAGLIDE_COMPILER_DIST ?? "dist");
await fs
	.access(path.join(compiler, "bundler-plugins/dispatch-matrix-packer.js"))
	.catch(() => {
		throw Error(
			`Missing Paraglide compiler dist at ${compiler}; build the compiler before generating migration artifacts.`
		);
	});
const checkout = path.resolve(
	process.argv[2] ?? ".real-apps/anything-llm-source"
);
const expected = "2a10d052a1812d7be12c43f9024072cf26a27a8b";
const sha = execFileSync("git", ["rev-parse", "HEAD"], {
	cwd: checkout,
	encoding: "utf8",
}).trim();
if (sha !== expected)
	throw Error(`Expected AnythingLLM ${expected}, got ${sha}`);
const source = path.join(checkout, "frontend");
await fs.access(path.join(source, "node_modules/vite/bin/vite.js"));
const scratch = path.join(repo, ".real-apps/anything-migration");
const frontend = path.join(scratch, "frontend");
if (await fs.stat(frontend).catch(() => null))
	throw Error(
		"Derived migration frontend already exists; use a clean benchmark worktree to preserve recorded experiments."
	);
await fs.mkdir(scratch, { recursive: true });
const alias = path.join(repo, ".real-apps/anything-llm-source");
if (path.resolve(alias) !== checkout) {
	const existing = await fs.realpath(alias).catch(() => undefined);
	if (existing && existing !== (await fs.realpath(checkout)))
		throw Error("Existing source alias points to a different checkout.");
	if (!existing) await fs.symlink(checkout, alias, "dir");
}
const archive = execFileSync("git", ["archive", expected, "frontend"], {
	cwd: checkout,
	maxBuffer: 64 * 1024 * 1024,
});
execFileSync("tar", ["-x", "-C", scratch], { input: archive });
await fs.symlink(
	path.join(source, "node_modules"),
	path.join(frontend, "node_modules"),
	"dir"
);
const templates = path.join(repo, "benchmark/real-apps/anything-migration");
for (const name of await fs.readdir(templates))
	if (name.endsWith(".mjs"))
		await fs.copyFile(path.join(templates, name), path.join(scratch, name));
for (const [from, to] of [
	["vite.config.js.fixture", "vite.config.js"],
	["locale-test.html.fixture", "locale-test.html"],
	["locale-test.jsx.fixture", "src/locale-test.jsx"],
])
	await fs.copyFile(path.join(templates, from), path.join(frontend, to));
const env = { ...process.env, PARAGLIDE_COMPILER_DIST: compiler };
async function run(script, cwd = repo, extra = {}) {
	await new Promise((resolve, reject) => {
		const child = spawn(process.execPath, script, {
			cwd,
			env: { ...env, ...extra },
			stdio: "inherit",
		});
		child.on("error", reject);
		child.on("exit", (code) =>
			code === 0
				? resolve()
				: reject(Error(`Command exited ${code}: ${script.join(" ")}`))
		);
	});
}
for (const name of [
	"generate",
	"prepare-app",
	"verify-catalog",
	"check-trans",
	"language-options-probe",
	"prepare-native-metadata-control",
])
	await run([path.join(scratch, `${name}.mjs`)]);
const inventory = path.join(scratch, "inventory-vite-config.mjs");
const nativeFrontend = path.join(
	repo,
	".real-apps/anything-native-metadata-control/frontend"
);
for (const [kind, folder, out] of [
	["native", nativeFrontend, "anything-native-metadata-control-dist"],
	["paraglide", frontend, "anything-migration-dist-clean-catalog-metadata"],
])
	await run(
		[
			path.join(folder, "node_modules/vite/bin/vite.js"),
			"build",
			"--config",
			inventory,
			"--outDir",
			path.join(repo, ".real-apps", out),
			"--emptyOutDir",
		],
		folder,
		{
			ANYTHING_BASE_CONFIG: path.join(folder, "vite.config.js"),
			ANYTHING_MODULE_REPORT: path.join(scratch, `${kind}-all-modules.json`),
		}
	);
await run([path.join(scratch, "route-perf.mjs")], repo, {
	ANYTHING_NATIVE_DIST: ".real-apps/anything-native-metadata-control-dist",
	ANYTHING_PARAGLIDE_DIST:
		".real-apps/anything-migration-dist-clean-catalog-metadata",
});
console.log(
	`Recorded production comparison: ${path.join(scratch, "route-perf-report.json")}`
);
