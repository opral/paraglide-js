import fs from "node:fs/promises";
import path from "node:path";
import { spawnSync } from "node:child_process";

// Run after migrate-anything.mjs creates the pinned native metadata control.
const source = path.resolve(process.argv[2] ?? ".real-apps/anything-native-metadata-control/frontend");
const destination = path.resolve(process.argv[3] ?? ".real-apps/anything-lazy-i18next-control/frontend");
try {
	await fs.access(destination);
	throw new Error(`Refusing to overwrite ${destination}`);
} catch (error) {
	if (error.code !== "ENOENT") throw error;
}
await fs.cp(source, destination, {
	recursive: true,
	filter: (filename) => !["node_modules", "dist", "bundleinspector.html"].includes(path.basename(filename)),
});
await fs.symlink(path.join(source, "node_modules"), path.join(destination, "node_modules"), "dir");
const resources = await fs.readFile(path.join(source, "src/locales/resources.js"), "utf8");
const imports = Object.fromEntries([...resources.matchAll(/import\s+(\w+)\s+from\s+"([^"]+)"/g)].map((match) => [match[1], match[2]]));
const body = resources.split("export const resources =")[1];
if (!body) throw new Error("Pinned resource declaration not found");
const loaders = [...body.matchAll(/(?:"([^"]+)"|(\w+)):\s*\{\s*common:\s*(\w+),?\s*\}/g)].map((match) => {
	const filename = imports[match[3]];
	if (!filename?.startsWith("./")) throw new Error("Unknown pinned resource import");
	return `${JSON.stringify(match[1] ?? match[2])}: () => import(${JSON.stringify("./locales/" + filename.slice(2))})`;
});
if (loaders.length !== 31) throw new Error(`Expected 31 pinned locales, got ${loaders.length}`);
await fs.writeFile(path.join(destination, "src/i18n.js"), `import i18next from "i18next";
import { initReactI18next } from "react-i18next";
import LanguageDetector from "i18next-browser-languagedetector";
const localeLoaders = {\n${loaders.join(",\n")}\n};
const backend = {
 type: "backend",
 init() {},
 read(language, namespace, callback) {
   const load = localeLoaders[language];
   if (!load || namespace !== "common") { callback(new Error("Unavailable locale " + language), false); return; }
   load().then((module) => callback(null, module.default), (error) => callback(error, false));
 }
};
await i18next.use(initReactI18next).use(LanguageDetector).use(backend).init({
 fallbackLng: "en", debug: import.meta.env.DEV, defaultNS: "common", ns: ["common"],
 lowerCaseLng: true, interpolation: { escapeValue: false },
});
export default i18next;
`);
const config = path.join(destination, "vite.config.js");
const original = await fs.readFile(config, "utf8");
if (!original.includes("build: {")) throw new Error("Pinned Vite build config not found");
await fs.writeFile(config, original.replace("build: {", 'build: {\n    target: "esnext",'));
const result = spawnSync(process.execPath, [path.join(destination, "node_modules/vite/bin/vite.js"), "build", "--outDir", "../dist", "--emptyOutDir"], { cwd: destination, stdio: "inherit" });
if (result.status !== 0) throw new Error(`Native lazy control build failed (${result.status})`);
