import type {
	Bundle,
	BundleNested,
	Message,
	ProjectSettings,
} from "@inlang/sdk";
import { compileMessage } from "./compile-message.js";
import type { Compiled } from "./types.js";
import {
	jsDocBundleFunctionTypes,
	type InputMatchTypes,
} from "./jsdoc-types.js";
import { toSafeModuleId } from "./safe-module-id.js";
import { escapeForDoubleQuoteString } from "../services/codegen/escape.js";

export type CompiledBundleWithMessages = {
	/** The compilation result for the bundle index */
	bundle: Compiled<Bundle>;
	/** The compilation results for the languages */
	messages: {
		[locale: string]: Compiled<Message>;
	};
	/** Match literal types inferred from bundle variants */
	matchTypes: InputMatchTypes;
};

/**
 * Compiles all the messages in the bundle and returns an index-function + each compiled message
 */
export const compileBundle = (args: {
	bundle: BundleNested;
	fallbackMap: Record<string, string | undefined>;
	messageReferenceExpression: (locale: string, bundleId: string) => string;
	settings?: ProjectSettings;
}): CompiledBundleWithMessages => {
	const compiledMessages: Record<string, Compiled<Message>> = {};
	const matchTypes = collectInputMatchTypes(args.bundle);

	for (const message of args.bundle.messages) {
		if (compiledMessages[message.locale]) {
			throw new Error(`Duplicate locale: ${message.locale}`);
		}

		const compiledMessage = compileMessage(
			args.bundle.declarations,
			message,
			message.variants,
			matchTypes
		);

		// set the pattern for the language tag
		compiledMessages[message.locale] = compiledMessage;
	}

	return {
		bundle: compileBundleFunction({
			bundle: args.bundle,
			availableLocales: Object.keys(args.fallbackMap),
			messageReferenceExpression: args.messageReferenceExpression,
			settings: args.settings,
			matchTypes,
		}),
		messages: compiledMessages,
		matchTypes,
	};
};

const compileBundleFunction = (args: {
	/**
	 * The bundle to compile
	 */
	bundle: BundleNested;
	/**
	 * The language tags which are available
	 */
	availableLocales: string[];
	/**
	 * The message reference expression
	 */
	messageReferenceExpression: (locale: string, bundleId: string) => string;
	/**
	 * The project settings
	 */
	settings?: ProjectSettings;
	/**
	 * Match literal types inferred from bundle variants
	 */
	matchTypes: InputMatchTypes;
}): Compiled<Bundle> => {
	const inputs = args.bundle.declarations.filter(
		(decl) => decl.type === "input-variable"
	);
	const hasInputs = inputs.length > 0;
	const safeBundleId = toSafeModuleId(args.bundle.id);

	const isSafeBundleId = safeBundleId === args.bundle.id;

	const isFullyTranslated =
		args.availableLocales.length === args.settings?.locales.length;

	let code = `/**
* This function has been compiled by [Paraglide JS](https://inlang.com/m/gerre34r).
*
* - Changing this function will be over-written by the next build.
*
* - If you want to change the translations, you can either edit the source files e.g. \`en.json\`, or
* use another inlang app like [Fink](https://inlang.com/m/tdozzpar) or the [VSCode extension Sherlock](https://inlang.com/m/r7kp499g).
* ${jsDocBundleFunctionTypes({
		inputs,
		locales: args.availableLocales,
		matchTypes: args.matchTypes,
	})}
*/
/* @__NO_SIDE_EFFECTS__ */
${isSafeBundleId ? "export " : ""}const ${safeBundleId} = (inputs${hasInputs ? "" : " = {}"}, options = {}) => {
	if (experimentalMiddlewareLocaleSplitting && isServer === false) {
		return /** @type {any} */ (globalThis).__paraglide_ssr.${safeBundleId}(inputs) 
	}
	const locale = experimentalStaticLocale ?? options.locale ?? getLocale()
	trackMessageCall("${safeBundleId}", locale)
	${args.availableLocales
		.map(
			(locale, index) =>
				`${index > 0 ? "	" : ""}${!isFullyTranslated || index < args.availableLocales.length - 1 ? `if (locale === "${locale}") ` : ""}return ${args.messageReferenceExpression(locale, args.bundle.id)}(inputs)`
		)
		.join(
			"\n"
		)}${!isFullyTranslated ? `\n	return /** @type {LocalizedString} */ ("${args.bundle.id}")` : ""}
};`;

	if (isSafeBundleId === false) {
		code += `\nexport { ${safeBundleId} as "${escapeForDoubleQuoteString(args.bundle.id)}" }`;
	}

	return {
		code,
		node: args.bundle,
	};
};

function collectInputMatchTypes(bundle: BundleNested): InputMatchTypes {
	const inputNames = new Set(
		bundle.declarations
			?.filter((decl) => decl.type === "input-variable")
			.map((decl) => decl.name) ?? []
	);
	const matchTypes: InputMatchTypes = new Map();

	const ensureInfo = (name: string) => {
		const existing = matchTypes.get(name);
		if (existing) return existing;
		const created = { literals: new Set<string>(), hasCatchAll: false };
		matchTypes.set(name, created);
		return created;
	};

	for (const message of bundle.messages) {
		for (const variant of message.variants) {
			for (const match of variant.matches ?? []) {
				if (!inputNames.has(match.key)) continue;
				const info = ensureInfo(match.key);
				if (match.type === "catchall-match") {
					info.hasCatchAll = true;
					continue;
				}
				if (match.type === "literal-match") {
					info.literals.add(match.value);
				}
			}
		}
	}

	return matchTypes;
}
