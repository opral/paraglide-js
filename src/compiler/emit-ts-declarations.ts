import path from "node:path";

type TypeScript = typeof import("typescript");

const missingTypeScriptMessage = `Paraglide's "emitTsDeclarations" option requires the "typescript" package.

Install TypeScript in your project, or disable "emitTsDeclarations".`;

const failedToLoadTypeScriptMessage = `Paraglide's "emitTsDeclarations" option requires the "typescript" package.

TypeScript appears to be installed, but failed to load. See the error cause for details.`;

/**
 * Generates `.d.ts` files for the compiled Paraglide output using the TypeScript compiler.
 *
 * @param output - The generated compiler output keyed by relative file path.
 * @returns The generated declaration files keyed by relative path.
 *
 * @example
 * const declarations = await emitTsDeclarations(output);
 * // Merge them into the compiler output before writing to disk
 */
export async function emitTsDeclarations(
	output: Record<string, string>
): Promise<Record<string, string>> {
	const ts = await importTypeScript();

	const jsEntries = Object.entries(output).filter(([fileName]) =>
		fileName.endsWith(".js")
	);

	if (jsEntries.length === 0) {
		return {};
	}

	const virtualRoot = path.join(process.cwd(), "__paraglide_virtual_output");
	const normalizeFileName = (fileName: string) =>
		path.normalize(
			path.isAbsolute(fileName) ? fileName : path.join(virtualRoot, fileName)
		);

	const files = new Map(
		jsEntries.map(([fileName, content]) => [
			normalizeFileName(fileName),
			content,
		])
	);
	const quotedExportAliases = collectQuotedExportAliases(ts, files);

	const virtualDirectories = new Set(
		Array.from(files.keys()).flatMap((filePath) => {
			const directories: string[] = [];
			let current = path.dirname(filePath);
			while (current.startsWith(virtualRoot) && current !== virtualRoot) {
				directories.push(current);
				const parent = path.dirname(current);
				if (parent === current) break;
				current = parent;
			}
			return directories;
		})
	);
	// Ensure the virtual root itself is treated as existing
	virtualDirectories.add(virtualRoot);

	const compilerOptions: import("typescript").CompilerOptions = {
		allowJs: true,
		checkJs: true,
		declaration: true,
		emitDeclarationOnly: true,
		isolatedDeclarations: true,
		esModuleInterop: true,
		lib: ["ESNext", "DOM"],
		module: ts.ModuleKind.ESNext,
		moduleResolution: ts.ModuleResolutionKind.Bundler,
		noEmitOnError: false,
		outDir: virtualRoot,
		rootDir: virtualRoot,
		skipLibCheck: true,
		target: ts.ScriptTarget.ESNext,
	};

	const defaultHost = ts.createCompilerHost(compilerOptions, true);
	const declarations: Record<string, string> = {};

	const host: import("typescript").CompilerHost = {
		...defaultHost,
		fileExists: (fileName) => {
			const normalized = normalizeFileName(fileName);
			return files.has(normalized) || defaultHost.fileExists(fileName);
		},
		directoryExists: (directoryName) => {
			const normalized = normalizeFileName(directoryName);
			return (
				virtualDirectories.has(normalized) ||
				defaultHost.directoryExists?.(directoryName) === true
			);
		},
		getDirectories: (directoryName) => {
			const normalized = normalizeFileName(directoryName);
			const children = Array.from(virtualDirectories).filter(
				(dir) => path.dirname(dir) === normalized
			);
			return [
				...(defaultHost.getDirectories?.(directoryName) ?? []),
				...children.map((dir) => path.basename(dir)),
			];
		},
		readFile: (fileName) => {
			const normalized = normalizeFileName(fileName);
			return files.get(normalized) ?? defaultHost.readFile(fileName);
		},
		getSourceFile: (
			fileName,
			languageVersion,
			onError,
			shouldCreateNewFile
		) => {
			const normalized = normalizeFileName(fileName);
			const sourceText = files.get(normalized);
			if (sourceText !== undefined) {
				return ts.createSourceFile(fileName, sourceText, languageVersion, true);
			}
			return defaultHost.getSourceFile(
				fileName,
				languageVersion,
				onError,
				shouldCreateNewFile
			);
		},
		writeFile: (fileName, text) => {
			const relativePath = path
				.relative(virtualRoot, fileName)
				.split(path.sep)
				.join(path.posix.sep);

			if (!relativePath.startsWith("..")) {
				declarations[relativePath] = text;
			}
		},
	};

	const program = ts.createProgram(
		Array.from(files.keys()),
		compilerOptions,
		host
	);

	program.emit(undefined, undefined, undefined, true, {
		afterDeclarations: [
			createQuotedExportAliasTransformer(
				ts,
				quotedExportAliases,
				normalizeFileName
			),
		],
	});

	return declarations;
}

