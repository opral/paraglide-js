import { defineConfig } from "@inlang/paraglide-js";

export default defineConfig({
	outdir: "./src/lib/paraglide",
	emitTsDeclarations: true,
	strategy: ["url", "cookie", "baseLocale"],
});
