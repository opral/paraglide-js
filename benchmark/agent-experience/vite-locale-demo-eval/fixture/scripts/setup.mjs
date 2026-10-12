import { execFileSync } from "node:child_process";
import { readFileSync, realpathSync } from "node:fs";
import { resolve } from "node:path";

const compilerPath = process.env.PARAGLIDE_COMPILER_PATH;

if (!compilerPath) {
	throw new Error("Set PARAGLIDE_COMPILER_PATH to a built @inlang/paraglide-js checkout.");
}

const resolvedCompilerPath = realpathSync(resolve(compilerPath));
const compilerPackage = JSON.parse(readFileSync(resolve(resolvedCompilerPath, "package.json"), "utf8"));

if (compilerPackage.name !== "@inlang/paraglide-js") {
	throw new Error(`PARAGLIDE_COMPILER_PATH points to ${compilerPackage.name}, expected @inlang/paraglide-js.`);
}

const npm = process.platform === "win32" ? "npm.cmd" : "npm";
execFileSync(npm, ["ci"], { stdio: "inherit" });
execFileSync(npm, ["install", "--no-save", "--package-lock=false", resolvedCompilerPath], { stdio: "inherit" });

console.log(`Installed unreleased compiler from ${resolvedCompilerPath}`);
