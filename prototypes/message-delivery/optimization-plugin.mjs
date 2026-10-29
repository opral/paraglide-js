import path from "node:path";
import { createHash } from "node:crypto";
import fs from "node:fs/promises";
import { createRequire } from "node:module";
import ts from "typescript";
import { toSafeModuleId } from "../../dist/compiler/safe-module-id.js";
const require = createRequire(import.meta.url);
const magicPackage = path.dirname(require.resolve("vite/package.json"));
const MagicString = require(
	createRequire(path.join(magicPackage, "package.json")).resolve("magic-string")
);

// Conservative prototype: reject any ambiguous namespace use or local shadowing.
export function rewriteStaticMessages(
	code,
	id,
	{ exports, publicPrefix, importSources }
) {
	const sf = ts.createSourceFile(
		id,
		code,
		ts.ScriptTarget.Latest,
		true,
		ts.ScriptKind.TSX
	);
	if (sf.parseDiagnostics.length) return null;
	const changes = [];
	const newImports = [];
	let rewrites = 0;
	let fallbacks = 0;
	const identifiers = new Set();
	const visitNames = (node) => {
		if (ts.isIdentifier(node)) identifiers.add(node.text);
		ts.forEachChild(node, visitNames);
	};
	visitNames(sf);
	let serial = 0;
	const fresh = () => {
		let name;
		do {
			name = `__pg_message_${serial++}`;
		} while (identifiers.has(name));
		identifiers.add(name);
		return name;
	};
	for (const statement of sf.statements) {
		if (
			!ts.isImportDeclaration(statement) ||
			!ts.isStringLiteral(statement.moduleSpecifier) ||
			!importSources.has(statement.moduleSpecifier.text)
		)
			continue;
		const clause = statement.importClause;
		if (
			!clause ||
			clause.name ||
			!clause.namedBindings ||
			!ts.isNamedImports(clause.namedBindings)
		)
			continue;
		const keep = [];
		for (const spec of clause.namedBindings.elements) {
			const imported = spec.propertyName?.text ?? spec.name.text;
			if (imported !== "m") {
				if (!exports.has(imported)) {
					keep.push(spec.getText(sf));
					continue;
				}
				newImports.push(
					`import { ${JSON.stringify(imported)} as ${spec.name.text} } from ${JSON.stringify(publicPrefix + "messages/" + toSafeModuleId(imported) + ".js")};`
				);
				rewrites++;
				continue;
			}
			const local = spec.name.text;
			const references = [];
			let unsafe = false;
			const visit = (node) => {
				if (node === statement) return;
				if (ts.isIdentifier(node) && node.text === local) {
					const parent = node.parent;
					// A property name on a different object is not a reference to this import.
					if (ts.isPropertyAccessExpression(parent) && parent.name === node)
						return;
					if (
						(ts.isPropertyAssignment(parent) ||
							ts.isMethodDeclaration(parent) ||
							ts.isPropertyDeclaration(parent)) &&
						parent.name === node
					)
						return;
					let name;
					if (
						ts.isPropertyAccessExpression(parent) &&
						parent.expression === node &&
						!parent.questionDotToken
					)
						name = parent.name.text;
					else if (
						ts.isElementAccessExpression(parent) &&
						parent.expression === node &&
						!parent.questionDotToken &&
						parent.argumentExpression &&
						ts.isStringLiteral(parent.argumentExpression)
					)
						name = parent.argumentExpression.text;
					else {
						unsafe = true;
						return;
					}
					const owner = parent.parent;
					if (
						(ts.isBinaryExpression(owner) &&
							owner.left === parent &&
							owner.operatorToken.kind >= ts.SyntaxKind.FirstAssignment &&
							owner.operatorToken.kind <= ts.SyntaxKind.LastAssignment) ||
						ts.isDeleteExpression(owner) ||
						ts.isPrefixUnaryExpression(owner) ||
						ts.isPostfixUnaryExpression(owner) ||
						!exports.has(name)
					) {
						unsafe = true;
						return;
					}
					references.push({ node: parent, name });
				}
				ts.forEachChild(node, visit);
			};
			visit(sf);
			if (unsafe) {
				keep.push(spec.getText(sf));
				fallbacks++;
				continue;
			}
			const locals = new Map();
			for (const reference of references) {
				let alias = locals.get(reference.name);
				if (!alias) {
					alias = fresh();
					locals.set(reference.name, alias);
					newImports.push(
						`import { ${JSON.stringify(reference.name)} as ${alias} } from ${JSON.stringify(publicPrefix + "messages/" + toSafeModuleId(reference.name) + ".js")};`
					);
				}
				changes.push([reference.node.getStart(sf), reference.node.end, alias]);
				rewrites++;
			}
		}
		changes.push([
			statement.getStart(sf),
			statement.end,
			keep.length
				? `import { ${keep.join(", ")} } from ${JSON.stringify(statement.moduleSpecifier.text)};`
				: "",
		]);
	}
	if (!changes.length || !rewrites) return null;
	const result = new MagicString(code);
	for (const [start, end, replacement] of changes)
		result.overwrite(start, end, replacement);
	result.prepend(newImports.join("\n") + "\n");
	return {
		code: result.toString(),
		map: result.generateMap({ hires: true, source: id, includeContent: true }),
		rewrites,
		fallbacks,
	};
}

