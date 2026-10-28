import { test, expect, beforeEach, afterEach, vi } from "vitest";
import consola from "consola";
import { memfs } from "memfs";
import path from "node:path";
import realFs from "node:fs";
import type { HotPayload, ViteDevServer } from "vite";
import {
	loadProjectInMemory,
	newProject,
	saveProjectToDirectory,
} from "@inlang/sdk";

let originalNodeEnv: string | undefined;
let testDirectories: string[] = [];

beforeEach(() => {
	originalNodeEnv = process.env.NODE_ENV;

	// Reset module state between tests so the module-scoped
	// `previousCompilation` doesn't leak across tests.
	vi.resetModules();

	// Mock logging methods to suppress error messages in tests
	consola.mockTypes(() => vi.fn());
});

afterEach(async () => {
	if (originalNodeEnv !== undefined) {
		process.env.NODE_ENV = originalNodeEnv;
	} else {
		delete process.env.NODE_ENV;
	}
	vi.restoreAllMocks();
	for (const directory of testDirectories.splice(0)) {
		await realFs.promises.rm(directory, { recursive: true, force: true });
	}
});

/**
 * Creates a real on-disk fixture: `<workspace>/project.inlang` with a
 * saved inlang project. The paraglide config lives inside the project
 * directory and is loaded through jiti, so it must exist on the real
 * filesystem.
 */
async function createProjectFixture(
	options: {
		locales?: string[];
		outdirName?: string;
		/** `false` skips writing a config file entirely. */
		config?:
			| {
					fileName?: string;
					content?: string;
			  }
			| false;
	} = {}
): Promise<{
	workspace: string;
	projectDir: string;
	outdir: string;
}> {
	const { mkdtemp, mkdir, writeFile } = await import("node:fs/promises");
	const { tmpdir } = await import("node:os");
	const workspace = realFs.realpathSync(
		await mkdtemp(path.join(tmpdir(), "paraglide-plugin-"))
	);
	testDirectories.push(workspace);
	const projectDir = path.join(workspace, "project.inlang");
	await mkdir(projectDir, { recursive: true });

	const project = await loadProjectInMemory({
		blob: await newProject({
			settings: {
				baseLocale: "en",
				locales: options.locales ?? ["en", "de"],
			},
		}),
	});
	await saveProjectToDirectory({
		project,
		path: projectDir,
		fs: realFs.promises,
	});

	const outdir = path.join(workspace, options.outdirName ?? "test-output");
	if (options.config !== false) {
		const content =
			options.config?.content ??
			["export default {", `  outdir: ${JSON.stringify(outdir)},`, "}"].join(
				"\n"
			);
		await writeFile(
			path.join(projectDir, options.config?.fileName ?? "paraglide.config.js"),
			content
		);
	}
	return { workspace, projectDir, outdir };
}

/** Fires Vite's configResolved so the plugin learns its root. */
function setViteRoot(plugin: any, root: string): void {
	const configResolved =
		(plugin.vite?.configResolved as
			| { handler?: (config: unknown) => void }
			| undefined) ??
		(plugin.configResolved as
			| { handler?: (config: unknown) => void }
			| undefined);
	configResolved?.handler?.({ root });
}

const mockContext = { addWatchFile: () => {} };

test("closing Vite waits for an in-flight watch compilation", async () => {
	process.env.NODE_ENV = "development";
	const { workspace, projectDir, outdir } = await createProjectFixture();
	let notifyEntered!: () => void;
	let releaseCompilation!: () => void;
	const entered = new Promise<void>((resolve) => {
		notifyEntered = resolve;
	});
	const released = new Promise<void>((resolve) => {
		releaseCompilation = resolve;
	});
	let shouldBlock = false;
	vi.doMock("../compiler/compile.js", async (importOriginal) => {
		const original =
			await importOriginal<typeof import("../compiler/compile.js")>();
		return {
			...original,
			compile: async (...args: Parameters<typeof original.compile>) => {
				if (shouldBlock) {
					notifyEntered();
					await released;
				}
				return original.compile(...args);
			},
		};
	});
	const { createServer } = await import("vite");
	const { paraglideVitePlugin } = await import("./vite.js");
	const server = await createServer({
		root: workspace,
		configFile: false,
		logLevel: "silent",
		plugins: [paraglideVitePlugin({ project: projectDir, outdir })],
		server: { middlewareMode: true, watch: null },
		optimizeDeps: { noDiscovery: true, include: [] },
	});
	let pending: Promise<void> | undefined;
	try {
		const file = path.join(projectDir, "settings.json");
		const settings = JSON.parse(await realFs.promises.readFile(file, "utf8"));
		await realFs.promises.writeFile(
			file,
			JSON.stringify({ ...settings, baseLocale: "de" })
		);
		shouldBlock = true;
		pending = server.pluginContainer.watchChange(file, { event: "update" });
		await entered;
		let didClose = false;
		const closing = server.close().then(() => {
			didClose = true;
		});
		await new Promise((resolve) => setTimeout(resolve, 50));
		expect(didClose).toBe(false);
		releaseCompilation();
		await closing;
		expect(
			await realFs.promises.readFile(path.join(outdir, "runtime.js"), "utf8")
		).toContain('baseLocale = "de"');
	} finally {
		releaseCompilation();
		await pending;
		await server.close();
		vi.doUnmock("../compiler/compile.js");
	}
});

function configureViteServer(plugin: any) {
	const ws = {
		send: vi.fn(),
		clients: new Set([{}]),
		on: vi.fn(),
	};
	plugin.configureServer?.({ ws });
	return ws;
}

test.each(["settings", "config"])(
	"ignores late %s events after close and resumes on buildStart",
	async (source) => {
		process.env.NODE_ENV = "development";
		const { workspace, projectDir, outdir } = await createProjectFixture();
		const { paraglideVitePlugin } = await import("./vite.js");
		const plugin = paraglideVitePlugin({ project: projectDir, outdir }) as any;
		setViteRoot(plugin, workspace);
		await plugin.buildStart.call(mockContext);
		await plugin.closeBundle.call(mockContext);
		const runtime = path.join(outdir, "runtime.js");
		const before = await realFs.promises.readFile(runtime, "utf8");
		const file = path.join(
			projectDir,
			source === "settings" ? "settings.json" : "paraglide.config.js"
		);
		if (source === "settings") {
			const settings = JSON.parse(await realFs.promises.readFile(file, "utf8"));
			await realFs.promises.writeFile(
				file,
				JSON.stringify({ ...settings, baseLocale: "de" })
			);
		} else {
			await realFs.promises.writeFile(
				file,
				'export default { cookieName: "after-close" };'
			);
		}
		await plugin.watchChange.call(mockContext, file);
		expect(await realFs.promises.readFile(runtime, "utf8")).toBe(before);
		await plugin.buildStart.call(mockContext);
		expect(await realFs.promises.readFile(runtime, "utf8")).toContain(
			source === "settings" ? 'baseLocale = "de"' : 'cookieName = "after-close"'
		);
	}
);

