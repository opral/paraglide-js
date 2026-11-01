import fs from "node:fs";
import type { CompilerOptions } from "../compiler-options.js";

/**
 * Returns the code for the `server.js` module
 */
export function createServerFile(args: {
	compilerOptions: {
		disableAsyncLocalStorage: NonNullable<
			CompilerOptions["disableAsyncLocalStorage"]
		>;
	};
}): string {
	let code = `
import * as runtime from "./runtime.js";

${injectCode("./middleware.js")}
`;

	const asyncLocalStorageMarker = "// %async-local-storage";
	const markerIndex = code.indexOf(asyncLocalStorageMarker);
	if (markerIndex === -1) {
		throw new Error(
			"Expected a single %async-local-storage marker in server middleware."
		);
	}

	const lineStart = code.lastIndexOf("\n", markerIndex) + 1;
	const indent = code.slice(lineStart, markerIndex).replace(/\t/g, "  ");
	const innerIndent = `${indent}  `;
	const asyncLocalStorageBlock = args.compilerOptions.disableAsyncLocalStorage
		? [
				`${indent}requestAsyncLocalStorage = runtime.getServerAsyncLocalStorage();`,
				`${indent}if (!requestAsyncLocalStorage) {`,
				`${innerIndent}requestAsyncLocalStorage = createMockAsyncLocalStorage();`,
				`${innerIndent}runtime.overwriteServerAsyncLocalStorage(requestAsyncLocalStorage);`,
				`${indent}}`,
			]
		: [
				`${indent}requestAsyncLocalStorage = runtime.getServerAsyncLocalStorage();`,
				`${indent}if (!runtime.disableAsyncLocalStorage && !requestAsyncLocalStorage) {`,
				`${innerIndent}const { AsyncLocalStorage } = await import("async_hooks");`,
				`${innerIndent}requestAsyncLocalStorage = runtime.getServerAsyncLocalStorage();`,
				`${innerIndent}if (!requestAsyncLocalStorage) {`,
				`${innerIndent}  requestAsyncLocalStorage = new AsyncLocalStorage();`,
				`${innerIndent}  runtime.overwriteServerAsyncLocalStorage(requestAsyncLocalStorage);`,
				`${innerIndent}}`,
				`${indent}}`,
				`${indent}if (!requestAsyncLocalStorage) {`,
				`${innerIndent}requestAsyncLocalStorage = createMockAsyncLocalStorage();`,
				`${innerIndent}runtime.overwriteServerAsyncLocalStorage(requestAsyncLocalStorage);`,
				`${indent}}`,
			];

	const lineEnd = code.indexOf("\n", markerIndex);
	const endOfMarkerLine = lineEnd === -1 ? code.length : lineEnd + 1;

	code =
		code.slice(0, lineStart) +
		`${asyncLocalStorageBlock.join("\n")}\n` +
		code.slice(endOfMarkerLine);

	return code.replace(/\t/g, "  ");
}

/**
 * Load a file from the current directory.
 *
 * Prunes the imports on top of the file as the runtime is
 * self-contained.
 *
 * @param {string} path
 * @returns {string}
 */
function injectCode(path: string): string {
	const code = fs.readFileSync(new URL(path, import.meta.url), "utf-8");
	// Regex to match single-line and multi-line imports
	const importRegex = /^\s*import\s+[\s\S]*?from\s+['"][^'"]+['"]\s*;?/gm;
	const sourceMapRegex = /\/\/# sourceMappingURL=.*$/gm;
	const blockSourceMapRegex = /\/\*# sourceMappingURL=.*?\*\//g;
	return code
		.replace(importRegex, "")
		.replace(sourceMapRegex, "")
		.replace(blockSourceMapRegex, "")
		.trim();
}
