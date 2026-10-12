import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const repo = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../..");
const source = path.resolve(
	process.env.ANYTHING_NATIVE_DIST ??
	"/root/repos-iii/paraglide-client-split-pr4/.real-apps/anything-lazy-i18next-control/dist"
);
const output = path.join(
	repo,
	".real-apps/anything-startup-experiments/native-i18next-inline-locale-bootstrap"
);
await fs.rm(output, { recursive: true, force: true });
await fs.cp(source, output, { recursive: true });

const assets = path.join(source, "assets");
const files = await fs.readdir(assets);
async function localeAsset(text) {
	const matches = [];
	for (const file of files.filter((name) => name.startsWith("common-") && name.endsWith(".js"))) {
		if ((await fs.readFile(path.join(assets, file), "utf8")).includes(text)) {
			matches.push(`/assets/${file}`);
		}
	}
	if (matches.length !== 1) throw new Error(`Expected one native locale chunk containing ${JSON.stringify(text)}; got ${matches.join(", ")}`);
	return matches[0];
}
const en = await localeAsset("Get Started");
const fr = await localeAsset("Bienvenue");
const htmlPath = path.join(output, "index.html");
const html = await fs.readFile(htmlPath, "utf8");
const script = `<script type="module">await Promise.all([import(${JSON.stringify(en)}), import(${JSON.stringify(fr)})]);</script>`;
await fs.writeFile(
	htmlPath,
	html.replace(/<head(?:\s[^>]*)?>/i, (head) => `${head}${script}`)
);
console.log(JSON.stringify({ source, output, en, fr }, null, 2));