test.each(
	["same instance", "new instance", "cold restart"].flatMap((restart) =>
		[true, false].map((notifyLateChange) => ({ restart, notifyLateChange }))
	)
)(
	"rebuilds after a shutdown input race: $restart, late event=$notifyLateChange",
	async ({ restart, notifyLateChange }) => {
		process.env.NODE_ENV = "development";
		const { workspace, projectDir, outdir } = await createProjectFixture();
		let notifyCompiled!: () => void;
		let releaseCompilation!: () => void;
		const compiled = new Promise<void>((resolve) => {
			notifyCompiled = resolve;
		});
		const released = new Promise<void>((resolve) => {
			releaseCompilation = resolve;
		});
		let shouldBlock = false;
		let compilationCount = 0;
		vi.doMock("../compiler/compile.js", async (importOriginal) => {
			const original =
				await importOriginal<typeof import("../compiler/compile.js")>();
			return {
				...original,
				compile: async (...args: Parameters<typeof original.compile>) => {
					compilationCount++;
					const result = await original.compile(...args);
					if (shouldBlock) {
						// Pause after the input has been consumed, before the plugin
						// re-reads it to compute the cached digest.
						notifyCompiled();
						await released;
					}
					return result;
				},
			};
		});
		let { paraglideVitePlugin } = await import("./vite.js");
		let plugin = paraglideVitePlugin({ project: projectDir, outdir }) as any;
		setViteRoot(plugin, workspace);
		let pending: Promise<void> | undefined;
		try {
			await plugin.buildStart.call(mockContext);
			const file = path.join(projectDir, "settings.json");
			const original = await realFs.promises.readFile(file, "utf8");
			await realFs.promises.writeFile(
				file,
				JSON.stringify({ ...JSON.parse(original), baseLocale: "de" })
			);
			shouldBlock = true;
			pending = plugin.watchChange.call(mockContext, file);
			await compiled;
			const closing = plugin.closeBundle.call(mockContext);
			await realFs.promises.writeFile(file, original);
			const lateChange = notifyLateChange
				? plugin.watchChange.call(mockContext, file)
				: undefined;
			releaseCompilation();
			await Promise.all([pending, closing, lateChange]);
			shouldBlock = false;
			// Shutdown drains the existing work without forcing another compile.
			expect(compilationCount).toBe(2);
			const runtime = path.join(outdir, "runtime.js");
			expect(await realFs.promises.readFile(runtime, "utf8")).toContain(
				'baseLocale = "de"'
			);
			if (restart === "cold restart") {
				// Drop the warm state so only the on-disk cache can be reused.
				vi.resetModules();
				({ paraglideVitePlugin } = await import("./vite.js"));
			}
			if (restart !== "same instance") {
				plugin = paraglideVitePlugin({ project: projectDir, outdir }) as any;
				setViteRoot(plugin, workspace);
			}
			await plugin.buildStart.call(mockContext);
			expect(compilationCount).toBe(3);
			expect(await realFs.promises.readFile(runtime, "utf8")).toContain(
				'baseLocale = "en"'
			);
		} finally {
			releaseCompilation();
			await pending;
			vi.doUnmock("../compiler/compile.js");
		}
	}
);

async function connectViteClient(server: ViteDevServer) {
	const url = new URL(server.resolvedUrls!.local[0]!);
	url.protocol = "ws:";
	url.searchParams.set("token", server.config.webSocketToken);
	const socket = new WebSocket(url, "vite-hmr");
	const messages: HotPayload[] = [];
	socket.addEventListener("message", (event) => {
		messages.push(JSON.parse(String(event.data)));
	});
	await vi.waitFor(() => {
		expect(messages).toContainEqual({ type: "connected" });
	});
	// A message sent after connection callbacks provides a transport barrier.
	server.ws.send({ type: "custom", event: "paraglide:test-barrier" });
	await vi.waitFor(() => {
		expect(messages).toContainEqual({
			type: "custom",
			event: "paraglide:test-barrier",
		});
	});
	return { socket, messages };
}

async function startOverlayServer(invalidSettings = false) {
	process.env.NODE_ENV = "development";
	const { createServer } = await import("vite");
	const { paraglideVitePlugin } = await import("./vite.js");
	const fixture = await createProjectFixture();
	const { workspace, projectDir, outdir } = fixture;
	const file = path.join(projectDir, "settings.json");
	const original = await realFs.promises.readFile(file, "utf8");
	if (invalidSettings) await realFs.promises.writeFile(file, "{");
	await realFs.promises.writeFile(
		path.join(workspace, "index.html"),
		"<html><body>Translation preview</body></html>"
	);
	const server = await createServer({
		root: workspace,
		configFile: false,
		logLevel: "silent",
		plugins: [paraglideVitePlugin({ project: projectDir, outdir })],
		server: { host: "127.0.0.1", port: 0, watch: null },
		optimizeDeps: { noDiscovery: true, include: [] },
	});
	try {
		await server.listen();
	} catch (error) {
		await server.close();
		throw error;
	}
	return { ...fixture, server, file, original };
}

test.each(["settings", "config"])(
	"vite error overlay reports invalid %s at startup and clears after recovery",
	async (source) => {
		process.env.NODE_ENV = "development";
		const { projectDir, outdir } = await createProjectFixture();
		const file = path.join(
			projectDir,
			source === "settings" ? "settings.json" : "paraglide.config.js"
		);
		const original = await realFs.promises.readFile(file, "utf8");
		await realFs.promises.writeFile(
			file,
			source === "settings" ? "{" : "export default { outdir: 42 }"
		);
		const { paraglideVitePlugin } = await import("./vite.js");
		const plugin = paraglideVitePlugin({ project: projectDir, outdir }) as any;
		const { send } = configureViteServer(plugin);

		await expect(plugin.buildStart.call(mockContext)).resolves.toBeUndefined();
		expect(send).toHaveBeenCalledWith({
			type: "error",
			err: {
				message: expect.any(String),
				stack: expect.any(String),
				plugin: "unplugin-paraglide-js",
			},
		});
		expect(send.mock.calls[0]![0].err.message.length).toBeGreaterThan(0);

		await realFs.promises.writeFile(file, original);
		await plugin.watchChange.call(mockContext, file);
		expect(send).toHaveBeenLastCalledWith({ type: "full-reload" });
		expect(await realFs.promises.readdir(outdir)).toContain("runtime.js");
	}
);

