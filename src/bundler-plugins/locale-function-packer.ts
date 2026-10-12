import { parse } from "acorn";
import MagicString from "magic-string";

type AstNode = {
	type: string;
	start?: number;
	end?: number;
	[key: string]: unknown;
};

type ParentInfo = { parent: AstNode; key: string };

type FunctionCandidate = {
	name: string;
	locale: string;
	index: number;
	declaration: AstNode;
	declarationId: AstNode;
	declarationStart: number;
	declarationEnd: number;
	initializerEnd: number;
	value: string | undefined;
	directExport: boolean;
	invalid: boolean;
	calls: AstNode[];
};

type PackOptions = {
	fileName?: string;
	sourcemap?: boolean | "inline" | "hidden";
};

type SourceEdit = {
	start: number;
	end: number;
	content: string;
};

const LOCAL_FUNCTION_PREFIX = "__paraglide_locale_fn_";
// Measured Vite output shows the repeated call savings become reliable at 16
// helpers per locale. Smaller groups can regress compressed bytes and are
// often already simplified by Vite's minifier.
const MIN_LOCALE_FUNCTION_GROUP_SIZE = 16;

/**
 * Pack private generated helpers that only return static strings. Calls to
 * the helpers become reads from a locale-major array after tree shaking.
 */
export function packLocaleFunctionChunk(
	code: string,
	options: PackOptions = {}
): { code: string; map: ReturnType<MagicString["generateMap"]> | null } | null {
	if (!code.includes(LOCAL_FUNCTION_PREFIX)) return null;
	// Dynamic scope can observe private bindings. Bail before parsing large chunks.
	if (/\beval\s*\(/.test(code) || /\bwith\s*\(/.test(code)) return null;

	let program: AstNode;
	try {
		const parsed = parse(code, {
			ecmaVersion: "latest",
			sourceType: "module",
			allowHashBang: true,
		});
		if (!isNode(parsed) || parsed.type !== "Program") return null;
		program = parsed;
	} catch {
		return null;
	}

	const parents = new WeakMap<AstNode, ParentInfo>();
	const identifiers = new Set<string>();
	const candidates = collectFunctionCandidates(program, parents, identifiers);
	if (candidates.length === 0) return null;

	const candidatesByName = new Map<string, FunctionCandidate>();
	const indexesByLocale = new Map<string, FunctionCandidate[]>();
	for (const candidate of candidates) {
		if (candidatesByName.has(candidate.name)) {
			candidate.invalid = true;
			candidatesByName.get(candidate.name)!.invalid = true;
		}
		candidatesByName.set(candidate.name, candidate);
		const key = `${candidate.locale}\0${candidate.index}`;
		const sameIndex = indexesByLocale.get(key) ?? [];
		sameIndex.push(candidate);
		indexesByLocale.set(key, sameIndex);
	}
	for (const sameIndex of indexesByLocale.values()) {
		if (sameIndex.length > 1) {
			for (const candidate of sameIndex) candidate.invalid = true;
		}
	}

	let hasDynamicScope = false;
	walk(program, parents, (node, parentInfo) => {
		if (
			node.type === "WithStatement" ||
			(node.type === "CallExpression" &&
				isNode(node.callee) &&
				node.callee.type === "Identifier" &&
				node.callee.name === "eval")
		) {
			hasDynamicScope = true;
		}
		if (node.type !== "Identifier" || typeof node.name !== "string") return;
		identifiers.add(node.name);
		const candidate = candidatesByName.get(node.name);
		if (!candidate || node === candidate.declarationId) return;

		const call = parentInfo?.parent;
		if (
			!parentInfo ||
			call?.type !== "CallExpression" ||
			call.callee !== node ||
			call.optional === true ||
			(asArray(call.arguments) ?? []).some(
				(argument) => isNode(argument) && argument.type === "SpreadElement"
			)
		) {
			candidate.invalid = true;
			return;
		}
		candidate.calls.push(call);
	});
	if (hasDynamicScope) return null;
	markOuterCandidatesForNestedCalls(candidates, parents);

	const eligible = candidates.filter(
		(candidate) =>
			!candidate.invalid &&
			!candidate.directExport &&
			candidate.value !== undefined &&
			candidate.calls.length > 0 &&
			candidate.calls.every(
				(call) =>
					typeof call.start === "number" &&
					typeof call.end === "number" &&
					call.start >= candidate.declarationEnd &&
					!isInsideHoistedConsumer(call, parents)
			)
	);
	const groups = new Map<string, FunctionCandidate[]>();
	for (const candidate of eligible) {
		const group = groups.get(candidate.locale) ?? [];
		group.push(candidate);
		groups.set(candidate.locale, group);
	}
	for (const [locale, group] of groups) {
		if (
			group.length < MIN_LOCALE_FUNCTION_GROUP_SIZE ||
			new Set(group.map((candidate) => candidate.value)).size < 2
		) {
			groups.delete(locale);
			continue;
		}
		group.sort((left, right) => left.index - right.index);
	}
	if (groups.size === 0) return null;

	const source = new MagicString(code, { filename: options.fileName });
	const rowsByInsertionPoint = new Map<number, string[]>();
	const edits: SourceEdit[] = [];
	for (const [locale, group] of groups) {
		const rowName = allocateRowName(locale, identifiers);
		const row = `const ${rowName} = [${group.map((item) => JSON.stringify(item.value)).join(",")}];`;
		const insertionPoint = Math.min(
			...group.map((item) => item.declarationStart)
		);
		const rows = rowsByInsertionPoint.get(insertionPoint) ?? [];
		rows.push(row);
		rowsByInsertionPoint.set(insertionPoint, rows);

		for (const [slot, candidate] of group.entries()) {
			for (const call of candidate.calls) {
				const args = (asArray(call.arguments) ?? []).map((argument) => {
					if (
						!isNode(argument) ||
						typeof argument.start !== "number" ||
						typeof argument.end !== "number"
					) {
						return "";
					}
					return code.slice(argument.start, argument.end);
				});
				const result = `${rowName}[${slot}]`;
				const replacement = args.length
					? `(${args.join(",")},${result})`
					: result;
				edits.push({
					start: call.start!,
					end: call.end!,
					content: replacement,
				});
			}
			let declarationEnd = candidate.declaration.end!;
			if (code[declarationEnd] === ";") declarationEnd++;
			edits.push({
				start: candidate.declarationStart,
				end: declarationEnd,
				content: "",
			});
		}
	}

	// MagicString's split lookup benefits from edits in source order. Applying
	// thousands of declarations and call sites grouped by locale repeatedly
	// seeks backwards through the chunk and becomes quadratic on large catalogs.
	edits.sort((left, right) => left.start - right.start || left.end - right.end);
	let previousEnd = -1;
	for (const edit of edits) {
		if (edit.start < previousEnd) return null;
		previousEnd = edit.end;
		if (edit.content === "") source.remove(edit.start, edit.end);
		else source.overwrite(edit.start, edit.end, edit.content);
	}

	for (const [insertionPoint, rows] of rowsByInsertionPoint) {
		source.appendLeft(insertionPoint, `\n${rows.join("\n")}\n`);
	}
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

/**
 * Rewriting an outer call copies its argument source into the replacement so
 * argument side effects still run. If an argument also contains a candidate
 * helper call, that copied source would overlap the inner rewrite. Leave the
 * outer helper and its call alone; the nested helper can still be packed.
 */
function markOuterCandidatesForNestedCalls(
	candidates: FunctionCandidate[],
	parents: WeakMap<AstNode, ParentInfo>
): void {
	const candidateByCall = new Map<AstNode, FunctionCandidate>();
	for (const candidate of candidates) {
		for (const call of candidate.calls) candidateByCall.set(call, candidate);
	}

	for (const candidate of candidates) {
		for (const call of candidate.calls) {
			let current = call;
			let parentInfo = parents.get(current);
			while (parentInfo) {
				const ancestor = parentInfo.parent;
				const outerCandidate = candidateByCall.get(ancestor);
				if (outerCandidate && ancestor !== call) {
					outerCandidate.invalid = true;
				}
				current = ancestor;
				parentInfo = parents.get(current);
			}
		}
	}
}

function collectFunctionCandidates(
	program: AstNode,
	parents: WeakMap<AstNode, ParentInfo>,
	identifiers: Set<string>
): FunctionCandidate[] {
	const candidates: FunctionCandidate[] = [];
	for (const statementValue of asArray(program.body) ?? []) {
		if (!isNode(statementValue)) continue;
		const directExport = statementValue.type === "ExportNamedDeclaration";
		const declaration = directExport
			? statementValue.declaration
			: statementValue;
		if (!isNode(declaration) || declaration.type !== "VariableDeclaration")
			continue;
		const variableDeclarations = asArray(declaration.declarations) ?? [];
		for (const declarator of variableDeclarations) {
			if (!isNode(declarator)) continue;
			const id = declarator.id;
			if (
				!isNode(id) ||
				id.type !== "Identifier" ||
				typeof id.name !== "string"
			)
				continue;
			const encoded = decodeLocalName(id.name);
			if (!encoded) continue;
			identifiers.add(id.name);
			const initializer = declarator.init;
			const value = staticTextFromFunction(initializer);
			const statementStart = statementValue.start ?? declaration.start;
			if (
				typeof statementStart !== "number" ||
				typeof declaration.end !== "number"
			)
				continue;
			const initializerEnd =
				isNode(initializer) && typeof initializer.end === "number"
					? initializer.end
					: declaration.end;
			candidates.push({
				name: id.name,
				locale: encoded.locale,
				index: encoded.index,
				declaration,
				declarationId: id,
				declarationStart: statementStart,
				declarationEnd: declaration.end,
				initializerEnd,
				value,
				directExport,
				invalid: variableDeclarations.length !== 1,
				calls: [],
			});
		}
	}
	return candidates;
}

function staticTextFromFunction(value: unknown): string | undefined {
	if (!isNode(value) || value.type !== "ArrowFunctionExpression")
		return undefined;
	if (
		value.async === true ||
		value.generator === true ||
		(asArray(value.params) ?? []).length !== 0 ||
		!isNode(value.body) ||
		value.body.type !== "BlockStatement"
	) {
		return undefined;
	}
	const body = asArray(value.body.body) ?? [];
	if (
		body.length !== 1 ||
		!isNode(body[0]) ||
		body[0].type !== "ReturnStatement"
	) {
		return undefined;
	}
	const expression = body[0].argument;
	if (!isNode(expression)) return undefined;
	if (expression.type === "Literal" && typeof expression.value === "string") {
		return expression.value;
	}
	if (
		expression.type === "TemplateLiteral" &&
		(asArray(expression.expressions) ?? []).length === 0
	) {
		const quasis = asArray(expression.quasis) ?? [];
		if (quasis.length !== 1 || !isNode(quasis[0])) return undefined;
		const templateValue = quasis[0].value;
		if (typeof templateValue !== "object" || templateValue === null)
			return undefined;
		const cooked = "cooked" in templateValue ? templateValue.cooked : undefined;
		const raw = "raw" in templateValue ? templateValue.raw : undefined;
		return typeof cooked === "string"
			? cooked
			: typeof raw === "string"
				? raw
				: undefined;
	}
	return undefined;
}

function isInsideHoistedConsumer(
	call: AstNode,
	parents: WeakMap<AstNode, ParentInfo>
): boolean {
	let current = call;
	let info = parents.get(current);
	while (info) {
		const parent = info.parent;
		if (
			parent.type === "FunctionDeclaration" ||
			parent.type === "ClassDeclaration" ||
			parent.type === "ClassExpression"
		)
			return true;
		current = parent;
		info = parents.get(current);
	}
	return false;
}

function decodeLocalName(
	name: string
): { locale: string; index: number } | undefined {
	if (!name.startsWith(LOCAL_FUNCTION_PREFIX)) return undefined;
	const match = /^l(\d+)_((?:[0-9a-f]+(?:_[0-9a-f]+)*)|x)_n(\d+)$/.exec(
		name.slice(LOCAL_FUNCTION_PREFIX.length)
	);
	if (!match) return undefined;
	const expectedLength = Number(match[1]);
	const index = Number(match[3]);
	if (!Number.isSafeInteger(index)) return undefined;
	if (match[2] === "x")
		return expectedLength === 0 ? { locale: "", index } : undefined;
	const codePoints = match[2]!
		.split("_")
		.map((part) => Number.parseInt(part, 16));
	if (
		codePoints.length !== expectedLength ||
		codePoints.some((point) => point > 0x10ffff)
	)
		return undefined;
	try {
		return { locale: String.fromCodePoint(...codePoints), index };
	} catch {
		return undefined;
	}
}

function allocateRowName(locale: string, identifiers: Set<string>): string {
	const encoded =
		Array.from(locale, (character) =>
			character.codePointAt(0)!.toString(16)
		).join("_") || "x";
	const prefix = `__paraglide_packed_locale_l${Array.from(locale).length}_${encoded}`;
	let suffix = 0;
	let name = `${prefix}_${suffix}`;
	while (identifiers.has(name)) name = `${prefix}_${++suffix}`;
	identifiers.add(name);
	return name;
}

function walk(
	root: AstNode,
	parents: WeakMap<AstNode, ParentInfo>,
	visit: (node: AstNode, parentInfo?: ParentInfo) => void
): void {
	const seen = new Set<object>();
	const visitValue = (value: unknown, parentInfo?: ParentInfo): void => {
		if (Array.isArray(value)) {
			for (const item of value) visitValue(item, parentInfo);
			return;
		}
		if (!isNode(value) || seen.has(value)) return;
		seen.add(value);
		if (parentInfo) parents.set(value, parentInfo);
		visit(value, parentInfo);
		for (const [key, child] of Object.entries(value)) {
			if (["parent", "start", "end", "loc", "range"].includes(key)) continue;
			visitValue(child, { parent: value, key });
		}
	};
	visitValue(root);
}

function isNode(value: unknown): value is AstNode {
	return typeof value === "object" && value !== null && "type" in value;
}

function asArray(value: unknown): unknown[] | undefined {
	return Array.isArray(value) ? value : undefined;
}
