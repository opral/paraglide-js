import fs from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";
const root = path.dirname(new URL(import.meta.url).pathname);
const variants = process.env.CATALOG_BENCH_GRAI
	? ["baseline", "current", "grai"]
	: ["baseline", "current"];
if (!process.env.CATALOG_BENCH_BASELINE)
	throw Error("Set CATALOG_BENCH_BASELINE to the frozen built baseline");
const resultsDir = path.resolve(process.env.CATALOG_BENCH_RESULTS ?? root);
fs.mkdirSync(resultsDir, { recursive: true });
const results = [];
for (let round = 0; round < 5; round++)
	for (const size of [6400, 13300])
		for (let i = 0; i < variants.length; i++) {
			const variant = variants[(i + round) % variants.length];
			const run = spawnSync(
				process.execPath,
				[path.join(root, "trial.mjs"), variant, String(size), "measure"],
				{ encoding: "utf8", maxBuffer: 8 * 1024 * 1024 }
			);
			if (run.status !== 0) {
				fs.writeFileSync(
					path.join(resultsDir, "failure.log"),
					run.stdout + run.stderr
				);
				throw Error(`${variant} ${size} failed: see failure.log`);
			}
			const result = JSON.parse(run.stdout.trim().split("\n").at(-1));
			results.push({ ...result, round });
			fs.writeFileSync(
				path.join(resultsDir, "results.json"),
				JSON.stringify(results, null, 2)
			);
			console.log(
				`round ${round + 1} ${size} ${variant}: ${result.rows.find((r) => r.scenario === "translation").ms.toFixed(1)}ms translation; verified`
			);
		}
const median = (a) => {
	a.sort((a, b) => a - b);
	return a[Math.floor(a.length / 2)];
};
const summary = [];
for (const size of [6400, 13300])
	for (const variant of variants)
		for (const scenario of results[0].rows.map((r) => r.scenario)) {
			const rows = results
				.filter((r) => r.size === size && r.variant === variant)
				.flatMap((r) => r.rows.filter((s) => s.scenario === scenario));
			summary.push({
				size,
				variant,
				scenario,
				median: median(rows.map((r) => r.ms)),
				min: Math.min(...rows.map((r) => r.ms)),
				max: Math.max(...rows.map((r) => r.ms)),
				writes: rows.map((r) => r.writes),
			});
		}
fs.writeFileSync(
	path.join(resultsDir, "summary.json"),
	JSON.stringify(summary, null, 2)
);
