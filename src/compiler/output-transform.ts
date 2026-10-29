/** Internal bundler publication hook; not a compiler configuration option. */
export const transformOutput = Symbol("paraglide.transformOutput");
export type OutputTransform = (
	output: Record<string, string>,
	outdir: string,
	messageIds: readonly string[]
) => { output: Record<string, string>; onPublished: () => void };
export type PublicationOptions = { [transformOutput]?: OutputTransform };
