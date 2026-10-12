import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const repo = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../..");
const local = (relative) => path.join(repo, relative);
const splitSource = local(".real-apps/anything-public-final-pr4-split-dist");
const nativeSource = "/root/repos-iii/paraglide-client-split-pr4/.real-apps/anything-lazy-i18next-control/dist";
const experiments = path.join(repo, ".real-apps/anything-startup-experiments");
await fs.mkdir(experiments, { recursive: true });

async function copy(source, name) {
	const output = path.join(experiments, name);
	await fs.rm(output, { recursive: true, force: true });
	await fs.cp(source, output, { recursive: true });
	return output;
}

async function editHtml(directory, transform) {
	const filename = path.join(directory, "index.html");
	const original = await fs.readFile(filename, "utf8");
	const modified = transform(original);
	if (modified === original) throw new Error(`HTML transform made no change in ${directory}`);
	await fs.writeFile(filename, modified);
}

const splitFiles = await fs.readdir(path.join(splitSource, "assets"));
const splitAsset = (prefix) => {
	const found = splitFiles.find((file) => file.startsWith(prefix));
	if (!found) throw new Error(`Missing split asset ${prefix}`);
	return `/assets/${found}`;
};
const splitPreload = splitAsset("paraglide-locale-preload-");
const splitCore = splitAsset("_paraglide_client-locale-split_core-");
const splitLocales = Object.fromEntries(
	["en", "fr"].map((locale) => [
		locale,
		splitAsset(`_paraglide_client-locale-split_locale_${locale}-`),
	])
);
const splitRegistry = splitAsset("registry-");

const htmlHints = (priority) => {
	const links = [splitLocales.en, splitLocales.fr, splitRegistry]
		.map((href) => `<link rel="modulepreload" fetchpriority="${priority}" href="${href}">`)
		.join("");
	return (html) => html.replace(/<head(?:\s[^>]*)?>/i, (head) => `${head}${links}`);
};

const preloaded = await copy(splitSource, "split-explicit-preloads-high");
await editHtml(preloaded, htmlHints("high"));

const lowPriorityPreloaded = await copy(splitSource, "split-explicit-preloads-low");
await editHtml(lowPriorityPreloaded, htmlHints("low"));

const coreEntry = await copy(splitSource, "split-core-as-bootstrap");
await editHtml(coreEntry, (html) =>
	html.replace(
		`<script type="module" src="${splitPreload}"></script>`,
		`<script type="module" src="${splitCore}"></script>`
	)
);

const inlineLocalePreload = await copy(splitSource, "split-inline-locale-bootstrap");
const localeMap = JSON.stringify(splitLocales);
const localeBootstrap = `<script type="module">
const supported = ["en","zh","zh-tw","es","de","fr","ko","lo","et","ru","it","pt","he","nl","vi","fa","tr","ar","da","ja","lv","pl","ro","cs","lt","ca","id","hr","sv","hi","bg"];
const canonical = (value) => typeof value === "string" ? supported.find((locale) => locale.toLowerCase() === value.replaceAll("_","-").toLowerCase()) : undefined;
let preferred;
try { preferred = canonical(localStorage.getItem("i18nextLng")); } catch {}
const selected = preferred ?? navigator.languages?.map((tag) => canonical(tag) ?? canonical(tag.split("-")[0])).find(Boolean) ?? "en";
const modules = ${localeMap};
await Promise.all([...new Set(["en", selected])].map((locale) => import(modules[locale])));
</script>`;
await editHtml(inlineLocalePreload, (html) =>
	html.replace(
		`<script type="module" src="${splitPreload}"></script>`,
		localeBootstrap
	)
);

const noBootstrap = await copy(splitSource, "split-no-bootstrap");
await editHtml(noBootstrap, (html) =>
	html.replace(`<script type="module" src="${splitPreload}"></script>`, "")
);

const nativeFiles = await fs.readdir(path.join(nativeSource, "assets"));
const nativeAssetContaining = async (substring) => {
	const matches = [];
	for (const file of nativeFiles.filter((name) => name.startsWith("common-") && name.endsWith(".js"))) {
		if ((await fs.readFile(path.join(nativeSource, "assets", file), "utf8")).includes(substring)) {
			matches.push(`/assets/${file}`);
		}
	}
	if (matches.length !== 1) throw new Error(`Expected one native locale chunk for ${substring}; got ${matches.join(", ")}`);
	return matches[0];
};
const nativeLocaleAssets = await Promise.all([
	nativeAssetContaining("Get Started"),
	nativeAssetContaining("Bienvenue"),
]);
const nativePreloaded = await copy(nativeSource, "native-i18next-explicit-preloads");
await editHtml(nativePreloaded, (html) => {
	const links = nativeLocaleAssets
		.map((href) => `<link rel="modulepreload" fetchpriority="high" href="${href}">`)
		.join("");
	return html.replace(/<head(?:\s[^>]*)?>/i, (head) => `${head}${links}`);
});

console.log(JSON.stringify({
	inputs: { splitSource, nativeSource },
	split: { preload: splitPreload, core: splitCore, en: splitLocales.en, fr: splitLocales.fr, registry: splitRegistry },
	nativeLocaleAssets,
	outputs: [preloaded, lowPriorityPreloaded, coreEntry, inlineLocalePreload, noBootstrap, nativePreloaded],
}, null, 2));
