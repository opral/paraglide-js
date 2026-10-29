import fs from "node:fs/promises";
import path from "node:path";
import os from "node:os";
import { createRequire } from "node:module";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import {
	fixture,
	generate,
	transport,
	publish,
	variants,
} from "./prototype.mjs";

// Fresh tsc subprocesses include compiler/library startup, not editor latency.
// Compare both skipLibCheck settings because the single file changes the
// declaration graph as well as the number of filesystem writes.
const compiler = createRequire(import.meta.url).resolve("typescript/bin/tsc");
const run = promisify(execFile);
const destination =
	process.argv[2] ?? "/tmp/paraglide-single-types-checks.json";
const root = await fs.realpath(
	await fs.mkdtemp(path.join(os.tmpdir(), "paraglide-typecheck-"))
);
const results = [];
try {
	for (const [count, shape] of [
		[6400, "plain"],
		[20000, "plain"],
		[6400, "mixed"],
	]) {
		const catalog = fixture(count, ["en", "de", "fr"], shape);
		const selected = variants.filter((variant) =>
			["virtual-message-types-64", "virtual-message-single-types"].includes(
				variant.name
			)
		);
		const directories = new Map();
		for (const variant of selected) {
			const directory = path.join(root, `${count}-${shape}-${variant.name}`);
			const files = transport(
				(await generate(catalog, variant)).output,
				variant
			).disk;
			await publish(path.join(directory, "paraglide"), files);
			await fs.writeFile(
				path.join(directory, "package.json"),
				'{"type":"module"}'
			);
			await fs.writeFile(
				path.join(directory, "consumer.ts"),
				`
        import { m, message_0 } from "./paraglide/messages.js";
        import type { Message_0Inputs } from "./paraglide/messages.js";
        const inputs: m.Message_0Inputs = { name: "Ada" };
        const namedInputs: Message_0Inputs = inputs;
        message_0(namedInputs, { locale: "de" }) satisfies string;
        m.message_${count - 1}(${shape === "mixed" ? "{count: 2}" : '{name: "Ada"}'});
        // @ts-expect-error required inputs remain checked
        m.message_0();
        // @ts-expect-error locale union remains checked
        m.message_0(inputs, { locale: "invalid" });
        // @ts-expect-error nonexistent messages remain checked
        m.does_not_exist();
      `
			);
			directories.set(variant.name, directory);
		}
		for (const skipLibCheck of [false, true]) {
			for (let round = 0; round < 3; round++) {
				const order = round % 2 ? [...selected].reverse() : selected;
				for (const variant of order) {
					const directory = directories.get(variant.name);
					await fs.writeFile(
						path.join(directory, "tsconfig.json"),
						JSON.stringify({
							compilerOptions: {
								strict: true,
								noEmit: true,
								allowJs: false,
								module: "NodeNext",
								moduleResolution: "NodeNext",
								target: "ES2022",
								types: [],
								skipLibCheck,
							},
							files: ["consumer.ts"],
						})
					);
					const start = performance.now();
					try {
						await run(
							process.execPath,
							[compiler, "-p", path.join(directory, "tsconfig.json")],
							{ env: { ...process.env, ELECTRON_RUN_AS_NODE: "1" } }
						);
					} catch (error) {
						throw new Error(error.stdout || error.message, { cause: error });
					}
					const record = {
						count,
						shape,
						variant: variant.name,
						skipLibCheck,
						round,
						ms: performance.now() - start,
					};
					results.push(record);
					console.log(JSON.stringify(record));
				}
			}
		}
	}
	await fs.writeFile(
		destination,
		JSON.stringify(
			{
				metadata: {
					node: process.version,
					typescript: createRequire(import.meta.url)("typescript/package.json")
						.version,
					note: "Fresh CLI subprocesses, including compiler/library startup. Not language-server or editor latency. allowJs false, strict true, noEmit true. Three rotated repetitions.",
				},
				results,
			},
			null,
			2
		) + "\n"
	);
} finally {
	await fs.rm(root, { recursive: true, force: true });
}
