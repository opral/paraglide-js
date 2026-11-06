import path from "node:path";

const windowsSlashRE = /\\/g;
function slash(p: string): string {
	return p.replace(windowsSlashRE, "/");
}

const isWindows =
	typeof process !== "undefined" && process.platform === "win32";

export function nodeNormalizePath(id: string) {
	// POSIX normalization collapses the leading // of Windows UNC paths.
	return isWindows ? slash(path.win32.normalize(id)) : path.posix.normalize(id);
}
