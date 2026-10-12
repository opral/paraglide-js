import { createRequire } from "node:module";
import { execFileSync } from "node:child_process";
import { createServer } from "node:http";
import { createHash } from "node:crypto";
import assert from "node:assert/strict";
import {
	brotliCompressSync,
	constants as zlibConstants,
	gzipSync,
} from "node:zlib";
import {
	mkdir,
	readFile,
	readdir,
	rm,
	symlink,
	writeFile,
} from "node:fs/promises";
import { dirname, extname, join, resolve, sep } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), "../../..");
const appSourceArg = process.env.NTFY_PROJECTION_SOURCE;
if (!appSourceArg)
	throw new Error(
		"Set NTFY_PROJECTION_SOURCE to the pinned Ntfy web directory."
	);
const appRoot = resolve(appSourceArg);
const fixtureRoot = join(
	repoRoot,
	` .real-apps/ntfy-route-capsules-${process.env.NTFY_PROJECTION_MODE ?? "aggregation"}${process.env.NTFY_SOURCEMAP === "1" ? "-sourcemap" : ""}`.trim()
);
const projectRoot = join(fixtureRoot, "project.inlang");
const outdir = join(fixtureRoot, "src/paraglide");
const distDir = join(fixtureRoot, "dist");
const reportPath = join(fixtureRoot, "report.json");
const durableReportPath = join(
	dirname(fileURLToPath(import.meta.url)),
	`results/route-capsules-${process.env.NTFY_PROJECTION_MODE ?? "aggregation"}${process.env.NTFY_SOURCEMAP === "1" ? "-sourcemap" : ""}.json`
);
const locales = ["en", "fr", "de"];
const englishCatalog = JSON.parse(
	await readFile(join(appRoot, "project.inlang/messages/en.json"), "utf8")
);
const messages = Object.keys(englishCatalog);
assert.equal(messages.length, 473);
const mode = process.env.NTFY_PROJECTION_MODE ?? "projection";

await rm(fixtureRoot, { recursive: true, force: true });
await mkdir(join(projectRoot, "messages"), { recursive: true });
await mkdir(join(fixtureRoot, "src"), { recursive: true });
await symlink(
	join(appRoot, "node_modules"),
	join(fixtureRoot, "node_modules"),
	"dir"
);

const originalSettings = JSON.parse(
	await readFile(join(appRoot, "project.inlang/settings.json"), "utf8")
);
originalSettings.locales = locales;
originalSettings.modules = [
	join(appRoot, "node_modules/@inlang/plugin-message-format/dist/index.js"),
];
await writeFile(
	join(projectRoot, "settings.json"),
	JSON.stringify(originalSettings, null, 2)
);
await writeFile(
	join(projectRoot, "paraglide.config.js"),
	`export default { outdir: ${JSON.stringify(outdir)}, strategy: ["localStorage", "baseLocale"], localStorageKey: "i18nextLng", emitTsDeclarations: false };\n`
);

for (const locale of locales) {
	const source = JSON.parse(
		await readFile(
			join(appRoot, `project.inlang/messages/${locale}.json`),
			"utf8"
		)
	);
	const selected = Object.fromEntries(messages.map((id) => [id, source[id]]));
	if (Object.values(selected).some((value) => value === undefined)) {
		throw new Error(
			`The pinned Ntfy catalog is missing one of ${messages.join(", ")} for ${locale}.`
		);
	}
	await writeFile(
		join(projectRoot, `messages/${locale}.json`),
		JSON.stringify(selected, null, 2)
	);
}

