import { execFileSync } from "node:child_process";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { defineConfig } from "vite";

const compilerRoot = process.env.PARAGLIDE_COMPILER_ROOT;
const expectedCommit = "6997d020813d76f087d585110e62cd54891726e0";
if (!compilerRoot) throw new Error("Set PARAGLIDE_COMPILER_ROOT to the compiler checkout.");
const resolvedCompilerRoot = path.resolve(compilerRoot);
const actualCommit = execFileSync("git", ["-C", resolvedCompilerRoot, "rev-parse", "HEAD"], { encoding: "utf8" }).trim();
if (actualCommit !== expectedCommit) {
  throw new Error(`Expected compiler commit ${expectedCommit}, found ${actualCommit} at ${resolvedCompilerRoot}`);
}
const { paraglideVitePlugin } = await import(pathToFileURL(path.join(resolvedCompilerRoot, "dist/index.js")).href);

export default defineConfig({
  plugins: [paraglideVitePlugin({
    project: "./project.inlang",
    outdir: "./src/paraglide",
    outputStructure: "locale-modules",
    strategy: ["localStorage", "baseLocale"],
    localStorageKey: "locale",
    experimentalClientLocaleSplit: true,
  })],
  build: { target: "es2022", outDir: "dist", emptyOutDir: true },
});
