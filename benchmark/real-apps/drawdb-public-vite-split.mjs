import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { fileURLToPath, pathToFileURL } from "node:url";
import { createHash } from "node:crypto";

const here = path.dirname(fileURLToPath(import.meta.url));
const repo = path.resolve(here, "../..");
const drawdbRepo = path.resolve(repo, "../i18n-app-drawdb");
const commit = "351bd6050692d5b7d7fb50cc283ef90a19d817ea";
const compilerPackage = path.resolve(
	repo,
	".real-apps/drawdb-public-split/compiler-pr4"
);
const compilerEntry = path.join(compilerPackage, "dist/index.js");
const outputRoot = path.resolve(repo, ".real-apps/drawdb-public-split");
const adapterDir = path.join(here, "drawdb-public-split-support");
const staging = await fs.mkdtemp(path.join(os.tmpdir(), "drawdb-public-split-"));
const checkout = path.join(staging, "source");
const envBase = {
	...process.env,
	npm_config_audit: "false",
	npm_config_fund: "false",
	npm_config_update_notifier: "false",
};

function command(bin, args, cwd, env = envBase) {
	console.log(`$ ${bin} ${args.join(" ")}`);
	execFileSync(bin, args, {
		cwd,
		env,
		stdio: "inherit",
		maxBuffer: 512 * 1024 * 1024,
	});
}

function flatten(resource, prefix = "", result = {}) {
	for (const [key, value] of Object.entries(resource)) {
		const full = prefix ? `${prefix}.${key}` : key;
		if (typeof value === "string") result[full] = value;
		else if (value && !Array.isArray(value) && typeof value === "object")
			flatten(value, full, result);
		else throw new Error(`Unsupported DrawDB catalog value at ${full}`);
	}
	return result;
}

function convertInterpolation(value, locale, key) {
	const converted = value.replace(/\{\{\s*([^{}]+?)\s*\}\}/g, (_match, name) => {
		if (/[{},]/.test(name))
			throw new Error(`Unsupported interpolation ${JSON.stringify(name)} in ${locale}:${key}`);
		return `{${name.trim()}}`;
	});
	if (converted.includes("{{") || converted.includes("}}"))
		throw new Error(`Unconverted i18next interpolation in ${locale}:${key}`);
	return converted;
}

function rewriteI18nModule(source) {
	const sourceImports =
		source.match(/^import \{[^\n]+\} from "\.\/locales\/[^\n]+;$/gm) ?? [];
	if (sourceImports.length !== 51)
		throw new Error(`Expected 51 DrawDB locale imports, found ${sourceImports.length}`);
	source = source
		.replace(/^import i18n from "i18next";\n/m, "")
		.replace(/^import \{ initReactI18next \} from "react-i18next";\n/m, "")
		.replace(/^import LanguageDetector from "i18next-browser-languagedetector";\n/m, "")
		.replace(/^import \{\s*[^,}]+,\s*([^}]+)\} from "\.\/locales\/([^\"]+)";$/gm, 'import { $1 } from "./locales/$2";');
	const initialization = source.indexOf("\ni18n\n  .use(LanguageDetector)");
	if (initialization < 0 || !source.includes("resources:"))
		throw new Error("Could not locate pinned DrawDB i18next initialization");
	return `${source.slice(0, initialization)}\n\nexport { default } from "./paraglide-i18n-bridge.js";\n`;
}

async function saveDist(label) {
	const target = path.join(outputRoot, `app-${label}/dist`);
	await fs.rm(path.dirname(target), { recursive: true, force: true });
	await fs.mkdir(path.dirname(target), { recursive: true });
	await fs.cp(path.join(checkout, "dist"), target, { recursive: true });
	const files = await fs.readdir(path.join(target, "assets"));
	const assets = [];
	for (const filename of files.filter((name) => name.endsWith(".js")).sort()) {
		const body = await fs.readFile(path.join(target, "assets", filename));
		assets.push({
			filename,
			bytes: body.byteLength,
			sha256: createHash("sha256").update(body).digest("hex"),
		});
	}
	return { label, assets };
}

