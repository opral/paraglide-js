#!/usr/bin/env node
import fs from "node:fs/promises";
import path from "node:path";
import { createRequire } from "node:module";

const args = new Map();
for (let index = 2; index < process.argv.length; index += 1) {
	const item = process.argv[index];
	if (item.startsWith("--")) args.set(item.slice(2), process.argv[++index]);
}

const appRoot = path.resolve(args.get("app-root") ?? "/root/repos-iii/memos-paraglide-auth-run");
const webRoot = path.join(appRoot, "web");
const catalogRoot = path.resolve(
	args.get("catalog") ?? "/root/repos-iii/paraglide-real-apps/.real-apps/memos/baseline/paraglide",
);
const mappingPath = path.resolve(
	args.get("mapping") ?? "/root/repos-iii/paraglide-real-apps/.real-apps/memos/baseline/mapping.json",
);
const require = createRequire("/root/repos-iii/paraglide-real-apps/benchmark/package.json");
const ts = require("typescript");
const mapping = JSON.parse(await fs.readFile(mappingPath, "utf8"));
const files = [
	"src/pages/SignIn.tsx",
	"src/components/AuthPageLayout.tsx",
	"src/components/PasswordSignInForm.tsx",
	"src/components/CredentialFields.tsx",
	"src/components/IdentityProviderButtons.tsx",
	"src/components/LocalePicker.tsx",
];
const used = new Set();
const transformed = [];

await fs.rm(path.join(webRoot, "src/paraglide"), { recursive: true, force: true });
await fs.cp(catalogRoot, path.join(webRoot, "src/paraglide"), { recursive: true });

for (const relativePath of files) {
	const filePath = path.join(webRoot, relativePath);
	const source = await fs.readFile(filePath, "utf8");
	const sourceFile = ts.createSourceFile(relativePath, source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
	const edits = [];
	const hookFiles = new Set();
	const visit = (node) => {
		if (
			ts.isCallExpression(node) &&
			ts.isIdentifier(node.expression) &&
			node.expression.text === "t" &&
			node.arguments.length >= 1 &&
			ts.isStringLiteralLike(node.arguments[0])
		) {
			const key = node.arguments[0].text;
			const messageId = mapping[key];
			if (!messageId) throw new Error(`${relativePath}: no compiler mapping for ${key}`);
			const input = node.arguments[1] ? source.slice(node.arguments[1].getStart(sourceFile), node.arguments[1].end) : "";
			const replacement = input ? `${messageId}(${input}, { locale })` : `${messageId}(undefined, { locale })`;
			edits.push({ start: node.getStart(sourceFile), end: node.end, replacement });
			used.add(messageId);
			hookFiles.add(relativePath);
		}
		ts.forEachChild(node, visit);
	};
	visit(sourceFile);

	let output = source;
	for (const edit of edits.sort((a, b) => b.start - a.start)) {
		output = output.slice(0, edit.start) + edit.replacement + output.slice(edit.end);
	}
	output = output
		.replace(/^import \{ useTranslate \} from "@\/utils\/i18n";\r?\n/m, "")
		.replace(/(import \{ [^\n]*?)\s*, useTranslate(,?[^\n]*?\} from "@\/utils\/i18n";)/, "$1$2");
	if (hookFiles.size > 0 && !relativePath.endsWith("LocalePicker.tsx")) {
		output = `import { useAuthParaglideLocale } from "@/auth-paraglide-locale";\n${output}`;
		output = output.replace(/\bconst t = useTranslate\(\);/, "const locale = useAuthParaglideLocale();");
	}
	if (relativePath.endsWith("LocalePicker.tsx")) {
		output = output.replace(/\s*const t = useTranslate\(\);\r?\n/, "\n");
		output = output.replace("  const { i18n } = useTranslation();", "  const { i18n } = useTranslation();\n  const locale = (i18n.resolvedLanguage || i18n.language) as Locale;");
	}
	if (edits.length > 0) {
		const specifiers = [...new Set(edits.map((edit) => edit.replacement.match(/^(k\d+)/)?.[1]).filter(Boolean))];
		output = `import { ${specifiers.join(", ")} } from "@/paraglide-auth-messages";\n${output}`;
	}
	await fs.writeFile(filePath, output);
	transformed.push({ file: relativePath, calls: edits.length });
}

const messageImports = [...used]
	.sort((a, b) => Number(a.slice(1)) - Number(b.slice(1)))
	.map((messageId) => `export { ${messageId} } from "./paraglide/messages/${messageId}.js";`)
	.join("\n");
await fs.writeFile(path.join(webRoot, "src/paraglide-auth-messages.ts"), `${messageImports}\n`);
await fs.writeFile(
	path.join(webRoot, "src/auth-paraglide-locale.ts"),
	'import { useTranslation } from "react-i18next";\n\nexport const useAuthParaglideLocale = (): Locale => {\n  const { i18n } = useTranslation();\n  return (i18n.resolvedLanguage || i18n.language) as Locale;\n};\n',
);

const i18nPath = path.join(webRoot, "src/i18n.ts");
let i18nSource = await fs.readFile(i18nPath, "utf8");
i18nSource = i18nSource.replace(
	"    const matchedLanguage = findNearestMatchedLanguage(language);",
	'    if (typeof window !== "undefined" && window.location.pathname.startsWith("/auth")) {\n      callback(null, {});\n      return;\n    }\n    const matchedLanguage = findNearestMatchedLanguage(language);',
);
await fs.writeFile(i18nPath, i18nSource);

const utilsPath = path.join(webRoot, "src/utils/i18n.ts");
let utilsSource = await fs.readFile(utilsPath, "utf8");
utilsSource = `import { setLocale as setParaglideLocale } from "@/paraglide/runtime.js";\n${utilsSource}`;
utilsSource = utilsSource.replace(
	"  applyDocumentLocale(validLocale);",
	"  applyDocumentLocale(validLocale);\n  void setParaglideLocale(validLocale, { reload: false });",
);
await fs.writeFile(utilsPath, utilsSource);

console.log(
	JSON.stringify(
		{
			appCommit: "a668bb8f7e3652be029459bc80bd3bffb86f0542",
			catalogPath: catalogRoot,
			keys: [...used].sort((a, b) => Number(a.slice(1)) - Number(b.slice(1))),
			transformed,
			limitations: [
				"This is a bounded /auth route experiment, not a whole-app migration.",
				"Only statically keyed translation calls in the listed auth route components are rewritten.",
				"The i18next backend remains for other routes and skips locale JSON imports only on /auth.",
				"Auth messages receive the current i18next locale through Paraglide's per-call locale option so React language updates are explicit.",
				"The standard Paraglide message modules include every locale for each retained key.",
				"i18next remains installed as the React language-change subscription and route-local locale state.",
			],
		},
		null,
		2,
	),
);
