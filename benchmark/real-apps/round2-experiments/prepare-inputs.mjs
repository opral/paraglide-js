import fs from "node:fs/promises";
import path from "node:path";
import { execFileSync } from "node:child_process";
const checkout = path.resolve(
	process.argv[2] ?? ".real-apps/anything-llm-source"
);
const sha = execFileSync("git", ["rev-parse", "HEAD"], {
	cwd: checkout,
	encoding: "utf8",
}).trim();
if (sha !== "2a10d052a1812d7be12c43f9024072cf26a27a8b")
	throw Error(`Unexpected AnythingLLM pin ${sha}`);
const scratch = path.resolve(".real-apps/round2");
await fs.mkdir(path.join(scratch, "experiments"), { recursive: true });
let source = await fs.readFile(
	"benchmark/real-apps/anything-migration/generate.mjs",
	"utf8"
);
source = source.replace(
	'const checkout = path.resolve(".real-apps/anything-migration");',
	'const checkout = path.resolve(".real-apps/round2/anything-migration");'
);
source = source.replace(
	'const sourceFrontend = path.resolve(".real-apps/anything-llm-source/frontend");',
	`const sourceFrontend = ${JSON.stringify(path.join(checkout, "frontend"))};`
);
source = source.replace(
	"const fallbackMap = Object.fromEntries(",
	"await fs.mkdir(checkout, { recursive: true });\nawait fs.writeFile(path.join(checkout, 'bundles.json'), JSON.stringify(bundles));\nconst fallbackMap = Object.fromEntries("
);
const script = path.join(scratch, "experiments/generate-inputs.mjs");
await fs.writeFile(script, source);
execFileSync(process.execPath, [script], {
	stdio: "inherit",
	env: {
		...process.env,
		PARAGLIDE_COMPILER_DIST: path.resolve(
			process.env.PARAGLIDE_COMPILER_DIST ?? "dist"
		),
	},
});
