import { paraglideWebpackPlugin } from "@inlang/paraglide-js";

/**
 * @type {import('next').NextConfig}
 */
export default {
	cacheComponents: true,
	skipProxyUrlNormalize: true,
	partialPrefetching: true,
	webpack: (config) => {
		config.plugins.push(
			paraglideWebpackPlugin({
				outdir: "./src/paraglide",
				project: "./project.inlang",
				emitTsDeclarations: true,
				strategy: ["url", "cookie", "baseLocale"],
			})
		);

		return config;
	},
};
