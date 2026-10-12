import { execFileSync } from "node:child_process";
import fs from "node:fs/promises";
import path from "node:path";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";

const root = path.dirname(fileURLToPath(import.meta.url));
const compilerRoot = process.env.PARAGLIDE_COMPILER_ROOT;
const expectedCommit = "6997d020813d76f087d585110e62cd54891726e0";
if (!compilerRoot) throw new Error("Set PARAGLIDE_COMPILER_ROOT to the compiler checkout.");
const resolvedCompilerRoot = path.resolve(compilerRoot);
const actualCommit = execFileSync("git", ["-C", resolvedCompilerRoot, "rev-parse", "HEAD"], { encoding: "utf8" }).trim();
if (actualCommit !== expectedCommit) {
  throw new Error(`Expected compiler commit ${expectedCommit}, found ${actualCommit} at ${resolvedCompilerRoot}`);
}
await fs.access(path.join(resolvedCompilerRoot, "dist/index.js"));
const requireFromFixture = createRequire(path.join(root, "package.json"));
const messageFormatModule = requireFromFixture.resolve("@inlang/plugin-message-format");
const template = JSON.parse(await fs.readFile(path.join(root, "project-settings.template.json"), "utf8"));
template.modules = [messageFormatModule];
await fs.writeFile(path.join(root, "project.inlang/settings.json"), `${JSON.stringify(template, null, 2)}\n`);
console.log(JSON.stringify({ compilerRoot: resolvedCompilerRoot, compilerCommit: actualCommit, messageFormatModule }, null, 2));
