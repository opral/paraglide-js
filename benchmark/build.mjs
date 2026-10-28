import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { build, createBuilder } from "vite";
import { compile } from "@inlang/paraglide-js";
import { fixture, pluralForms } from "./fixture.mjs";
import { scenarios, variants, nameOf } from "./config.mjs";
const localCompiler = await import("../dist/index.js");

const sourceDirectory = path.dirname(fileURLToPath(import.meta.url));
process.chdir(process.env.BENCHMARK_OUTPUT ?? sourceDirectory);
await fs.mkdir("dist", { recursive: true });
await fs.mkdir(".work", { recursive: true });
const manifest = [];
const compiled = new Map();
const chosen = process.env.SMOKE ? scenarios.slice(0, 1) : scenarios;
for (const s of chosen) {
	const f = fixture(s);
	const key = `l${s.localeCount}-n${s.total}`;
	const workspace = path.resolve(".work", key);
	const messagesDir = path.join(workspace, "messages");
	await fs.mkdir(messagesDir, { recursive: true });
	const catalogs = {};
	for (const l of f.locales) {
		const flat = Object.fromEntries(f.entries.map((e) => [e.key, e.values[l]]));
		for (const [category, text] of Object.entries(pluralForms[l]))
			flat[`benchItems_${category}`] = text;
		await fs.writeFile(
			path.join(messagesDir, `${l}.json`),
			JSON.stringify(flat)
		);
		catalogs[l] = {
			common: Object.fromEntries(
				f.entries
					.filter((e) => e.ns === "common")
					.map((e) => [e.key, e.values[l]])
			),
		};
		for (const [category, text] of Object.entries(pluralForms[l]))
			catalogs[l].common[`benchItems_${category}`] = text;
		for (let i = 0; i < 5; i++)
			catalogs[l][`route${i}`] = Object.fromEntries(
				f.entries
					.filter((e) => e.ns === `route${i}`)
					.map((e) => [e.key, e.values[l]])
			);
	}
	if (!compiled.has(key)) {
		const project = path.join(workspace, "project.inlang");
		await fs.rm(project, { recursive: true, force: true });
		await fs.mkdir(project, { recursive: true });
		await fs.copyFile(
			"node_modules/@inlang/plugin-i18next/dist/index.js",
			path.join(workspace, "plugin.js")
		);
		await fs.writeFile(
			path.join(project, "settings.json"),
			JSON.stringify({
				baseLocale: "en",
				locales: f.locales,
				modules: ["./plugin.js"],
				"plugin.inlang.i18next": { pathPattern: "./messages/{locale}.json" },
			})
		);
		const start = performance.now();
		await compile({
			project,
			outdir: path.join(workspace, "paraglide"),
			isServer: "false",
			strategy: ["globalVariable", "baseLocale"],
		});
		await fs.access(path.join(workspace, "paraglide/messages/msg00000.js"));
		compiled.set(key, performance.now() - start);
	}
	for (const variant of variants) {
		const name = nameOf(s, variant);
		const appDir = path.resolve(".work", name);
		await fs.mkdir(path.join(appDir, "pages"), { recursive: true });
		await fs.copyFile(
			path.join(sourceDirectory, "app.js"),
			path.join(appDir, "app.js")
		);
		await fs.writeFile(
			path.join(appDir, "index.html"),
			'<!doctype html><html><head><meta charset="utf-8"><link rel="icon" href="data:,"><title>i18n benchmark</title></head><body><nav id="navigation"></nav><nav id="languages"></nav><main id="app"></main><p id="plural"></p><p id="date"></p><script type="module" src="./app.js"></script></body></html>'
		);
		const perLocale = variant.startsWith("paraglide-per-locale");
		const isParaglide = variant.startsWith("paraglide");
		const generated = perLocale
			? path.join(appDir, "paraglide")
			: path.join(workspace, "paraglide");
		const localePaths = perLocale
			? Object.fromEntries(
					f.locales.map((locale) => [
						locale,
						`/${name}/__paraglide/${locale}-${Buffer.from(locale).toString("hex")}/`,
					])
				)
			: undefined;
		let adapter;
		if (isParaglide) {
			const runtime = path.join(generated, "runtime.js");
			const messages = path.join(generated, "messages.js");
			adapter = `import {setLocale} from ${JSON.stringify(runtime)}; import {m} from ${JSON.stringify(messages)};
export async function init(){}; export async function setLanguage(locale){setLocale(locale,{reload:false})}; export const plural=count=>m.benchItems({count});`;
			if (perLocale)
				adapter = `import {m} from ${JSON.stringify(messages)};
export async function init(){}; export async function setLanguage(){}; export const plural=count=>m.benchItems({count});`;
		} else {
			const isHttp = variant.includes("http");
			adapter = `import i18next from 'i18next';\n`;
			if (isHttp)
				adapter += `import Backend from 'i18next-http-backend';\ni18next.use(Backend);\n`;
			const resources =
				variant === "i18next-bundled"
					? `resources:${JSON.stringify(catalogs)},`
					: "";
			const routeMode = variant === "i18next-http-routes";
			const backend = isHttp
				? `backend:{loadPath:import.meta.env.BASE_URL+'locales/{{lng}}/{{ns}}.json'},`
				: "";
			adapter += `export async function init(){await i18next.init({lng:'en',fallbackLng:false,supportedLngs:${JSON.stringify(f.locales)},load:'currentOnly',ns:[],defaultNS:'common',interpolation:{escapeValue:false},${resources}${backend}})};
export async function setLanguage(locale,route){await i18next.changeLanguage(locale);${isHttp ? `await i18next.loadNamespaces(${routeMode ? `['common','route'+route]` : `['translation']`});` : ""}}
export const translate=(ns,key,inputs)=>i18next.t(key,{...inputs,ns:${isHttp && !routeMode ? `'translation'` : `ns`}});
export const plural=count=>translate('common','benchItems',{count});`;
		}
		await fs.writeFile(path.join(appDir, "adapter.js"), adapter);
		for (let i = 0; i < 5; i++) {
			const calls = f.routes[i].map((e) =>
				isParaglide
					? `m.${e.key}(${JSON.stringify(e.inputs)})`
					: `translate(${JSON.stringify(e.ns)},${JSON.stringify(e.key)},${JSON.stringify(e.inputs)})`
			);
			const imports = isParaglide
				? `import {m} from ${JSON.stringify(path.join(generated, "messages.js"))};`
				: `import {translate} from '../adapter.js';`;

			await fs.writeFile(
				path.join(appDir, "pages", `route${i}.js`),
				`${imports}\nexport const messages=()=>[${calls.join(",")}];`
			);
		}
		const start = performance.now();
		const buildOptions = {
			root: appDir,
			configFile: false,
			logLevel: "error",
			base: perLocale ? "./" : `/${name}/`,
			define: {
				LOCALES: JSON.stringify(f.locales),
				LOCALE_PATHS: JSON.stringify(localePaths ?? {}),
			},
			build: {
				outDir: perLocale ? "build" : path.resolve("dist", name),
				emptyOutDir: true,
				target: "es2022",

				sourcemap: false,
			},
		};
		if (perLocale) {
			const builder = await createBuilder({
				...buildOptions,
				plugins: [
					localCompiler.paraglideVitePlugin({
						project: path.join(workspace, "project.inlang"),
						outdir: generated,
						isServer: "false",
						strategy: ["globalVariable", "baseLocale"],
						experimentalPerLocaleBuild: true,
						outputStructure: "message-modules",
					}),
				],
			});
			await builder.buildApp();
			await fs.rm(path.resolve("dist", name), { recursive: true, force: true });
			await fs.cp(path.join(appDir, "build"), path.resolve("dist", name), {
				recursive: true,
			});
			const emitted = JSON.parse(
				await fs.readFile(
					path.resolve("dist", name, "paraglide-vite-locales.json"),
					"utf8"
				)
			);
			for (const locale of f.locales) {
				if (
					localePaths[locale] !==
					`/${name}/${emitted.locales[locale].directory}/`
				)
					throw Error("Locale manifest and serving paths disagree");
			}
		} else await build(buildOptions);
		const buildMs = performance.now() - start;
		if (variant.startsWith("i18next-http")) {
			for (const l of f.locales) {
				const dir = path.resolve("dist", name, "locales", l);
				await fs.mkdir(dir, { recursive: true });
				if (variant === "i18next-http-global")
					await fs.copyFile(
						path.join(messagesDir, `${l}.json`),
						path.join(dir, "translation.json")
					);
				else
					for (const [ns, values] of Object.entries(catalogs[l]))
						await fs.writeFile(
							path.join(dir, `${ns}.json`),
							JSON.stringify(values)
						);
			}
		}
		manifest.push({
			name,
			variant,
			...(localePaths ? { localePaths } : {}),
			...s,
			compileMs: variant === "paraglide" ? compiled.get(key) : 0,
			buildMs,
		});
		console.log(
			`Built ${manifest.length}/${chosen.length * variants.length} ${name}: ${buildMs.toFixed(0)}ms`
		);
	}
	await fs.writeFile("build-manifest.json", JSON.stringify(manifest, null, 2));
}
