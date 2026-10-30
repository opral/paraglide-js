import MagicString from "magic-string";
import type { Node, Program, ImportSpecifier, MemberExpression } from "estree";

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
 * Local names of Vue's `unref`, imported from "vue" and never redeclared or
 * used other than as a call. `unref(x)` returns `x.value` when `x.__v_isRef` is
 * strictly `true` and `x` otherwise. The properties of `m` are message exports,
 * which are functions, so none of them is `true` and `unref(m)` is `m`.
 */
function vueUnrefBindings(ast: Program): Set<string> {
	const names = new Set<string>();
	for (const statement of ast.body)
		if (
			statement.type === "ImportDeclaration" &&
			statement.source.value === "vue"
		)
			for (const specifier of statement.specifiers)
				if (
					specifier.type === "ImportSpecifier" &&
					specifier.imported.type === "Identifier" &&
					specifier.imported.name === "unref"
				)
					names.add(specifier.local.name);
	walk(ast, (node, parent) => {
		if (
			node.type === "Identifier" &&
			names.has(node.name) &&
			parent?.type !== "ImportSpecifier" &&
			!(parent?.type === "CallExpression" && parent.callee === node)
		)
			names.delete(node.name);
	});
	return names;
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
	const unrefs = vueUnrefBindings(ast);
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
				// Compiled Vue templates read imports as `_unref(m).key`; that call
				// returns `m` itself (see vueUnrefBindings).
				const read =
					parent.type === "CallExpression" &&
					!parent.optional &&
					parent.callee.type === "Identifier" &&
					unrefs.has(parent.callee.name) &&
					parent.arguments.length === 1 &&
					parent.arguments[0] === node
						? parent
						: node;
				const member = read === node ? parent : parents.get(read);
				if (
					member?.type !== "MemberExpression" ||
					member.object !== read ||
					member.optional
				) {
					unsafe = true;
					return;
				}
				const name =
					!member.computed && member.property.type === "Identifier"
						? member.property.name
						: member.computed &&
							  member.property.type === "Literal" &&
							  typeof member.property.value === "string"
							? member.property.value
							: undefined;
				const owner = parents.get(member);
				if (
					!name ||
					!messages.has(name) ||
					owner?.type === "ChainExpression" ||
					(owner?.type === "AssignmentExpression" && owner.left === member) ||
					(owner?.type === "UnaryExpression" && owner.operator === "delete") ||
					owner?.type === "UpdateExpression" ||
					((owner?.type === "ForOfStatement" ||
						owner?.type === "ForInStatement") &&
						owner.left === member)
				) {
					unsafe = true;
					return;
				}
				// Destructuring writes may nest the target below a pattern node.
				let ancestor: Node | undefined = member;
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
				references.push({ node: member, name });
			});
			if (unsafe || !references.length) {
				keep.push(text(specifier));
				continue;
			}
			const locals = new Map<string, string>();
			for (const reference of references) {
				let alias = locals.get(reference.name);
				if (!alias) {
					alias = fresh();
					locals.set(reference.name, alias);
					addImport(reference.name, alias, replacements);
				}
				changes.push([start(reference.node), end(reference.node), alias]);
			}
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
