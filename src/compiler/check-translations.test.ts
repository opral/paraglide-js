import { afterEach, expect, test, vi } from "vitest";
import * as sdk from "@inlang/sdk";
import { memfs } from "memfs";
import { loadProjectInMemory, newProject } from "@inlang/sdk";
import messageFormat from "@inlang/plugin-message-format";
import * as v from "valibot";
import { compileProject } from "./compile-project.js";
import { compile } from "./compile.js";
import { paraglideConfigSchema } from "../services/config/config-schema.js";

vi.mock("@inlang/sdk", async (importOriginal) => ({
	...(await importOriginal<typeof import("@inlang/sdk")>()),
	loadProjectFromDirectory: vi.fn(),
}));

type Catalogs = Record<string, Record<string, unknown>>;
type TestProject = Awaited<ReturnType<typeof loadProjectInMemory>>;
const projects: TestProject[] = [];
const strictOptions = { checkTranslations: true, emitReadme: false };

async function createProject(catalogs: Catalogs): Promise<TestProject> {
	const settings = {
		baseLocale: "en",
		locales: ["en", "pt", "es"],
		modules: [],
	};
	const project = await loadProjectInMemory({
		blob: await newProject({ settings }),
		providePlugins: [
			{
				key: messageFormat.key,
				importFiles: ({ files }) =>
					messageFormat.importFiles!({ files, settings }),
			},
		],
	});
	projects.push(project);
	await project.importFiles({
		pluginKey: messageFormat.key,
		files: Object.entries(catalogs).map(([locale, messages]) => ({
			locale,
			content: new TextEncoder().encode(JSON.stringify(messages)),
		})),
	});
	return project;
}

afterEach(async () => {
	vi.restoreAllMocks();
	for (const project of projects.splice(0)) await project.close();
});

test("translation checks remain opt-in and preserve fallback output", async () => {
	const project = await createProject({ en: { hello: "Hello {name}" } });
	const implicit = await compileProject({ project });
	const compilerOptions = { checkTranslations: false, emitReadme: true };
	expect(await compileProject({ project, compilerOptions })).toEqual(implicit);
	await expect(
		compileProject({ project, compilerOptions: strictOptions })
	).rejects.toThrow(/missing-translation.*hello.*pt/s);
});

test.each([
	["empty-translation", " "],
	["missing-variable", "Hola"],
	["unknown-variable", "Hola {username}"],
])("reports %s with the bundle ID and locale", async (checkId, translation) => {
	const project = await createProject({
		en: { hello: "Hello {name}" },
		pt: { hello: "Olá {name}" },
		es: { hello: translation },
	});
	await expect(
		compileProject({ project, compilerOptions: strictOptions })
	).rejects.toThrow(new RegExp(`${checkId}.*hello.*es`, "s"));
});

test("valid translations produce the same files with checks enabled", async () => {
	const project = await createProject({
		en: { hello: "Hello {name}" },
		pt: { hello: "Olá {name}" },
		es: { hello: "Hola {name}" },
	});
	expect(
		await compileProject({ project, compilerOptions: strictOptions })
	).toEqual(
		await compileProject({ project, compilerOptions: { emitReadme: false } })
	);
});

test("validates every plural form using the SDK semantics", async () => {
	const plural = [
		{
			declarations: [
				"input count",
				"input name",
				"local plural = count: plural",
			],
			selectors: ["plural"],
			match: {
				"plural=one": "{name}: {count} item",
				"plural=*": "{name}: {count} items",
			},
		},
	];
	const project = await createProject({
		en: { items: plural },
		pt: { items: plural },
		es: {
			items: [
				{
					...plural[0],
					match: {
						"plural=one": "{name}: {count} item",
						"plural=*": "{count} items",
					},
				},
			],
		},
	});
	await expect(
		compileProject({ project, compilerOptions: strictOptions })
	).rejects.toThrow(/missing-variable.*items.*name.*es/s);
});

test("config accepts checkTranslations as a boolean", () => {
	expect(
		v.parse(paraglideConfigSchema, { checkTranslations: true })
	).toMatchObject({ checkTranslations: true });
	expect(
		v.safeParse(paraglideConfigSchema, { checkTranslations: "true" }).success
	).toBe(false);
});

test.each([false, true])(
	"failed checks preserve output and release the lock when close also fails: %s",
	async (closeFails) => {
		const invalid = await createProject({ en: { hello: "Hello" } });
		const valid = await createProject({
			en: { hello: "Hello" },
			pt: { hello: "Olá" },
			es: { hello: "Hola" },
		});
		const close = invalid.close;
		const closeSpy = vi.spyOn(invalid, "close").mockImplementation(async () => {
			await close();
			projects.splice(projects.indexOf(invalid), 1);
			if (closeFails) throw new Error("cleanup failed");
		});
		vi.spyOn(sdk, "loadProjectFromDirectory")
			.mockResolvedValueOnce({
				...invalid,
				errors: { get: async () => [...(await invalid.errors.get())] },
			})
			.mockResolvedValueOnce({
				...valid,
				errors: { get: async () => [...(await valid.errors.get())] },
			});
		const { fs, vol } = memfs({ "/output/messages.js": "previous output" });
		const options = {
			...strictOptions,
			project: "/project.inlang",
			outdir: "/output",
			fs: fs as unknown as typeof import("node:fs"),
		};
		await expect(compile(options)).rejects.toThrow(/missing-translation/);
		expect(closeSpy).toHaveBeenCalledOnce();
		expect(vol.toJSON()).toEqual({ "/output/messages.js": "previous output" });
		await expect(compile(options)).resolves.toHaveProperty("outputHashes");
		projects.splice(projects.indexOf(valid), 1);
		expect(fs.readFileSync("/output/messages.js", "utf8")).not.toBe(
			"previous output"
		);
	}
);
