import memfs from "memfs";
import type fs from "node:fs/promises";
import { test, expect, vi, beforeEach } from "vitest";

beforeEach(() => {
	vi.resetModules();
});

test("should write the output to a non-existing directory", async () => {
	const { writeOutput } = await import("./write-output.js");
	const fs = mockFs({});

	await writeOutput({
		directory: "/output",
		output: { "test.txt": "test" },
		fs,
	});
	expect(await fs.readFile("/output/test.txt", { encoding: "utf-8" })).toBe(
		"test"
	);
});

test("should clear & overwrite output that's already there", async () => {
	const { writeOutput } = await import("./write-output.js");
	const fs = mockFs({
		"/output/test.txt": "old",
		"/output/other.txt": "other",
	});

	await writeOutput({
		directory: "/output",
		output: { "test.txt": "new" },
		cleanDirectory: true,
		fs,
	});

	expect(await fs.readFile("/output/test.txt", { encoding: "utf-8" })).toBe(
		"new"
	);
	await expect(
		async () => await fs.readFile("/output/other.txt", { encoding: "utf-8" })
	).rejects.toBeDefined();
});

test("should create any missing directories", async () => {
	const { writeOutput } = await import("./write-output.js");
	const fs = mockFs({});

	await writeOutput({
		directory: "/output/messages",
		output: {
			"de/test.txt": "de",
			"en/test.txt": "en",
		},
		fs,
	});
	expect(
		await fs.readFile("/output/messages/de/test.txt", { encoding: "utf-8" })
	).toBe("de");
	expect(
		await fs.readFile("/output/messages/en/test.txt", { encoding: "utf-8" })
	).toBe("en");
});

test("should only write once if the output hasn't changed", async () => {
	const { writeOutput } = await import("./write-output.js");
	const fs = mockFs({});

	const writeFileSpy = vi.spyOn(fs as any, "writeFile");

	const hashes = await writeOutput({
		directory: "/output",
		output: { "test.txt": "test" },
		fs,
	});
	const hashes2 = await writeOutput({
		directory: "/output",
		output: { "test.txt": "test" },
		fs,
		previousOutputHashes: hashes,
	});
	expect(hashes).toEqual(hashes2);
	expect(await fs.readFile("/output/test.txt", { encoding: "utf-8" })).toBe(
		"test"
	);
	expect(writeFileSpy).toHaveBeenCalledTimes(1);
});

test("should write again if the output has changed", async () => {
	const { writeOutput } = await import("./write-output.js");
	const fs = mockFs({});

	const writeFileSpy = vi.spyOn(fs as any, "writeFile");

	const hashes = await writeOutput({
		directory: "/output",
		output: { "test.txt": "test" },
		fs,
	});
	await writeOutput({
		directory: "/output",
		output: { "test.txt": "test2" },
		fs,
		previousOutputHashes: hashes,
	});
	expect(await fs.readFile("/output/test.txt", { encoding: "utf-8" })).toBe(
		"test2"
	);
	expect(writeFileSpy).toHaveBeenCalledTimes(2);
});

test("should only create directories for files that changed", async () => {
	const { writeOutput } = await import("./write-output.js");
	const fs = mockFs({});
	const mkdirSpy = vi.spyOn(fs, "mkdir");

	const hashes = await writeOutput({
		directory: "/output",
		output: {
			"messages/first.js": "first",
			"messages/second.js": "second",
		},
		fs,
	});
	mkdirSpy.mockClear();

	await writeOutput({
		directory: "/output",
		output: {
			"messages/first.js": "changed",
			"messages/second.js": "second",
		},
		fs,
		previousOutputHashes: hashes,
	});

	expect(mkdirSpy).toHaveBeenCalledTimes(1);
	expect(mkdirSpy).toHaveBeenCalledWith("/output/messages", {
		recursive: true,
	});
});

