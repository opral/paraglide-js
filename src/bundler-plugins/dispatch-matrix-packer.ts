import { parse } from "acorn";
import MagicString from "magic-string";
import {
	decodeViteDispatchMarker,
	VITE_DISPATCH_PREFIX,
} from "../compiler/vite-dispatch-marker.js";

type Node = {
	type: string;
	start: number;
	end: number;
	[key: string]: unknown;
};
type Dispatcher = {
	body: Node;
	firstBranch: Node;
	marker: string;
	locales: string[];
	texts: string[];
};
type Options = { fileName?: string; sourcemap?: boolean | "inline" | "hidden" };
const node = (value: unknown): value is Node =>
	typeof value === "object" &&
	value !== null &&
	"type" in value &&
	typeof value.type === "string" &&
	"start" in value &&
	typeof value.start === "number" &&
	"end" in value &&
	typeof value.end === "number";
const nodes = (value: unknown): Node[] =>
	Array.isArray(value) ? value.filter(node) : [];

/** Pack fully static compiler-owned dispatchers after Vite removes unused messages. */
export function packDispatchMatrixChunk(
	code: string,
	options: Options = {}
): { code: string; map: ReturnType<MagicString["generateMap"]> | null } | null {
	if (!code.includes(VITE_DISPATCH_PREFIX)) return null;
	let program: Node;
	try {
		const parsed = parse(code, {
			ecmaVersion: "latest",
			sourceType: "module",
			allowHashBang: true,
		});
		if (!node(parsed)) return null;
		program = parsed;
	} catch {
		return null;
	}
	const identifiers = new Set<string>();
	let dynamicScope = false;
	walk(program, (current) => {
		if (current.type === "Identifier" && typeof current.name === "string")
			identifiers.add(current.name);
		if (
			current.type === "WithStatement" ||
			(current.type === "CallExpression" &&
				node(current.callee) &&
				current.callee.type === "Identifier" &&
				current.callee.name === "eval")
		)
			dynamicScope = true;
	});
	if (dynamicScope) return null;
	const groups = new Map<string, Dispatcher[]>();
	for (const statement of nodes(program.body)) {
		const declaration =
			statement.type === "ExportNamedDeclaration"
				? statement.declaration
				: statement;
		if (!node(declaration) || declaration.type !== "VariableDeclaration")
			continue;
		for (const binding of nodes(declaration.declarations)) {
			const dispatcher = readDispatcher(binding.init);
			if (!dispatcher) continue;
			const key = JSON.stringify(dispatcher.locales);
			const group = groups.get(key) ?? [];
			group.push(dispatcher);
			groups.set(key, group);
		}
	}
	const source = new MagicString(code, { filename: options.fileName });
	const declarations: string[] = [];
	const edits: { start: number; end: number; text: string }[] = [];
	let suffix = 0;
	const allocate = (prefix: string) => {
		let name;
		do {
			name = `${prefix}${suffix++}`;
		} while (identifiers.has(name));
		identifiers.add(name);
		return name;
	};
	for (const group of groups.values()) {
		// Small graphs are already efficiently simplified by Vite. Identical
		// messages do not justify retaining a shared selector and matrix.
		if (
			group.length < 32 ||
			group[0]!.locales.length < 8 ||
			!group[0]!.locales.some(
				(_, index) => new Set(group.map((item) => item.texts[index])).size > 1
			)
		)
			continue;
		const locales = group[0]!.locales;
		const matrixName = allocate("__paraglide_dispatch_matrix_");
		const selectName = allocate("__paraglide_dispatch_select_");
		declarations.push(
			`const ${matrixName} = ${JSON.stringify(locales.map((_, index) => group.map((item) => item.texts[index])))};`
		);
		// A switch preserves strict equality, including unknown strings, symbols
		// and objects. A property lookup would coerce options.locale and expose
		// inherited property names such as constructor and __proto__.
		declarations.push(
			`const ${selectName} = locale => { switch (locale) { ${locales
				.slice(1)
				.map(
					(locale, index) =>
						`case ${JSON.stringify(locale)}: return ${index + 1};`
				)
				.join(" ")} default: return 0; } };`
		);
		for (const [slot, item] of group.entries())
			edits.push({
				start: item.firstBranch.start,
				end: item.body.end - 1,
				text: `return ${matrixName}[${selectName}(${item.marker})][${slot}];\n`,
			});
	}
	if (declarations.length === 0) return null;
	edits.sort((left, right) => left.start - right.start);
	let previousEnd = -1;
	for (const edit of edits) {
		if (edit.start < previousEnd) return null;
		previousEnd = edit.end;
		source.overwrite(edit.start, edit.end, edit.text);
	}
	const statements = nodes(program.body);
	let insertion = statements[0]?.start ?? 0;
	for (const statement of statements) {
		if (
			statement.type !== "ExpressionStatement" ||
			typeof statement.directive !== "string"
		)
			break;
		insertion = statement.end;
	}
	// Keep hashbangs and directive prologues intact. Literal-only tables have
	// no evaluation effects and initialize before any retained const arrow.
	source.appendLeft(insertion, `\n${declarations.join("\n")}\n`);
	return {
		code: source.toString(),
		map: options.sourcemap
			? source.generateMap({
					file: options.fileName,
					includeContent: true,
					hires: true,
				})
			: null,
	};
}

