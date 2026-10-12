import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { gzipSync } from "node:zlib";
import { createHash } from "node:crypto";
import { fileURLToPath, pathToFileURL } from "node:url";

// Rebuild a pinned DrawDB checkout, then compare its native and generated
// Paraglide output variants. This intentionally writes only under .real-apps.
const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const compilerRoot = path.resolve(scriptDir, "../..");
const drawdbRepo = path.resolve(
	process.env.DRAWDB_REPO ?? path.join(compilerRoot, "../i18n-app-drawdb")
);
const drawdbCommit =
	process.env.DRAWDB_COMMIT ?? "351bd6050692d5b7d7fb50cc283ef90a19d817ea";
const generatedRoot = path.resolve(
	process.env.DRAWDB_GENERATED_ROOT ??
		path.join(compilerRoot, ".real-apps/drawdb")
);
const outputRoot = path.resolve(
	process.env.DRAWDB_OUTPUT ?? path.join(compilerRoot, ".real-apps/drawdb")
);
const labels = (process.env.DRAWDB_VARIANTS ?? "baseline,inline").split(",");
if (labels.some((label) => !/^[a-z0-9-]+$/.test(label)))
	throw Error("Invalid variant label");
const packerCompiler = process.env.DRAWDB_PACKER_COMPILER;
const packerLabels = new Set(
	(process.env.DRAWDB_PACKER_VARIANTS ?? "").split(",")
);
const adapterDir = path.resolve(
	scriptDir,
	"../../../paraglide-real-apps/benchmark/real-apps/drawdb-support"
);
const virtualLocalePluginPath = path.join(
	scriptDir,
	"virtual-locale-split-vite-plugin.mjs"
);
const staging = await fs.mkdtemp(
	path.join(os.tmpdir(), "drawdb-paraglide-ab-")
);
const checkout = path.join(staging, "source");
const npmEnv = {
	...process.env,
	npm_config_audit: "false",
	npm_config_fund: "false",
	npm_config_update_notifier: "false",
};

function command(bin, args, cwd, env = npmEnv) {
	console.log(`$ ${bin} ${args.join(" ")}`);
	execFileSync(bin, args, {
		cwd,
		env,
		stdio: "inherit",
		maxBuffer: 512 * 1024 * 1024,
	});
}

async function saveDist(label) {
	const target = path.join(outputRoot, `app-${label}/dist`);
	await fs.rm(path.dirname(target), { recursive: true, force: true });
	await fs.mkdir(path.dirname(target), { recursive: true });
	await fs.cp(path.join(checkout, "dist"), target, { recursive: true });
	const files = await fs.readdir(path.join(target, "assets"));
	const main = files
		.filter((filename) => filename.endsWith(".js"))
		.map((filename) => ({
			filename,
			bytes: fs.stat(path.join(target, "assets", filename)),
		}))
		.sort((a, b) => a.filename.localeCompare(b.filename));
	const sizes = [];
	for (const file of main) {
		const bytes = await file.bytes;
		const source = await fs.readFile(
			path.join(target, "assets", file.filename)
		);
		sizes.push({
			filename: file.filename,
			rawBytes: bytes.size,
			gzipBytes: gzipSync(source).byteLength,
			sha256: createHash("sha256").update(source).digest("hex"),
		});
	}
	const largest = sizes.sort((a, b) => b.rawBytes - a.rawBytes)[0];
	return { label, mainJs: largest };
}

function rewriteI18nModule(source) {
	const sourceImports =
		source.match(/^import \{[^\n]+\} from "\.\/locales\/[^\n]+;$/gm) ?? [];
	if (sourceImports.length !== 51)
		throw new Error(
			`Expected 51 DrawDB locale imports, found ${sourceImports.length}`
		);
	source = source
		.replace(/^import i18n from "i18next";\n/m, "")
		.replace(/^import \{ initReactI18next \} from "react-i18next";\n/m, "")
		.replace(
			/^import LanguageDetector from "i18next-browser-languagedetector";\n/m,
			""
		)
		.replace(
			/^import \{\s*[^,}]+,\s*([^}]+)\} from "\.\/locales\/([^\"]+)";$/gm,
			'import { $1 } from "./locales/$2";'
		);
	const initialization = source.indexOf("\ni18n\n  .use(LanguageDetector)");
	if (initialization < 0 || !source.includes("resources:"))
		throw new Error(
			"Could not locate the pinned DrawDB i18next initialization"
		);
	return `${source.slice(0, initialization)}\n\nexport { default } from "./paraglide-i18n-bridge.js";\n`;
}

