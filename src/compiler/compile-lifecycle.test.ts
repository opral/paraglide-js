import {
	loadProjectInMemory,
	newProject,
	saveProjectToDirectory,
} from "@inlang/sdk";
import { memfs } from "memfs";
import { test, expect, vi } from "vitest";
import { compile } from "./compile.js";

test("permits a retry after catalog output publication fails", async () => {
	const fs = memfs().fs as unknown as typeof import("node:fs");
	const project = await loadProjectInMemory({ blob: await newProject({}) });
	try {
		await saveProjectToDirectory({
			project,
			path: "/project.inlang",
			fs: fs.promises,
		});
	} finally {
		await project.close();
	}
	const originalWrite = fs.promises.writeFile.bind(fs.promises);
	const error = Object.assign(new Error("write: no space left on device"), {
		code: "ENOSPC",
	});
	const writeSpy = vi
		.spyOn(fs.promises, "writeFile")
		.mockImplementation((async (...args) => {
			if (String(args[0]).startsWith("/output/")) throw error;
			return originalWrite(...args);
		}) as typeof fs.promises.writeFile);
	try {
		await expect(
			compile({ project: "/project.inlang", outdir: "/output", fs })
		).rejects.toBe(error);
	} finally {
		writeSpy.mockRestore();
	}
	const result = await compile({
		project: "/project.inlang",
		outdir: "/output",
		fs,
	});
	expect(result.outputHashes).toHaveProperty("runtime.js");
});

async function createMessageFormatProject() {
	const fs = memfs().fs as unknown as typeof import("node:fs");
	const diskFs = await import("node:fs/promises");
	await fs.promises.mkdir("/project.inlang", { recursive: true });
	await fs.promises.mkdir("/messages", { recursive: true });
	await fs.promises.writeFile(
		"/plugin.js",
		await diskFs.readFile(
			new URL(
				"../../node_modules/@inlang/plugin-message-format/dist/index.js",
				import.meta.url
			)
		)
	);
	await fs.promises.writeFile(
		"/project.inlang/settings.json",
		JSON.stringify({
			baseLocale: "en",
			// fr has no resource file: a missing file stays tolerated
			locales: ["en", "de", "fr"],
			modules: ["/plugin.js"],
			"plugin.inlang.messageFormat": {
				pathPattern: "/messages/{locale}.json",
			},
		})
	);
	await fs.promises.writeFile(
		"/messages/en.json",
		JSON.stringify({ greeting: "Hello" })
	);
	await fs.promises.writeFile(
		"/messages/de.json",
		JSON.stringify({ greeting: "Hallo" })
	);
	return fs;
}

test.each([
	["cleaning the output directory", true],
	["updating the previous compilation", false],
] as const)(
	"rejects unreadable translation resources before %s",
	async (_, cleanOutdir) => {
		const { hashDirectory } =
			await import("../services/file-handling/write-output.js");
		const fs = await createMessageFormatProject();
		const originalRead = fs.promises.readFile.bind(fs.promises);
		const denied = Object.assign(
			new Error("EACCES: permission denied, open '/messages/de.json'"),
			{ code: "EACCES" }
		);
		const readSpy = vi.spyOn(fs.promises, "readFile");
		const options = {
			project: "/project.inlang",
			outdir: "/output",
			fs,
			cleanOutdir,
		};
		try {
			const previous = await compile(options);
			const before = await hashDirectory("/output", fs.promises);
			expect(before).toEqual(previous.outputHashes);
			expect(
				await fs.promises.readFile("/output/messages/greeting.js", "utf8")
			).toContain("Hallo");

			readSpy.mockImplementation((async (...args) => {
				if (String(args[0]) === "/messages/de.json") throw denied;
				return originalRead(...args);
			}) as typeof fs.promises.readFile);
			const failure = await compile({
				...options,
				previousCompilation: cleanOutdir ? undefined : previous,
			}).then(
				() => undefined,
				(error: unknown) => error
			);
			expect(await hashDirectory("/output", fs.promises)).toEqual(before);
			expect(failure).toBeInstanceOf(AggregateError);
			expect((failure as AggregateError).message).toContain(
				"/messages/de.json (EACCES)"
			);
			expect((failure as AggregateError).errors).toEqual([
				expect.objectContaining({
					name: "ResourceFileImportError",
					cause: denied,
				}),
			]);

			readSpy.mockRestore();
			const recovered = await compile(options);
			expect(recovered.outputHashes).toEqual(previous.outputHashes);
			expect(await hashDirectory("/output", fs.promises)).toEqual(before);
		} finally {
			readSpy.mockRestore();
		}
	}
);
