import MagicString from "magic-string";
import type {
	Node,
	Program,
	ImportSpecifier,
	MemberExpression,
	ObjectPattern,
} from "estree";

function walk(
	node: Node,
	visit: (node: Node, parent?: Node) => void,
	parent?: Node
) {
	visit(node, parent);
	for (const value of Object.values(node)) {
		if (Array.isArray(value)) {
			for (const child of value)
				if (child && typeof child === "object" && "type" in child)
					walk(child as Node, visit, node);
		} else if (value && typeof value === "object" && "type" in value) {
			walk(value as Node, visit, node);
		}
	}
}

const start = (node: Node) => (node as Node & { start: number }).start;
const end = (node: Node) => (node as Node & { end: number }).end;

/**
 * The name a property key spells: an identifier or a string, or, when computed,
 * a string literal or a template literal without expressions. Anything else is
 * not statically known.
 */
function propertyName(key: Node, computed: boolean): string | undefined {
	if (key.type === "Literal")
		return typeof key.value === "string" ? key.value : undefined;
	if (!computed) return key.type === "Identifier" ? key.name : undefined;
	if (key.type === "TemplateLiteral" && key.expressions.length === 0)
		return key.quasis[0]?.value.cooked ?? undefined;
	return undefined;
}

/**
 * The object pattern that reads `node` whole, as `const { key } = m` does. An
 * assignment counts only as a statement, where its value, `node` itself, is unused.
 */
function destructuringPattern(
	node: Node,
	parent: Node,
	owner: Node | undefined
): ObjectPattern | undefined {
	const target =
		parent.type === "VariableDeclarator" && parent.init === node
			? parent.id
			: (parent.type === "AssignmentExpression" &&
						parent.operator === "=" &&
						parent.right === node &&
						owner?.type === "ExpressionStatement") ||
				  (parent.type === "AssignmentPattern" && parent.right === node)
				? parent.left
				: undefined;
	return target?.type === "ObjectPattern" ? target : undefined;
}