const source = `import { k0, k107, k110, k113 } from "./paraglide/messages.js";
import { loadLocale } from "./paraglide/locale-loader.js";
import { getLocale, setLocale } from "./paraglide/runtime.js";

let lazyMessage;
let lazyStaticMessage;
function render() {
  document.documentElement.lang = getLocale();
  document.querySelector("#static").textContent = k0();
  document.querySelector("#placeholder").textContent = k110({ p0: "10" });
  document.querySelector("#rich").textContent = JSON.stringify(k107.parts({ p0: "Friday" }));
  document.querySelector("#plural").textContent = k113.parts({ count: 2, p0: "2" }).filter(part => part.type === "text").map(part => part.value).join("");
  document.querySelector("#lazy").textContent = lazyMessage ? lazyMessage({ p0: "5 MB" }) : "not loaded";
  window.lazyStaticText = lazyStaticMessage ? lazyStaticMessage() : "not loaded";
  document.querySelector("#locale").textContent = getLocale();
  document.body.dataset.ready = "true";
}

render();
window.activateLazyRoute = async () => {
  const route = await import("./lazy-route.js");
  lazyStaticMessage = route.lazyStatic;
  lazyMessage = route.lazyFileSize;
  render();
};
window.preloadFixtureLocale = loadLocale;
window.previewLazyLocale = locale => lazyStaticMessage({ locale });
window.switchFixtureLocale = async (locale) => {
  await setLocale(locale, { reload: false });
  render();
};
`;
await writeFile(
	join(fixtureRoot, "index.html"),
	`<!doctype html><html lang="en"><head><meta charset="utf-8"></head><body>
<h1 id="static"></h1><p id="placeholder"></p><p id="rich"></p><p id="plural"></p><p id="lazy"></p><code id="locale"></code>
<script type="module" src="/src/main.js"></script></body></html>\n`
);
await writeFile(join(fixtureRoot, "src/main.js"), source);
await writeFile(
	join(fixtureRoot, "src/lazy-route.js"),
	`import { k115, k1 } from "./paraglide/messages.js"; export const lazyFileSize = (inputs) => k115(inputs); export const lazyStatic = options => k1({}, options);\n`
);

const fromApp = createRequire(join(appRoot, "package.json"));
const { build } = fromApp("vite");
const vitePackage = JSON.parse(
	await readFile(join(appRoot, "node_modules/vite/package.json"), "utf8")
);
const { paraglideVitePlugin } = await import(
	pathToFileURL(join(repoRoot, "dist/index.js")).href
);
const plugins =
	mode === "native"
		? []
		: paraglideVitePlugin({
				project: projectRoot,
				outdir,
				strategy: ["localStorage", "baseLocale"],
				localStorageKey: "i18nextLng",
				outputStructure: "locale-modules",
				experimentalClientLocaleSplit: mode === "split",
				experimentalClientMessageProjection: mode === "projection",
				experimentalClientMessageAggregation: mode === "aggregation",
			});