test("should write files if output has partially changed", async () => {
	const { writeOutput } = await import("./write-output.js");
	const fs = mockFs({});

	const writeFileSpy = vi.spyOn(fs as any, "writeFile");

	const hashes = await writeOutput({
		directory: "/output",
		output: { "file1.txt": "test", "file2.txt": "test" },
		fs,
	});

	await writeOutput({
		directory: "/output",
		output: { "file1.txt": "test", "file2.txt": "test2" },
		fs,
		previousOutputHashes: hashes,
	});
	expect(writeFileSpy).toHaveBeenCalledWith("/output/file2.txt", "test2");
	expect(writeFileSpy).toHaveBeenCalledTimes(3);
});

test("should delete files that have been removed from the output", async () => {
	const { writeOutput } = await import("./write-output.js");
	const fs = mockFs({});

	// First write with three files
	const hashes = await writeOutput({
		directory: "/output",
		output: {
			"file1.txt": "content1",
			"file2.txt": "content2",
			"subdir/file3.txt": "content3",
		},
		fs,
	});

	// Verify all files were written
	expect(await fs.readFile("/output/file1.txt", { encoding: "utf-8" })).toBe(
		"content1"
	);
	expect(await fs.readFile("/output/file2.txt", { encoding: "utf-8" })).toBe(
		"content2"
	);
	expect(
		await fs.readFile("/output/subdir/file3.txt", { encoding: "utf-8" })
	).toBe("content3");

	// Second write with file2.txt removed
	await writeOutput({
		directory: "/output",
		output: {
			"file1.txt": "content1",
			"subdir/file3.txt": "content3updated",
		},
		fs,
		previousOutputHashes: hashes,
	});

	// Verify file1.txt still exists
	expect(await fs.readFile("/output/file1.txt", { encoding: "utf-8" })).toBe(
		"content1"
	);
	// Verify file2.txt has been deleted
	await expect(
		async () => await fs.readFile("/output/file2.txt", { encoding: "utf-8" })
	).rejects.toBeDefined();
	// Verify file3.txt was updated
	expect(
		await fs.readFile("/output/subdir/file3.txt", { encoding: "utf-8" })
	).toBe("content3updated");

	// Get the new hashes
	const newHashes = await writeOutput({
		directory: "/output",
		output: {
			"file1.txt": "content1",
			"subdir/file3.txt": "content3updated",
		},
		fs,
		previousOutputHashes: hashes,
	});

	// Third write with subdir/file3.txt removed
	await writeOutput({
		directory: "/output",
		output: {
			"file1.txt": "content1",
		},
		fs,
		previousOutputHashes: newHashes,
	});

	// Verify file1.txt still exists
	expect(await fs.readFile("/output/file1.txt", { encoding: "utf-8" })).toBe(
		"content1"
	);
	// Verify subdir/file3.txt has been deleted
	await expect(
		async () =>
			await fs.readFile("/output/subdir/file3.txt", { encoding: "utf-8" })
	).rejects.toBeDefined();
	// Verify the subdir directory has also been removed
	await expect(
		async () => await fs.readdir("/output/subdir")
	).rejects.toBeDefined();
});

test("hashDirectory matches the hashes writeOutput returns", async () => {
	const { writeOutput, hashDirectory } = await import("./write-output.js");
	const fs = mockFs({});

	const output = {
		"a.txt": "alpha",
		"nested/b.txt": "beta",
		"nested/deep/c.txt": "gamma",
	};

	const writtenHashes = await writeOutput({
		directory: "/output",
		output,
		fs,
	});

	const seededHashes = await hashDirectory("/output", fs);

	expect(seededHashes).toEqual(writtenHashes);
});

test("hashDirectory returns undefined when directory does not exist", async () => {
	const { hashDirectory } = await import("./write-output.js");
	const fs = mockFs({});

	expect(await hashDirectory("/nope", fs)).toBeUndefined();
});