try {
	const resolvedCommit = execFileSync(
		"git",
		["rev-parse", `${drawdbCommit}^{commit}`],
		{ cwd: drawdbRepo, encoding: "utf8" }
	).trim();
	if (resolvedCommit !== drawdbCommit)
		throw new Error(
			`DRAWDB_COMMIT must be a full SHA; resolved ${resolvedCommit}`
		);
	const archive = execFileSync(
		"git",
		["archive", "--format=tar", drawdbCommit],
		{
			cwd: drawdbRepo,
			maxBuffer: 512 * 1024 * 1024,
		}
	);
	await fs.mkdir(checkout, { recursive: true });
	execFileSync("tar", ["-xf", "-", "-C", checkout], {
		input: archive,
		maxBuffer: 512 * 1024 * 1024,
	});
	console.log(`Pinned DrawDB ${resolvedCommit}; Node ${process.version}`);
	command("npm", ["ci"], checkout);
	command("npm", ["run", "build"], checkout);
	const reports = [await saveDist("native")];

	const i18nPath = path.join(checkout, "src/i18n/i18n.js");
	const transformed = rewriteI18nModule(await fs.readFile(i18nPath, "utf8"));
	await fs.writeFile(i18nPath, transformed);
	await fs.mkdir(path.join(checkout, "scripts"), { recursive: true });
	for (const filename of [
		"paraglide-adapter.js",
		"paraglide-i18n-bridge.js",
		"react-i18next-bridge.js",
	]) {
		const target = filename.includes("bridge")
			? path.join(checkout, "src/i18n", filename)
			: path.join(checkout, "scripts", filename);
		await fs.copyFile(path.join(adapterDir, filename), target);
	}
	const bridgePath = path.join(checkout, "src/i18n/paraglide-i18n-bridge.js");
	let bridge = await fs.readFile(bridgePath, "utf8");
	bridge = bridge.replace(
		'import { getLocale, locales, setLocale } from "@paraglide/runtime.js";',
		'import { getLocale, locales, setLocale } from "@paraglide/runtime.js";\nimport { loadLocale } from "@paraglide/messages.js";'
	);
	bridge = bridge.replace(
		/let activeLocale = detectedLocale\(\);\nsetLocale\(activeLocale, \{ reload: false \}\);/,
		"let activeLocale = detectedLocale();\nawait loadLocale(activeLocale);\nsetLocale(activeLocale, { reload: false });"
	);
	const originalChangeLanguage = bridge;
	bridge = bridge.replace(
		/changeLanguage\(locale\) \{[\s\S]*?return Promise\.resolve\(activeLocale\);\n\t\},/,
		`async changeLanguage(locale) {
		const nextLocale = resolveLocale(locale);
		await loadLocale(nextLocale);
		activeLocale = nextLocale;
		setLocale(activeLocale, { reload: false });
		try {
			window.localStorage.setItem("i18nextLng", activeLocale);
		} catch {
			// The language still changes for this page if storage is unavailable.
		}
		notifyLanguageChanged();
		return activeLocale;
	},`
	);
	if (
		bridge === originalChangeLanguage ||
		!bridge.includes("await loadLocale(nextLocale)")
	) {
		throw new Error("Could not add the explicit async locale-loading boundary to the DrawDB bridge.");
	}
	await fs.writeFile(bridgePath, bridge);
	const packagePath = path.join(checkout, "package.json");
	const packageJson = JSON.parse(await fs.readFile(packagePath, "utf8"));
	packageJson.devDependencies.espree = "9.6.1";
	await fs.writeFile(packagePath, `${JSON.stringify(packageJson, null, 2)}\n`);
	command(
		"npm",
		[
			"install",
			"--package-lock-only",
			"--ignore-scripts",
			"--no-audit",
			"--no-fund",
		],
		checkout
	);
	const viteConfig = `import { defineConfig } from 'vite'\nimport react from '@vitejs/plugin-react'\nimport path from 'node:path'\nimport { fileURLToPath, pathToFileURL } from 'node:url'\nimport { paraglideAdapter } from './scripts/paraglide-adapter.js'\nconst { virtualLocaleSplit } = await import(${JSON.stringify(pathToFileURL(virtualLocalePluginPath).href)})\nconst packer = process.env.PARAGLIDE_PACKER ? await import(pathToFileURL(process.env.PARAGLIDE_PACKER).href) : undefined\n\nconst projectRoot = path.dirname(fileURLToPath(import.meta.url))\nconst paraglideOutput = path.resolve(projectRoot, process.env.PARAGLIDE_OUTPUT)\n\nexport default defineConfig({\n  plugins: [paraglideAdapter(), virtualLocaleSplit({ generatedDirectory: paraglideOutput }), react(), ...(packer ? [{ name: 'drawdb-locale-packer', enforce: 'post', renderChunk: { order: 'pre', handler(code, chunk) { return packer.packLocaleFunctionChunk(code, { fileName: chunk.fileName }); } } }] : [])],\n  resolve: {\n    alias: [\n      { find: /^@paraglide\\/messages\\.js$/, replacement: 'virtual:paraglide/split-messages' },\n      { find: '@paraglide', replacement: paraglideOutput },\n      { find: 'react-i18next', replacement: path.resolve(projectRoot, 'src/i18n/react-i18next-bridge.js') },\n    ],\n  },\n})\n`;
	await fs.writeFile(path.join(checkout, "vite.config.js"), viteConfig);
	command("npm", ["ci"], checkout);

	for (const label of labels) {
		const variantRoot = path.join(generatedRoot, label);
		const generatedRuntime = path.join(variantRoot, "paraglide/runtime.js");
		let runtimeSource = await fs.readFile(generatedRuntime, "utf8");
		const originalStrategy = /export const strategy = \[\s*"globalVariable",\s*"baseLocale"\s*\];/;
		if (!originalStrategy.test(runtimeSource)) {
			throw new Error("Expected the benchmark runtime's globalVariable/baseLocale strategy.");
		}
		runtimeSource = runtimeSource.replace(
			originalStrategy,
			`export const strategy = [
  "localStorage",
  "globalVariable",
  "baseLocale"
];`
		);
		runtimeSource = runtimeSource.replace(
			'export const localStorageKey = "PARAGLIDE_LOCALE";',
			'export const localStorageKey = "i18nextLng";'
		);
		await fs.writeFile(generatedRuntime, runtimeSource);
		const env = {
			...npmEnv,
			PARAGLIDE_OUTPUT: path.join(variantRoot, "paraglide"),
			PARAGLIDE_MAPPING: path.join(variantRoot, "mapping.json"),
			...(packerCompiler && packerLabels.has(label)
				? {
						PARAGLIDE_PACKER: path.resolve(
							packerCompiler,
							"bundler-plugins/locale-function-packer.js"
						),
					}
				: {}),
		};
		command("npm", ["run", "build"], checkout, env);
		reports.push(await saveDist(label));
	}
	const report = {
		drawdbCommit: resolvedCommit,
		node: process.version,
		viteVersion: JSON.parse(
			await fs.readFile(
				path.join(checkout, "node_modules/vite/package.json"),
				"utf8"
			)
		).version,
		generatedRoot,
		packerCompiler: packerCompiler ?? null,
		packerLabels: [...packerLabels].filter(Boolean),
		outputs: reports,
	};
	await fs.mkdir(outputRoot, { recursive: true });
	await fs.writeFile(
		path.join(outputRoot, "app-build-results.json"),
		`${JSON.stringify(report, null, 2)}\n`
	);
	console.log(JSON.stringify(report, null, 2));
} finally {
	await fs.rm(staging, { recursive: true, force: true });
}
