import path from "node:path";
import { createRequire } from "node:module";
import { pathToFileURL } from "node:url";

const root = path.resolve(".real-apps/anything-migration");
const frontend = path.join(root, "frontend");
const sourceFrontend = path.resolve(".real-apps/anything-llm-source/frontend");
const require = createRequire(path.join(frontend, "package.json"));
const React = require("react");
const { renderToStaticMarkup } = require("react-dom/server");
const i18next = require("i18next");
const { Trans: NativeTrans, I18nextProvider } = require("react-i18next");
const resourcesModule = await import(
	pathToFileURL(path.join(sourceFrontend, "src/locales/resources.js"))
);
const catalogs = JSON.parse(
	await (
		await import("node:fs/promises")
	).readFile(path.join(root, "catalogs.json"), "utf8")
);
const data = JSON.parse(
	await (
		await import("node:fs/promises")
	).readFile(path.join(root, "mapping.json"), "utf8")
);
const native = i18next.createInstance();
await native.init({
	resources: resourcesModule.resources,
	lng: "en",
	fallbackLng: "en",
	defaultNS: resourcesModule.defaultNS,
	lowerCaseLng: true,
	interpolation: { escapeValue: false },
});
const customI18n = await import(
	pathToFileURL(path.join(frontend, "src/paraglide/i18n.js"))
);
const { Trans: ParaglideTrans } = await import(
	pathToFileURL(path.join(frontend, "src/paraglide/react-compat.js"))
);

function makeProps(key, locale) {
	const source = catalogs.catalogs[locale]?.[key] ?? catalogs.catalogs.en[key];
	const tags = [...source.matchAll(/<([A-Za-z][\w-]*)(?:\s*\/)?\s*>/g)].map(
		(m) => m[1]
	);
	const components = Object.fromEntries(
		[...new Set(tags)].map((tag) => [
			tag,
			React.createElement(tag === "br" ? "br" : "span", {
				"data-component": tag,
			}),
		])
	);
	const values = Object.fromEntries(
		[...source.matchAll(/\{\{\s*([^{}]+?)\s*\}\}/g)].map((m) => [
			m[1].trim(),
			m[1].trim() === "count" ? 7 : `VALUE_${m[1].trim()}`,
		])
	);
	if (key === "agent.mcp.tool-count-warning") values.count = 7;
	return { source, components, values };
}

let checks = 0;
const mismatches = [];
for (const locale of catalogs.locales) {
	await native.changeLanguage(locale);
	await customI18n.default.changeLanguage(locale);
	for (const key of catalogs.transKeys) {
		const { source, components, values } = makeProps(key, locale);
		const nativeMarkup = renderToStaticMarkup(
			React.createElement(
				I18nextProvider,
				{ i18n: native },
				React.createElement(NativeTrans, { i18nKey: key, components, values })
			)
		);
		let customMarkup;
		try {
			customMarkup = renderToStaticMarkup(
				React.createElement(ParaglideTrans, {
					i18nKey: key,
					components,
					values,
				})
			);
		} catch (error) {
			console.error(
				JSON.stringify(
					{ locale, key, values, source, nativeMarkup, error: String(error) },
					null,
					2
				)
			);
			process.exit(2);
		}
		checks++;
		if (nativeMarkup !== customMarkup) {
			mismatches.push({ locale, key, source, nativeMarkup, customMarkup });
		}
	}
}
if (mismatches.length) {
	console.error(
		JSON.stringify({ checks, mismatches: mismatches.slice(0, 15) }, null, 2)
	);
	process.exitCode = 1;
} else {
	console.log(
		JSON.stringify({
			checks,
			locales: catalogs.locales.length,
			keys: catalogs.transKeys.length,
			result: "all Trans render parity checks passed",
		})
	);
}