test("hashDirectory skips files that disappear while walking", async () => {
	const { hashDirectory } = await import("./write-output.js");
	const fs = mockFs({
		"/output/a.txt": "alpha",
		"/output/b.txt": "beta",
	});
	const readFile = fs.readFile.bind(fs);
	vi.spyOn(fs, "readFile").mockImplementation((async (...args) => {
		if (args[0] === "/output/b.txt") {
			throw new Error("file disappeared");
		}
		return readFile(args[0], args[1]);
	}) as typeof fs.readFile);

	const seededHashes = await hashDirectory("/output", fs);

	expect(seededHashes).toEqual({
		"a.txt": expect.any(String),
	});
});

test("hashDirectory skips directories that disappear while walking", async () => {
	const { hashDirectory } = await import("./write-output.js");
	const fs = mockFs({
		"/output/nested/b.txt": "beta",
	});
	const readdir = fs.readdir.bind(fs);
	vi.spyOn(fs, "readdir").mockImplementation((async (...args) => {
		if (args[0] === "/output/nested") {
			throw new Error("directory disappeared");
		}
		return readdir(args[0], args[1] as never);
	}) as typeof fs.readdir);

	const seededHashes = await hashDirectory("/output", fs);

	expect(seededHashes).toEqual({});
});

const mockFs = (files: memfs.DirectoryJSON) => {
	const _memfs = memfs.createFsFromVolume(memfs.Volume.fromJSON(files));
	return _memfs.promises as unknown as typeof fs;
};

test("bounds every filesystem phase for large nested outputs", async () => {
	const { writeOutput } = await import("./write-output.js");
	const fs = mockFs({});
	const output = Object.fromEntries(
		Array.from({ length: 500 }, (_, i) => [
			`messages/${i}/en.js`,
			`message ${i}`,
		])
	);
	for (const name of ["mkdir", "writeFile", "unlink"] as const) {
		const original = fs[name].bind(fs);
		let active = 0;
		let peak = 0;
		vi.spyOn(fs, name).mockImplementation((async (...args: unknown[]) => {
			active++;
			peak = Math.max(peak, active);
			try {
				// Simulate a process with room for at most 32 operations.
				if (active > 32)
					throw Object.assign(new Error("too many open files"), {
						code: "EMFILE",
					});
				await new Promise<void>((resolve) => setImmediate(resolve));
				return await (original as (...args: unknown[]) => Promise<unknown>)(
					...args
				);
			} finally {
				active--;
			}
		}) as never);
		const hashes = await writeOutput({ directory: "/output", output, fs });
		await writeOutput({
			directory: "/output",
			output: {},
			previousOutputHashes: hashes,
			fs,
		});
		expect(peak).toBeGreaterThan(1);
		expect(peak).toBeLessThanOrEqual(32);
		expect(active).toBe(0);
		vi.restoreAllMocks();
	}
});

test.each(["mkdir", "writeFile"] as const)(
	"propagates %s errors and retries the incomplete output",
	async (name) => {
		const { writeOutput, hashDirectory } = await import("./write-output.js");
		const fs = mockFs({});
		const output = {
			"messages/en.js": "English",
			"messages/de.js": "German",
			"runtime.js": "runtime",
		};
		const error = Object.assign(new Error(`${name}: permission denied`), {
			code: "EACCES",
		});
		const spy = vi.spyOn(fs, name).mockRejectedValueOnce(error);
		await expect(
			writeOutput({ directory: "/output", output, fs })
		).rejects.toBe(error);
		spy.mockRestore();
		const hashes = await writeOutput({ directory: "/output", output, fs });
		expect(await hashDirectory("/output", fs)).toEqual(hashes);
	}
);

