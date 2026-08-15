import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import { afterEach, expect, test } from "vitest";
import { createServerFile } from "./create-server-file.js";

const temporaryDirectories: string[] = [];

afterEach(async () => {
	await Promise.all(
		temporaryDirectories
			.splice(0)
			.map((directory) => rm(directory, { recursive: true, force: true }))
	);
});

test("uses the initialized AsyncLocalStorage when an import interceptor snapshots the initial export", async () => {
	const directory = await mkdtemp(join(tmpdir(), "paraglide-server-"));
	temporaryDirectories.push(directory);

	const serverCode = createServerFile({
		compiledBundles: [],
		compilerOptions: {
			disableAsyncLocalStorage: false,
			experimentalMiddlewareLocaleSplitting: false,
		},
	}).replace('"./runtime.js"', '"./runtime-wrapper.mjs"');

	await writeFile(join(directory, "server.mjs"), serverCode);
	await writeFile(
		join(directory, "runtime-real.mjs"),
		`export let serverAsyncLocalStorage;
export const disableAsyncLocalStorage = false;
export function overwriteServerAsyncLocalStorage(value) {
  serverAsyncLocalStorage = value;
}
export function getServerAsyncLocalStorage() {
  return serverAsyncLocalStorage;
}
export const baseLocale = "en";
export function isExcludedByRouteStrategy() {
  return true;
}`
	);
	await writeFile(
		join(directory, "runtime-wrapper.mjs"),
		`import * as runtime from "./runtime-real.mjs";
export const serverAsyncLocalStorage = runtime.serverAsyncLocalStorage;
export const disableAsyncLocalStorage = runtime.disableAsyncLocalStorage;
export const overwriteServerAsyncLocalStorage = runtime.overwriteServerAsyncLocalStorage;
export const getServerAsyncLocalStorage = runtime.getServerAsyncLocalStorage;
export const baseLocale = runtime.baseLocale;
export const isExcludedByRouteStrategy = runtime.isExcludedByRouteStrategy;`
	);

	const server = await import(
		pathToFileURL(join(directory, "server.mjs")).href
	);
	const response = await server.paraglideMiddleware(
		new Request("https://example.com/api/ready"),
		() => new Response("ready")
	);

	expect(response.status).toBe(200);
	expect(await response.text()).toBe("ready");
});
