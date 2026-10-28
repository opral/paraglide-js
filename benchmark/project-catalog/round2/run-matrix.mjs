import fs from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { configuration } from "./run-case.mjs";

const config = configuration();
if (process.env.CATALOG_CPU_PROFILE)
	throw new Error(
		"Profile individual run-case invocations; do not mix sampling into the performance matrix"
	);
const mode = process.argv[2] ?? "full";
if (!["full", "phases"].includes(mode))
	throw new Error("Expected full or phases");
fs.mkdirSync(config.results, { recursive: true });
if (fs.existsSync(path.join(config.results, "results.jsonl")))
	throw new Error(
		"Use a fresh CATALOG_BENCH_RESULTS directory for each matrix"
	);
let cases = [
	...(mode === "full" && config.grai ? [["grai", "shards"]] : []),
	["sdk", "default"],
	["catalog", "default"],
	["sdk", "locale"],
	["catalog", "locale"],
	["catalog", "shards"],
	...(config.optimizedPlugin
		? [
				["catalog-optimized", "default"],
				["catalog-optimized", "locale"],
				["catalog-optimized", "shards"],
			]
		: []),
];
if (process.env.CATALOG_BENCH_CASES) {
	const selected = new Set(process.env.CATALOG_BENCH_CASES.split(","));
	const available = new Set(
		cases.map(([backend, layout]) => `${backend}/${layout}`)
	);
	for (const name of selected)
		if (!available.has(name))
			throw new Error(`Unknown benchmark case: ${name}`);
	cases = cases.filter(([backend, layout]) =>
		selected.has(`${backend}/${layout}`)
	);
}
const runner = fileURLToPath(new URL("./run-case.mjs", import.meta.url));
for (const size of [6400, 13300])
	for (let round = 0; round < config.rounds; round++)
		for (let index = 0; index < cases.length; index++) {
			const [backend, layout] = cases[(index + round) % cases.length];
			const start = performance.now();
			const result = spawnSync(
				process.execPath,
				[runner, backend, layout, String(size), String(round), mode],
				{ encoding: "utf8", maxBuffer: 8 * 1024 * 1024 }
			);
			const processWallMs = performance.now() - start;
			process.stdout.write(result.stdout ?? "");
			process.stderr.write(result.stderr ?? "");
			if (result.error || result.status !== 0)
				throw (
					result.error ??
					new Error(
						`Trial failed: ${backend}/${layout}/${size}/${round}, status ${result.status}, signal ${result.signal}`
					)
				);
			const lines = result.stdout.trim().split("\n");
			const row = JSON.parse(lines[lines.length - 1]);
			fs.appendFileSync(
				path.join(config.results, "process-results.jsonl"),
				JSON.stringify({ ...row, processWallMs }) + "\n"
			);
		}
await import("./summarize.mjs");