test("waits for active writes and stops scheduling after a failure", async () => {
	const { writeOutput } = await import("./write-output.js");
	const fs = mockFs({});
	const output = Object.fromEntries(
		Array.from({ length: 100 }, (_, i) => [`${i}.js`, `${i}`])
	);
	const error = Object.assign(new Error("disk full"), { code: "ENOSPC" });
	let release!: () => void;
	const blocked = new Promise<void>((resolve) => {
		release = resolve;
	});
	let signalStarted!: () => void;
	const startedWriting = new Promise<void>((resolve) => {
		signalStarted = resolve;
	});
	let calls = 0;
	let active = 0;
	vi.spyOn(fs, "writeFile").mockImplementation((async () => {
		calls++;
		if (calls === 1) throw error;
		active++;
		signalStarted();
		await blocked;
		active--;
	}) as typeof fs.writeFile);
	let settled = false;
	const writing = writeOutput({ directory: "/output", output, fs });
	const rejection = writing.catch((caught) => caught);
	void writing.catch(() => {
		settled = true;
	});
	await startedWriting;
	await Promise.resolve();
	expect(active).toBeGreaterThan(0);
	expect(settled).toBe(false);
	const started = calls;
	release();
	expect(await rejection).toBe(error);
	expect(active).toBe(0);
	expect(calls).toBe(started);
	expect(calls).toBeLessThan(100);
});

test("required deletes ignore only missing files and preserve the old hashes on failure", async () => {
	const { writeOutput } = await import("./write-output.js");
	const fs = mockFs({});
	const hashes = await writeOutput({
		directory: "/output",
		output: { "old.js": "old" },
		fs,
	});
	const error = Object.assign(new Error("unlink denied"), { code: "EACCES" });
	const spy = vi.spyOn(fs, "unlink").mockRejectedValueOnce(error);
	await expect(
		writeOutput({
			directory: "/output",
			output: { "new.js": "new" },
			previousOutputHashes: hashes,
			fs,
		})
	).rejects.toBe(error);
	expect(await fs.readFile("/output/old.js", "utf8")).toBe("old");
	spy.mockRestore();
	await fs.unlink("/output/old.js");
	const next = await writeOutput({
		directory: "/output",
		output: { "new.js": "new" },
		previousOutputHashes: hashes,
		fs,
	});
	expect(Object.keys(next)).toEqual(["new.js"]);
	expect(await fs.readFile("/output/new.js", "utf8")).toBe("new");
});

test("clean partial updates rewrite unchanged output too", async () => {
	const { writeOutput, hashDirectory } = await import("./write-output.js");
	const fs = mockFs({});
	const output = { "messages/en.js": "English", "runtime.js": "runtime" };
	const hashes = await writeOutput({ directory: "/output", output, fs });
	const next = await writeOutput({
		directory: "/output",
		output: { ...output, "messages/en.js": "changed" },
		previousOutputHashes: hashes,
		cleanDirectory: true,
		fs,
	});
	expect(await fs.readFile("/output/runtime.js", "utf8")).toBe("runtime");
	expect(await hashDirectory("/output", fs)).toEqual(next);
});

test("retries a partially written incremental update with the same previous hashes", async () => {
	const { writeOutput, hashDirectory } = await import("./write-output.js");
	const fs = mockFs({});
	const baseline = {
		"a.js": "old a",
		"b.js": "old b",
		"unchanged.js": "unchanged",
	};
	const previousOutputHashes = await writeOutput({
		directory: "/output",
		output: baseline,
		fs,
	});
	const output = { ...baseline, "a.js": "new a", "b.js": "new b" };
	const original = fs.writeFile.bind(fs);
	const error = Object.assign(new Error("disk full"), { code: "ENOSPC" });
	const spy = vi.spyOn(fs, "writeFile").mockImplementation((async (...args) => {
		if (args[0] === "/output/b.js") throw error;
		return original(...args);
	}) as typeof fs.writeFile);
	await expect(
		writeOutput({ directory: "/output", output, previousOutputHashes, fs })
	).rejects.toBe(error);
	expect(await fs.readFile("/output/a.js", "utf8")).toBe("new a");
	expect(await fs.readFile("/output/b.js", "utf8")).toBe("old b");
	spy.mockRestore();
	const next = await writeOutput({
		directory: "/output",
		output,
		previousOutputHashes,
		fs,
	});
	expect(await hashDirectory("/output", fs)).toEqual(next);
	expect(previousOutputHashes["a.js"]).not.toBe(next["a.js"]);
});
