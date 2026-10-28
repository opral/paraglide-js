import fs from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { pathToFileURL } from "node:url";
import assert from "node:assert/strict";

// Fixture creation and verification stay in this parent. Only the actual CLI
// child process is timed, including Node startup and all of its imports.
function required(name) {
	const value = process.env[name];
	if (!value || !path.isAbsolute(value))
		throw new Error(`${name} must be an absolute path`);
	if (!fs.existsSync(value))
		throw new Error(`${name} does not exist: ${value}`);
	return value;
}
const candidate = required("CATALOG_BENCH_CANDIDATE");
const plugin = required("CATALOG_BENCH_OPTIMIZED_PLUGIN");
const grai = required("CATALOG_BENCH_GRAI");
const results = process.env.CATALOG_BENCH_RESULTS;
if (!results || !path.isAbsolute(results))
	throw new Error("CATALOG_BENCH_RESULTS must be an absolute output directory");
if (process.versions.node.split(".")[0] !== "22")
	throw new Error("Run this benchmark with the selected Node 22 binary");
if (process.env.CATALOG_CPU_PROFILE)
	throw new Error("CLI timing must not run with CATALOG_CPU_PROFILE");
const rounds = Number(process.env.CATALOG_BENCH_ROUNDS ?? 5);
if (!Number.isSafeInteger(rounds) || rounds < 1 || rounds % 2 !== 1)
	throw new Error("CATALOG_BENCH_ROUNDS must be a positive odd integer");
if (fs.existsSync(results) && fs.readdirSync(results).length)
	throw new Error("Use a new or empty CATALOG_BENCH_RESULTS directory");
const paraglideCli = path.join(candidate, "bin/run.js");
const graiCli = fs.statSync(grai).isDirectory()
	? path.join(grai, "dist/cli.js")
	: path.basename(grai) === "compile.js"
		? path.join(path.dirname(grai), "cli.js")
		: grai;
for (const filename of [
	paraglideCli,
	graiCli,
	path.join(candidate, "dist/cli/index.js"),
	path.join(
		candidate,
		"node_modules/@inlang/sdk/dist/project/loadProjectCatalog.js"
	),
]) {
	if (!fs.existsSync(filename))
		throw new Error(
			`Required built CLI/catalog artifact is missing: ${filename}`
		);
}
fs.mkdirSync(results, { recursive: true });
const checksum = (filename) =>
	createHash("sha256").update(fs.readFileSync(filename)).digest("hex");
const revision = (directory) => {
	const child = spawnSync("git", ["-C", directory, "rev-parse", "HEAD"], {
		encoding: "utf8",
	});
	return child.status === 0 ? child.stdout.trim() : undefined;
};
fs.writeFileSync(
	path.join(results, "cli-metadata.json"),
	JSON.stringify(
		{
			node: process.version,
			execPath: process.execPath,
			platform: process.platform,
			arch: process.arch,
			uvThreadpool: process.env.UV_THREADPOOL_SIZE ?? "default",
			rounds,
			candidate,
			plugin,
			grai,
			candidateRevision: revision(candidate),
			graiRevision: revision(
				fs.statSync(grai).isDirectory() ? grai : path.dirname(grai)
			),
			pluginSha256: checksum(plugin),
			paraglideCliSha256: checksum(paraglideCli),
			paraglideCliIndexSha256: checksum(
				path.join(candidate, "dist/cli/index.js")
			),
			graiCliSha256: checksum(graiCli),
			catalogLoaderSha256: checksum(
				path.join(
					candidate,
					"node_modules/@inlang/sdk/dist/project/loadProjectCatalog.js"
				)
			),
		},
		null,
		2
	) + "\n"
);

