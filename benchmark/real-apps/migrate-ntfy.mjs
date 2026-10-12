import fs from "node:fs/promises";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const compilerRoot = path.resolve(scriptDir, "../..");
const appRoot = path.resolve(process.env.NTFY_WEB_ROOT ?? "/root/repos-iii/ntfy-native-ab/web");
const appRepo = path.resolve(appRoot, "..");
const benchmarkRoot = path.resolve(
	process.env.NTFY_BENCHMARK_OUTPUT_ROOT ?? path.join(compilerRoot, ".real-apps/ntfy-ab"),
);
const expectedCommit = process.env.NTFY_EXPECTED_COMMIT ?? "211ba22860d7483073a8ce13dcda5f467194989b";
const actualCommit = execFileSync("git", ["-C", appRepo, "rev-parse", "HEAD"], { encoding: "utf8" }).trim();
if (actualCommit !== expectedCommit) {
	throw new Error(`Expected ntfy ${expectedCommit}, found ${actualCommit} in ${appRepo}`);
}

const files = [
	["i18next-bridge.js", "src/benchmark-adapter/i18next-bridge.js"],
	["react-i18next-bridge.jsx", "src/benchmark-adapter/react-i18next-bridge.js"],
	["sparse-static-fallback.mjs", "sparse-static-fallback.mjs"],
	["vite-adapter.mjs", "vite-adapter.mjs"],
	["vite-ntfy-paraglide.config.mjs", "vite.paraglide.config.mjs"],
	["vitest-paraglide.config.mjs", "vitest.paraglide.config.mjs"],
];
for (const [sourceName, targetName] of files) {
	const sourcePath = path.join(scriptDir, "ntfy-support", sourceName);
	const targetPath = path.join(appRoot, targetName);
	await fs.mkdir(path.dirname(targetPath), { recursive: true });
	await fs.copyFile(sourcePath, targetPath);
}

const i18nPath = path.join(appRoot, "src/app/i18n.js");
const currentI18n = await fs.readFile(i18nPath, "utf8");
const originalI18n = execFileSync("git", ["-C", appRepo, "show", "HEAD:web/src/app/i18n.js"], { encoding: "utf8" });
const benchmarkI18n = `import i18n from "../benchmark-adapter/i18next-bridge.js";\n\n// Benchmark-only adapter: keep the app's initialization boundary while serving\n// translation calls from generated Paraglide output.\nconst initI18n = () => i18n.ready;\n\nexport default initI18n;\n`;
if (currentI18n !== originalI18n && currentI18n !== benchmarkI18n) {
	throw new Error(`Refusing to replace ${i18nPath}: it differs from the pinned source and benchmark adapter.`);
}
await fs.writeFile(i18nPath, benchmarkI18n);

const childEnv = {
	...process.env,
	NTFY_WEB_ROOT: appRoot,
	NTFY_BENCHMARK_OUTPUT_ROOT: benchmarkRoot,
};
execFileSync(process.execPath, [path.join(scriptDir, "prepare-ntfy.mjs")], { env: childEnv, stdio: "inherit" });
execFileSync(process.execPath, [path.join(scriptDir, "ntfy-support/make-trans-map.mjs"), appRoot], { env: childEnv, stdio: "inherit" });

console.log(`Prepared benchmark-only ntfy adapter in ${appRoot}`);
console.log(`Compiler catalogs and metadata: ${benchmarkRoot}`);
