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
import {
	declarationShardTypes,
	declarationShardTypesImport,
	shardTypesModule,
} from "./output-structure/shard-types.js";
import { toSafeModuleId } from "./safe-module-id.js";

const localizedString =
	'export type LocalizedString = import("../runtime.js").LocalizedString;';

// How a message module declares the value of a message named "default".
const defaultValueExport =
	/^declare const [A-Za-z_$][\w$]*: [^\n]*\nexport \{ [A-Za-z_$][\w$]* as "default" \};\n/m;

/**
 * The barrel declaration of `message-modules`: the declarations of every message
 * module in one file, so TypeScript reads one file for `messages.js` instead of
 * one per message. The per-message files remain for direct imports. Like the
 * JavaScript barrel's `export *`, it leaves out the value of a message named
 * "default". Built from the message files so incremental output can rebuild it.
 */
export function messageModulesIndexDeclaration(
	output: Record<string, string>
): string {
	const defaultModule = `messages/${toSafeModuleId("default")}.d.ts`;
	const values: string[] = [];
	const types: string[] = [];
	for (const [name, code] of Object.entries(output)) {
		if (
			!name.startsWith("messages/") ||
			!name.endsWith(".d.ts") ||
			name === "messages/_index.d.ts"
		)
			continue;
		// A message module declares its value, then LocalizedString, then its types.
		const [value = "", type = ""] = code.split(`${localizedString}\n`);
		values.push(
			name === defaultModule ? value.replace(defaultValueExport, "") : value
		);
		types.push(type);
	}
	// Values first and types after: TypeScript builds the program for the same
	// declarations in about 40% less time than with each type after its value.
	return [...values, `${localizedString}\n`, ...types].join("");
}

/** Writes declarations from the same bundle and input metadata used by JavaScript generation. */
export function emitTsDeclarations(args: {
	compiledBundles: CompiledBundleWithMessages[];
	bundles: BundleNested[];
	settings: Pick<ProjectSettings, "locales">;
	fallbackMap: Record<string, string | undefined>;
	outputStructure: NonNullable<CompilerOptions["outputStructure"]>;
	messageModuleSize?: number;
}): Record<string, string> {
	const output: Record<string, string> = {
		"messages.d.ts":
			'export * from "./messages/_index.js";\nexport * as m from "./messages/_index.js";\n',
	};
	const options = `{ locale?: ${args.settings.locales.map((locale) => JSON.stringify(locale)).join(" | ") || "never"} }`;
	const declarations = args.compiledBundles.map((compiled, index) => {
		const bundle = args.bundles[index]!;
		const name = toSafeModuleId(bundle.id);
		const alias =
			compiled.inputTypeAliasName ?? toBundleInputTypeAliasName(name);
		const inputs = bundle.declarations.filter(
			(declaration) => declaration.type === "input-variable"
		);
		const parameters = `inputs${inputs.length === 0 ? "?" : ""}: ${alias}, options?: ${options}`;
		const call = `(${parameters}) => LocalizedString`;
		const parts =
			!compiled.usesSharedFactory && bundleHasMarkup(bundle)
				? ` & { parts: (${parameters}) => import("../runtime.js").MessagePart[] }`
				: "";
		const type =
			(args.messageModuleSize ?? 1) > 1 && !parts
				? `${inputs.length ? "__ParaglideMessage" : "__ParaglideOptionalMessage"}<${alias}>`
				: `(${call})${parts} & import("../runtime.js").MessageMetadata<${alias}, ${options}, ${buildMarkupSchemaType(bundle, compiled.matchTypes)}>`;
		const comment =
			compiled.englishMatchTableDoc ?? buildEnglishMatchTableDoc(bundle);
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
		const size = args.messageModuleSize ?? 1;
		const filenames: string[] = [];
		for (let start = 0; start < declarations.length; start += size) {
			const group = declarations.slice(start, start + size);
			const name = size === 1 ? group[0]!.name : `_shard_${filenames.length}`;
			filenames.push(name);
			output[`messages/${name}.d.ts`] =
				size === 1
					? [group[0]!.exported, localizedString, group[0]!.definition].join(
							"\n"
						) + "\n"
					: [
							declarationShardTypesImport,
							...group.map((d) => d.exported),
							localizedString,
							...group.map((d) => d.definition),
						].join("\n") + "\n";
		}
		if (size > 1)
			output[`messages/${shardTypesModule}.d.ts`] = declarationShardTypes(
				args.settings.locales
			);
		output["messages/_index.d.ts"] =
			size === 1
				? messageModulesIndexDeclaration(output)
				: [
						...filenames.map(
							(name) => `export * from ${JSON.stringify(`./${name}.js`)};`
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
