import fs from "node:fs";
import path from "node:path";
import * as espree from "espree";

const dynamicKeys = [
	"ask_on_discord",
	"auto_arrange",
	"auto_connect_fk",
	"autosave",
	"clear",
	"clear_cache",
	"configure_custom_types",
	"copy",
	"copy_as_image",
	"cut",
	"dark",
	"dbml_view",
	"default",
	"delete",
	"delete_diagram",
	"docs",
	"duplicate",
	"edit",
	"exit",
	"export_as",
	"export_saved_data",
	"export_source",
	"field_details",
	"file",
	"flush_storage",
	"force_hide",
	"fullscreen",
	"header",
	"help",
	"hide",
	"import_from",
	"import_from_source",
	"issues",
	"language",
	"light",
	"many_to_one",
	"new",
	"new_window",
	"one_to_many",
	"one_to_one",
	"open",
	"open_recent",
	"paste",
	"presentation_mode",
	"redo",
	"rename",
	"report_bug",
	"reset_view",
	"save",
	"save_as",
	"save_as_template",
	"settings",
	"shortcuts",
	"show_cardinality",
	"show_comments",
	"show_datatype",
	"show_debug_coordinates",
	"show_grid",
	"show_relationship_labels",
	"show_timeline",
	"sidebar",
	"snap_to_grid",
	"strict_mode",
	"theme",
	"toolbar",
	"undo",
	"view",
	"zoom_in",
	"zoom_out",
];

const virtualDynamicId = "virtual:drawdb-paraglide-dynamic-translations";
const resolvedVirtualDynamicId = `\0${virtualDynamicId}`;

function isTranslationCall(node) {
	const callee = node.callee;
	return (
		(callee.type === "Identifier" && callee.name === "t") ||
		(callee.type === "MemberExpression" &&
			!callee.computed &&
			callee.object.type === "Identifier" &&
			callee.object.name === "i18n" &&
			callee.property.name === "t")
	);
}

function walk(node, visit) {
	if (!node || typeof node !== "object") return;
	visit(node);
	for (const [key, value] of Object.entries(node)) {
		if (
			key === "range" ||
			key === "loc" ||
			key === "tokens" ||
			key === "comments"
		)
			continue;
		if (Array.isArray(value)) value.forEach((child) => walk(child, visit));
		else if (value && typeof value === "object") walk(value, visit);
	}
}

export function paraglideAdapter() {
	const root = process.cwd();
	const sourceRoot = path.join(root, "src");
	const outputDir = path.resolve(
		root,
		process.env.PARAGLIDE_OUTPUT ??
			"../paraglide-real-apps/.real-apps/drawdb/baseline/paraglide"
	);
	const mappingPath = path.resolve(
		root,
		process.env.PARAGLIDE_MAPPING ??
			"../paraglide-real-apps/.real-apps/drawdb/baseline/mapping.json"
	);
	const mapping = JSON.parse(fs.readFileSync(mappingPath, "utf8"));
	const dynamicMapping = Object.fromEntries(
		dynamicKeys.map((key) => {
			const messageId = mapping[key];
			if (!messageId)
				throw new Error(`Missing Paraglide mapping for dynamic key ${key}`);
			return [key, messageId];
		})
	);

	return {
		name: "drawdb-paraglide-adapter",
		enforce: "pre",
		resolveId(id) {
			if (id === virtualDynamicId) return resolvedVirtualDynamicId;
		},
		load(id) {
			if (id !== resolvedVirtualDynamicId) return;
			const ids = [...new Set(Object.values(dynamicMapping))];
			const imports = ids
				.map((messageId) => `  ${messageId} as ${messageId},`)
				.join("\n");
			const entries = Object.entries(dynamicMapping)
				.map(([key, messageId]) => `  ${JSON.stringify(key)}: ${messageId},`)
				.join("\n");
			return `import {\n${imports}\n} from '@paraglide/messages.js'\nexport const dynamicTranslations = {\n${entries}\n}\n`;
		},
		transform(code, id) {
			const file = id.split("?")[0];
			if (
				!file.startsWith(`${sourceRoot}${path.sep}`) ||
				!/\.[jt]sx?$/.test(file)
			)
				return;

			const ast = espree.parse(code, {
				ecmaVersion: "latest",
				sourceType: "module",
				ecmaFeatures: { jsx: true },
				range: true,
			});
			const edits = [];
			const usedIds = new Set();

			walk(ast, (node) => {
				if (node.type !== "CallExpression" || !isTranslationCall(node)) return;
				const keyNode = node.arguments[0];
				if (keyNode?.type !== "Literal" || typeof keyNode.value !== "string")
					return;

				const messageId = mapping[keyNode.value];
				if (!messageId) {
					throw new Error(
						`Missing Paraglide mapping for literal key ${JSON.stringify(keyNode.value)} in ${file}`
					);
				}
				usedIds.add(messageId);
				const args = node.arguments
					.slice(1)
					.map((arg) => code.slice(arg.range[0], arg.range[1]));
				edits.push({
					start: node.range[0],
					end: node.range[1],
					value: `__drawdb_${messageId}(${args.join(", ")})`,
				});
			});

			if (edits.length === 0) return;
			const imports = [...usedIds]
				.sort((a, b) => Number(a.slice(1)) - Number(b.slice(1)))
				.map((messageId) => `  ${messageId} as __drawdb_${messageId},`)
				.join("\n");
			edits.sort((a, b) => b.start - a.start);
			let transformed = code;
			for (const edit of edits) {
				transformed =
					transformed.slice(0, edit.start) +
					edit.value +
					transformed.slice(edit.end);
			}
			transformed = `import {\n${imports}\n} from '@paraglide/messages.js'\n${transformed}`;
			return { code: transformed, map: null };
		},
	};
}