test.each(["settings", "config"])(
	"vite error overlay recovers from invalid %s and preserves the last output until recovery",
	async (source) => {
		process.env.NODE_ENV = "development";
		const { projectDir, outdir } = await createProjectFixture();
		const { paraglideVitePlugin } = await import("./vite.js");
		const writeFile = vi.spyOn(realFs.promises, "writeFile");
		const plugin = paraglideVitePlugin({ project: projectDir, outdir }) as any;
		const { send } = configureViteServer(plugin);
		await plugin.buildStart.call(mockContext);
		expect(send).not.toHaveBeenCalled();
		const runtime = await realFs.promises.readFile(
			path.join(outdir, "runtime.js"),
			"utf8"
		);
		const file = path.join(
			projectDir,
			source === "settings" ? "settings.json" : "paraglide.config.js"
		);
		const original = await realFs.promises.readFile(file, "utf8");
		await realFs.promises.writeFile(
			file,
			source === "settings" ? "{" : "export default { outdir: 42 }"
		);
		await expect(
			plugin.watchChange.call(mockContext, file)
		).resolves.toBeUndefined();
		expect(send).toHaveBeenLastCalledWith({
			type: "error",
			err: expect.objectContaining({ message: expect.any(String) }),
		});
		expect(
			await realFs.promises.readFile(path.join(outdir, "runtime.js"), "utf8")
		).toBe(runtime);

		await plugin.watchChange.call(mockContext, path.join(outdir, "runtime.js"));
		expect(send).toHaveBeenCalledTimes(1);
		await realFs.promises.writeFile(file, original);
		writeFile.mockClear();
		await plugin.watchChange.call(mockContext, file);
		expect(send).toHaveBeenLastCalledWith({ type: "full-reload" });
		// The restored inputs reproduce the output still on disk, so the
		// recovery compile has nothing to write.
		const outputWrites = writeFile.mock.calls.filter(([file]) =>
			String(file).startsWith(outdir)
		);
		expect(outputWrites).toHaveLength(0);
		await plugin.watchChange.call(mockContext, file);
		expect(send).toHaveBeenCalledTimes(2);
	}
);

test("vite error overlay prevents generated HMR while the config remains invalid", async () => {
	const { server, workspace, projectDir, outdir, file, original } =
		await startOverlayServer();
	try {
		const main = path.join(workspace, "main.js");
		await realFs.promises.writeFile(
			main,
			"import './test-output/runtime.js'; import.meta.hot.accept(); import.meta.hot.accept('./test-output/runtime.js', () => {});"
		);
		await server.transformRequest("/main.js");
		await server.transformRequest("/test-output/runtime.js");
		const client = await connectViteClient(server);
		server.watcher.emit("change", main);
		await vi.waitFor(() =>
			expect(client.messages.some((message) => message.type === "update")).toBe(
				true
			)
		);
		await server.transformRequest("/main.js");

		const configFile = path.join(projectDir, "paraglide.config.js");
		const config = await realFs.promises.readFile(configFile, "utf8");
		await realFs.promises.writeFile(
			configFile,
			"export default { outdir: 42 }"
		);
		await server.pluginContainer.watchChange(configFile, { event: "update" });
		await vi.waitFor(() =>
			expect(client.messages.some((message) => message.type === "error")).toBe(
				true
			)
		);
		const runtimeFile = path.join(outdir, "runtime.js");
		const outputBefore = await realFs.promises.readFile(runtimeFile, "utf8");
		const settings = JSON.parse(original);
		settings.locales.push("fr");
		await realFs.promises.writeFile(file, JSON.stringify(settings));
		await server.pluginContainer.watchChange(file, { event: "update" });
		const outputAfter = await realFs.promises.readFile(runtimeFile, "utf8");
		// The fixture disables file watching; deliver the event a changed output produces.
		if (outputAfter !== outputBefore) {
			server.watcher.emit("change", runtimeFile);
			await vi.waitFor(() =>
				expect(
					client.messages.filter((message) => message.type === "update")
				).toHaveLength(2)
			);
		}
		server.ws.send({ type: "custom", event: "paraglide:input-processed" });
		await vi.waitFor(() =>
			expect(client.messages).toContainEqual({
				type: "custom",
				event: "paraglide:input-processed",
			})
		);
		expect(
			client.messages
				.filter((message) =>
					["update", "error", "full-reload"].includes(message.type)
				)
				.at(-1)?.type
		).toBe("error");
		expect(outputAfter).toBe(outputBefore);
		expect((await fetch(server.resolvedUrls!.local[0]!)).status).toBe(200);

		await realFs.promises.writeFile(configFile, config);
		await server.pluginContainer.watchChange(configFile, { event: "update" });
		await vi.waitFor(() =>
			expect(client.messages).toContainEqual({ type: "full-reload" })
		);
		expect(await realFs.promises.readFile(runtimeFile, "utf8")).not.toBe(
			outputBefore
		);
	} finally {
		await server.close();
	}
});

test("vite error overlay still reports failures after restarting an inline plugin", async () => {
	const { server, file } = await startOverlayServer();
	try {
		await server.restart();
		const client = await connectViteClient(server);
		await realFs.promises.writeFile(file, "{");
		await server.pluginContainer.watchChange(file, { event: "update" });
		await vi.waitFor(() =>
			expect(client.messages.some((message) => message.type === "error")).toBe(
				true
			)
		);
	} finally {
		await server.close();
	}
});

test("vite error overlay retains errors without buffering them in Vite", async () => {
	process.env.NODE_ENV = "development";
	const { projectDir, outdir } = await createProjectFixture();
	const file = path.join(projectDir, "settings.json");
	const original = await realFs.promises.readFile(file, "utf8");
	await realFs.promises.writeFile(file, "{");
	const { paraglideVitePlugin } = await import("./vite.js");
	const plugin = paraglideVitePlugin({ project: projectDir, outdir }) as any;
	const ws = configureViteServer(plugin);
	ws.clients.clear();
	await plugin.buildStart.call(mockContext);
	expect(ws.send).not.toHaveBeenCalled();
	expect(ws.on).toHaveBeenCalledWith("connection", expect.any(Function));
	const onConnection = ws.on.mock.calls[0]![1];
	const socket = { send: vi.fn() };
	onConnection(socket);
	expect(JSON.parse(socket.send.mock.calls[0]![0])).toMatchObject({
		type: "error",
		err: { message: expect.any(String), plugin: "unplugin-paraglide-js" },
	});
	await realFs.promises.writeFile(file, original);
	await plugin.watchChange.call(mockContext, file);
	expect(ws.send).not.toHaveBeenCalled();
	socket.send.mockClear();
	onConnection(socket);
	expect(socket.send).not.toHaveBeenCalled();
});

