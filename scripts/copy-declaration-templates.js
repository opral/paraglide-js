import fs from "node:fs/promises";

// tsc copies JavaScript but does not copy non-source assets. Keep the direct
// emitter's templates beside the compiled module in the published package.
const source = new URL("../src/compiler/declarations/", import.meta.url);
const destination = new URL("../dist/compiler/declarations/", import.meta.url);
await fs.mkdir(destination, { recursive: true });
for (const file of await fs.readdir(source)) {
	if (file.endsWith(".d.ts.template")) {
		await fs.copyFile(new URL(file, source), new URL(file, destination));
	}
}