try {
	const resolved = execFileSync("git", ["rev-parse", `${commit}^{commit}`], {
		cwd: drawdbRepo,
		encoding: "utf8",
	}).trim();
	if (resolved !== commit) throw new Error(`Unexpected DrawDB source commit ${resolved}`);
	const archive = execFileSync("git", ["archive", "--format=tar", commit], {
		cwd: drawdbRepo,
		maxBuffer: 512 * 1024 * 1024,
	});
	await fs.mkdir(checkout, { recursive: true });
	execFileSync("tar", ["-xf", "-", "-C", checkout], {
		input: archive,
		maxBuffer: 512 * 1024 * 1024,
	});
	console.log(`Pinned DrawDB ${resolved}; compiler ${await fs.readFile(path.join(compilerPackage, "source-commit.txt"), "utf8")}; Node ${process.version}`);

	command("npm", ["ci"], checkout);
	command("npm", ["run", "build"], checkout);
	const reports = [await saveDist("native")];

	const localeDir = path.join(checkout, "src/i18n/locales");
	const aliases = {
		"pt-br": "pt-BR",
		"zh-tw": "zh-TW",
		"pa-pk": "pa-PK",
		"sv-se": "sv",
	};
	const catalogs = {};
	for (const filename of (await fs.readdir(localeDir)).filter((name) => name.endsWith(".js")).sort()) {
		const loaded = await import(pathToFileURL(path.join(localeDir, filename)).href);
		const resource = Object.values(loaded).find((value) => value?.translation);
		if (!resource) throw new Error(`No translation export in ${filename}`);
		const locale = aliases[filename.slice(0, -3)] ?? filename.slice(0, -3);
		catalogs[locale] = flatten(resource.translation);
	}
	const locales = Object.keys(catalogs).sort();
	if (locales.length !== 51 || !locales.includes("en"))
		throw new Error(`Expected 51 locales including en; found ${locales.length}`);
	const keys = [...new Set(Object.values(catalogs).flatMap(Object.keys))].sort();
	const mapping = Object.fromEntries(keys.map((key, index) => [key, `k${index}`]));
	const normalized = Object.fromEntries(
		locales.map((locale) => [
			locale,
			Object.fromEntries(
				Object.entries(catalogs[locale]).map(([key, value]) => [
					mapping[key],
					convertInterpolation(value, locale, key),
				])
			),
		])
	);
	const projectDir = path.join(checkout, "project.inlang");
	const messageDir = path.join(projectDir, "messages");
	await fs.mkdir(messageDir, { recursive: true });
	await fs.mkdir(path.join(checkout, "node_modules/@inlang"), { recursive: true });
	await fs.symlink(
		path.join(compilerPackage, "node_modules/@inlang/plugin-message-format"),
		path.join(checkout, "node_modules/@inlang/plugin-message-format"),
		"dir"
	);
	await fs.writeFile(
		path.join(projectDir, "settings.json"),
		`${JSON.stringify(
			{
				$schema: "https://inlang.com/schema/project-settings",
				baseLocale: "en",
				locales,
				modules: ["./node_modules/@inlang/plugin-message-format/dist/index.js"],
				"plugin.inlang.messageFormat": {
					pathPattern: "./project.inlang/messages/{locale}.json",
				},
			},
			null,
			2
		)}\n`
	);
	await fs.writeFile(
		path.join(projectDir, "paraglide.config.js"),
		`export default { outdir: "./src/paraglide", strategy: ["localStorage", "baseLocale"], localStorageKey: "i18nextLng", emitTsDeclarations: false }\n`
	);
	for (const locale of locales)
		await fs.writeFile(
			path.join(messageDir, `${locale}.json`),
			`${JSON.stringify(normalized[locale])}\n`
		);
	await fs.writeFile(path.join(outputRoot, "mapping.json"), `${JSON.stringify(mapping, null, 2)}\n`);
	await fs.writeFile(path.join(outputRoot, "catalogs.json"), `${JSON.stringify(catalogs)}\n`);

	const i18nPath = path.join(checkout, "src/i18n/i18n.js");
	await fs.writeFile(i18nPath, rewriteI18nModule(await fs.readFile(i18nPath, "utf8")));
	await fs.mkdir(path.join(checkout, "scripts"), { recursive: true });
	for (const filename of ["paraglide-adapter.js", "paraglide-i18n-bridge.js", "react-i18next-bridge.js"])
		await fs.copyFile(path.join(adapterDir, filename), filename.includes("bridge") ? path.join(checkout, "src/i18n", filename) : path.join(checkout, "scripts", filename));
	const packagePath = path.join(checkout, "package.json");
	const packageJson = JSON.parse(await fs.readFile(packagePath, "utf8"));
	packageJson.devDependencies.espree = "9.6.1";
	await fs.writeFile(packagePath, `${JSON.stringify(packageJson, null, 2)}\n`);
	command("npm", ["install", "--package-lock-only", "--ignore-scripts", "--no-audit", "--no-fund"], checkout);
	command("npm", ["ci"], checkout);
	await fs.mkdir(path.join(checkout, "node_modules/@inlang"), { recursive: true });
	await fs.symlink(
		path.join(compilerPackage, "node_modules/@inlang/plugin-message-format"),
		path.join(checkout, "node_modules/@inlang/plugin-message-format"),
		"dir"
	);

	const viteConfig = `import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { paraglideAdapter } from "./scripts/paraglide-adapter.js";
const { paraglideVitePlugin } = await import(pathToFileURL(process.env.DRAWDB_PUBLIC_COMPILER_ENTRY).href);
const root = path.dirname(fileURLToPath(import.meta.url));
const split = process.env.DRAWDB_PUBLIC_MODE === "split";
const localeModules = process.env.DRAWDB_PUBLIC_MODE !== "default";
export default defineConfig({
  plugins: [
    paraglideVitePlugin({
      project: path.join(root, "project.inlang"),
      outdir: path.join(root, "src/paraglide"),
      strategy: ["localStorage", "baseLocale"],
      localStorageKey: "i18nextLng",
      outputStructure: localeModules ? "locale-modules" : undefined,
      experimentalClientLocaleSplit: split,
    }),
    paraglideAdapter(),
    react(),
  ],
  resolve: {
    alias: [
      { find: "@paraglide", replacement: path.join(root, "src/paraglide") },
      { find: "react-i18next", replacement: path.join(root, "src/i18n/react-i18next-bridge.js") },
    ],
  },
  build: { target: "esnext" },
});
`;
	await fs.writeFile(path.join(checkout, "vite.config.js"), viteConfig);

	const baseBridge = await fs.readFile(path.join(adapterDir, "paraglide-i18n-bridge.js"), "utf8");
	for (const mode of ["default", "locale-modules", "split"]) {
		let bridge = baseBridge.replace("\tchangeLanguage(locale) {", "\tasync changeLanguage(locale) {");
		const setLocaleCall = "\t\tsetLocale(activeLocale, { reload: false });";
		const replacement = mode === "split"
			? "\t\tconst { loadLocale } = await import(\"@paraglide/locale-loader.js\");\n\t\tawait loadLocale(activeLocale);\n\t\tawait setLocale(activeLocale, { reload: false });"
			: "\t\tawait setLocale(activeLocale, { reload: false });";
		if (!bridge.includes(setLocaleCall)) throw new Error("Could not patch bridge language-switch path");
		bridge = bridge.replace(setLocaleCall, replacement);
		await fs.writeFile(path.join(checkout, "src/i18n/paraglide-i18n-bridge.js"), bridge);
		const env = {
			...envBase,
			DRAWDB_PUBLIC_COMPILER_ENTRY: compilerEntry,
			DRAWDB_PUBLIC_MODE: mode,
			PARAGLIDE_OUTPUT: path.join(checkout, "src/paraglide"),
			PARAGLIDE_MAPPING: path.join(outputRoot, "mapping.json"),
		};
		command("npm", ["run", "build"], checkout, env);
		reports.push(await saveDist(`public-${mode}`));
	}
	const report = {
		drawdbCommit: resolved,
		compilerCommit: (await fs.readFile(path.join(compilerPackage, "source-commit.txt"), "utf8")).trim(),
		compilerPackageHash: createHash("sha256").update(await fs.readFile(compilerEntry)).digest("hex"),
		node: process.version,
		viteVersion: JSON.parse(await fs.readFile(path.join(checkout, "node_modules/vite/package.json"), "utf8")).version,
		localeCount: locales.length,
		keyCount: keys.length,
		modes: ["default", "locale-modules", "split"],
		outputs: reports,
	};
	await fs.writeFile(path.join(outputRoot, "build-results.json"), `${JSON.stringify(report, null, 2)}\n`);
	console.log(JSON.stringify(report, null, 2));
} finally {
	await fs.rm(staging, { recursive: true, force: true });
}