test("vite error overlay preserves compiler diagnostics and clears after a successful buildStart", async () => {
	process.env.NODE_ENV = "development";
	const actual = await vi.importActual<typeof import("../compiler/compile.js")>(
		"../compiler/compile.js"
	);
	const error = new SyntaxError("Invalid message pattern in messages/en.json");
	const compile = vi.fn(actual.compile).mockRejectedValueOnce(error);
	vi.doMock("../compiler/compile.js", () => ({ ...actual, compile }));
	try {
		const { projectDir, outdir } = await createProjectFixture();
		const { paraglideVitePlugin } = await import("./vite.js");
		const plugin = paraglideVitePlugin({ project: projectDir, outdir }) as any;
		const { send } = configureViteServer(plugin);
		await plugin.buildStart.call(mockContext);
		expect(send).toHaveBeenCalledWith({
			type: "error",
			err: {
				message: error.message,
				stack: error.stack,
				plugin: "unplugin-paraglide-js",
			},
		});
		await plugin.buildStart.call(mockContext);
		expect(send).toHaveBeenLastCalledWith({ type: "full-reload" });
		await plugin.buildStart.call(mockContext);
		expect(send).toHaveBeenCalledTimes(2);
	} finally {
		vi.doUnmock("../compiler/compile.js");
	}
});

test("vite error overlay reports non-Error compiler failures during watchChange", async () => {
	process.env.NODE_ENV = "development";
	const actual = await vi.importActual<typeof import("../compiler/compile.js")>(
		"../compiler/compile.js"
	);
	const compile = vi.fn(actual.compile);
	vi.doMock("../compiler/compile.js", () => ({ ...actual, compile }));
	try {
		const { projectDir, outdir } = await createProjectFixture();
		const { paraglideVitePlugin } = await import("./vite.js");
		const plugin = paraglideVitePlugin({ project: projectDir, outdir }) as any;
		const { send } = configureViteServer(plugin);
		await plugin.buildStart.call(mockContext);
		compile.mockRejectedValueOnce("Invalid translation");
		const file = path.join(projectDir, "settings.json");
		await plugin.watchChange.call(mockContext, file);
		expect(send).toHaveBeenLastCalledWith({
			type: "error",
			err: {
				message: "Invalid translation",
				stack: expect.any(String),
				plugin: "unplugin-paraglide-js",
			},
		});
		await plugin.watchChange.call(mockContext, file);
		expect(send).toHaveBeenLastCalledWith({ type: "full-reload" });
	} finally {
		vi.doUnmock("../compiler/compile.js");
	}
});

test("vite error overlay keeps serving requests while the dev watcher recovers", async () => {
	const { server, file, original } = await startOverlayServer();
	try {
		const send = vi.spyOn(server.ws, "send");
		const client = await connectViteClient(server);
		const url = server.resolvedUrls!.local[0]!;
		await realFs.promises.writeFile(file, "{");
		server.watcher.emit("change", file);
		await vi.waitFor(
			() => {
				expect(send).toHaveBeenCalledWith({
					type: "error",
					err: expect.objectContaining({ message: expect.any(String) }),
				});
			},
			{ timeout: 10000 }
		);
		await vi.waitFor(() =>
			expect(client.messages.some((message) => message.type === "error")).toBe(
				true
			)
		);
		const response = await fetch(url);
		expect(response.status).toBe(200);
		expect(await response.text()).toContain("Translation preview");
		send.mockClear();
		await realFs.promises.writeFile(file, original);
		server.watcher.emit("change", file);
		await vi.waitFor(
			() => expect(send).toHaveBeenCalledWith({ type: "full-reload" }),
			{ timeout: 10000 }
		);
	} finally {
		await server.close();
	}
});

// Vite 7 and earlier can retain a buffered error after a full reload.
test("vite error overlay does not replay an error recovered before the first connection", async () => {
	const { server, file, original, outdir } = await startOverlayServer(true);
	try {
		await realFs.promises.writeFile(file, original);
		await server.pluginContainer.watchChange(file, { event: "update" });
		expect(await realFs.promises.readdir(outdir)).toContain("runtime.js");
		const client = await connectViteClient(server);
		expect(client.messages.some((message) => message.type === "error")).toBe(
			false
		);
	} finally {
		await server.close();
	}
});

test("vite error overlay reaches new tabs and reconnecting clients after a startup failure", async () => {
	const { server, file, original } = await startOverlayServer(true);
	try {
		const first = await connectViteClient(server);
		await vi.waitFor(() => {
			expect(first.messages.some((message) => message.type === "error")).toBe(
				true
			);
		});
		const second = await connectViteClient(server);
		expect(second.messages.some((message) => message.type === "error")).toBe(
			true
		);
		await Promise.all(
			[first, second].map(
				({ socket }) =>
					new Promise<void>((resolve) => {
						socket.addEventListener("close", () => resolve(), { once: true });
						socket.close();
					})
			)
		);
		const reconnected = await connectViteClient(server);
		expect(
			reconnected.messages.some((message) => message.type === "error")
		).toBe(true);
		await realFs.promises.writeFile(file, original);
		await server.pluginContainer.watchChange(file, { event: "update" });
		await vi.waitFor(() => {
			expect(reconnected.messages).toContainEqual({ type: "full-reload" });
		});
		const recovered = await connectViteClient(server);
		expect(recovered.messages.some((message) => message.type === "error")).toBe(
			false
		);
	} finally {
		await server.close();
	}
});

test("watch mode follows config precedence flips", async () => {
	process.env.NODE_ENV = "development";
	const { writeFile, rm } = await import("node:fs/promises");
	const { workspace, projectDir, outdir } = await createProjectFixture({
		config: { fileName: "paraglide.config.ts" },
	});
	const jsOutdir = path.join(workspace, "js-output");

	const { paraglideVitePlugin: vitePlugin } =
		await import("../bundler-plugins/vite.js");
	const plugin = vitePlugin({ project: projectDir }) as any;
	setViteRoot(plugin, workspace);

	await plugin.buildStart?.call(mockContext);
	expect(await realFs.promises.readdir(outdir)).not.toHaveLength(0);

	// Delete the winning .ts config and create a .js one.
	await rm(path.join(projectDir, "paraglide.config.ts"));
	await writeFile(
		path.join(projectDir, "paraglide.config.js"),
		["export default {", `  outdir: ${JSON.stringify(jsOutdir)},`, "}"].join(
			"\n"
		)
	);

	await expect(
		plugin.watchChange?.call(
			mockContext,
			path.join(projectDir, "paraglide.config.js")
		)
	).resolves.toBeUndefined();

	expect(await realFs.promises.readdir(jsOutdir)).not.toHaveLength(0);
});