export function fuseMessages(records, size) {
	const files = {};
	const groups = [];
	for (let start = 0; start < records.length; start += size) {
		const imports = new Set();
		const members = [];
		for (const [name, code] of records.slice(start, start + size)) {
			const sf = ts.createSourceFile(
				name,
				code,
				ts.ScriptTarget.Latest,
				true,
				ts.ScriptKind.JS
			);
			const edits = [];
			const exported = [];
			for (const statement of sf.statements) {
				if (ts.isImportDeclaration(statement)) {
					imports.add(statement.getText(sf));
					edits.push([statement.getStart(sf), statement.end, ""]);
				} else if (
					ts.isExportDeclaration(statement) &&
					statement.exportClause &&
					ts.isNamedExports(statement.exportClause)
				) {
					for (const element of statement.exportClause.elements)
						exported.push([
							element.name.text,
							element.propertyName?.text ?? element.name.text,
						]);
					edits.push([statement.getStart(sf), statement.end, ""]);
				} else if (
					ts.isVariableStatement(statement) &&
					statement.modifiers?.some(
						(m) => m.kind === ts.SyntaxKind.ExportKeyword
					)
				) {
					for (const declaration of statement.declarationList.declarations) {
						if (!ts.isIdentifier(declaration.name))
							throw new Error("Unexpected generated binding");
						exported.push([declaration.name.text, declaration.name.text]);
					}
					for (const modifier of statement.modifiers)
						if (modifier.kind === ts.SyntaxKind.ExportKeyword)
							edits.push([modifier.getStart(sf), modifier.end, ""]);
				}
			}
			if (exported.length !== 1)
				throw new Error(`Expected one export in ${name}`);
			let body = code;
			for (const [a, b, replacement] of edits.sort((a, b) => b[0] - a[0]))
				body = body.slice(0, a) + replacement + body.slice(b);
			const [publicName, local] = exported[0];
			const binding = `__message_${members.length}`;
			members.push(
				`const ${binding} = /* @__PURE__ */ (()=>{\n${body}\nreturn ${local};\n})();\nexport { ${binding} as ${JSON.stringify(publicName)} };`
			);
		}
		const name = `messages/__fused_${groups.length}.js`;
		groups.push(name);
		files[name] = [...imports, ...members].join("\n");
	}
	files["messages/_index.js"] = groups
		.map(
			(name) => `export * from ${JSON.stringify("./" + path.basename(name))};`
		)
		.join("\n");
	return files;
}

