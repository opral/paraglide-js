import { spawnSync } from "node:child_process";
import path from "node:path";
const root = new URL("./", import.meta.url).pathname;
for (const size of [6400, 13300])
	for (let round = 0; round < 3; round++)
		for (const layout of ["message", "locale"])
			for (const backend of round % 2
				? ["catalog", "sdk"]
				: ["sdk", "catalog"]) {
				const p = spawnSync(
					process.execPath,
					[
						path.join(root, "run-case.mjs"),
						backend,
						layout,
						String(size),
						String(round),
					],
					{ encoding: "utf8", maxBuffer: 1024 * 1024 }
				);
				process.stdout.write(p.stdout);
				process.stderr.write(p.stderr);
				if (p.status) process.exit(p.status);
			}