test("vite plugin does not throw on compilation errors in development", async () => {
	const { paraglideVitePlugin } = await import("../bundler-plugins/vite.js");

	process.env.NODE_ENV = "development";

	const { mkdtemp } = await import("node:fs/promises");
	const { tmpdir } = await import("node:os");
	const workspace = await mkdtemp(path.join(tmpdir(), "paraglide-plugin-"));
	testDirectories.push(workspace);

	const plugin = paraglideVitePlugin({
		project: path.join(workspace, "does-not-exist.inlang"),
		outdir: path.join(workspace, "out"),
	}) as any;

	// In development mode - should catch errors and NOT throw
	await expect(plugin.buildStart?.call(mockContext)).resolves.toBeUndefined();
});

test("vite plugin throws on compilation errors at build time", async () => {
	const { paraglideVitePlugin } = await import("../bundler-plugins/vite.js");

	process.env.NODE_ENV = "production";

	const { mkdtemp } = await import("node:fs/promises");
	const { tmpdir } = await import("node:os");
	const workspace = await mkdtemp(path.join(tmpdir(), "paraglide-plugin-"));
	testDirectories.push(workspace);

	const plugin = paraglideVitePlugin({
		project: path.join(workspace, "does-not-exist.inlang"),
		outdir: path.join(workspace, "out"),
	}) as any;

	// In production mode - should throw the error
	const { send } = configureViteServer(plugin);
	await expect(plugin.buildStart?.call(mockContext)).rejects.toThrow();
	expect(send).not.toHaveBeenCalled();
});

// Regression test for https://github.com/opral/inlang-paraglide-js/issues/659:
// the bundler plugins used to wipe `outdir` on every fresh process, racing
// concurrent reads (SSR/prerender modules, sibling Vite processes, the
// config-watcher reload) and producing ENOENT/MISSING_EXPORT/ERR_LOAD_URL.
test("vite plugin does not wipe outdir during first buildStart (#659)", async () => {
	const { paraglideVitePlugin: vitePlugin } =
		await import("../bundler-plugins/vite.js");

	const { projectDir, outdir } = await createProjectFixture();

	// Pre-seed outdir with a sentinel file mimicking a prior compilation
	// still on disk from an earlier process.
	await realFs.promises.mkdir(outdir, { recursive: true });
	await realFs.promises.writeFile(
		path.join(outdir, "__sentinel__.txt"),
		"kept"
	);

	const rmSpy = vi.spyOn(realFs.promises, "rm");

	const plugin = vitePlugin({
		project: projectDir,
		outdir,
		cleanOutdir: true,
	}) as any;

	await plugin.buildStart?.call(mockContext);

	// The plugin must not recursively remove the outdir during the first
	// compile, even though previousCompilation is undefined. Concurrent
	// readers may be holding file handles into outdir.
	for (const call of rmSpy.mock.calls) {
		expect(String(call[0])).not.toBe(outdir);
	}
});

test("vite plugin warm-restart writes nothing when inputs unchanged (#659)", async () => {
	const { projectDir, outdir } = await createProjectFixture();
	const mockCtx = { addWatchFile: () => {} };

	// First process: compile and persist files to outdir.
	{
		const { paraglideVitePlugin: vitePlugin } =
			await import("../bundler-plugins/vite.js");
		const plugin = vitePlugin({ project: projectDir, outdir }) as any;
		await plugin.buildStart?.call(mockCtx);
	}

	// Second process: simulate a fresh node process by resetting modules so
	// the module-scoped `previousCompilation` is undefined again. The plugin
	// should seed from on-disk hashes and write zero files (no race window).
	vi.resetModules();
	const { paraglideVitePlugin: vitePluginFresh } =
		await import("../bundler-plugins/vite.js");
	const plugin2 = vitePluginFresh({ project: projectDir, outdir }) as any;

	const writeFileSpy = vi.spyOn(realFs.promises, "writeFile");
	await plugin2.buildStart?.call(mockCtx);

	expect(writeFileSpy).not.toHaveBeenCalled();
});

// A watch event can reach a plugin instance before its buildStart: another
// plugin writing its cache during startup, or the previous instance's writes
// after a Vite server restart. Rewriting the unchanged output from there turns
// every message module into a fresh watch event for the bundler.
test("watchChange before buildStart writes nothing when inputs unchanged", async () => {
	const { workspace, projectDir, outdir } = await createProjectFixture();

	// First process: compile and persist files to outdir.
	{
		const { paraglideVitePlugin: vitePlugin } =
			await import("../bundler-plugins/vite.js");
		const plugin = vitePlugin({ project: projectDir, outdir }) as any;
		await plugin.buildStart?.call(mockContext);
	}

	// Second process: a file changes before its buildStart has run.
	vi.resetModules();
	const { paraglideVitePlugin: vitePluginFresh } =
		await import("../bundler-plugins/vite.js");
	const plugin2 = vitePluginFresh({ project: projectDir, outdir }) as any;

	// Modification times rather than a writeFile spy: the plugin's tracked fs
	// copies the fs methods when its state is created.
	const outputMtimes = async () => {
		const files = (await realFs.promises.readdir(outdir, {
			recursive: true,
		})) as string[];
		const mtimes: Record<string, bigint> = {};
		for (const file of files.sort()) {
			const stat = await realFs.promises.stat(path.join(outdir, file), {
				bigint: true,
			});
			if (stat.isFile()) mtimes[file] = stat.mtimeNs;
		}
		return mtimes;
	};
	const before = await outputMtimes();

	await plugin2.watchChange?.call(
		mockContext,
		path.join(workspace, "other-plugin-cache.json")
	);

	expect(Object.keys(before).length).toBeGreaterThan(0);
	expect(await outputMtimes()).toEqual(before);
});