const locales = ["en", "de", "fr"];
const rows = [];
for (const size of [6400, 13300]) {
	for (let round = 0; round < rounds; round++) {
		for (const backend of round % 2
			? ["grai", "paraglide"]
			: ["paraglide", "grai"]) {
			const fixture = path.join(
				results,
				"fixtures",
				`${backend}-${size}-${round}`
			);
			const project = path.join(fixture, "project.inlang"),
				outdir = path.join(fixture, "out");
			assert.equal(
				fs.existsSync(fixture),
				false,
				"Each trial must have a fresh fixture"
			);
			fs.mkdirSync(path.join(fixture, "messages"), { recursive: true });
			fs.mkdirSync(project);
			fs.writeFileSync(path.join(fixture, "package.json"), '{"type":"module"}');
			// An explicit empty config prevents an ancestor project's options leaking in.
			fs.writeFileSync(
				path.join(fixture, "paraglide.config.mjs"),
				"export default {};\n"
			);
			fs.copyFileSync(plugin, path.join(fixture, "plugin.js"));
			for (const locale of locales)
				fs.writeFileSync(
					path.join(fixture, "messages", `${locale}.json`),
					JSON.stringify(
						Object.fromEntries(
							Array.from({ length: size }, (_, i) => [
								`message_${i}`,
								`${locale} Message ${i}: Hello {username}!`,
							])
						),
						null,
						"\t"
					) + "\n"
				);
			fs.writeFileSync(
				path.join(project, "settings.json"),
				JSON.stringify({
					baseLocale: "en",
					locales,
					modules: ["./plugin.js"],
					"plugin.inlang.messageFormat": {
						pathPattern: "./messages/{locale}.json",
					},
				})
			);
			for (const [name, value] of Object.entries({
				".meta.json": JSON.stringify({ highestSdkVersion: "4.0.4" }),
				"README.md": "readme",
				".gitignore": "ignore",
			}))
				fs.writeFileSync(path.join(project, name), value);
			const graiConfig = path.join(fixture, "grai.config.json");
			fs.writeFileSync(
				graiConfig,
				JSON.stringify({
					locales,
					baseLocale: "en",
					catalogs: "messages/{locale}.json",
					outdir: "out",
					strategy: [],
				})
			);
			const args =
				backend === "paraglide"
					? [
							paraglideCli,
							"compile",
							"--project",
							project,
							"--outdir",
							outdir,
							"--emit-ts-declarations",
							"--output-structure",
							"message-modules",
							"--message-module-size",
							"512",
							"--strategy",
							"baseLocale",
							"--no-clean-outdir",
							"--silent",
						]
					: [graiCli, "compile", "--config", graiConfig];
			const started = performance.now();
			const child = spawnSync(process.execPath, args, {
				cwd: fixture,
				encoding: "utf8",
				maxBuffer: 16 * 1024 * 1024,
			});
			const processWallMs = performance.now() - started;
			if (child.error || child.status !== 0)
				throw new Error(
					`${backend} CLI failed (${child.status}, signal ${child.signal}): ${child.error?.message ?? ""}\n${child.stdout ?? ""}\n${child.stderr ?? ""}`
				);
			const files = fs
				.readdirSync(outdir, { recursive: true, withFileTypes: true })
				.filter((entry) => entry.isFile())
				.map((entry) =>
					path
						.relative(outdir, path.join(entry.parentPath, entry.name))
						.split(path.sep)
						.join("/")
				)
				.sort();
			const hash = createHash("sha256");
			let bytes = 0;
			for (const filename of files) {
				let data = fs.readFileSync(path.join(outdir, filename));
				bytes += data.length;
				if (filename === "README.md")
					data = Buffer.from(
						data.toString("utf8").replaceAll(project, "./project.inlang")
					);
				hash.update(filename).update("\0").update(data).update("\0");
			}
			const dts = files.filter((name) => name.endsWith(".d.ts")).length;
			assert.ok(dts > 0, `${backend} must produce declarations`);
			if (backend === "paraglide")
				assert.equal(
					files.filter(
						(name) =>
							name.startsWith("messages/") &&
							name.endsWith(".js") &&
							name !== "messages/_index.js"
					).length,
					Math.ceil(size / 512),
					"CLI must honor message-module-size"
				);
			let validated = 0;
			if (round === 0) {
				const { m } = await import(
					pathToFileURL(path.join(outdir, "messages.js")).href
				);
				for (const locale of locales)
					for (let i = 0; i < size; i++) {
						assert.equal(
							m[`message_${i}`]({ username: "Ada" }, { locale }),
							`${locale} Message ${i}: Hello Ada!`,
							`${backend}/${locale}/${i}`
						);
						validated++;
					}
			}
			const row = {
				backend,
				size,
				round,
				node: process.version,
				mode: "actual-cli-process",
				processWallMs,
				files: files.length,
				dts,
				maps: files.filter((name) => name.endsWith(".map")).length,
				bytes,
				hash: hash.digest("hex"),
				validated,
				stdout: child.stdout.trim(),
				stderr: child.stderr.trim(),
				args: args.slice(1),
			};
			rows.push(row);
			fs.appendFileSync(
				path.join(results, "cli-results.jsonl"),
				JSON.stringify(row) + "\n"
			);
			console.log(JSON.stringify(row));
		}
	}
}
const median = (values) =>
	[...values].sort((a, b) => a - b)[Math.floor(values.length / 2)];
const summary = [];
for (const size of [6400, 13300])
	for (const backend of ["paraglide", "grai"]) {
		const group = rows.filter(
			(row) => row.size === size && row.backend === backend
		);
		assert.equal(group.length, rounds);
		if (backend === "paraglide")
			assert.equal(
				new Set(group.map((row) => row.hash)).size,
				1,
				"Paraglide output must remain stable across trials"
			);
		summary.push({
			size,
			backend,
			trials: group.length,
			medianProcessWallMs: median(group.map((row) => row.processWallMs)),
			minProcessWallMs: Math.min(...group.map((row) => row.processWallMs)),
			maxProcessWallMs: Math.max(...group.map((row) => row.processWallMs)),
			files: group[0].files,
			dts: group[0].dts,
			maps: group[0].maps,
			validated: group.reduce((n, row) => n + row.validated, 0),
		});
	}
fs.writeFileSync(
	path.join(results, "cli-summary.json"),
	JSON.stringify(summary, null, 2) + "\n"
);
console.log(JSON.stringify({ summary }));
