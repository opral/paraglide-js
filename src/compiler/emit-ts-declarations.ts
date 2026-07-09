import path from "node:path";
import fs from "node:fs/promises";
import os from "node:os";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { resolveTscJsPath } from "./resolve-tsc-js-path.js";

const execFileAsync = promisify(execFile);

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

	// TypeScript 7+ (the Go-based compiler) no longer ships the in-process
	// compiler API — its main entry point only exports version metadata.
	// https://github.com/opral/paraglide-js/issues/711
	const compilerApi = resolveCompilerApi(ts);
	if (compilerApi === undefined) {
		return emitWithTscCli(jsEntries);
	}

	return emitWithCompilerApi(compilerApi, jsEntries);
}

/**
 * Returns the in-process compiler API (TypeScript 5/6), or `undefined` when
 * the installed TypeScript does not provide one (TypeScript 7+).
 *
 * Unwraps default-only interop shapes (`{ default: ts }`) that bundlers and
 * CJS interop can produce. Without the unwrap, TypeScript 5/6 would be
 * misrouted to the CLI path, whose TypeScript 5 declaration emitter produces
 * syntactically invalid quoted export aliases.
 */
function resolveCompilerApi(ts: TypeScript): TypeScript | undefined {
	if (typeof ts.createProgram === "function") {
		return ts;
	}
	const defaultExport = (ts as { default?: TypeScript }).default;
	if (defaultExport && typeof defaultExport.createProgram === "function") {
		return defaultExport;
	}
	return undefined;
}

/**
 * Emits declarations with the in-process TypeScript compiler API (TypeScript 5/6).
 */
async function emitWithCompilerApi(
	ts: TypeScript,
	jsEntries: [string, string][]
): Promise<Record<string, string>> {
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

const failedToEmitWithTscMessage = `Paraglide's "emitTsDeclarations" option failed to generate declaration files with the installed TypeScript version.

TypeScript 7+ no longer provides the in-process compiler API, so Paraglide invokes its "tsc" CLI instead — which did not produce a declaration file for every compiled file. As a workaround, install TypeScript 5 or 6, or disable "emitTsDeclarations".`;

/**
 * Emits declarations by invoking the `tsc` CLI of the installed TypeScript
 * package (TypeScript 7+, where the in-process compiler API is unavailable).
 *
 * The compiled output is written to a temporary directory because the
 * Go-based compiler cannot read from a virtual filesystem.
 */
async function emitWithTscCli(
	jsEntries: [string, string][]
): Promise<Record<string, string>> {
	// entries escaping the output root cannot be declared safely; the
	// compiler-API path silently drops them too (see the writeFile hook)
	const safeEntries = jsEntries.filter(([fileName]) => {
		const normalized = path.posix.normalize(fileName);
		return (
			normalized.startsWith("..") === false &&
			path.posix.isAbsolute(normalized) === false
		);
	});

	// resolved before spawning so a missing tsc entry point surfaces its own
	// pointed error instead of the generic "no declaration files" one
	const tscJsPath = resolveTscJsPath();

	const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "paraglide-dts-"));

	try {
		const srcDir = path.join(tempDir, "src");
		const outDir = path.join(tempDir, "dist");
		await fs.mkdir(outDir, { recursive: true });

		for (const [fileName, content] of safeEntries) {
			const filePath = path.join(srcDir, fileName);
			await fs.mkdir(path.dirname(filePath), { recursive: true });
			await fs.writeFile(filePath, content);
		}

		const tsconfigPath = path.join(tempDir, "tsconfig.json");
		await fs.writeFile(
			tsconfigPath,
			JSON.stringify({
				compilerOptions: {
					allowJs: true,
					checkJs: true,
					declaration: true,
					emitDeclarationOnly: true,
					esModuleInterop: true,
					lib: ["ESNext", "DOM"],
					module: "ESNext",
					moduleResolution: "bundler",
					// Declaration emit does not need a typecheck; skipping it also
					// suppresses diagnostics about the project's environment (e.g.
					// a missing @types/node) that are irrelevant to the output.
					noCheck: true,
					noEmitOnError: false,
					outDir: "./dist",
					rootDir: "./src",
					skipLibCheck: true,
					target: "ESNext",
				},
				files: safeEntries.map(([fileName]) => `./src/${fileName}`),
			})
		);

		let tscError: unknown;
		try {
			await execFileAsync(
				process.execPath,
				[tscJsPath, "--project", tsconfigPath],
				{
					maxBuffer: 64 * 1024 * 1024,
					// Electron-based hosts must execute tsc with their embedded
					// Node instead of launching another instance of the host app.
					// Harmless under node and bun.
					env: { ...process.env, ELECTRON_RUN_AS_NODE: "1" },
				}
			);
		} catch (error) {
			// tsc exits non-zero when the input has diagnostics even though the
			// declaration files are still emitted (noEmitOnError is false).
			// Success is judged by the presence of declaration files below.
			tscError = error;
		}

		const declarations: Record<string, string> = {};

		for (const entry of await fs.readdir(outDir, { recursive: true })) {
			if (entry.endsWith(".d.ts")) {
				declarations[entry.split(path.sep).join(path.posix.sep)] =
					await fs.readFile(path.join(outDir, entry), "utf-8");
			}
		}

		// tsc emits exactly one .d.ts per input .js (even for inputs with
		// syntax errors), so a count mismatch means the compiler died mid-emit
		// and the result would be silently incomplete.
		if (Object.keys(declarations).length !== safeEntries.length) {
			throw new Error(withTscOutput(failedToEmitWithTscMessage, tscError), {
				cause: tscError,
			});
		}

		return declarations;
	} finally {
		await fs.rm(tempDir, { recursive: true, force: true });
	}
}

/**
 * Appends the spawned compiler's output to the error message.
 *
 * tsc writes diagnostics to stdout, which `execFile` errors expose only as a
 * property — not in the message — so error reporters that print only
 * message/stack would otherwise hide the reason the emit failed.
 */
function withTscOutput(message: string, tscError: unknown): string {
	const { stdout, stderr } = (tscError ?? {}) as {
		stdout?: unknown;
		stderr?: unknown;
	};
	const output = [stdout, stderr]
		.filter((value): value is string => typeof value === "string")
		.join("\n")
		.trim();
	if (output === "") {
		return message;
	}
	const truncated =
		output.length > 4000 ? output.slice(0, 4000) + "\n… (truncated)" : output;
	return `${message}\n\nCompiler output:\n${truncated}`;
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
