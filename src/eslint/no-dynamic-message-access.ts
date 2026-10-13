import type { Rule, Scope } from "eslint";
import type { Identifier, Node, MemberExpression } from "estree";

/** Only syntax-level static keys are allowed; this rule does not evaluate expressions. */
function staticKey(node: Node): string | undefined {
	if (node.type === "Identifier") return node.name;
	if (
		node.type === "Literal" &&
		(typeof node.value === "string" || typeof node.value === "number")
	)
		return String(node.value);
	if (node.type === "TemplateLiteral" && node.expressions.length === 0)
		return node.quasis[0]?.value.cooked ?? undefined;
	return undefined;
}

function staticMemberKey(node: MemberExpression): string | undefined {
	return node.computed && node.property.type === "Identifier"
		? undefined
		: staticKey(node.property);
}

// TypeScript wrappers do not change the identity of a namespace reference.
function unwrap(node: Node): Node {
	while (
		[
			"ChainExpression",
			"TSAsExpression",
			"TSTypeAssertion",
			"TSNonNullExpression",
			"TSSatisfiesExpression",
		].includes(node.type)
	) {
		node = (node as Node & { expression: Node }).expression;
	}
	return node;
}

/** Prevent runtime catalog indexing from retaining all generated messages. */
export const noDynamicMessageAccess: Rule.RuleModule = {
	meta: {
		type: "problem",
		docs: {
			description:
				"Require static references or an explicit map for runtime-selected messages",
			url: "https://paraglidejs.com/basics#dynamic-messages",
		},
		schema: [
			{
				type: "object",
				properties: {
					messageModuleDirectories: {
						type: "array",
						items: { type: "string", minLength: 1 },
						uniqueItems: true,
					},
					messageModules: {
						type: "array",
						items: { type: "string" },
						uniqueItems: true,
					},
				},
				additionalProperties: false,
			},
		],
		messages: {
			dynamicAccess:
				"Dynamic access to the Paraglide message catalog can bundle every message. Create a local map of explicit message references (for example, { greeting: m.greeting }) and index that map instead.",
			catalogCopy:
				"Copying the Paraglide message catalog can bundle every message. Create a local map containing only the messages this UI renders.",
		},
	},
	create(context) {
		const sourceCode = context.sourceCode;
		const options = context.options[0] as
			| { messageModules?: string[]; messageModuleDirectories?: string[] }
			| undefined;
		const configuredModules = new Set(options?.messageModules ?? []);
		const directories = new Set([
			"paraglide",
			...(options?.messageModuleDirectories ?? []),
		]);
		const matchesModule = (value: unknown) =>
			typeof value === "string" &&
			(configuredModules.has(value) ||
				[...directories].some((directory) =>
					["messages", "messages.js"].some(
						(file) =>
							value === `${directory}/${file}` ||
							value.endsWith(`/${directory}/${file}`)
					)
				));

		function variableFor(node: Identifier): Scope.Variable | undefined {
			for (
				let scope: Scope.Scope | null = sourceCode.getScope(node);
				scope;
				scope = scope.upper
			) {
				const variable = scope.set.get(node.name);
				if (variable) return variable;
			}
			return undefined;
		}

		function isCatalog(
			node: Node | null | undefined,
			namespaceOnly = false,
			seen = new Set<Scope.Variable>()
		): boolean {
			if (!node) return false;
			const expression = unwrap(node);
			if (expression.type === "MemberExpression") {
				return (
					!namespaceOnly &&
					staticMemberKey(expression) === "m" &&
					isCatalog(expression.object, true, seen)
				);
			}
			if (expression.type !== "Identifier") return false;
			const variable = variableFor(expression);
			if (!variable || seen.has(variable)) return false;
			seen.add(variable);
			for (const definition of variable.defs) {
				if (
					definition.type === "ImportBinding" &&
					matchesModule(definition.parent.source.value)
				) {
					const specifier = definition.node;
					if (specifier.type === "ImportNamespaceSpecifier") return true;
					if (
						!namespaceOnly &&
						specifier.type === "ImportSpecifier" &&
						staticKey(specifier.imported) === "m"
					)
						return true;
				}
				if (
					definition.type === "Variable" &&
					definition.parent.kind === "const"
				) {
					const declaration = definition.node;
					if (declaration.id.type === "Identifier")
						return isCatalog(declaration.init, namespaceOnly, seen);
					if (!namespaceOnly && declaration.id.type === "ObjectPattern") {
						return declaration.id.properties.some(
							(property) =>
								property.type === "Property" &&
								!property.computed &&
								staticKey(property.key) === "m" &&
								property.value.type === "Identifier" &&
								property.value.name === expression.name &&
								isCatalog(declaration.init, true, seen)
						);
					}
				}
			}
			return false;
		}

		return {
			MemberExpression(node) {
				if (
					node.computed &&
					staticMemberKey(node) === undefined &&
					isCatalog(node.object)
				)
					context.report({ node, messageId: "dynamicAccess" });
			},
			VariableDeclarator(node) {
				if (node.id.type !== "ObjectPattern" || !isCatalog(node.init)) return;
				for (const property of node.id.properties) {
					if (property.type === "RestElement")
						context.report({ node: property, messageId: "catalogCopy" });
					else if (
						property.computed &&
						(property.key.type === "Identifier" ||
							staticKey(property.key) === undefined)
					)
						context.report({ node: property, messageId: "dynamicAccess" });
				}
			},
			SpreadElement(node) {
				if (isCatalog(node.argument))
					context.report({ node, messageId: "catalogCopy" });
			},
		};
	},
};