if (mode === "native") {
	await mkdir(outdir, { recursive: true });
	const nativeCatalogs = Object.fromEntries(
		await Promise.all(
			locales.map(async (locale) => [
				locale,
				JSON.parse(
					await readFile(
						join(appRoot, `public/static/langs/${locale}.json`),
						"utf8"
					)
				),
			])
		)
	);
	const categories = new Set(["zero", "one", "two", "few", "many", "other"]);
	const baseKey = (key) =>
		categories.has(key.slice(key.lastIndexOf("_") + 1))
			? key.slice(0, key.lastIndexOf("_"))
			: key;
	const keys = [
		...new Set(
			Object.values(nativeCatalogs)
				.flatMap((catalog) => Object.keys(catalog))
				.map(baseKey)
		),
	].sort();
	const groups = {
		initial: ["k0", "k107", "k110", "k113"],
		lazy: ["k1", "k115"],
	};
	const urls = {};
	await mkdir(join(fixtureRoot, "public"), { recursive: true });
	for (const locale of locales) {
		urls[locale] = {};
		for (const [group, ids] of Object.entries(groups)) {
			const selectedKeys = new Set(ids.map((id) => keys[Number(id.slice(1))]));
			const values = Object.fromEntries(
				Object.entries(nativeCatalogs[locale]).filter(([key]) =>
					selectedKeys.has(baseKey(key))
				)
			);
			const bytes = JSON.stringify(values);
			const name = `native-${locale}-${group}-${createHash("sha256").update(bytes).digest("hex").slice(0, 12)}.json`;
			await writeFile(join(fixtureRoot, "public", name), bytes);
			urls[locale][group] = "/" + name;
		}
	}
	const wrapper = (id, group) => {
		const key = keys[Number(id.slice(1))];
		const names = [
			...new Set(
				Object.values(nativeCatalogs).flatMap((catalog) =>
					Object.entries(catalog)
						.filter(([candidate]) => baseKey(candidate) === key)
						.flatMap(([, value]) =>
							[...value.matchAll(/\{\{\s*([^{}]+?)\s*\}\}/g)].map((match) =>
								match[1].trim()
							)
						)
				)
			),
		].sort();
		const inputs = Object.fromEntries(
			names.map((name, index) => [name, `p${index}`])
		);
		return `export const ${id} = (inputs = {}, options = {}) => i18next.t(${JSON.stringify(key)}, { ns: ${JSON.stringify(group)}, lng: options.locale, ...inputs, ${Object.entries(
			inputs
		)
			.map(
				([name, variable]) =>
					JSON.stringify(name) +
					(name === "count"
						? ": Number(inputs.count ?? inputs[" +
							JSON.stringify(variable) +
							"])"
						: ": inputs[" + JSON.stringify(variable) + "]")
			)
			.join(
				","
			)} });\n${id}.parts = (inputs, options) => parts(${id}(inputs, options));`;
	};
	await writeFile(
		join(outdir, "runtime.js"),
		`import i18next from "i18next";
const urls = ${JSON.stringify(urls)};
const groups = new Set();
const requestedLocales = new Set();
const pending = new Map();
export async function register(group) { groups.add(group); await Promise.all([...new Set(["en", getLocale(), ...requestedLocales])].map(loadLocale)); }
export function getLocale() { return i18next.language ?? localStorage.getItem("i18nextLng") ?? "en"; }
export async function loadLocale(locale) { requestedLocales.add(locale); await Promise.all([...groups].map(group => { const key = locale + group; let promise = pending.get(key); if (!promise) { promise = fetch(urls[locale][group]).then(response => { if (!response.ok) throw new Error("Namespace HTTP " + response.status); return response.json(); }).then(values => i18next.addResourceBundle(locale, group, values)).catch(error => { pending.delete(key); throw error; }); pending.set(key, promise); } return promise; })); }
export async function setLocale(locale) { await loadLocale(locale); await i18next.changeLanguage(locale); localStorage.setItem("i18nextLng", locale); }
export function parts(html) { const root = new DOMParser().parseFromString(html, "text/html").body; const result = []; const walk = node => { if (node.nodeType === 3) result.push({ type: "text", value: node.textContent }); else { const name = node.tagName.toLowerCase(); result.push({ type: "markup-start", name }); for (const child of node.childNodes) walk(child); result.push({ type: "markup-end", name }); } }; for (const child of root.childNodes) walk(child); return result; }
await i18next.init({ lng: localStorage.getItem("i18nextLng") ?? "en", fallbackLng: "en", resources: {}, ns: [], interpolation: { escapeValue: false } });
`
	);
	await writeFile(
		join(outdir, "locale-loader.js"),
		`export { loadLocale } from "./runtime.js";`
	);
	await writeFile(
		join(outdir, "messages.js"),
		`import i18next from "i18next"; import { register, parts } from "./runtime.js"; await register("initial");\n${groups.initial.map((id) => wrapper(id, "initial")).join("\n")}`
	);
	await writeFile(
		join(fixtureRoot, "src/lazy-route.js"),
		`import i18next from "i18next"; import { register, parts } from "./paraglide/runtime.js"; await register("lazy");\n${groups.lazy.map((id) => wrapper(id, "lazy")).join("\n")}\nexport const lazyFileSize = inputs => k115(inputs); export const lazyStatic = options => k1({}, options);`
	);
}
await build({
	configFile: false,
	logLevel: "warn",
	root: fixtureRoot,
	plugins: Array.isArray(plugins) ? plugins : [plugins],
	build: {
		target: "es2022",
		outDir: distDir,
		assetsDir: "assets",
		manifest: true,
		sourcemap: process.env.NTFY_SOURCEMAP === "1",
		emptyOutDir: true,
	},
});