/** Rewrite only verified public imports and unambiguous static namespace reads. */
export function rewriteVirtualMessageImports(args: {
	code: string;
	id: string;
	ast: Program;
	imports: ReadonlySet<string>;
	messages: ReadonlyMap<string, string>;
}) {
	const { code, id, ast, imports, messages } = args;
	const identifiers = new Set<string>();
	const parents = new Map<Node, Node>();
	let hasEval = false;
	walk(ast, (node, parent) => {
		if (parent) parents.set(node, parent);
		if (node.type === "Identifier") identifiers.add(node.name);
		if (
			node.type === "CallExpression" &&
			node.callee.type === "Identifier" &&
			node.callee.name === "eval"
		)
			hasEval = true;
	});
	// Direct eval can reference an import through a string. Its scope is opaque.
	if (hasEval) return null;
	const changes: [number, number, string][] = [];
	let rewritten = false;
	let serial = 0;
	const fresh = () => {
		let name: string;
		do {
			name = `__paraglide_message_${serial++}`;
		} while (identifiers.has(name));
		identifiers.add(name);
		return name;
	};
	const text = (node: Node) => code.slice(start(node), end(node));
	const addImport = (name: string, local: string, imports: string[]) =>
		imports.push(
			`import { ${JSON.stringify(name)} as ${local} } from ${JSON.stringify(messages.get(name))};`
		);
	for (const statement of ast.body) {
		if (
			statement.type !== "ImportDeclaration" ||
			typeof statement.source.value !== "string" ||
			!imports.has(statement.source.value)
		)
			continue;
		if (
			!statement.specifiers.length ||
			statement.specifiers.some((s) => s.type !== "ImportSpecifier")
		)
			continue;
		// Preserve imports with attributes/assertions rather than changing their semantics.
		const attributed = statement as typeof statement & {
			attributes?: unknown[];
			assertions?: unknown[];
		};
		if (attributed.attributes?.length || attributed.assertions?.length)
			continue;
		const keep: string[] = [];
		const replacements: string[] = [];
		for (const specifier of statement.specifiers as ImportSpecifier[]) {
			const imported =
				specifier.imported.type === "Identifier"
					? specifier.imported.name
					: String(specifier.imported.value);
			if (imported !== "m") {
				if (!messages.has(imported)) {
					keep.push(text(specifier));
					continue;
				}
				addImport(imported, specifier.local.name, replacements);
				continue;
			}
			const local = specifier.local.name;
			const references: { node: MemberExpression; name: string }[] = [];
			// `m` read by an object pattern, e.g. `const { key } = m`.
			const destructured: { node: Node; names: string[] }[] = [];
			let unsafe = false;
			walk(ast, (node, parent) => {
				if (node.type !== "Identifier" || node.name !== local || !parent)
					return;
				// The import's own binding is handled here, not by reference analysis.
				if (
					parent.type === "ImportSpecifier" &&
					statement.specifiers.includes(parent)
				)
					return;
				if (
					parent.type === "MemberExpression" &&
					parent.property === node &&
					!parent.computed
				)
					return;
				if (
					(parent.type === "Property" &&
						parent.key === node &&
						!parent.computed &&
						!parent.shorthand) ||
					(parent.type === "MethodDefinition" &&
						parent.key === node &&
						!parent.computed)
				)
					return;
				const pattern = destructuringPattern(node, parent, parents.get(parent));
				if (pattern) {
					const names: string[] = [];
					for (const property of pattern.properties) {
						const name =
							property.type === "Property"
								? propertyName(property.key, property.computed)
								: undefined;
						if (name === undefined || !messages.has(name)) {
							unsafe = true;
							return;
						}
						names.push(name);
					}
					destructured.push({ node, names });
					return;
				}
				if (
					parent.type !== "MemberExpression" ||
					parent.object !== node ||
					parent.optional
				) {
					unsafe = true;
					return;
				}
				const name = propertyName(parent.property, parent.computed);
				const owner = parents.get(parent);
				if (
					!name ||
					!messages.has(name) ||
					owner?.type === "ChainExpression" ||
					(owner?.type === "AssignmentExpression" && owner.left === parent) ||
					(owner?.type === "UnaryExpression" && owner.operator === "delete") ||
					owner?.type === "UpdateExpression" ||
					((owner?.type === "ForOfStatement" ||
						owner?.type === "ForInStatement") &&
						owner.left === parent)
				) {
					unsafe = true;
					return;
				}
				// Destructuring writes may nest the target below a pattern node.
				let ancestor: Node | undefined = parent;
				while (ancestor && ancestor !== statement) {
					if (
						ancestor.type === "AssignmentPattern" ||
						ancestor.type === "ArrayPattern" ||
						ancestor.type === "ObjectPattern"
					) {
						unsafe = true;
						return;
					}
					ancestor = parents.get(ancestor);
				}
				references.push({ node: parent, name });
			});
			if (unsafe || (!references.length && !destructured.length)) {
				keep.push(text(specifier));
				continue;
			}
			const locals = new Map<string, string>();
			const aliasOf = (name: string) => {
				let alias = locals.get(name);
				if (!alias) {
					alias = fresh();
					locals.set(name, alias);
					addImport(name, alias, replacements);
				}
				return alias;
			};
			for (const reference of references)
				changes.push([
					start(reference.node),
					end(reference.node),
					aliasOf(reference.name),
				]);
			// The pattern reads only these properties, so an object holding just
			// them gives it the same values as the namespace. Computed keys make
			// each one a data property, `__proto__` included.
			for (const reference of destructured)
				changes.push([
					start(reference.node),
					end(reference.node),
					`{ ${reference.names.map((name) => `[${JSON.stringify(name)}]: ${aliasOf(name)}`).join(", ")} }`,
				]);
		}
		if (!replacements.length) continue;
		rewritten = true;
		changes.push([
			start(statement),
			end(statement),
			[
				...replacements,
				...(keep.length
					? [
							`import { ${keep.join(", ")} } from ${JSON.stringify(statement.source.value)};`,
						]
					: []),
			].join("\n"),
		]);
	}
	if (!rewritten) return null;
	const result = new MagicString(code);
	for (const [from, to, replacement] of changes)
		result.overwrite(from, to, replacement);
	// Replacements stay at the original import position: dependency evaluation
	// order, directive prologues and hashbangs all retain their original order.
	return {
		code: result.toString(),
		map: result.generateMap({ hires: true, source: id, includeContent: true }),
	};
}
