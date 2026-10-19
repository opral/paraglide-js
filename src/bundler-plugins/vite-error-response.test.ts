import { afterEach, expect, test, vi } from "vitest";
import fs from "node:fs/promises";
import nodeFs from "node:fs";
import { tmpdir } from "node:os";
import { createRequire } from "node:module";
import path from "node:path";
import { createServer, type HotPayload, type ViteDevServer } from "vite";
import {
	loadProjectInMemory,
	newProject,
	saveProjectToDirectory,
} from "@inlang/sdk";
import { paraglideVitePlugin } from "./vite.js";

type FixtureOptions = {
	devErrorResponse?: boolean;
	experimentalPerLocaleBuild?: boolean;
	source: "settings" | "config" | "translations";
	isInitiallyInvalid?: boolean;
};

const cleanups: Array<() => Promise<void>> = [];
const initialNodeEnv = process.env.NODE_ENV;

afterEach(async () => {
	for (const cleanup of cleanups.splice(0).reverse()) await cleanup();
	vi.restoreAllMocks();
	if (initialNodeEnv === undefined) delete process.env.NODE_ENV;
	else process.env.NODE_ENV = initialNodeEnv;
});

async function createFixture(options: FixtureOptions) {
	process.env.NODE_ENV = "development";
	const root = nodeFs.realpathSync(
		await fs.mkdtemp(path.join(tmpdir(), "paraglide-error-response-"))
	);
	cleanups.push(() => fs.rm(root, { recursive: true, force: true }));
	const projectDir = path.join(root, "project.inlang");
	const project = await loadProjectInMemory({
		blob: await newProject({ settings: { baseLocale: "en", locales: ["en"] } }),
	});
	try {
		await saveProjectToDirectory({ project, path: projectDir, fs });
	} finally {
		await project.close();
	}
	const configFile = path.join(projectDir, "paraglide.config.js");
	await fs.writeFile(configFile, "export default {};");
	await fs.writeFile(
		path.join(root, "index.html"),
		"<p>Translation preview</p>"
	);
	if (options.source === "translations") {
		await fs.mkdir(path.join(root, "messages"));
		await fs.writeFile(
			path.join(root, "plugin.js"),
			await fs.readFile(
				createRequire(import.meta.url).resolve("@inlang/plugin-message-format"),
				"utf8"
			)
		);
		await fs.writeFile(
			path.join(projectDir, "settings.json"),
			JSON.stringify({
				baseLocale: "en",
				locales: ["en", "de"],
				modules: [path.join(root, "plugin.js")],
				"plugin.inlang.messageFormat": {
					pathPattern: path.join(root, "messages/{locale}.json"),
				},
			})
		);
		await fs.writeFile(
			path.join(root, "messages/en.json"),
			JSON.stringify({ hello: "Hello" })
		);
		await fs.writeFile(
			path.join(root, "messages/de.json"),
			JSON.stringify({ hello: "Hallo" })
		);
	}
	const file =
		options.source === "settings"
			? path.join(projectDir, "settings.json")
			: options.source === "translations"
				? path.join(root, "messages/de.json")
				: configFile;
	const original = await fs.readFile(file, "utf8");
	const invalid =
		options.source === "settings"
			? "{"
			: options.source === "translations"
				? "{}"
				: "export default { outdir: 42 };";
	if (options.isInitiallyInvalid) await fs.writeFile(file, invalid);
	const server = await createServer({
		root,
		configFile: false,
		logLevel: "silent",
		plugins: [
			paraglideVitePlugin({
				project: projectDir,
				outdir: path.join(root, "paraglide"),
				devErrorResponse: options.devErrorResponse,
				checkTranslations: options.source === "translations",
				experimentalPerLocaleBuild: options.experimentalPerLocaleBuild,
			}),
		],
		server: { host: "127.0.0.1", port: 0, watch: null },
		optimizeDeps: { noDiscovery: true, include: [] },
	});
	cleanups.push(() => server.close());
	await server.listen();
	const url = server.resolvedUrls!.local[0]!;
	return { server, file, original, invalid, url };
}

async function notifyChange(server: ViteDevServer, file: string) {
	await server.pluginContainer.watchChange(file, { event: "update" });
}