// Regression test for https://github.com/opral/paraglide-js/issues/741:
// a new Vite process should validate the persisted inputs and output instead
// of loading the project and compiling every message again.
test("vite plugin skips compile on an unchanged fresh process (#741)", async () => {
	const actualCompileModule = await vi.importActual<
		typeof import("../compiler/compile.js")
	>("../compiler/compile.js");
	const compileSpy = vi.fn(actualCompileModule.compile);
	vi.doMock("../compiler/compile.js", () => ({
		...actualCompileModule,
		compile: compileSpy,
	}));

	try {
		let emitReadme = true;
		const optionsGetter = () => ({
			emitReadme,
		});

		const { projectDir, outdir } = await createProjectFixture({
			locales: ["en", "de"],
		});
		const startFreshProcess = async () => {
			vi.resetModules();
			const { paraglideVitePlugin } =
				await import("../bundler-plugins/vite.js");
			const plugin = paraglideVitePlugin({
				project: projectDir,
				outdir,
				...optionsGetter(),
			}) as any;
			await plugin.buildStart?.call(mockContext);
		};

		await startFreshProcess();
		expect(compileSpy).toHaveBeenCalledTimes(1);

		// The persisted cache makes the unchanged cold restart skip compile().
		await startFreshProcess();
		expect(compileSpy).toHaveBeenCalledTimes(1);

		// A file added beside a tracked project input invalidates the cache.
		await realFs.promises.writeFile(
			path.join(projectDir, "new-project-input.txt"),
			"new"
		);
		await startFreshProcess();
		expect(compileSpy).toHaveBeenCalledTimes(2);

		// Compiler options are part of the cache key.
		emitReadme = false;
		await startFreshProcess();
		expect(compileSpy).toHaveBeenCalledTimes(3);

		// Generated output is validated too, so edited output self-repairs.
		await realFs.promises.writeFile(
			path.join(outdir, "runtime.js"),
			"tampered"
		);
		await startFreshProcess();
		expect(compileSpy).toHaveBeenCalledTimes(4);
		expect(
			await realFs.promises.readFile(path.join(outdir, "runtime.js"), "utf8")
		).not.toBe("tampered");

		// A compiler version change invalidates the persisted cache.
		const cacheDirectory = path.join(projectDir, "cache", "paraglide-js");
		for (const cacheFile of await realFs.promises.readdir(cacheDirectory)) {
			const cachePath = path.join(cacheDirectory, cacheFile as string);
			const cache = JSON.parse(
				await realFs.promises.readFile(cachePath, "utf8")
			);
			cache.compilerVersion = "0.0.0-stale";
			await realFs.promises.writeFile(cachePath, JSON.stringify(cache));
		}
		await startFreshProcess();
		expect(compileSpy).toHaveBeenCalledTimes(5);

		// A syntactically valid but malformed cache is treated as a miss.
		for (const cacheFile of await realFs.promises.readdir(cacheDirectory)) {
			const cachePath = path.join(cacheDirectory, cacheFile as string);
			const cache = JSON.parse(
				await realFs.promises.readFile(cachePath, "utf8")
			);
			cache.outputHashes = null;
			await realFs.promises.writeFile(cachePath, JSON.stringify(cache));
		}
		await startFreshProcess();
		expect(compileSpy).toHaveBeenCalledTimes(6);
	} finally {
		vi.doUnmock("../compiler/compile.js");
	}
});

// Regression test for https://github.com/opral/paraglide-js/issues/693:
// `vite build` fires buildStart once per environment (client, ssr) and each
// run used to do a full compile() even though the inputs hadn't changed.
test("vite plugin skips compile() when buildStart fires again with unchanged inputs (#693)", async () => {
	const actualCompileModule = await vi.importActual<
		typeof import("../compiler/compile.js")
	>("../compiler/compile.js");
	const compileSpy = vi.fn(actualCompileModule.compile);
	vi.doMock("../compiler/compile.js", () => ({
		...actualCompileModule,
		compile: compileSpy,
	}));

	try {
		const { paraglideVitePlugin: vitePlugin } =
			await import("../bundler-plugins/vite.js");

		const { projectDir, outdir } = await createProjectFixture({
			locales: ["en", "de", "fr"],
		});

		const plugin = vitePlugin({ project: projectDir, outdir }) as any;

		// First environment (e.g. client) compiles.
		await plugin.buildStart?.call(mockContext);
		expect(compileSpy).toHaveBeenCalledTimes(1);

		// Second environment (e.g. ssr) — inputs unchanged, compile skipped.
		await plugin.buildStart?.call(mockContext);
		expect(compileSpy).toHaveBeenCalledTimes(1);

		// Changing an input file invalidates the digest and recompiles.
		const settingsPath = path.join(projectDir, "settings.json");
		const settings = JSON.parse(
			await realFs.promises.readFile(settingsPath, "utf-8")
		);
		settings.locales = ["en", "de", "fr", "es"];
		await realFs.promises.writeFile(settingsPath, JSON.stringify(settings));

		await plugin.buildStart?.call(mockContext);
		expect(compileSpy).toHaveBeenCalledTimes(2);
	} finally {
		vi.doUnmock("../compiler/compile.js");
	}
});

// A new file added next to tracked inputs must invalidate the digest via
// the directory-listing part of the hash, not only edits to known files.
test("vite plugin recompiles when a file is added to a tracked directory (#693)", async () => {
	const actualCompileModule = await vi.importActual<
		typeof import("../compiler/compile.js")
	>("../compiler/compile.js");
	const compileSpy = vi.fn(actualCompileModule.compile);
	vi.doMock("../compiler/compile.js", () => ({
		...actualCompileModule,
		compile: compileSpy,
	}));

	try {
		const { paraglideVitePlugin: vitePlugin } =
			await import("../bundler-plugins/vite.js");

		const { projectDir, outdir } = await createProjectFixture();

		const plugin = vitePlugin({ project: projectDir, outdir }) as any;

		await plugin.buildStart?.call(mockContext);
		await plugin.buildStart?.call(mockContext);
		expect(compileSpy).toHaveBeenCalledTimes(1);

		// No tracked file changed, but the listing of a tracked directory did.
		await realFs.promises.writeFile(
			path.join(projectDir, "added-later.txt"),
			"new"
		);

		await plugin.buildStart?.call(mockContext);
		expect(compileSpy).toHaveBeenCalledTimes(2);
	} finally {
		vi.doUnmock("../compiler/compile.js");
	}
});

// After a failed compile the stored digest must not be reused: restoring an
// input to its previous content has to trigger a real recompile.
test("vite plugin does not reuse a digest from before a failed compile (#693)", async () => {
	process.env.NODE_ENV = "development";

	const actualCompileModule = await vi.importActual<
		typeof import("../compiler/compile.js")
	>("../compiler/compile.js");
	const compileSpy = vi.fn(actualCompileModule.compile);
	vi.doMock("../compiler/compile.js", () => ({
		...actualCompileModule,
		compile: compileSpy,
	}));

	try {
		const { paraglideVitePlugin: vitePlugin } =
			await import("../bundler-plugins/vite.js");

		const { projectDir, outdir } = await createProjectFixture();

		const plugin = vitePlugin({ project: projectDir, outdir }) as any;

		await plugin.buildStart?.call(mockContext);
		expect(compileSpy).toHaveBeenCalledTimes(1);

		const settingsPath = path.join(projectDir, "settings.json");
		const originalSettings = await realFs.promises.readFile(
			settingsPath,
			"utf-8"
		);

		// Break the settings file — the compile attempt fails (dev mode
		// swallows the error) and must clear the stored digest.
		await realFs.promises.writeFile(settingsPath, "{ not json");
		await plugin.buildStart?.call(mockContext);
		expect(compileSpy).toHaveBeenCalledTimes(2);

		// Restore the exact original content. It must compile again instead
		// of skipping.
		await realFs.promises.writeFile(settingsPath, originalSettings);
		await plugin.buildStart?.call(mockContext);
		expect(compileSpy).toHaveBeenCalledTimes(3);
	} finally {
		vi.doUnmock("../compiler/compile.js");
	}
});

