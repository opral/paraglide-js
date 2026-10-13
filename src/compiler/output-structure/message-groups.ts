import type { ProjectSettings } from "@inlang/sdk";
import type { CompiledBundleWithMessages } from "../compile-bundle.js";
import { toSafeModuleId } from "../safe-module-id.js";
import { renderMessage, messageImports } from "./message-modules.js";
import { createDynamicFile } from "../create-dynamic.js";
export { messageReferenceExpression } from "./message-modules.js";

// Bound both source size and overfetch. A single large message stays intact.
const targetSourceBytes = 64 * 1024;
const maxMessages = 64;

export function generateOutput(
	bundles: CompiledBundleWithMessages[],
	settings: Pick<ProjectSettings, "locales" | "baseLocale">,
	fallbackMap: Record<string, string | undefined>,
	middleware = false
): Record<string, string> {
	const groups: Array<
		Array<{
			bundle: CompiledBundleWithMessages;
			index: number;
			rendered: ReturnType<typeof renderMessage>;
		}>
	> = [];
	let size = 0;
	for (const [index, bundle] of bundles.entries()) {
		const rendered = renderMessage(bundle, settings, fallbackMap);
		const bytes = Buffer.byteLength(
			rendered.code +
				rendered.inputType +
				JSON.stringify(bundle.bundle.node.id) +
				`export const _message${index} = /* @__PURE__ */ (() => {\n\nreturn ${bundle.bundleFunctionName ?? toSafeModuleId(bundle.bundle.node.id)};\n})();` +
				`[]: _message${index},`
		);
		let group = groups.at(-1);
		if (
			!group ||
			group.length >= maxMessages ||
			size + bytes > targetSourceBytes
		) {
			group = [];
			groups.push(group);
			size = Buffer.byteLength(
				messageImports(middleware, true) + "\n\nexport const messages = {};"
			);
		}
		group.push({ bundle, index, rendered });
		size += bytes;
	}
	const output: Record<string, string> = {};
	const exports: string[] = [];
	const boundaries: string[] = [];
	const filenames: string[] = [];
	for (const [index, group] of groups.entries()) {
		const filename = `group-${String(index).padStart(3, "0")}.js`;
		filenames.push(filename);
		boundaries.push(group[0]!.bundle.bundle.node.id);
		output[`messages/${filename}`] =
			messageImports(
				middleware,
				group.some((item) => item.rendered.usesRegistry)
			) +
			group.map((item) => item.rendered.inputType).join("") +
			group
				.map(
					({ bundle, index, rendered }) =>
						`export const _message${index} = /* @__PURE__ */ (() => {\n${rendered.code}\nreturn ${bundle.bundleFunctionName ?? toSafeModuleId(bundle.bundle.node.id)};\n})();`
				)
				.join("\n\n") +
			`\n\nexport const messages = {${group.map(({ bundle, index }) => `[${JSON.stringify(bundle.bundle.node.id)}]: _message${index}`).join(",")}};`;
		exports.push(
			...group.map(
				({ bundle, index }) =>
					`export { _message${index} as ${JSON.stringify(bundle.bundle.node.id)} } from './${filename}';`
			)
		);
	}
	output["messages/_index.js"] = exports.join("\n");
	output["dynamic.js"] = createDynamicFile(boundaries, filenames);
	return output;
}
