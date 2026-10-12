import fs from "node:fs";
import path from "node:path";
import { parse } from "espree";

function walk(node, visit) {
	if (!node || typeof node !== "object") return;
	visit(node);
	for (const [key, value] of Object.entries(node)) {
		if (["range", "loc", "tokens", "comments"].includes(key)) continue;
		if (Array.isArray(value)) value.forEach((child) => walk(child, visit));
		else if (value && typeof value === "object") walk(value, visit);
	}
}

function isTranslationCall(node) {
	const callee = node.callee;
	return (
		(callee.type === "Identifier" && callee.name === "t") ||
		(callee.type === "MemberExpression" &&
			!callee.computed &&
			callee.property.type === "Identifier" &&
			callee.property.name === "t" &&
			callee.object.type === "Identifier" &&
			["i18n", "i18next"].includes(callee.object.name))
	);
}

export function ntfyParaglideAdapter({ sourceRoot, generated, mappingPath }) {
	const mapping = JSON.parse(fs.readFileSync(mappingPath, "utf8"));
	return {
		name: "ntfy-paraglide-literal-call-adapter",
		enforce: "pre",
		transform(code, id) {
			const file = id.split("?")[0];
			if (
				!file.startsWith(`${sourceRoot}${path.sep}`) ||
				!/\.[jt]sx?$/.test(file) ||
				/\.(test|spec)\.[jt]sx?$/.test(file)
			)
				return;

			const ast = parse(code, {
				ecmaVersion: "latest",
				sourceType: "module",
				ecmaFeatures: { jsx: true },
				range: true,
			});
			const edits = [];
			const used = new Set();
			walk(ast, (node) => {
				if (node.type !== "CallExpression" || !isTranslationCall(node)) return;
				const keyNode = node.arguments[0];
				if (keyNode?.type !== "Literal" || typeof keyNode.value !== "string") return;
				const safeName = mapping[keyNode.value];
				if (!safeName) return; // i18next returns an unknown key unchanged.
				used.add(safeName);
				const args = node.arguments
					.slice(1)
					.map((arg) => code.slice(arg.range[0], arg.range[1]));
				edits.push({
					start: node.range[0],
					end: node.range[1],
					node,
					safeName,
				});
			});
			if (edits.length === 0) return;
			const imports = [...used]
				.sort((a, b) => Number(a.slice(1)) - Number(b.slice(1)))
				.map((name) => `\t${name} as __ntfy_${name},`)
				.join("\n");
			const callImport = `\tcallTranslation as __ntfy_call,`;
			const renderCall = (edit) => {
				const options = edit.node.arguments[1]
					? renderRange(edit.node.arguments[1].range[0], edit.node.arguments[1].range[1])
					: "{}";
				return `__ntfy_call(${JSON.stringify(edit.node.arguments[0].value)}, __ntfy_${edit.safeName}, ${options})`;
			};
			const renderRange = (start, end) => {
				const contained = edits.filter(
					(edit) => edit.start >= start && edit.end <= end,
				);
				const outermost = contained.filter(
					(edit) =>
						!contained.some(
							(parent) =>
								parent !== edit &&
								parent.start <= edit.start &&
								parent.end >= edit.end &&
								(parent.start < edit.start || parent.end > edit.end),
						),
				);
				let rendered = code.slice(start, end);
				outermost.sort((a, b) => b.start - a.start);
				for (const edit of outermost) {
					rendered =
						rendered.slice(0, edit.start - start) +
						renderCall(edit) +
						rendered.slice(edit.end - start);
				}
				return rendered;
			};
			const transformed = `import {\n${imports}\n} from ${JSON.stringify(path.join(generated, "messages.js"))};\nimport { ${callImport} } from ${JSON.stringify(path.resolve("src/benchmark-adapter/translation-inputs.js"))};\n${renderRange(0, code.length)}`;
			return { code: transformed, map: null };
		},
	};
}