test.each(["settings", "config", "translations"] as const)(
	"serves HTTP 500 for invalid %s on startup and recovers without restarting",
	async (source) => {
		const fixture = await createFixture({
			source,
			devErrorResponse: true,
			isInitiallyInvalid: true,
		});
		const response = await fetch(fixture.url);
		expect(response.status).toBe(500);
		expect(response.headers.get("content-type")).toContain("text/plain");
		expect(response.headers.get("cache-control")).toBe("no-store");
		expect(await response.text()).not.toContain("Translation preview");
		await fs.writeFile(fixture.file, fixture.original);
		await notifyChange(fixture.server, fixture.file);
		const recovered = await fetch(fixture.url);
		expect(recovered.status).toBe(200);
		expect(await recovered.text()).toContain("Translation preview");
	}
);

test.each(["settings", "config", "translations"] as const)(
	"blocks stale responses after invalid %s and restores them after recovery",
	async (source) => {
		const fixture = await createFixture({ source, devErrorResponse: true });
		const before = await fetch(fixture.url);
		expect(before.status).toBe(200);
		await before.body?.cancel();
		await fs.writeFile(fixture.file, fixture.invalid);
		await notifyChange(fixture.server, fixture.file);
		const failed = await fetch(fixture.url);
		expect(failed.status).toBe(500);
		expect(await failed.text()).not.toContain("Translation preview");
		await fs.writeFile(fixture.file, fixture.original);
		await notifyChange(fixture.server, fixture.file);
		const recovered = await fetch(fixture.url);
		expect(recovered.status).toBe(200);
		await recovered.body?.cancel();
	}
);

test.each(["settings", "config", "translations"] as const)(
	"keeps the default HTTP behavior after invalid %s",
	async (source) => {
		const fixture = await createFixture({ source });
		await fs.writeFile(fixture.file, fixture.invalid);
		await notifyChange(fixture.server, fixture.file);
		const response = await fetch(fixture.url);
		expect(response.status).toBe(200);
		expect(await response.text()).toContain("Translation preview");
	}
);

test("preserves error responses with experimental per-locale builds enabled", async () => {
	const fixture = await createFixture({
		source: "config",
		devErrorResponse: true,
		experimentalPerLocaleBuild: true,
	});
	await fs.writeFile(fixture.file, fixture.invalid);
	await notifyChange(fixture.server, fixture.file);
	const response = await fetch(fixture.url);
	expect(response.status).toBe(500);
	await response.body?.cancel();
	await fs.writeFile(fixture.file, fixture.original);
	await notifyChange(fixture.server, fixture.file);
	const recovered = await fetch(fixture.url);
	expect(recovered.status).toBe(200);
	await recovered.body?.cancel();
});

test("blocks generated modules while preserving errors and recovery for connected clients", async () => {
	const fixture = await createFixture({
		source: "settings",
		devErrorResponse: true,
	});
	const moduleUrl = new URL("paraglide/runtime.js", fixture.url);
	const before = await fetch(moduleUrl);
	expect(before.status).toBe(200);
	expect(await before.text()).toContain("baseLocale");
	const socketUrl = new URL(fixture.url);
	socketUrl.protocol = "ws:";
	socketUrl.searchParams.set("token", fixture.server.config.webSocketToken);
	const socket = new WebSocket(socketUrl, "vite-hmr");
	cleanups.push(() => {
		if (socket.readyState === WebSocket.CLOSED) return Promise.resolve();
		return new Promise<void>((resolve) => {
			socket.addEventListener("close", () => resolve(), { once: true });
			socket.close();
		});
	});
	const messages: HotPayload[] = [];
	socket.addEventListener("message", (event) => {
		messages.push(JSON.parse(String(event.data)) as HotPayload);
	});
	await vi.waitFor(() => {
		expect(messages).toContainEqual({ type: "connected" });
	});
	await fs.writeFile(fixture.file, fixture.invalid);
	await notifyChange(fixture.server, fixture.file);
	await vi.waitFor(() => {
		expect(messages.some((message) => message.type === "error")).toBe(true);
	});
	const failed = await fetch(moduleUrl);
	expect(failed.status).toBe(500);
	const diagnostic = messages.find((message) => message.type === "error");
	expect(await failed.text()).toBe(diagnostic?.err.message);
	await fs.writeFile(fixture.file, fixture.original);
	await notifyChange(fixture.server, fixture.file);
	await vi.waitFor(() => {
		expect(messages).toContainEqual({ type: "full-reload" });
	});
	const recovered = await fetch(moduleUrl);
	expect(recovered.status).toBe(200);
	expect(await recovered.text()).toContain("baseLocale");
});