type QuotedExportAliases = Map<string, Map<string, Set<string>>>;

function collectQuotedExportAliases(
	ts: TypeScript,
	files: Map<string, string>
): QuotedExportAliases {
	const aliases: QuotedExportAliases = new Map();

	for (const [fileName, content] of files) {
		const sourceFile = ts.createSourceFile(
			fileName,
			content,
			ts.ScriptTarget.ESNext,
			true,
			ts.ScriptKind.JS
		);
		const fileAliases = new Map<string, Set<string>>();

		const visit = (node: import("typescript").Node) => {
			if (
				ts.isExportDeclaration(node) &&
				node.exportClause &&
				ts.isNamedExports(node.exportClause)
			) {
				for (const specifier of node.exportClause.elements) {
					if (ts.isStringLiteral(specifier.name)) {
						const localName = moduleExportNameText(
							specifier.propertyName ?? specifier.name
						);
						const exportedName = specifier.name.text;
						const localAliases =
							fileAliases.get(localName) ?? new Set<string>();
						localAliases.add(exportedName);
						fileAliases.set(localName, localAliases);
					}
				}
			}
			ts.forEachChild(node, visit);
		};

		visit(sourceFile);

		if (fileAliases.size > 0) {
			aliases.set(fileName, fileAliases);
		}
	}

	return aliases;
}

function createQuotedExportAliasTransformer(
	ts: TypeScript,
	quotedExportAliases: QuotedExportAliases,
	normalizeFileName: (fileName: string) => string
): import("typescript").TransformerFactory<
	import("typescript").SourceFile | import("typescript").Bundle
> {
	return (context) => {
		const visitSourceFile = (sourceFile: import("typescript").SourceFile) => {
			const fileAliases = quotedExportAliases.get(
				normalizeFileName(sourceFile.fileName)
			);

			if (!fileAliases) {
				return sourceFile;
			}

			const visit = (
				node: import("typescript").Node
			): import("typescript").VisitResult<import("typescript").Node> => {
				if (
					ts.isExportDeclaration(node) &&
					node.exportClause &&
					ts.isNamedExports(node.exportClause)
				) {
					const elements: import("typescript").ExportSpecifier[] = [];
					const emitted = new Set<string>();

					for (const specifier of node.exportClause.elements) {
						const localName = moduleExportNameText(
							specifier.propertyName ?? specifier.name
						);
						const exportedName = moduleExportNameText(specifier.name);
						const shouldQuote = fileAliases.get(localName)?.has(exportedName);
						const nextSpecifier = shouldQuote
							? ts.factory.updateExportSpecifier(
									specifier,
									specifier.isTypeOnly,
									specifier.propertyName,
									ts.factory.createStringLiteral(exportedName)
								)
							: specifier;
						const emittedKey = `${moduleExportNameText(
							nextSpecifier.propertyName ?? nextSpecifier.name
						)}\0${moduleExportNameText(nextSpecifier.name)}`;

						if (!emitted.has(emittedKey)) {
							elements.push(nextSpecifier);
							emitted.add(emittedKey);
						}
					}

					return ts.factory.updateExportDeclaration(
						node,
						node.modifiers,
						node.isTypeOnly,
						ts.factory.updateNamedExports(node.exportClause, elements),
						node.moduleSpecifier,
						node.attributes
					);
				}

				return ts.visitEachChild(node, visit, context);
			};

			return ts.visitEachChild(sourceFile, visit, context);
		};

		return (sourceFileOrBundle) => {
			if ("fileName" in sourceFileOrBundle) {
				return visitSourceFile(sourceFileOrBundle);
			}
			return sourceFileOrBundle;
		};
	};
}

function moduleExportNameText(name: import("typescript").ModuleExportName) {
	return name.text;
}

async function importTypeScript(): Promise<TypeScript> {
	try {
		return await import("typescript");
	} catch (cause) {
		if (isMissingTypeScriptPackageError(cause)) {
			throw new Error(missingTypeScriptMessage);
		}
		throw new Error(failedToLoadTypeScriptMessage, { cause });
	}
}

function isMissingTypeScriptPackageError(cause: unknown): boolean {
	if (cause instanceof Error === false) {
		return false;
	}
	if ("code" in cause && cause.code !== "ERR_MODULE_NOT_FOUND") {
		return false;
	}
	return cause.message.includes("Cannot find package 'typescript'");
}