const manifest = JSON.parse(
	await readFile(join(distDir, ".vite/manifest.json"), "utf8")
);
const manifestReachable = new Set();
const visit = (key) => {
	const entry = manifest[key];
	if (!entry || manifestReachable.has(entry.file)) return;
	manifestReachable.add(entry.file);
	for (const dependency of [
		...(entry.imports ?? []),
		...(entry.dynamicImports ?? []),
	])
		visit(dependency);
};
visit("index.html");
const manifestReachableRows = await Promise.all(
	[...manifestReachable].map(async (file) => {
		const bytes = await readFile(join(distDir, file));
		return {
			file,
			bytes: bytes.length,
			sha256: createHash("sha256").update(bytes).digest("hex"),
			gzipBytes: gzipSync(bytes, { level: 6 }).length,
			brotliQ4Bytes: brotliCompressSync(bytes, {
				params: { [zlibConstants.BROTLI_PARAM_QUALITY]: 4 },
			}).length,
		};
	})
);

const mime = {
	".css": "text/css",
	".html": "text/html; charset=utf-8",
	".js": "text/javascript; charset=utf-8",
	".json": "application/json",
	".svg": "image/svg+xml",
};
const server = createServer(async (request, response) => {
	const pathname = decodeURIComponent(
		new URL(request.url ?? "/", "http://localhost").pathname
	);
	const relative =
		pathname === "/" ? "index.html" : pathname.replace(/^\//, "");
	const path = resolve(distDir, relative);
	if (!path.startsWith(`${distDir}${sep}`)) {
		response.writeHead(403).end();
		return;
	}
	try {
		const bytes = await readFile(path);
		response.writeHead(200, {
			"content-type": mime[extname(path)] ?? "application/octet-stream",
		});
		response.end(bytes);
	} catch {
		response.writeHead(404).end();
	}
});
await new Promise((resolveListen) =>
	server.listen(0, "127.0.0.1", resolveListen)
);
const address = server.address();
if (!address || typeof address === "string")
	throw new Error("Could not start the fixture server.");

let browser;
const browserRequests = [];
const browserResult = {};
try {
	const { chromium } = fromApp("playwright");
	browser = await chromium.launch({ headless: true });
	const page = await browser.newPage();
	page.on("request", (request) =>
		browserRequests.push(new URL(request.url()).pathname)
	);
	page.on("pageerror", (error) =>
		(browserResult.errors ??= []).push(error.message)
	);
	page.on("console", (message) => {
		if (message.type() === "error")
			(browserResult.consoleErrors ??= []).push(message.text());
	});
	await page.addInitScript(() => localStorage.setItem("i18nextLng", "fr"));
	await page.goto(`http://127.0.0.1:${address.port}/`, {
		waitUntil: "domcontentloaded",
	});
	await page
		.locator('body[data-ready="true"]')
		.waitFor({ timeout: 5000 })
		.catch(() => {});
	if (!(await page.locator('body[data-ready="true"]').count())) {
		browserResult.requests = browserRequests;
		throw new Error(
			`Fixture did not become ready: ${JSON.stringify(browserResult)}`
		);
	}
	const captureVisibleState = () =>
		page.locator("body").evaluate((body) => ({
			locale: body.querySelector("#locale").textContent,
			htmlLang: document.documentElement.lang,
			staticText: body.querySelector("#static").textContent,
			placeholder: body.querySelector("#placeholder").textContent,
			richParts: body.querySelector("#rich").textContent,
			plural: body.querySelector("#plural").textContent,
			lazy: body.querySelector("#lazy").textContent,
			lazyStatic: window.lazyStaticText,
		}));
	browserResult.initialFrench = await captureVisibleState();
	browserResult.initialRequestPaths = [...browserRequests];
	await page.evaluate(() => window.activateLazyRoute());
	browserResult.afterLazyFrench = await captureVisibleState();
	browserResult.afterLazyRequestPaths = browserRequests.slice(
		browserResult.initialRequestPaths.length
	);
	let requestIndex = browserRequests.length;
	await page.evaluate(() => window.switchFixtureLocale("de"));
	browserResult.afterGerman = await captureVisibleState();
	browserResult.germanSwitchRequestPaths = browserRequests.slice(requestIndex);
	requestIndex = browserRequests.length;
	await page.evaluate(() => window.switchFixtureLocale("en"));
	browserResult.afterEnglish = await captureVisibleState();
	browserResult.englishSwitchRequestPaths = browserRequests.slice(requestIndex);
	requestIndex = browserRequests.length;
	await page.evaluate(() => window.switchFixtureLocale("fr"));
	browserResult.afterFrenchAgain = await captureVisibleState();
	browserResult.frenchSwitchRequestPaths = browserRequests.slice(requestIndex);
	browserResult.requests = browserRequests;
	const racePage = await browser.newPage();
	const raceErrors = [];
	racePage.on("pageerror", (error) => raceErrors.push(error.message));
	await racePage.addInitScript(() => localStorage.setItem("i18nextLng", "fr"));
	await racePage.goto(`http://127.0.0.1:${address.port}/`);
	await racePage.locator('body[data-ready="true"]').waitFor();
	await racePage.evaluate(async () => {
		await preloadFixtureLocale("de");
		await activateLazyRoute();
	});
	browserResult.explicitPreloadBeforeLazy = await racePage.evaluate(() =>
		previewLazyLocale("de")
	);
	await racePage.close();
	const concurrentPage = await browser.newPage();
	concurrentPage.on("pageerror", (error) => raceErrors.push(error.message));
	await concurrentPage.addInitScript(() =>
		localStorage.setItem("i18nextLng", "fr")
	);
	await concurrentPage.goto(`http://127.0.0.1:${address.port}/`);
	await concurrentPage.locator('body[data-ready="true"]').waitFor();
	await concurrentPage.evaluate(() =>
		Promise.all([switchFixtureLocale("de"), activateLazyRoute()])
	);
	browserResult.concurrentSwitchAndLazy = await concurrentPage.evaluate(() => ({
		locale: document.documentElement.lang,
		staticText: window.lazyStaticText,
	}));
	await concurrentPage.close();
	const failurePage = await browser.newPage();
	await failurePage.addInitScript(() =>
		localStorage.setItem("i18nextLng", "fr")
	);
	await failurePage.goto(`http://127.0.0.1:${address.port}/`);
	await failurePage.locator('body[data-ready="true"]').waitFor();
	let injectedFailure = false;
	await failurePage.route("**/*.json", async (route) => {
		if (
			!injectedFailure &&
			/(?:capsule-de-|native-de-)/.test(route.request().url())
		) {
			injectedFailure = true;
			await route.fulfill({ status: 503, body: "Temporary benchmark failure" });
		} else await route.continue();
	});
	browserResult.failedSwitch = await failurePage.evaluate(async () => {
		try {
			await switchFixtureLocale("de");
			return { rejected: false };
		} catch (error) {
			return {
				rejected: true,
				locale: document.documentElement.lang,
				message: error.message,
			};
		}
	});
	assert.equal(browserResult.failedSwitch.rejected, true);
	assert.equal(browserResult.failedSwitch.locale, "fr");
	await failurePage.evaluate(() => switchFixtureLocale("de"));
	browserResult.retrySwitchLocale = await failurePage.evaluate(
		() => document.documentElement.lang
	);
	assert.equal(browserResult.retrySwitchLocale, "de");
	await failurePage.close();
	assert.deepEqual(raceErrors, []);
	assert.deepEqual(browserResult.errors ?? [], []);
	assert.deepEqual(browserResult.consoleErrors ?? [], []);
	const expected = {
		fr: {
			staticText:
				"Un utilisateur provisionné ne peut pas être modifié ou supprimé",
			placeholder: "économisez 10%",
			plural:
				"Le tarif sélectionné autorise moins de sujets réservés que votre tarif actuel. Avant de changer de tarif, veuillez supprimer au moins 2 sujets réservés. Vous pouvez supprimer des sujets réservés dans les Paramètres.",
			lazy: "5 MB par fichier",
			rich: "annuler votre abonnement",
		},
		de: {
			staticText:
				"Ein bereitgestellter Benutzer kann nicht bearbeitet oder gelöscht werden",
			placeholder: "spare 10%",
			plural:
				"Das gewählte Level erlaubt weniger reservierte Themen als Dein aktueller Level. Bitte löschen vor dem Wechsel Deines Levels mindestens 2 Reservierungen. Du kannst Reservierungen in den Einstellungen löschen.",
			lazy: "5 MB pro Datei",
			rich: "Dein Abo stornieren",
		},
		en: {
			staticText: "A provisioned user cannot be edited or deleted",
			placeholder: "save 10%",
			plural:
				"The selected tier allows fewer reserved topics than your current tier. Before changing your tier, please delete at least 2 reservations. You can remove reservations in the Settings.",
			lazy: "5 MB per file",
			rich: "cancel your subscription",
		},
	};
	for (const state of [
		browserResult.initialFrench,
		browserResult.afterLazyFrench,
		browserResult.afterGerman,
		browserResult.afterEnglish,
		browserResult.afterFrenchAgain,
	]) {
		const locale = state.locale;
		assert.equal(state.htmlLang, locale);
		assert.equal(state.staticText, expected[locale].staticText);
		assert.equal(state.placeholder, expected[locale].placeholder);
		assert.equal(state.plural, expected[locale].plural);
		assert.ok(state.richParts.includes(expected[locale].rich));
		assert.ok(state.richParts.includes("markup-start"));
		if (state === browserResult.initialFrench)
			assert.equal(state.lazy, "not loaded");
		else assert.equal(state.lazy, expected[locale].lazy);
		if (state !== browserResult.initialFrench) {
			const catalog = JSON.parse(
				await readFile(join(projectRoot, `messages/${locale}.json`), "utf8")
			);
			assert.equal(state.lazyStatic, catalog.k1);
		}
	}
	const germanCatalog = JSON.parse(
		await readFile(join(projectRoot, "messages/de.json"), "utf8")
	);
	assert.equal(browserResult.explicitPreloadBeforeLazy, germanCatalog.k1);
	assert.deepEqual(browserResult.concurrentSwitchAndLazy, {
		locale: "de",
		staticText: germanCatalog.k1,
	});
} finally {
	await browser?.close();
	await new Promise((resolveClose, rejectClose) =>
		server.close((error) => (error ? rejectClose(error) : resolveClose()))
	);
}

const report = {
	kind: "private automatic route capsule vs optimized scoped i18next fixture; not a production A/B",
 compilerUsed: mode !== "native",
	mode,
	appSource: appRoot,
	ntfySourceCommit:
		process.env.NTFY_SOURCE_COMMIT ??
		"211ba22860d7483073a8ce13dcda5f467194989b",
	compilerSourceHead: execFileSync("git", ["rev-parse", "HEAD"], {
		cwd: repoRoot,
		encoding: "utf8",
	}).trim(),
	compilerSourceWorkingTreeDiffSha256: createHash("sha256")
		.update(
			execFileSync(
				"git",
				[
					"diff",
					"--binary",
					"--",
					"src/bundler-plugins/client-locale-split/vite-plugin.ts",
					"src/bundler-plugins/unplugin.ts",
					"src/bundler-plugins/vite.ts",
					"src/bundler-plugins/vite.test.ts",
				],
				{ cwd: repoRoot }
			)
		)
		.digest("hex"),
	compilerFiles: {
		publicPluginEntryDistSha256: await sha256(join(repoRoot, "dist/index.js")),
		clientLocaleSplitPluginDistSha256: await sha256(
			join(repoRoot, "dist/bundler-plugins/client-locale-split/vite-plugin.js")
		),
		projectionPluginSourceSha256: await sha256(
			join(repoRoot, "src/bundler-plugins/client-locale-split/vite-plugin.ts")
		),
		publicViteOptionsSourceSha256: await sha256(
			join(repoRoot, "src/bundler-plugins/vite.ts")
		),
	},
	appLocaleCount: 51,
	fixtureLocales: locales,
	fixtureMessageIds: messages,
	toolchain: { node: process.version, vite: vitePackage.version, i18next: fromApp("i18next/package.json").version },
	fixtureBuildOutput: distDir,
	buildTree: await buildTreeSummary(distDir),
	manifestReachabilityUpperBound: {
		assetCount: manifestReachableRows.length,
		bytes: manifestReachableRows.reduce((sum, asset) => sum + asset.bytes, 0),
		gzipBytes: manifestReachableRows.reduce(
			(sum, asset) => sum + asset.gzipBytes,
			0
		),
		brotliQ4Bytes: manifestReachableRows.reduce(
			(sum, asset) => sum + asset.brotliQ4Bytes,
			0
		),
		assets: manifestReachableRows,
	},
	entryGraph: await requestedAssetSummary(browserResult.initialRequestPaths),
	browser: browserResult,
};
await writeFile(reportPath, `${JSON.stringify(report, null, 2)}\n`);
await mkdir(dirname(durableReportPath), { recursive: true });
await writeFile(durableReportPath, `${JSON.stringify(report, null, 2)}\n`);
console.log(
	JSON.stringify(
		{ reportPath, entryGraph: report.entryGraph, browser: browserResult },
		null,
		2
	)
);

async function requestedAssetSummary(paths) {
	const files = [
		...new Set(
			paths.map((pathname) =>
				pathname === "/" ? "index.html" : pathname.replace(/^\//, "")
			)
		),
	];
	const assets = await Promise.all(
		files.map(async (file) => {
			const bytes = await readFile(join(distDir, file));
			return {
				file,
				bytes: bytes.length,
				sha256: createHash("sha256").update(bytes).digest("hex"),
				gzipBytes: gzipSync(bytes, { level: 6 }).length,
				brotliQ4Bytes: brotliCompressSync(bytes, {
					params: { [zlibConstants.BROTLI_PARAM_QUALITY]: 4 },
				}).length,
			};
		})
	);
	return {
		resourceCount: assets.length,
		requestClassCounts: {
			messageLocaleFacades: paths.filter((path) =>
				path.includes("_projected-message_")
			).length,
			localeProjectionGroups: paths.filter((path) =>
				path.includes("paraglide-projection-")
			).length,
			localePayloadChunks: paths.filter((path) =>
				path.includes("paraglide-locale-payload-")
			).length,
			localeFunctionChunks: paths.filter((path) =>
				/\/(en|fr|de)-[^/]+\.js$/.test(path)
			).length,
			applicationAndRuntimeChunks: paths.filter(
				(path) =>
					path.startsWith("/assets/") &&
					!path.includes("_projected-message_") &&
					!path.includes("paraglide-projection-") &&
					!path.includes("paraglide-locale-payload-") &&
					!/\/(en|fr|de)-[^/]+\.js$/.test(path)
			).length,
		},
		bytes: assets.reduce((sum, asset) => sum + asset.bytes, 0),
		gzipBytes: assets.reduce((sum, asset) => sum + asset.gzipBytes, 0),
		brotliQ4Bytes: assets.reduce((sum, asset) => sum + asset.brotliQ4Bytes, 0),
		assets,
	};
}

async function buildTreeSummary(directory) {
	const files = [];
	const visitDirectory = async (current, relative = "") => {
		for (const entry of await readdir(current, { withFileTypes: true })) {
			const path = join(current, entry.name);
			const childRelative = relative ? `${relative}/${entry.name}` : entry.name;
			if (entry.isDirectory()) await visitDirectory(path, childRelative);
			else if (entry.isFile()) {
				const bytes = await readFile(path);
				files.push({
					path: childRelative,
					bytes: bytes.length,
					sha256: createHash("sha256").update(bytes).digest("hex"),
				});
			}
		}
	};
	await visitDirectory(directory);
	files.sort((left, right) => left.path.localeCompare(right.path));
	const treeHash = createHash("sha256");
	for (const file of files) treeHash.update(`${file.path}\0${file.sha256}\n`);
	return {
		fileCount: files.length,
		byteCount: files.reduce((sum, file) => sum + file.bytes, 0),
		sha256: treeHash.digest("hex"),
		files,
	};
}

async function sha256(path) {
	return createHash("sha256")
		.update(await readFile(path))
		.digest("hex");
}
