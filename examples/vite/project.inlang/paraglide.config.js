import { defineConfig } from "@inlang/paraglide-js";

export default defineConfig({
	outdir: "./src/paraglide",
	// forcing locale modules to detect problems during CI/CD
	// (all other projects use message-modules)
	outputStructure: "locale-modules",
	emitTsDeclarations: true,
});
