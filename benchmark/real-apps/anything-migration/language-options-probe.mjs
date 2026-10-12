import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { chromium } from "../../benchmark/node_modules/playwright/index.mjs";

const repo = path.resolve(".");
const frontend = path.join(repo, ".real-apps/anything-migration/frontend");
const compilerDist = process.env.PARAGLIDE_COMPILER_DIST;
if (!compilerDist)
	throw new Error(
		"Set PARAGLIDE_COMPILER_DIST to the built Paraglide dist directory"
	);

const sourceResources = await import(
	pathToFileURL(
		path.join(
			repo,
			".real-apps/anything-llm-source/frontend/src/locales/resources.js"
		)
	).href
);
const expectedLocales = Object.keys(sourceResources.resources);
const origin = "http://127.0.0.1:4184";
const viteBin = path.join(frontend, "node_modules/vite/bin/vite.js");
const server = spawn(
	process.execPath,
	[viteBin, "--host", "127.0.0.1", "--port", "4184", "--strictPort"],
	{
		cwd: frontend,
		env: {
			...process.env,
			PARAGLIDE_COMPILER_DIST: path.resolve(compilerDist),
		},
		stdio: ["ignore", "pipe", "pipe"],
	}
);
let serverOutput = "";
server.stdout.on("data", (chunk) => {
	serverOutput += chunk.toString();
});
server.stderr.on("data", (chunk) => {
	serverOutput += chunk.toString();
});

let browser;
try {
	const deadline = Date.now() + 30_000;
	while (Date.now() < deadline) {
		if (server.exitCode !== null)
			throw new Error(`Vite exited early:\n${serverOutput}`);
		try {
			const response = await fetch(`${origin}/locale-test.html`);
			if (response.ok) break;
		} catch {}
		await new Promise((resolve) => setTimeout(resolve, 200));
	}
	const response = await fetch(`${origin}/locale-test.html`);
	assert(response.ok, `Vite did not become ready:\n${serverOutput}`);

	browser = await chromium.launch({ headless: true, args: ["--no-sandbox"] });
	const page = await browser.newPage({ locale: "en" });
	const errors = [];
	page.on("pageerror", (error) => errors.push(error.message));
	await page.goto(`${origin}/locale-test.html?lng=en`, {
		waitUntil: "networkidle",
	});
	await page.locator("#language").waitFor();
	const options = await page
		.locator("#language option")
		.evaluateAll((items) =>
			items.map((item) => ({ value: item.value, label: item.textContent }))
		);
	assert.deepEqual(
		options.map((item) => item.value),
		expectedLocales,
		"dropdown locales and ordering must match native Object.keys(resources)"
	);
	assert(
		options.every((item) => item.label),
		"each native locale should retain a display name"
	);
	assert(
		options.some((item) => item.value === "zh-tw"),
		"the native zh-tw region key must remain available"
	);
	assert(
		options.some((item) => item.value === "pt"),
		"the native pt alias must remain available"
	);

	await page.locator("#language").selectOption("fr");
	await page.waitForFunction(
		() => document.querySelector("#locale")?.textContent === "fr"
	);
	assert.equal(await page.locator("#message").textContent(), "Bienvenue");
	assert.deepEqual(errors, []);
	console.log(
		JSON.stringify(
			{
				localeCount: options.length,
				locales: options.map((item) => item.value),
				frenchMessage: "Bienvenue",
				errors,
			},
			null,
			2
		)
	);
} finally {
	await browser?.close();
	server.kill("SIGTERM");
	await new Promise((resolve) => {
		if (server.exitCode !== null) return resolve();
		server.once("exit", resolve);
		setTimeout(resolve, 2_000).unref();
	});
}