function readDispatcher(value: unknown): Dispatcher | undefined {
	if (
		!node(value) ||
		value.type !== "ArrowFunctionExpression" ||
		value.async === true ||
		value.generator === true ||
		!node(value.body) ||
		value.body.type !== "BlockStatement"
	)
		return undefined;
	const body = nodes(value.body.body);
	const firstBranchIndex = body.findIndex(
		(item) => item.type === "IfStatement"
	);
	if (firstBranchIndex < 1) return undefined;
	let marker: string | undefined;
	let baseLocale: string | undefined;
	for (const statement of body.slice(0, firstBranchIndex)) {
		if (
			statement.type === "ExpressionStatement" &&
			node(statement.expression) &&
			statement.expression.type === "UnaryExpression" &&
			statement.expression.operator === "void" &&
			node(statement.expression.argument) &&
			statement.expression.argument.type === "Identifier" &&
			statement.expression.argument.name === "inputs"
		)
			continue;
		if (marker !== undefined || statement.type !== "VariableDeclaration")
			return undefined;
		const bindings = nodes(statement.declarations);
		if (
			bindings.length !== 1 ||
			!node(bindings[0]!.id) ||
			bindings[0]!.id.type !== "Identifier" ||
			typeof bindings[0]!.id.name !== "string" ||
			!node(bindings[0]!.init)
		)
			return undefined;
		marker = bindings[0]!.id.name;
		baseLocale = decodeViteDispatchMarker(marker);
		if (baseLocale === undefined) return undefined;
	}
	if (marker === undefined || baseLocale === undefined) return undefined;
	const tail = body.slice(firstBranchIndex);
	const last = tail.pop();
	const baseText = returnText(last);
	if (baseText === undefined) return undefined;
	const locales = [baseLocale],
		texts = [baseText];
	for (const statement of tail) {
		if (
			statement.type !== "IfStatement" ||
			statement.alternate !== null ||
			!node(statement.test) ||
			statement.test.type !== "BinaryExpression" ||
			statement.test.operator !== "===" ||
			!node(statement.test.left) ||
			statement.test.left.type !== "Identifier" ||
			statement.test.left.name !== marker ||
			!node(statement.test.right) ||
			statement.test.right.type !== "Literal" ||
			typeof statement.test.right.value !== "string"
		)
			return undefined;
		const locale = statement.test.right.value;
		const text = returnText(statement.consequent);
		if (text === undefined || locales.includes(locale)) return undefined;
		locales.push(locale);
		texts.push(text);
	}
	return {
		body: value.body,
		firstBranch: body[firstBranchIndex]!,
		marker,
		locales,
		texts,
	};
}

function returnText(value: unknown): string | undefined {
	if (!node(value) || value.type !== "ReturnStatement" || !node(value.argument))
		return undefined;
	return value.argument.type === "Literal" &&
		typeof value.argument.value === "string"
		? value.argument.value
		: undefined;
}

function walk(value: unknown, visit: (current: Node) => void): void {
	if (!node(value)) return;
	visit(value);
	for (const child of Object.values(value)) {
		if (Array.isArray(child)) for (const item of child) walk(item, visit);
		else walk(child, visit);
	}
}
