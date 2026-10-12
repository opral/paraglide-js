import { spawnSync } from "node:child_process";
import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const repo = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../..");
const frontend = path.join(repo, ".real-apps/anything-migration/frontend");
const compilerWorktree = path.resolve(
	process.env.PARAGLIDE_PUBLIC_COMPILER_WORKTREE ??
	"."
);
const compilerEntry = path.join(compilerWorktree, "dist/index.js");
const viteBin = path.resolve(
	process.env.PARAGLIDE_PUBLIC_VITE_BIN ??
	path.join(compilerWorktree, "node_modules/vite/bin/vite.js")
);
const project = path.join(
	repo,
	".real-apps/anything-migration/public-plugin-project/project.inlang"
);
const generated = path.join(frontend, "src/paraglide");
const adaptersPath = path.join(
	repo,
	".real-apps/anything-migration/public-plugin-adapters.json"
);
const expectedMetadataPath = path.join(
	repo,
	".real-apps/anything-migration/public-plugin-expected-metadata.json"
);
const outputPrefix = process.env.PARAGLIDE_PUBLIC_OUTPUT_PREFIX ?? "anything-public";

await fs.mkdir(generated, { recursive: true });
for (const script of ["generate.mjs", "prepare-app.mjs", "prepare-public-project.mjs"]) {
	const result = spawnSync(
		process.execPath,
		[path.join(repo, "benchmark/real-apps/anything-migration", script)],
		{
			cwd: repo,
			stdio: "inherit",
			env: {
				...process.env,
				PARAGLIDE_COMPILER_DIST: path.join(compilerWorktree, "dist"),
				PARAGLIDE_SPLIT_METADATA: "true",
			},
		}
	);
	if (result.status !== 0) throw new Error(`${script} failed (${result.status})`);
}

await fs.copyFile(
	path.join(repo, "benchmark/real-apps/anything-migration/vite.public.config.mjs.fixture"),
	path.join(frontend, "vite.public.config.mjs")
);

const adapterFiles = Object.fromEntries(
	await Promise.all(
		[
			"dynamic-messages.js",
			"i18n.js",
			"i18next-compat.js",
			"react-compat.js",
		].map(async (filename) => [
			filename,
			await fs.readFile(path.join(generated, filename), "utf8"),
		])
	)
);
await fs.writeFile(adaptersPath, JSON.stringify(adapterFiles));
await fs.copyFile(
	path.join(generated, "client-locale-split.json"),
	expectedMetadataPath
);
await fs.rm(generated, { recursive: true, force: true });

const modes = (process.env.PARAGLIDE_PUBLIC_VARIANTS ?? "default,locale,split").split(",");
for (const mode of modes) {
	await fs.rm(generated, { recursive: true, force: true });
	const output = path.resolve(
		repo,
		`.real-apps/${outputPrefix}-${mode}-dist`
	);
	const result = spawnSync(
		process.execPath,
		[
			viteBin,
			"build",
			"--config",
			"vite.public.config.mjs",
			"--outDir",
			output,
			"--emptyOutDir",
		],
		{
			cwd: frontend,
			stdio: "inherit",
			env: {
				...process.env,
				NODE_ENV: "production",
				PARAGLIDE_PUBLIC_COMPILER: compilerEntry,
				PARAGLIDE_PUBLIC_PROJECT: project,
				PARAGLIDE_PUBLIC_MODE: mode,
				PARAGLIDE_PUBLIC_ADAPTERS: adaptersPath,
			},
		}
	);
	if (result.status !== 0) throw new Error(`Vite build for ${mode} failed (${result.status})`);
	const generatedFiles = await fs.readdir(generated);
	const metadataPresent = generatedFiles.includes("client-locale-split.json");
	if (metadataPresent !== (mode === "split")) {
		throw new Error(`Expected compiler metadata in split mode only (mode=${mode}, present=${metadataPresent})`);
	}
	if (mode === "split") {
		const actual = JSON.parse(await fs.readFile(path.join(generated, "client-locale-split.json"), "utf8"));
		const expected = JSON.parse(await fs.readFile(expectedMetadataPath, "utf8"));
		const normalizeMetadata = (metadata) => ({
			...metadata,
			messages: [...metadata.messages].sort((a, b) =>
				a.safeName.localeCompare(b.safeName, "en", { numeric: true })
			),
		});
		if (JSON.stringify(normalizeMetadata(actual)) !== JSON.stringify(normalizeMetadata(expected))) {
			throw new Error("Public compiler emitted locale metadata different from the adapter's independently generated catalog metadata.");
		}
	}
	console.log(JSON.stringify({ mode, output }));
}
