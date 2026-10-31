/**
 * Turns an unsafe module id like `helloWorld🍌` into a safe one like `helloworld__`.
 *
 * Mainly exists to support https://github.com/opral/inlang-paraglide-js/issues/285
 */
export function toSafeModuleId(id: string): string {
	// Most catalog keys already are module identifiers. Avoid a lowercase copy,
	// replacement, and per-character uppercase scan for that common case.
	if (
		typeof id === "string" &&
		/^[a-z_][a-z0-9_]*$/.test(id) &&
		!reservedJsKeywords.includes(id)
	) {
		return id;
	}
	const result = id.toLowerCase().replace(/[^a-z0-9_]/g, "_");

	const startsWithNumber = result[0]?.match(/[0-9]/);

	if (startsWithNumber) {
		return "_" + result;
	} else if (reservedJsKeywords.includes(result)) {
		return "_" + result;
	}

	let numUppercase = 0;
	for (const char of id) {
		if (char.match(/[A-Z]/)) {
			numUppercase++;
		}
	}

	return result + (numUppercase > 0 ? `${numUppercase}` : "");
}

export function isSafeModuleId(id: string): boolean {
	return toSafeModuleId(id) === id;
}

/**
 * Gives each id its module id: its `toSafeModuleId()`, unless another id or a
 * reserved name has the same one. Then each id that is not that module id
 * itself gets `escapeIdentifier(id)`, which depends on the id alone, so adding
 * or removing an id moves only the ids that share its safe module id.
 *
 * `eval` and `arguments` are always reserved: a module cannot declare them.
 *
 * @example
 *   allocateModuleIds(["a.b", "a_b", "_index"], new Set(["_index"]))
 *   // Map { "a.b" => "$a$2e$b", "a_b" => "a_b", "_index" => "$_index" }
 */
export function allocateModuleIds(
	ids: Iterable<string>,
	reserved: ReadonlySet<string>
): Map<string, string> {
	const safeIds = new Map<string, string>();
	const idsBySafeId = new Map<string, number>();
	for (const id of ids) {
		const safeId = toSafeModuleId(id);
		safeIds.set(id, safeId);
		idsBySafeId.set(safeId, (idsBySafeId.get(safeId) ?? 0) + 1);
	}
	const moduleIds = new Map<string, string>();
	for (const [id, safeId] of safeIds) {
		const keeps =
			!reserved.has(safeId) &&
			!unbindableNames.has(safeId) &&
			(id === safeId || idsBySafeId.get(safeId) === 1);
		moduleIds.set(id, keeps ? safeId : escapeIdentifier(id));
	}
	return moduleIds;
}

const unbindableNames = new Set(["eval", "arguments"]);

/**
 * `$` and the text, with every character other than a lowercase ASCII letter,
 * a digit or `_` written as its UTF-16 code in hex between two `$`.
 *
 * Distinct texts give distinct identifiers, which are also distinct file names
 * on case-insensitive file systems. Safe module ids contain no `$`, so none is
 * an escaped identifier.
 *
 * @example
 *   escapeIdentifier("a.b") // "$a$2e$b"
 */
export function escapeIdentifier(text: string): string {
	return (
		"$" +
		text.replace(
			/[^a-z0-9_]/g,
			(character) => `$${character.charCodeAt(0).toString(16)}$`
		)
	);
}

/**
 * Whether a binding generated code declares must avoid the name: the words
 * strict-mode code reserves, `eval`, `arguments` and `then`.
 */
export function isReservedBindingName(name: string): boolean {
	return reservedJsKeywords.includes(name) || unbindableNames.has(name);
}

const reservedJsKeywords = [
	"break",
	"case",
	"catch",
	"class",
	"const",
	"continue",
	"debugger",
	"default",
	"delete",
	"do",
	"else",
	"export",
	"extends",
	"false",
	"finally",
	"for",
	"function",
	"if",
	"import",
	"in",
	"instanceof",
	"new",
	"null",
	"return",
	"super",
	"switch",
	"this",
	"throw",
	"true",
	"try",
	"typeof",
	"var",
	"void",
	"while",
	"with",

	//Strict mode reserved keywords
	"let",
	"static",
	"yield",
	"await",

	//Reserved keywords for future use
	"enum",
	"implements",
	"interface",
	"package",
	"private",
	"protected",
	"public",

	// https://github.com/opral/inlang-paraglide-js/issues/331
	"then",
];
