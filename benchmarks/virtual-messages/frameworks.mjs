import assert from "node:assert/strict";
import fs from "node:fs/promises";
import path from "node:path";
import os from "node:os";
import { fileURLToPath } from "node:url";
import { createRequire } from "node:module";
import { spawn, execFile } from "node:child_process";
import { promisify } from "node:util";

const exec = promisify(execFile);
const root = fileURLToPath(new URL("../../", import.meta.url));
const workspace = await fs.realpath(
	await fs.mkdtemp(path.join(os.tmpdir(), "paraglide-framework-e2e-"))
);
const store = path.join(root, "node_modules/.pnpm");
const packages = await fs.readdir(store);
const require = createRequire(import.meta.url);
const playwrightPath =
	packages.find((p) => p === "playwright@1.57.0") ??
	packages.find((p) => p.startsWith("playwright@"));
const { chromium } = await import(
	path.join(store, playwrightPath, "node_modules/playwright/index.mjs")
);
const browser = await chromium.launch({ headless: true });
const explicitVirtualFacade = true;
const physicalFacade = true;
const requestedFrameworks = process.argv
	.slice(2)
	.filter((arg) => !arg.startsWith("--"));
const results = [];
async function command(directory, script, args = []) {
	try {
		const result = await exec(process.execPath, [script, ...args], {
			cwd: directory,
			timeout: 180_000,
			maxBuffer: 8 * 1024 * 1024,
			env: { ...process.env, NO_COLOR: "1" },
		});
		return result.stdout + result.stderr;
	} catch (error) {
		throw new Error(
			`${script} ${args.join(" ")} failed:\n${error.stdout}\n${error.stderr}`
		);
	}
}
async function boot(directory, script, args) {
	const child = spawn(process.execPath, [script, ...args], {
		cwd: directory,
		env: { ...process.env, NO_COLOR: "1" },
		stdio: ["ignore", "pipe", "pipe"],
	});
	let log = "";
	child.stdout.on("data", (b) => (log += b));
	child.stderr.on("data", (b) => (log += b));
	const match = await new Promise((resolve, reject) => {
		const timer = setTimeout(() => {
			clearInterval(poll);
			child.kill();
			reject(new Error(log));
		}, 90_000);
		const poll = setInterval(() => {
			const match = log.match(/Local:\s+(http:\/\/localhost:\d+\/)/);
			if (match) {
				clearTimeout(timer);
				clearInterval(poll);
				resolve(match[1]);
			} else if (child.exitCode !== null) {
				clearTimeout(timer);
				clearInterval(poll);
				reject(new Error(log));
			}
		}, 100);
	});
	return {
		url: match,
		stop: () =>
			child.exitCode !== null
				? Promise.resolve()
				: new Promise((resolve) => {
						child.once("exit", resolve);
						child.kill();
					}),
		log: () => log,
	};
}
async function fixture(name) {
	const directory = path.join(workspace, name);
	const example = path.join(root, "examples", name);
	await fs.cp(example, directory, {
		recursive: true,
		filter: (source) =>
			!/(?:^|\/)(node_modules|\.svelte-kit|\.output|\.tanstack|dist|build|cache|paraglide)(?:\/|$)/.test(
				path.relative(example, source)
			),
	});
	await fs.symlink(
		path.join(example, "node_modules"),
		path.join(directory, "node_modules"),
		"dir"
	);
	const configPath = path.join(
		directory,
		name === "react" ? "vite.config.js" : "vite.config.ts"
	);
	let config = await fs.readFile(configPath, "utf8");
	config = config.replace(
		/project: (['"])\.\/project.inlang\1/,
		'/* Paraglide Vite default layout */ project: "./project.inlang"'
	);
	await fs.writeFile(configPath, config);
	return directory;
}
async function visit(server, pathname, expected) {
	const response = await fetch(new URL(pathname, server.url));
	assert.equal(
		response.status,
		200,
		(await response.text().then((s) => s.slice(0, 2000))) + "\n" + server.log()
	);
	// A browser verifies hydration and client imports, beyond an SSR response.
	const page = await browser.newPage();
	const errors = [];
	page.on("pageerror", (e) => errors.push(e.message));
	await page.goto(new URL(pathname, server.url).href);
	await page
		.getByText(expected, { exact: false })
		.first()
		.waitFor({ timeout: 30_000 });
	await page.waitForTimeout(800);
	if (pathname === "/en") {
		await page.getByRole("link", { name: "About page", exact: true }).click();
		await page.getByText("About message", { exact: true }).waitFor();
		assert.equal(new URL(page.url()).pathname, "/en/about");
		await page.getByRole("link", { name: "Home page", exact: true }).click();
		await page.getByText(expected, { exact: false }).first().waitFor();
	}
	assert.deepEqual(errors, []);
	return page;
}
try {
	for (const framework of requestedFrameworks.length
		? requestedFrameworks
		: ["sveltekit", "tanstack-start", "react"]) {
		const directory = await fixture(framework);
		const local = createRequire(path.join(directory, "package.json"));
		const vite = path.join(
			path.dirname(local.resolve("vite/package.json")),
			"bin/vite.js"
		);
		console.log(`Testing ${framework} in ${directory}`);
		// The example predates TanStack's inputValidator rename; adapt only the test copy.
		if (framework === "tanstack-start") {
			const route = path.join(directory, "src/routes/index.tsx");
			await fs.writeFile(
				route,
				(await fs.readFile(route, "utf8"))
					.replace(".validator(", ".inputValidator(")
					.replace("import { getLocale } from '@/paraglide/runtime.js'", "")
			);
		}
		let server = await boot(directory, vite, [
			"--host",
			"localhost",
			"--port",
			"0",
		]);
		try {
			const expected =
				framework === "sveltekit"
					? "Welcome to the SvelteKit"
					: framework === "tanstack-start"
						? "John Doe"
						: "Hello";
			const pathname = framework === "tanstack-start" ? "/en" : "/";
			const page = await visit(server, pathname, expected);
			if (framework === "sveltekit") {
				const file = path.join(directory, "messages/en.json");
				const messages = JSON.parse(await fs.readFile(file, "utf8"));
				messages.welcome = "UPDATED_VIRTUAL_WELCOME";
				await fs.writeFile(file, JSON.stringify(messages));
				await page
					.getByText("UPDATED_VIRTUAL_WELCOME", { exact: true })
					.waitFor({ timeout: 30_000 });
				await page.getByRole("button", { name: 'Set locale to "de"' }).click();
				await page
					.getByRole("heading", { name: /Willkommen/ })
					.waitFor({ timeout: 30_000 });
			}
			await page.close();
			results.push({
				framework,
				check:
					framework === "react"
						? "dev client rendering"
						: framework === "tanstack-start"
							? "dev SSR, hydration and client navigation"
							: "dev SSR, hydration, locale switch and watched edits",
				pass: true,
			});
		} finally {
			await server.stop();
		}
		const outdir = path.join(
			directory,
			framework === "sveltekit" ? "src/lib/paraglide" : "src/paraglide"
		);
		const emitted = await fs.readdir(outdir);
		assert.ok(emitted.includes("messages.d.ts"));
		assert.equal(emitted.includes("messages.js"), physicalFacade);
		assert.equal(
			emitted.includes("messages"),
			physicalFacade && !explicitVirtualFacade
		);
		assert.equal(
			emitted.includes("messages.virtual.d.ts"),
			explicitVirtualFacade
		);
		if (physicalFacade && !explicitVirtualFacade)
			assert.deepEqual(await fs.readdir(path.join(outdir, "messages")), [
				"_index.d.ts",
			]);
		// A fresh process must reconstruct the virtual graph; disk caches cannot supply it.
		await command(directory, vite, ["build"]);
		results.push({
			framework,
			check: "cold production client/SSR build",
			pass: true,
		});
		if (framework === "sveltekit") {
			const checkPackage = packages.find((p) => p.startsWith("svelte-check@"));
			const check = path.join(
				store,
				checkPackage,
				"node_modules/svelte-check/bin/svelte-check"
			);
			// Control comparison: full dependency checks already fail with disk output.
			const fullConfig = path.join(directory, "tsconfig.full-libs.json");
			await fs.writeFile(
				fullConfig,
				JSON.stringify({
					extends: "./tsconfig.json",
					compilerOptions: { skipLibCheck: false },
				})
			);
			const diagnostics = async () => {
				try {
					await command(directory, check, ["--tsconfig", fullConfig]);
					return [];
				} catch (error) {
					return error.message
						.split("\n")
						.filter((line) => line.startsWith("Error:"));
				}
			};
			const virtualErrors = await diagnostics();
			const viteConfig = path.join(directory, "vite.config.ts");
			const virtualConfig = await fs.readFile(viteConfig, "utf8");
			await fs.writeFile(
				viteConfig,
				virtualConfig
					.replace(/optimizationPrototype\(\{[^}]*\}\),?/, "")
					.replace(
						"/* Paraglide Vite default layout */",
						'outputStructure: "message-modules",'
					)
			);
			await command(directory, vite, ["build"]);
			const diskErrors = await diagnostics();
			assert.deepEqual(virtualErrors, diskErrors);
			results.push({
				framework,
				check: "whole-project skipLibCheck=false matches disk baseline",
				pass: true,
				existingDependencyErrors: virtualErrors.length,
			});
			await fs.writeFile(viteConfig, virtualConfig);
			await command(directory, vite, ["build"]);
			for (const skipLibCheck of [true, false]) {
				const configPath = path.join(directory, "tsconfig.e2e.json");
				await fs.writeFile(
					configPath,
					JSON.stringify({
						extends: "./tsconfig.json",
						compilerOptions: {
							skipLibCheck,
							checkJs: true,
							noUncheckedSideEffectImports: true,
							verbatimModuleSyntax: true,
						},
						...(skipLibCheck
							? {}
							: {
									include: [
										"src/**/*.ts",
										"src/**/*.js",
										"src/**/*.svelte",
										".svelte-kit/*.d.ts",
										".svelte-kit/types/**/$types.d.ts",
									],
								}),
					})
				);
				const log = await command(directory, check, [
					"--tsconfig",
					configPath,
					"--fail-on-warnings",
				]);
				assert.match(log, /found 0 errors/);
				results.push({
					framework,
					check: `svelte-check strict checkJs skipLibCheck=${skipLibCheck}${skipLibCheck ? " (whole project)" : " (application and generated declarations)"}`,
					pass: true,
				});
			}
		} else {
			const tsc = require.resolve("typescript/bin/tsc");
			await command(directory, tsc, ["--noEmit"]);
			results.push({
				framework,
				check: "framework TypeScript configuration",
				pass: true,
			});
		}
		server = await boot(directory, vite, [
			"preview",
			"--host",
			"localhost",
			"--port",
			"0",
		]);
		try {
			const expected =
				framework === "sveltekit"
					? "UPDATED_VIRTUAL_WELCOME"
					: framework === "tanstack-start"
						? "John Doe"
						: "Hello";
			const page = await visit(
				server,
				framework === "tanstack-start" ? "/en" : "/",
				expected
			);
			await page.close();
			results.push({
				framework,
				check:
					framework === "react"
						? "production browser rendering"
						: framework === "tanstack-start"
							? "production browser SSR, hydration and client navigation"
							: "production browser SSR/hydration",
				pass: true,
			});
		} finally {
			await server.stop();
		}
		console.log(
			JSON.stringify(results.filter((r) => r.framework === framework))
		);
	}
} finally {
	await browser.close();
	await fs.writeFile(
		"/tmp/paraglide-virtual-frameworks.json",
		JSON.stringify({ workspace, results }, null, 2)
	);
	console.log(`Fixtures retained for inspection: ${workspace}`);
}
