import { bench, beforeAll } from "vitest";
import memfs from "memfs";
import { writeOutput } from "./write-output.js";
type NodeFs = typeof import("node:fs/promises");

const output = Object.fromEntries(
	Array.from({ length: 2_000 }, (_, index) => [
		`messages/bundle-${index}.js`,
		`export const m${index} = ${JSON.stringify("Hello world")}`,
	])
);
const localeOutput = {
	"messages/en.js": Object.values(output).join("\n"),
	"messages/de.js": Object.values(output).join("\n"),
};
const mockFs = () =>
	memfs.createFsFromVolume(new memfs.Volume()).promises as unknown as NodeFs;
const unchangedFs = mockFs();
const incrementalFs = mockFs();
let unchangedHashes: Record<string, string>;
let incrementalHashes: Record<string, string>;
let changed = false;

beforeAll(async () => {
	unchangedHashes = await writeOutput({
		directory: "/output",
		output,
		fs: unchangedFs,
	});
	incrementalHashes = await writeOutput({
		directory: "/output",
		output,
		fs: incrementalFs,
	});
});

bench(
	"write 2,000 generated message modules (including memfs setup)",
	async () => {
		await writeOutput({ directory: "/output", output, fs: mockFs() });
	}
);

bench("unchanged 2,000 generated message modules", async () => {
	await writeOutput({
		directory: "/output",
		output,
		fs: unchangedFs,
		previousOutputHashes: unchangedHashes,
	});
});

bench("rewrite one of 2,000 generated message modules", async () => {
	// Seed outside the measured operation; alternate content to ensure each
	// iteration actually rewrites one file, rather than timing a cold compile.
	changed = !changed;
	incrementalHashes = await writeOutput({
		directory: "/output",
		output: {
			...output,
			"messages/bundle-0.js": changed
				? "changed"
				: output["messages/bundle-0.js"]!,
		},
		fs: incrementalFs,
		previousOutputHashes: incrementalHashes,
	});
});

bench(
	"write two aggregate locale modules (including memfs setup)",
	async () => {
		await writeOutput({
			directory: "/output",
			output: localeOutput,
			fs: mockFs(),
		});
	}
);
