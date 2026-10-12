import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const appRoot = process.argv[2];
if (!appRoot) throw new Error("Usage: node make-trans-map.mjs <ntfy-web-root>");
const here = path.dirname(fileURLToPath(import.meta.url));
const benchmarkRoot = process.env.NTFY_BENCHMARK_OUTPUT_ROOT ?? path.resolve(here, "../../..", ".real-apps/ntfy-ab");

const sourceRoot = path.join(appRoot, "src");
const mapping = JSON.parse(fs.readFileSync(path.join(benchmarkRoot, "mapping.json"), "utf8"));
const entries = Object.entries(mapping).sort(([left], [right]) => left.localeCompare(right));
const imports = entries.map(([, name]) => `\t${name},`).join("\n");
const properties = entries
	.map(([key, name]) => `\t${JSON.stringify(key)}: ${name},`)
	.join("\n");
const output = `import {\n${imports}\n} from "./messages.js";\n\nexport const transMessages = {\n${properties}\n};\n`;
const adapterRoot = path.join(sourceRoot, "benchmark-adapter");
fs.mkdirSync(adapterRoot, { recursive: true });
fs.writeFileSync(path.join(adapterRoot, "trans-messages.js"), output.replace('./messages.js', '../paraglide/messages.js'));
const inputMetadata = JSON.parse(fs.readFileSync(
	path.join(benchmarkRoot, "input-metadata.json"),
	"utf8",
));
fs.writeFileSync(path.join(adapterRoot, "translation-inputs.js"), `const inputMetadata = ${JSON.stringify(inputMetadata)};\n\nexport function prepareMessageInputs(key, inputs = {}) {\n\tconst source = inputs && typeof inputs === "object" ? inputs : {};\n\tconst prepared = { ...source };\n\tfor (const [name, safeName] of Object.entries(inputMetadata[key] ?? {})) {\n\t\tconst hasValue = Object.hasOwn(source, name) && source[name] !== undefined;\n\t\tprepared[safeName] = hasValue ? (source[name] === null ? "" : source[name]) : "{{" + name + "}}";\n\t}\n\treturn prepared;\n}\n\nexport function callTranslation(key, fn, inputs = {}) {\n\treturn fn(prepareMessageInputs(key, inputs));\n}\n`);
console.log(`Generated compatibility lookup for ${entries.length} message IDs.`);
