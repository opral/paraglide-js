import fs from "node:fs/promises";
import http from "node:http";
import path from "node:path";
import { createRequire } from "node:module";
import { spawnSync } from "node:child_process";
import { fileURLToPath, pathToFileURL } from "node:url";
import { setTimeout as delay } from "node:timers/promises";
import { chromium } from "../../../benchmark/node_modules/playwright/index.mjs";

const repo = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../..");
const experimentRoot = path.join(repo, ".real-apps/anything-migration");
const frontend = path.join(experimentRoot, "frontend");
const fixtureHtml = path.join(frontend, "client-split-trans-test.html");
const fixtureModule = path.join(frontend, "client-split-trans-test.mjs");
const output = path.join(repo, ".real-apps/anything-public-split-trans-test-dist");
const compilerWorktree = path.resolve(
	process.env.PARAGLIDE_PUBLIC_COMPILER_WORKTREE ?? "."
);
const compilerEntry = path.join(compilerWorktree, "dist/index.js");
const project = path.join(
	experimentRoot,
	"public-plugin-project/project.inlang"
);
const adapters = path.join(experimentRoot, "public-plugin-adapters.json");
const port = 4317;
const testKey = "agent.mcp.tool-count-warning";
const locales = ["en", "fr"];
const html = `<!doctype html><html><head><meta charset="utf-8"></head><body><div id="root"></div><script type="module" src="/client-split-trans-test.mjs"></script></body></html>`;
const moduleSource = `
import React from "react";
import { createRoot } from "react-dom/client";
import { Trans } from "@/paraglide/react-compat.js";
import i18n from "@/paraglide/i18n.js";
const container = document.getElementById("root");
const root = createRoot(container);
const components = {
  b: React.createElement("span", { "data-component": "b" }),
  br: React.createElement("br", { "data-component": "br" }),
};
window.renderSplitMessage = async (locale) => {
  await i18n.changeLanguage(locale);
  root.render(React.createElement(Trans, {
    i18nKey: ${JSON.stringify(testKey)},
    values: { count: 7 },
    components,
  }));
  await new Promise((resolve) => requestAnimationFrame(() => resolve()));
  return container.innerHTML;
};
`;

await fs.writeFile(fixtureHtml, html);
await fs.writeFile(fixtureModule, moduleSource);
await fs.copyFile(
	path.join(repo, "benchmark/real-apps/anything-migration/vite.public.config.mjs.fixture"),
	path.join(frontend, "vite.public.config.mjs")
);

const build = spawnSync(
	process.execPath,
	[
		path.join(frontend, "node_modules/vite/bin/vite.js"),
		"build",
		"--config",
		"vite.public.config.mjs",
		"--outDir",
		output,
		"--emptyOutDir",
	],
	{
		cwd: frontend,
		stdio: "inherit",
		env: {
			...process.env,
			NODE_ENV: "production",
			PARAGLIDE_PUBLIC_COMPILER: compilerEntry,
			PARAGLIDE_PUBLIC_PROJECT: project,
			PARAGLIDE_PUBLIC_MODE: "split",
			PARAGLIDE_PUBLIC_ADAPTERS: adapters,
			PARAGLIDE_PUBLIC_TRANS_PROBE: "true",
		},
	}
);
if (build.status !== 0)
	throw new Error(`Vite production component-probe build failed (${build.status})`);

const contentTypes = {
	".css": "text/css; charset=utf-8",
	".html": "text/html; charset=utf-8",
	".js": "text/javascript; charset=utf-8",
	".mjs": "text/javascript; charset=utf-8",
};
const server = http.createServer(async (request, response) => {
	try {
		const pathname = decodeURIComponent(
			new URL(request.url ?? "/", "http://localhost").pathname
		);
		const filename = path.resolve(output, `.${pathname}`);
		if (!filename.startsWith(`${output}${path.sep}`)) {
			response.writeHead(403).end();
			return;
		}
		const body = await fs.readFile(filename);
		response.writeHead(200, {
			"cache-control": "no-store",
			"content-type": contentTypes[path.extname(filename)] ?? "application/octet-stream",
			"x-content-type-options": "nosniff",
		});
		response.end(body);
	} catch {
		response.writeHead(404).end();
	}
});
await new Promise((resolve) => server.listen(port, "127.0.0.1", resolve));

