#!/usr/bin/env node
import fs from "node:fs/promises";
import path from "node:path";
import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const appRoot = path.join(repoRoot, ".real-apps");
const compilerRoot = path.resolve(process.env.PARAGLIDE_COMPILER_ROOT ?? "/root/repos-iii/paraglide-client-split-current-api");
const outputFile = path.resolve(process.env.OPENWEBUI_MANIFEST_OUTPUT ?? path.join(repoRoot, "benchmark/real-apps/results/openwebui-artifact-manifest.json"));
const nativeWorktree = path.resolve(process.env.OPENWEBUI_NATIVE_WORKTREE ?? path.join(appRoot, "openwebui-native-ab"));
const scopedNativeWorktree = path.resolve(process.env.OPENWEBUI_SCOPED_NATIVE_WORKTREE ?? path.join(appRoot, "openwebui-i18next-auth-scoped"));
const paraglideWorktree = path.resolve(process.env.OPENWEBUI_PARAGLIDE_WORKTREE ?? path.join(appRoot, "openwebui-paraglide-ab"));
const defaultParaglideWorktree = path.resolve(process.env.OPENWEBUI_DEFAULT_PARAGLIDE_WORKTREE ?? path.join(appRoot, "openwebui-paraglide-auth-default"));
const edgefixParaglideWorktree = path.resolve(process.env.OPENWEBUI_EDGEFIX_PARAGLIDE_WORKTREE ?? path.join(appRoot, "openwebui-paraglide-auth-edgefix"));
const nativeBuild = path.resolve(process.env.OPENWEBUI_NATIVE_BUILD ?? path.join(nativeWorktree, "build"));
const scopedNativeBuild = path.resolve(process.env.OPENWEBUI_SCOPED_NATIVE_BUILD ?? path.join(scopedNativeWorktree, "build"));
const paraglideBuild = path.resolve(process.env.OPENWEBUI_PARAGLIDE_BUILD ?? path.join(paraglideWorktree, "build"));
const defaultParaglideBuild = path.resolve(process.env.OPENWEBUI_DEFAULT_PARAGLIDE_BUILD ?? path.join(defaultParaglideWorktree, "build"));
const edgefixParaglideBuild = path.resolve(process.env.OPENWEBUI_EDGEFIX_PARAGLIDE_BUILD ?? path.join(edgefixParaglideWorktree, "build"));
const clientLocaleSplit = process.env.OPENWEBUI_CLIENT_LOCALE_SPLIT === "1";

async function treeSummary(root) {
	const entries = [];
	async function visit(directory, prefix = "") {
		for (const entry of (await fs.readdir(directory, { withFileTypes: true })).sort((a, b) => a.name.localeCompare(b.name))) {
			const relativePath = prefix ? `${prefix}/${entry.name}` : entry.name;
			const absolutePath = path.join(directory, entry.name);
			if (entry.isDirectory()) await visit(absolutePath, relativePath);
			else if (entry.isFile()) {
				const bytes = await fs.readFile(absolutePath);
				entries.push({ path: relativePath, bytes: bytes.length, sha256: createHash("sha256").update(bytes).digest("hex") });
			}
		}
	}
	await visit(root);
	const hash = createHash("sha256");
	for (const entry of entries) hash.update(`${entry.path}\0${entry.sha256}\n`);
	return {
		path: root,
		files: entries.length,
		totalBytes: entries.reduce((sum, entry) => sum + entry.bytes, 0),
		sha256: hash.digest("hex"),
		...(process.env.OPENWEBUI_MANIFEST_FILES === "1" ? { entries } : {}),
	};
}

const readPackageVersion = async (packageName) => {
	const packagePath = path.join(appRoot, "open-webui-source/node_modules", packageName, "package.json");
	return JSON.parse(await fs.readFile(packagePath, "utf8")).version;
};
const readHead = (worktree) => {
	try { return execFileSync("git", ["-C", worktree, "rev-parse", "HEAD"], { encoding: "utf8" }).trim(); }
	catch { return null; }
};

