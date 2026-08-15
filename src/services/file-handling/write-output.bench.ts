import { bench } from "vitest";
import memfs from "memfs";
import { writeOutput } from "./write-output.js";
type NodeFs = typeof import("node:fs/promises");

const output = Object.fromEntries(
	Array.from({ length: 2_000 }, (_, index) => [
		`messages/bundle-${index}.js`,
		`export const m${index} = ${JSON.stringify("Hello world")}`,
	])
);

bench("write 2,000 generated message modules", async () => {
	const volume = memfs.Volume.fromJSON({});
	const fsp = memfs.createFsFromVolume(volume).promises as unknown as NodeFs;
	await writeOutput({ directory: "/output", output, fs: fsp });
});

bench("rewrite one of 2,000 generated message modules", async () => {
	const volume = memfs.Volume.fromJSON({});
	const fsp = memfs.createFsFromVolume(volume).promises as unknown as NodeFs;
	const hashes = await writeOutput({ directory: "/output", output, fs: fsp });
	await writeOutput({
		directory: "/output",
		output: { ...output, "messages/bundle-0.js": "changed" },
		fs: fsp,
		previousOutputHashes: hashes,
	});
});