const require = createRequire(path.join(frontend, "package.json"));
const React = require("react");
const { renderToStaticMarkup } = require("react-dom/server");
const i18next = require("i18next");
const { Trans: NativeTrans, I18nextProvider } = require("react-i18next");
const sourceFrontend = path.resolve(".real-apps/anything-llm-source/frontend");
const { resources, defaultNS } = await import(
	pathToFileURL(path.join(sourceFrontend, "src/locales/resources.js"))
);
const catalogData = JSON.parse(
	await fs.readFile(path.join(experimentRoot, "catalogs.json"), "utf8")
);
const native = i18next.createInstance();
await native.init({
	resources,
	lng: "en",
	fallbackLng: "en",
	defaultNS,
	lowerCaseLng: true,
	interpolation: { escapeValue: false },
});

let browser;
try {
	let ready = false;
	for (let attempt = 0; attempt < 80; attempt++) {
		try {
			const response = await fetch(
				`http://127.0.0.1:${port}/client-split-trans-test.html`
			);
			if (response.ok) {
				ready = true;
				break;
			}
		} catch {}
		await delay(100);
	}
	if (!ready) throw new Error("Component-probe server did not become ready");

	browser = await chromium.launch({ headless: true, args: ["--no-sandbox"] });
	const page = await browser.newPage();
	const errors = [];
	page.on("pageerror", (error) => errors.push(error.message));
	await page.goto(`http://127.0.0.1:${port}/client-split-trans-test.html`, {
		waitUntil: "domcontentloaded",
	});
	await page.waitForFunction(() => typeof window.renderSplitMessage === "function");

	const results = [];
	for (const locale of locales) {
		await native.changeLanguage(locale);
		const source =
			catalogData.catalogs[locale]?.[testKey] ?? catalogData.catalogs.en[testKey];
		const tags = [...source.matchAll(/<([A-Za-z][\w-]*)(?:\s*\/)?\s*>/g)].map(
			(match) => match[1]
		);
		const components = Object.fromEntries(
			[...new Set(tags)].map((tag) => [
				tag,
				React.createElement(tag === "br" ? "br" : "span", {
					"data-component": tag,
				}),
			])
		);
		const expected = renderToStaticMarkup(
			React.createElement(
				I18nextProvider,
				{ i18n: native },
				React.createElement(NativeTrans, {
					i18nKey: testKey,
					components,
					values: { count: 7 },
				})
			)
		).replace(/<br([^>]*)\/>/g, "<br$1>");
		const actual = await page.evaluate(
			(localeName) => window.renderSplitMessage(localeName),
			locale
		);
		results.push({ locale, equal: actual === expected, expected, actual });
	}
	if (errors.length || results.some((result) => !result.equal)) {
		throw new Error(JSON.stringify({ results, errors }, null, 2));
	}
	const report = {
		compilerWorktree,
		compilerCommit: process.env.PARAGLIDE_PUBLIC_COMPILER_COMMIT ?? null,
		vite: require(path.join(frontend, "node_modules/vite/package.json")).version,
		browser: browser.version(),
		key: testKey,
		results,
		errors,
		result: "client split facade rich .parts parity passed",
	};
	const reportPath = path.join(
		repo,
		"benchmark/real-apps/results/anything-llm-public-vite4-pr5-trans-facade.json"
	);
	await fs.writeFile(reportPath, JSON.stringify(report, null, 2));
	console.log(JSON.stringify(report, null, 2));
} finally {
	await browser?.close();
	await new Promise((resolve) => server.close(resolve));
	await fs.rm(fixtureHtml, { force: true });
	await fs.rm(fixtureModule, { force: true });
}
