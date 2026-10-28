import type { BundleNested, ProjectSettings } from "@inlang/sdk";
import {
	buildEnglishMatchTableDoc,
	buildMarkupSchemaType,
	bundleHasMarkup,
	toBundleInputTypeAliasName,
	type CompiledBundleWithMessages,
} from "./compile-bundle.js";
import type { CompilerOptions } from "./compiler-options.js";
import { inputsType } from "./jsdoc-types.js";
import { toSafeModuleId } from "./safe-module-id.js";

const localizedString =
	'export type LocalizedString = import("../runtime.js").LocalizedString;';

/** Writes declarations from the same bundle and input metadata used by JavaScript generation. */
export function emitTsDeclarations(args: {
	compiledBundles: CompiledBundleWithMessages[];
	bundles: BundleNested[];
	settings: Pick<ProjectSettings, "locales">;
	fallbackMap: Record<string, string | undefined>;
	outputStructure: NonNullable<CompilerOptions["outputStructure"]>;
}): Record<string, string> {
	const output: Record<string, string> = {
		"messages.d.ts":
			'export * from "./messages/_index.js";\nexport * as m from "./messages/_index.js";\n',
	};
	const declarations = args.compiledBundles.map((compiled, index) => {
		const bundle = args.bundles[index]!;
		const name = toSafeModuleId(bundle.id);
		const alias =
			compiled.inputTypeAliasName ?? toBundleInputTypeAliasName(name);
		const inputs = bundle.declarations.filter(
			(declaration) => declaration.type === "input-variable"
		);
		const options = `{ locale?: ${args.settings.locales.map((locale) => JSON.stringify(locale)).join(" | ") || "never"} }`;
		const parameters = `inputs${inputs.length === 0 ? "?" : ""}: ${alias}, options?: ${options}`;
		const call = `(${parameters}) => LocalizedString`;
		const parts = bundleHasMarkup(bundle)
			? ` & { parts: (${parameters}) => import("../runtime.js").MessagePart[] }`
			: "";
		const schema = buildMarkupSchemaType(bundle, compiled.matchTypes);
		const type = `(${call})${parts} & import("../runtime.js").MessageMetadata<${alias}, ${options}, ${schema}>`;
		const comment = buildEnglishMatchTableDoc(bundle);
		const exported =
			name === bundle.id
				? `export const ${name}: ${type};`
				: `declare const ${name}: ${type};\nexport { ${name} as ${JSON.stringify(bundle.id)} };`;
		return {
			bundle,
			name,
			alias,
			definition: `export type ${alias} = ${inputsType(inputs, compiled.matchTypes)};`,
			exported: `${comment ? `/**\n${comment}\n*/\n` : ""}${exported}`,
		};
	});

	if (args.outputStructure === "message-modules") {
		if (declarations.length === 0) {
			output["messages.d.ts"] = "export {};\n";
			output["messages/_index.d.ts"] =
				localizedString.replace("export ", "") + "\n";
			return output;
		}
		for (const declaration of declarations) {
			output[`messages/${declaration.name}.d.ts`] =
				[declaration.exported, localizedString, declaration.definition].join(
					"\n"
				) + "\n";
		}
		output["messages/_index.d.ts"] =
			[
				...declarations.map(
					({ name }) => `export * from ${JSON.stringify(`./${name}.js`)};`
				),
				localizedString,
			].join("\n") + "\n";
		return output;
	}

	output["messages/_index.d.ts"] =
		[
			...declarations.map(({ exported }) => exported),
			localizedString,
			...declarations.map(({ definition }) => definition),
		].join("\n") + "\n";
	for (const locale of args.settings.locales) {
		const contents: string[] = [];
		let needsTypes = false;
		for (const { bundle, name, alias } of declarations) {
			const message = bundle.messages.find(
				(message) => message.locale === locale
			);
			const fallback = args.fallbackMap[locale];
			if (!message && fallback) {
				contents.push(
					`export { ${name} } from ${JSON.stringify(`./${fallback}.js`)};`
				);
				continue;
			}
			needsTypes = true;
			const call = `(inputs: ${alias}) => LocalizedString`;
			const hasParts = message?.variants.some((variant) =>
				variant.pattern.some(
					(part) =>
						part.type === "markup-start" ||
						part.type === "markup-end" ||
						part.type === "markup-standalone"
				)
			);
			const type = hasParts
				? `(${call}) & { parts: (inputs: ${alias}) => import("../runtime.js").MessagePart[] }`
				: call;
			contents.push(`export const ${name}: ${type};`);
		}
		if (needsTypes) {
			contents.push(localizedString);
			const seen = new Set<string>();
			for (const { alias, definition } of declarations) {
				if (!seen.has(alias)) contents.push(definition);
				seen.add(alias);
			}
		}
		output[`messages/${locale}.d.ts`] =
			contents.join("\n") + (contents.length ? "\n" : "");
	}
	return output;
}