const report = {
	generatedAt: new Date().toISOString(),
	source: {
		repository: "open-webui/open-webui",
		commit: "f8ae8a6c328946dc62cd0712961a0632574581bf",
		installedVersions: {
			node: process.version,
			vite: await readPackageVersion("vite"),
			svelteKit: await readPackageVersion("@sveltejs/kit"),
			i18next: await readPackageVersion("i18next"),
		},
	},
	compiler: {
		checkout: compilerRoot,
		commit: "6997d020813d76f087d585110e62cd54891726e0",
		indexJsSha256: createHash("sha256").update(await fs.readFile(path.join(compilerRoot, "dist/index.js"))).digest("hex"),
		unpluginJsSha256: createHash("sha256").update(await fs.readFile(path.join(compilerRoot, "dist/bundler-plugins/unplugin.js"))).digest("hex"),
		clientLocaleSplitPluginSha256: createHash("sha256").update(await fs.readFile(path.join(compilerRoot, "dist/bundler-plugins/client-locale-split/vite-plugin.js"))).digest("hex"),
	},
	builds: {
		native: {
			appWorktree: nativeWorktree,
			worktreeHead: readHead(nativeWorktree),
			command: "node --max-old-space-size=8192 node_modules/vite/bin/vite.js build --target es2022",
			output: await treeSummary(nativeBuild),
		},
		nativeScoped: {
			appWorktree: scopedNativeWorktree,
			worktreeHead: readHead(scopedNativeWorktree),
			command: "node --max-old-space-size=8192 node_modules/vite/bin/vite.js build --target es2022",
			adaptation: "i18next is retained; auth-only 106-key/64-locale catalog route for /auth; original full-catalog loader retained elsewhere and when backend overrides are configured",
			output: await treeSummary(scopedNativeBuild),
		},
		paraglide: {
			appWorktree: paraglideWorktree,
			worktreeHead: readHead(paraglideWorktree),
			command: "node --max-old-space-size=12288 node_modules/vite/bin/vite.js build",
			config: {
				buildTarget: "es2022",
				outputStructure: "locale-modules",
				experimentalClientLocaleSplit: clientLocaleSplit,
				strategy: ["localStorage", "baseLocale"],
				localStorageKey: "locale",
			},
			output: await treeSummary(paraglideBuild),
		},
		paraglideDefault: {
			appWorktree: defaultParaglideWorktree,
			worktreeHead: readHead(defaultParaglideWorktree),
			command: "node --max-old-space-size=12288 node_modules/vite/bin/vite.js build",
			config: { buildTarget: "es2022", outputStructure: "locale-modules", experimentalClientLocaleSplit: false, strategy: ["localStorage", "baseLocale"], localStorageKey: "locale" },
			output: await treeSummary(defaultParaglideBuild),
		},
		paraglideEdgefix: {
			appWorktree: edgefixParaglideWorktree,
			worktreeHead: readHead(edgefixParaglideWorktree),
			command: "node --max-old-space-size=12288 node_modules/vite/bin/vite.js build",
			config: { buildTarget: "es2022", outputStructure: "locale-modules", experimentalClientLocaleSplit: true, strategy: ["localStorage", "baseLocale"], localStorageKey: "locale" },
			adaptation: "Parity-only edge behavior fix; not the measured performance tree",
			output: await treeSummary(edgefixParaglideBuild),
		},
	},
};

await fs.mkdir(path.dirname(outputFile), { recursive: true });
await fs.writeFile(outputFile, `${JSON.stringify(report, null, 2)}\n`);
console.log(JSON.stringify({ outputFile, source: report.source, compiler: report.compiler, builds: Object.fromEntries(Object.entries(report.builds).map(([name, build]) => [name, { worktreeHead: build.worktreeHead, output: build.output }])) }, null, 2));