// Two plugin instances with different filesystems must not share the tracked
// fs wrapper or cached compilation state — each compiles into its own fs.
// The project and config live on the real filesystem (the config loader
// always uses the native fs); only compiler I/O is virtualized here.
test("vite plugin instances with different fs compile against their own fs (#693)", async () => {
	const { paraglideVitePlugin: vitePlugin } =
		await import("../bundler-plugins/vite.js");

	const { projectDir, outdir } = await createProjectFixture({
		locales: ["en"],
	});

	const fsA = memfs().fs as unknown as typeof import("node:fs");
	const fsB = memfs().fs as unknown as typeof import("node:fs");

	// The compiler reads the project through its own fs, so seed a copy of
	// the real project into each instance's filesystem at /project.inlang.
	async function seedIntoFs(target: typeof import("node:fs")) {
		async function walk(dir: string, virtualDir: string) {
			for (const entry of await realFs.promises.readdir(dir, {
				withFileTypes: true,
			})) {
				const source = path.join(dir, entry.name);
				const destination = path.join(virtualDir, entry.name);
				if (entry.isDirectory()) {
					await target.promises.mkdir(destination, { recursive: true });
					await walk(source, destination);
				} else {
					await target.promises.writeFile(
						destination,
						await realFs.promises.readFile(source)
					);
				}
			}
		}
		await target.promises.mkdir("/project.inlang", { recursive: true });
		await walk(projectDir, "/project.inlang");
	}
	await seedIntoFs(fsA);
	await seedIntoFs(fsB);

	const pluginA = vitePlugin({
		project: "/project.inlang",
		outdir,
		fs: fsA,
	}) as any;
	await pluginA.buildStart?.call(mockContext);

	const pluginB = vitePlugin({
		project: "/project.inlang",
		outdir,
		fs: fsB,
	}) as any;
	await pluginB.buildStart?.call(mockContext);
	// B's output must exist in B's filesystem — with a shared tracked fs it
	// would have been read from and written into A's filesystem instead.
	const outputB = await fsB.promises.readdir(outdir);
	expect(outputB.length).toBeGreaterThan(0);
});

// The plugins must pick up options from a paraglide.config file inside the
// project directory when they are not passed explicitly, and explicit
// options must win over the file.
test("vite plugin reads options from a paraglide config file", async () => {
	const { writeFile } = await import("node:fs/promises");
	const { workspace, projectDir, outdir } = await createProjectFixture({
		outdirName: "from-config",
		config: false,
	});
	const flagOutdir = path.join(workspace, "from-flag");

	// No config yet: the plugin falls back to the default outdir.
	const { paraglideVitePlugin: vitePlugin } =
		await import("../bundler-plugins/vite.js");
	const pluginWithoutConfig = vitePlugin({
		project: projectDir,
		outdir,
	}) as any;
	setViteRoot(pluginWithoutConfig, workspace);
	await pluginWithoutConfig.buildStart?.call(mockContext);
	expect(await realFs.promises.readdir(outdir)).not.toHaveLength(0);

	// A config inside the project directory wins over the defaults...
	await writeFile(
		path.join(projectDir, "paraglide.config.js"),
		[
			"export default {",
			`  outdir: ${JSON.stringify(path.join(workspace, "from-config-file"))},`,
			"}",
		].join("\n")
	);
	const pluginWithConfig = vitePlugin({ project: projectDir }) as any;
	setViteRoot(pluginWithConfig, workspace);
	await pluginWithConfig.buildStart?.call(mockContext);
	expect(
		await realFs.promises.readdir(path.join(workspace, "from-config-file"))
	).not.toHaveLength(0);

	// ...and an explicit option wins over the config file.
	const pluginWithOverride = vitePlugin({
		project: projectDir,
		outdir: flagOutdir,
	}) as any;
	setViteRoot(pluginWithOverride, workspace);
	await pluginWithOverride.buildStart?.call(mockContext);
	expect(await realFs.promises.readdir(flagOutdir)).not.toHaveLength(0);
});

// A relative `project` option is resolved against the tool root.
test("resolves a relative project option against the vite root", async () => {
	const { workspace, projectDir, outdir } = await createProjectFixture();

	const { paraglideVitePlugin: vitePlugin } =
		await import("../bundler-plugins/vite.js");
	const plugin = vitePlugin({
		project: "./project.inlang", // relative — resolved against the root
		outdir,
	}) as any;
	setViteRoot(plugin, workspace);

	expect(projectDir).toBe(path.join(workspace, "project.inlang"));
	await plugin.buildStart?.call(mockContext);
	expect(await realFs.promises.readdir(outdir)).not.toHaveLength(0);
});

test("watch mode hot-reloads when the config file changes", async () => {
	const { writeFile } = await import("node:fs/promises");
	const { workspace, projectDir, outdir } = await createProjectFixture({
		outdirName: "cold-output",
	});
	const hotOutput = path.join(workspace, "hot-output");

	const { paraglideVitePlugin: vitePlugin } =
		await import("../bundler-plugins/vite.js");
	const plugin = vitePlugin({ project: projectDir }) as any;
	setViteRoot(plugin, workspace);

	const capturingContext = {
		addWatchFile: (p: string) => {
			addedWatchFiles.push(p);
		},
	};
	const addedWatchFiles: string[] = [];

	await plugin.buildStart?.call(capturingContext);
	expect(await realFs.promises.readdir(outdir)).not.toHaveLength(0);

	// Changes to unrelated files do not recompile.
	const outputBefore = await realFs.promises.readdir(outdir);
	await plugin.watchChange?.call(undefined, "/unrelated.ts");
	expect(await realFs.promises.readdir(outdir)).toEqual(outputBefore);

	// A config change recompiles with the new options.
	await writeFile(
		path.join(projectDir, "paraglide.config.js"),
		["export default {", `  outdir: ${JSON.stringify(hotOutput)},`, "}"].join(
			"\n"
		)
	);
	await plugin.watchChange?.call(
		undefined,
		path.join(projectDir, "paraglide.config.js")
	);

	expect(await realFs.promises.readdir(hotOutput)).not.toHaveLength(0);
});

