import type { Plugin } from "vite";
export function optimizationPrototype(options: {
	outdir: string;
	mode?: string;
}): Plugin[];
export function rewriteStaticMessages(
	code: string,
	id: string,
	options: {
		exports: ReadonlySet<string>;
		publicPrefix: string;
		importSources: ReadonlySet<string>;
	}
): { code: string; map: unknown; rewrites: number; fallbacks: number } | null;
export function fuseMessages(
	records: ReadonlyArray<readonly [string, string]>,
	size: number
): Record<string, string>;
