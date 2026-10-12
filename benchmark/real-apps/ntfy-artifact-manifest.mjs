import crypto from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";
import { execFileSync } from "node:child_process";

const [appRootArg, nativeDistArg, candidateDistArg, outputArg, reportArg, nativeEsnextDistArg] = process.argv.slice(2);
if (!appRootArg || !nativeDistArg || !candidateDistArg) {
	throw new Error("Usage: node ntfy-artifact-manifest.mjs <ntfy-web-root> <native-dist> <candidate-dist> [manifest-json] [ab-report-json]");
}
const appRoot = path.resolve(appRootArg);
const appRepo = path.resolve(appRoot, "..");
const hash = (value) => crypto.createHash("sha256").update(value).digest("hex");

async function treeManifest(rootArg) {
	const root = path.resolve(rootArg);
	const files = [];
	async function visit(directory) {
		for (const entry of await fs.readdir(directory, { withFileTypes: true })) {
			const absolute = path.join(directory, entry.name);
			if (entry.isDirectory()) await visit(absolute);
			else if (entry.isFile()) {
				const relative = path.relative(root, absolute).split(path.sep).join("/");
				const contents = await fs.readFile(absolute);
				files.push({ path: relative, bytes: contents.length, sha256: hash(contents) });
			}
		}
	}
	await visit(root);
	files.sort((a, b) => a.path.localeCompare(b.path));
	const treeDescription = files.map(({ path: filename, bytes, sha256 }) => `${filename}\0${bytes}\0${sha256}\n`).join("");
	return { path: root, fileCount: files.length, totalBytes: files.reduce((total, file) => total + file.bytes, 0), treeSha256: hash(treeDescription), files };
}

const packageJson = JSON.parse(await fs.readFile(path.join(appRoot, "package.json"), "utf8"));
const packageLock = await fs.readFile(path.join(appRoot, "package-lock.json"));
const sourceCommit = execFileSync("git", ["-C", appRepo, "rev-parse", "HEAD"], { encoding: "utf8" }).trim();
const installedVersion = async (name) => {
	const packagePath = path.join(appRoot, "node_modules", name, "package.json");
	return JSON.parse(await fs.readFile(packagePath, "utf8")).version;
};
const [i18nextVersion, reactI18nextVersion, viteVersion] = await Promise.all([
	installedVersion("i18next"),
	installedVersion("react-i18next"),
	installedVersion("vite"),
]);
let abReport;
if (reportArg) abReport = JSON.parse(await fs.readFile(path.resolve(reportArg), "utf8"));
const manifest = {
	createdAt: new Date().toISOString(),
	app: "ntfy",
	sourceCommit,
	nodeVersion: process.version,
	packageLockSha256: hash(packageLock),
	versions: {
		i18next: i18nextVersion,
		reactI18next: reactI18nextVersion,
		vite: viteVersion,
		ranges: {
			i18next: packageJson.dependencies?.i18next,
			reactI18next: packageJson.dependencies?.["react-i18next"],
			vite: packageJson.devDependencies?.vite ?? packageJson.dependencies?.vite,
		},
	},
	compilerWorktreeCommit: abReport?.compilerWorktreeCommit,
	paraglidePluginWorktreeCommit: abReport?.paraglidePluginWorktreeCommit,
	artifacts: {
		native: await treeManifest(nativeDistArg),
		paraglide: await treeManifest(candidateDistArg),
		...(nativeEsnextDistArg ? { nativeEsnext: await treeManifest(nativeEsnextDistArg) } : {}),
	},
};
const serialized = `${JSON.stringify(manifest, null, 2)}\n`;
if (outputArg) await fs.writeFile(path.resolve(outputArg), serialized);
if (reportArg) {
	abReport.artifactProvenance = {
		manifestPath: path.resolve(outputArg ?? "ntfy-artifact-manifest.json"),
		sourceCommit: manifest.sourceCommit,
		nodeVersion: manifest.nodeVersion,
		packageLockSha256: manifest.packageLockSha256,
		versions: manifest.versions,
		compilerWorktreeCommit: manifest.compilerWorktreeCommit,
		paraglidePluginWorktreeCommit: manifest.paraglidePluginWorktreeCommit,
		native: { path: manifest.artifacts.native.path, treeSha256: manifest.artifacts.native.treeSha256, fileCount: manifest.artifacts.native.fileCount, totalBytes: manifest.artifacts.native.totalBytes },
		paraglide: { path: manifest.artifacts.paraglide.path, treeSha256: manifest.artifacts.paraglide.treeSha256, fileCount: manifest.artifacts.paraglide.fileCount, totalBytes: manifest.artifacts.paraglide.totalBytes },
		...(manifest.artifacts.nativeEsnext ? { nativeEsnext: { path: manifest.artifacts.nativeEsnext.path, treeSha256: manifest.artifacts.nativeEsnext.treeSha256, fileCount: manifest.artifacts.nativeEsnext.fileCount, totalBytes: manifest.artifacts.nativeEsnext.totalBytes } } : {}),
	};
	await fs.writeFile(path.resolve(reportArg), `${JSON.stringify(abReport, null, 2)}\n`);
}
console.log(JSON.stringify(manifest.artifacts && {
	app: manifest.app,
	sourceCommit: manifest.sourceCommit,
	nodeVersion: manifest.nodeVersion,
	packageLockSha256: manifest.packageLockSha256,
	versions: manifest.versions,
	compilerWorktreeCommit: manifest.compilerWorktreeCommit,
	paraglidePluginWorktreeCommit: manifest.paraglidePluginWorktreeCommit,
	native: { path: manifest.artifacts.native.path, fileCount: manifest.artifacts.native.fileCount, totalBytes: manifest.artifacts.native.totalBytes, treeSha256: manifest.artifacts.native.treeSha256 },
	paraglide: { path: manifest.artifacts.paraglide.path, fileCount: manifest.artifacts.paraglide.fileCount, totalBytes: manifest.artifacts.paraglide.totalBytes, treeSha256: manifest.artifacts.paraglide.treeSha256 },
	...(manifest.artifacts.nativeEsnext ? { nativeEsnext: { path: manifest.artifacts.nativeEsnext.path, fileCount: manifest.artifacts.nativeEsnext.fileCount, totalBytes: manifest.artifacts.nativeEsnext.totalBytes, treeSha256: manifest.artifacts.nativeEsnext.treeSha256 } } : {}),
}, null, 2));
