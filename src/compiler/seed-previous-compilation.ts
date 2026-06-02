import path from "node:path";
import nodeFs from "node:fs/promises";
import type { CompilationResult } from "./compile.js";
import { hashDirectory } from "../services/file-handling/write-output.js";

export async function seedPreviousCompilationFromOutdir(args: {
	outdir: string;
	fs?: typeof nodeFs;
	cwd?: string;
}): Promise<CompilationResult | undefined> {
	const absoluteOutdir = path.resolve(args.cwd ?? process.cwd(), args.outdir);
	const outputHashes = await hashDirectory(absoluteOutdir, args.fs ?? nodeFs);

	return outputHashes ? { outputHashes } : undefined;
}
