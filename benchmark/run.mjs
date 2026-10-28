import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { spawn } from "node:child_process";
import { createHash } from "node:crypto";

const root = path.dirname(fileURLToPath(import.meta.url));
const repository = path.resolve(root, "..");
const output = path.join(
	root,
	".work",
	process.env.SMOKE ? "benchmark-smoke" : "benchmark"
);
await fs.mkdir(output, { recursive: true });
for (const entry of ["corpus", "node_modules"]) {
	try {
		await fs.symlink(path.join(root, entry), path.join(output, entry), "dir");
	} catch (error) {
		if (error.code !== "EEXIST") throw error;
	}
}
const env = { ...process.env, BENCHMARK_OUTPUT: output };
async function run(script, args = [], cwd = output) {
	await new Promise((resolve, reject) => {
		const child = spawn(process.execPath, [script, ...args], {
			cwd,
			env,
			stdio: "inherit",
		});
		child.on("error", reject);
		child.on("exit", (code) =>
			code === 0 ? resolve() : reject(Error(`${script} exited ${code}`))
		);
	});
}
for (const [script, args] of [
	["src/services/env-variables/create-index-file.js", []],
	["node_modules/typescript/bin/tsc", ["--build"]],
	["scripts/copy-declaration-templates.js", []],
])
	await run(path.join(repository, script), args, repository);
const digest = async (file) =>
	createHash("sha256")
		.update(await fs.readFile(path.join(repository, file)))
		.digest("hex");
await fs.writeFile(
	path.join(output, "compiler-source.json"),
	JSON.stringify(
		{
			variant: "paraglide-per-locale",
			source: "src/compiler/compile-bundle.ts",
			sourceSha256: await digest("src/compiler/compile-bundle.ts"),
			compiledSha256: await digest("dist/compiler/compile-bundle.js"),
		},
		null,
		2
	)
);
for (const script of [
	"build.mjs",
	"correctness.mjs",
	"measure.mjs",
	"report.mjs",
])
	await run(path.join(root, script));
if (process.env.SMOKE) {
	process.chdir(root);
	const { fixture } = await import("./fixture.mjs");
	const { inspectLocaleGraphs } = await import("./check-locale-graphs.mjs");
	const raw = JSON.parse(
		await fs.readFile(path.join(output, "results.json"), "utf8")
	);
	const checks = await inspectLocaleGraphs(output, raw, fixture);
	if (checks.lazyRouteIsolation !== 1 || checks.inactiveLocaleIsolation !== 1)
		throw Error("Incomplete smoke isolation checks");
	console.log(`Benchmark smoke passed; diagnostics: ${output}`);
} else {
	await run(path.join(root, "publish-results.mjs"));
}