export function optimizationPrototype({ outdir, mode = "direct" }) {
	outdir = path.resolve(outdir);
	const publicPrefix = `virtual:paraglide/${createHash("sha256").update(outdir).digest("hex").slice(0, 16)}/`;
	const prefix = "\0" + publicPrefix;
	const stats = {
		transformed: 0,
		rewrittenAccesses: 0,
		fallbacks: 0,
		parsedAppBytes: 0,
		fusedGroups: 0,
		indexReads: 0,
		indexBuilds: 0,
	};
	let config, server, base, fused, known, knownPromise;
	const reset = () => {
		fused = undefined;
		known = undefined;
		knownPromise = undefined;
	};
	const compilerHook = (plugin) =>
		typeof plugin.watchChange === "function"
			? plugin.watchChange
			: plugin.watchChange?.handler;
	const setup = {
		name: "paraglide-optimization-prototype-setup",
		enforce: "pre",
		api: { stats },
		configResolved(value) {
			config = value;
			base = config.plugins.find(
				(p) => p.name === "paraglide-virtual-messages"
			);
			if (!base) throw new Error("Prototype needs experimentalVirtualMessages");
			const compiler = config.plugins.find(
				(p) => p.name === "unplugin-paraglide-js"
			);
			const original = compilerHook(compiler);
			compiler.watchChange = async function (...args) {
				const result = await original?.apply(this, args);
				reset();
				if (fusedMode && server) {
					server.moduleGraph.invalidateAll();
					server.ws.send({ type: "full-reload" });
				}
				return result;
			};
			if (mode === "sync-resolve") {
				// Fast direct IDs stay synchronous; retain Vite's normal async path resolver fallback.
				const originalResolve = base.resolveId;
				base.resolveId = function (source, importer, ...rest) {
					if (source.startsWith(publicPrefix)) return "\0" + source;
					if (source.startsWith(prefix)) return source;
					return originalResolve.call(this, source, importer, ...rest);
				};
			}
		},
		configureServer(value) {
			server = value;
		},
	};
	const fusedMode = mode.startsWith("fused-");
	const plugins = [setup];
	if (fusedMode) {
		const size = Number(mode.slice(6));
		const ensure = async (context) => {
			if (fused) return fused;
			const original = await base.load.call(
				context,
				prefix + "messages/_index.js"
			);
			if (!original) return null;
			const code = typeof original === "string" ? original : original.code;
			const sf = ts.createSourceFile(
				"index.js",
				code,
				ts.ScriptTarget.Latest,
				true,
				ts.ScriptKind.JS
			);
			const records = [];
			for (const statement of sf.statements)
				if (
					ts.isExportDeclaration(statement) &&
					statement.moduleSpecifier &&
					ts.isStringLiteral(statement.moduleSpecifier)
				) {
					const name =
						"messages/" + path.basename(statement.moduleSpecifier.text);
					const loaded = await base.load.call(context, prefix + name);
					records.push([
						name,
						typeof loaded === "string" ? loaded : loaded.code,
					]);
				}
			fused = fuseMessages(records, size);
			fused["messages/_index.js"] = Object.keys(fused)
				.filter((name) => name !== "messages/_index.js")
				.map((name) => `export * from ${JSON.stringify(publicPrefix + name)};`)
				.join("\n");
			stats.fusedGroups = Math.ceil(records.length / size);
			return fused;
		};
		plugins.push({
			name: "paraglide-raw-fusion-prototype",
			enforce: "pre",
			resolveId(source) {
				if (source.startsWith(publicPrefix + "messages/__fused_"))
					return "\0" + source;
				if (source.startsWith(prefix + "messages/__fused_")) return source;
			},
			async load(id) {
				if (
					id === prefix + "messages/_index.js" ||
					id.startsWith(prefix + "messages/__fused_")
				) {
					const files = await ensure(this);
					const name = id.slice(prefix.length);
					return files?.[name] !== undefined
						? { code: files[name], moduleSideEffects: false, map: null }
						: null;
				}
			},
		});
	}
	if (mode.startsWith("direct"))
		plugins.push({
			name: "paraglide-static-import-prototype",
			enforce: "post",
			async transform(code, id) {
				if (
					id.includes("/node_modules/") ||
					id.startsWith("\0") ||
					!code.includes("messages")
				)
					return null;
				const loadIndex = async () => {
					stats.indexReads++;
					const declaration = await fs.readFile(
						path.join(outdir, "messages.d.ts"),
						"utf8"
					);
					stats.indexBuilds++;
					return new Set(
						[
							...declaration.matchAll(/readonly ("(?:[^"\\]|\\.)*"): typeof /g),
						].map((match) => JSON.parse(match[1]))
					);
				};
				let index;
				if (mode === "direct-indexed")
					index = await (knownPromise ??= loadIndex());
				else {
					if (!known) known = await loadIndex();
					index = known;
				}
				const sf = ts.createSourceFile(
					id,
					code,
					ts.ScriptTarget.Latest,
					true,
					ts.ScriptKind.TSX
				);
				const sources = new Set();
				for (const statement of sf.statements)
					if (
						ts.isImportDeclaration(statement) &&
						ts.isStringLiteral(statement.moduleSpecifier) &&
						/(?:^|\/)messages(?:\.js)?$/.test(statement.moduleSpecifier.text)
					) {
						const resolved = await this.resolve(
							statement.moduleSpecifier.text,
							id,
							{ skipSelf: true }
						);
						if (resolved?.id === prefix + "messages.js")
							sources.add(statement.moduleSpecifier.text);
					}
				if (!sources.size) return null;
				stats.parsedAppBytes += Buffer.byteLength(code);
				const result = rewriteStaticMessages(code, id, {
					exports: index,
					publicPrefix,
					importSources: sources,
				});
				if (result) {
					stats.transformed++;
					stats.rewrittenAccesses += result.rewrites;
					stats.fallbacks += result.fallbacks;
					return { code: result.code, map: result.map };
				}
				stats.fallbacks++;
				return null;
			},
		});
	return plugins;
}