// An invalid edited config must not crash the dev server — the previously
// compiled output keeps being served.
test("watchChange keeps the previous output when the edited config is invalid", async () => {
	const { writeFile } = await import("node:fs/promises");
	const { projectDir, outdir } = await createProjectFixture();

	const { paraglideVitePlugin: vitePlugin } =
		await import("../bundler-plugins/vite.js");
	const plugin = vitePlugin({ project: projectDir, outdir }) as any;
	setViteRoot(plugin, path.dirname(projectDir));

	await plugin.buildStart?.call(mockContext);
	expect(await realFs.promises.readdir(outdir)).not.toHaveLength(0);

	// Break the config, then trigger a change on it.
	await writeFile(
		path.join(projectDir, "paraglide.config.js"),
		"export default { outdir: 42 }"
	);
	await expect(
		plugin.watchChange?.call(
			undefined,
			path.join(projectDir, "paraglide.config.js")
		)
	).resolves.toBeUndefined();

	// The previous compilation is still in place.
	expect(await realFs.promises.readdir(outdir)).not.toHaveLength(0);
});

// An invalid config at startup follows the same policy as compilation
// errors: swallowed in development, thrown in production.
test("buildStart does not throw when the config file is invalid in development", async () => {
	process.env.NODE_ENV = "development";

	const { writeFile } = await import("node:fs/promises");
	const { projectDir } = await createProjectFixture({ config: false });
	await writeFile(
		path.join(projectDir, "paraglide.config.ts"),
		'export default { outdir: "./o", cookieMaxAge: "forever" }'
	);

	const { paraglideVitePlugin: vitePlugin } =
		await import("../bundler-plugins/vite.js");
	const plugin = vitePlugin({ project: projectDir }) as any;
	setViteRoot(plugin, path.dirname(projectDir));

	await expect(plugin.buildStart?.call(mockContext)).resolves.toBeUndefined();
});

// Regression: with no valid cached config (dev server started on an
// invalid config), an unrelated file change must not reject watchChange —
// that would crash the bundler's watcher.
test("watchChange does not throw for unrelated files while the config is invalid", async () => {
	process.env.NODE_ENV = "development";

	const { writeFile } = await import("node:fs/promises");
	const { projectDir } = await createProjectFixture({ config: false });
	await writeFile(
		path.join(projectDir, "paraglide.config.ts"),
		'export default { outdir: "./o", cookieMaxAge: "forever" }'
	);

	const { paraglideVitePlugin: vitePlugin } =
		await import("../bundler-plugins/vite.js");
	const plugin = vitePlugin({ project: projectDir }) as any;
	setViteRoot(plugin, path.dirname(projectDir));

	// Swallowed by buildStart; nothing valid ends up in the cache.
	await plugin.buildStart?.call(mockContext);

	await expect(
		plugin.watchChange?.call(undefined, "/some/unrelated.ts")
	).resolves.toBeUndefined();
});

// Regression (review): webpack fires one watchChange per modified file and
// a config event must never be starved by later input events.
test("queued config events are applied even when input events follow", async () => {
	const { writeFile } = await import("node:fs/promises");
	const { workspace, projectDir } = await createProjectFixture({
		outdirName: "cold-output",
	});
	const hotOutput = path.join(workspace, "hot-output");

	const { paraglideVitePlugin: vitePlugin } =
		await import("../bundler-plugins/vite.js");
	const plugin = vitePlugin({ project: projectDir }) as any;
	setViteRoot(plugin, workspace);

	await plugin.buildStart?.call(mockContext);

	// Volley: input, config, input — fired while the first rebuild is still
	// in flight (no awaiting between calls).
	const first = plugin.watchChange?.call(
		undefined,
		path.join(projectDir, "messages", "en.json")
	);
	await writeFile(
		path.join(projectDir, "paraglide.config.js"),
		["export default {", `  outdir: ${JSON.stringify(hotOutput)},`, "}"].join(
			"\n"
		)
	);
	const second = plugin.watchChange?.call(
		undefined,
		path.join(projectDir, "paraglide.config.js")
	);
	const third = plugin.watchChange?.call(
		undefined,
		path.join(projectDir, "messages", "de.json")
	);
	await Promise.all([first, second, third]);

	expect(await realFs.promises.readdir(hotOutput)).not.toHaveLength(0);
});

// Regression (review): an invalid config in production must fail the build
// loudly instead of silently compiling with default options.
test("buildStart throws when the config is invalid in production", async () => {
	process.env.NODE_ENV = "production";

	const { writeFile } = await import("node:fs/promises");
	const { projectDir } = await createProjectFixture();
	await writeFile(
		path.join(projectDir, "paraglide.config.js"),
		"export default { outdir: 42 }"
	);

	const { paraglideVitePlugin: vitePlugin } =
		await import("../bundler-plugins/vite.js");
	const plugin = vitePlugin({ project: projectDir }) as any;
	setViteRoot(plugin, path.dirname(projectDir));

	await expect(plugin.buildStart?.call(mockContext)).rejects.toThrow(
		/paraglide config/i
	);
});

// Regression (review): pinning outputStructure in the shared defaults
// template killed the development default (#486). Without an explicit
// structure, plugins must emit locale-modules outside production.
test("development default output structure is locale-modules", async () => {
	const { writeFile } = await import("node:fs/promises");
	const { projectDir, outdir } = await createProjectFixture();

	// Ensure at least one message exists so the two structures differ.
	await realFs.promises.mkdir(path.join(projectDir, "messages"), {
		recursive: true,
	});
	await writeFile(
		path.join(projectDir, "messages", "en.json"),
		JSON.stringify({ hello: "Hello" })
	);
	await writeFile(
		path.join(projectDir, "messages", "de.json"),
		JSON.stringify({ hello: "Hallo" })
	);

	const { paraglideVitePlugin: vitePlugin } =
		await import("../bundler-plugins/vite.js");
	const plugin = vitePlugin({ project: projectDir, outdir }) as any;
	setViteRoot(plugin, path.dirname(projectDir));

	delete process.env.NODE_ENV;
	await plugin.buildStart?.call(mockContext);

	const messages = await realFs.promises.readdir(path.join(outdir, "messages"));
	expect(messages).toContain("en.js");
	expect(messages).toContain("de.js");
	expect(messages).not.toContain("hello.js");
});

// All four candidate names are registered inside the project directory so
// renames/format switches are reported even by backends whose watchers only
// report registered files (webpack).
test("registers all config candidates inside the project directory", async () => {
	process.env.NODE_ENV = "development";

	const { workspace, projectDir } = await createProjectFixture({
		config: false,
	});

	const { paraglideVitePlugin: vitePlugin } =
		await import("../bundler-plugins/vite.js");
	const plugin = vitePlugin({ project: projectDir }) as any;
	setViteRoot(plugin, workspace);

	const addedWatchFiles: string[] = [];
	await plugin.buildStart?.call({
		addWatchFile: (p: string) => {
			addedWatchFiles.push(p);
		},
	});

	for (const name of [
		"paraglide.config.js",
		"paraglide.config.mjs",
		"paraglide.config.ts",
		"paraglide.config.cjs",
	]) {
		expect(addedWatchFiles).toContain(path.join(projectDir, name));
	}
});
