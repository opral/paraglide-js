import { createReadStream, readdirSync, statSync } from "node:fs";
import { dirname, extname, join, relative } from "node:path";
import { fileURLToPath } from "node:url";
import { defineConfig, loadEnv, type ConfigEnv, type Plugin } from "vite";
import { tanstackStart } from "@tanstack/react-start/plugin/vite";
import viteReact from "@vitejs/plugin-react";
import viteTsConfigPaths from "vite-tsconfig-paths";
import tailwindcss from "@tailwindcss/vite";
import { viteStaticCopy } from "vite-plugin-static-copy";
import { paraglideStaticPages } from "./src/ssg/static-pages";

const websiteDir = dirname(fileURLToPath(import.meta.url));
const blogDir = join(websiteDir, "../blog");
const blogAssetExtensions = new Set([
	".avif",
	".gif",
	".jpg",
	".jpeg",
	".png",
	".svg",
	".webp",
]);
const blogAssetMimeTypes = new Map([
	[".avif", "image/avif"],
	[".gif", "image/gif"],
	[".jpg", "image/jpeg"],
	[".jpeg", "image/jpeg"],
	[".png", "image/png"],
	[".svg", "image/svg+xml"],
	[".webp", "image/webp"],
]);

function getBlogAssetCopyTargets() {
	const files: string[] = [];
	const walk = (directory: string) => {
		for (const item of readdirSync(directory)) {
			const absolutePath = join(directory, item);
			const stats = statSync(absolutePath);
			if (stats.isDirectory()) {
				walk(absolutePath);
			} else if (blogAssetExtensions.has(extname(item).toLowerCase())) {
				files.push(absolutePath);
			}
		}
	};
	walk(blogDir);
	return files.map((file) => ({
		src: file,
		dest: `../client/blog/${dirname(relative(blogDir, file))}`,
	}));
}

function serveBlogAssetsPlugin(): Plugin {
	return {
		name: "serve-blog-assets",
		apply: "serve",
		configureServer(server) {
			server.middlewares.use("/blog", (request, response, next) => {
				const requestPath = request.url?.split("?")[0];
				if (!requestPath) return next();

				let decodedPath: string;
				try {
					decodedPath = decodeURIComponent(requestPath).replace(/^\/+/, "");
				} catch {
					response.statusCode = 400;
					response.end("Bad Request");
					return;
				}
				const assetPath = join(blogDir, decodedPath);
				const relativePath = relative(blogDir, assetPath);
				if (relativePath.startsWith("..") || relativePath.startsWith("/")) {
					return next();
				}

				const extension = extname(assetPath).toLowerCase();
				if (!blogAssetExtensions.has(extension)) return next();

				try {
					if (!statSync(assetPath).isFile()) return next();
				} catch {
					return next();
				}

				response.setHeader(
					"Content-Type",
					blogAssetMimeTypes.get(extension) ?? "application/octet-stream",
				);
				createReadStream(assetPath).pipe(response);
			});
		},
	};
}

export default defineConfig(({ mode, command }: ConfigEnv) => {
	const env = loadEnv(mode, process.cwd(), "");
	const siteUrl = env.SITE_URL || "https://paraglidejs.com";
	const isTest = process.env.VITEST === "true" || mode === "test";

	return {
		plugins: [
			viteTsConfigPaths({
				projects: ["./tsconfig.json"],
			}),
			tailwindcss(),
			serveBlogAssetsPlugin(),
			!isTest &&
				viteStaticCopy({
					targets: getBlogAssetCopyTargets(),
					watch: command === "serve" ? { reloadPageOnChange: true } : undefined,
				}),
			tanstackStart({
				prerender: {
					enabled: true,
					autoSubfolderIndex: false,
					autoStaticPathsDiscovery: true,
					crawlLinks: false,
					concurrency: 8,
					retryCount: 2,
					retryDelay: 1000,
					maxRedirects: 5,
					failOnError: true,
				},
				sitemap: {
					enabled: true,
					host: siteUrl,
				},
				pages: paraglideStaticPages().map((path) => ({ path })),
			}),
			viteReact(),
		].filter(Boolean),
		server: {
			fs: {
				allow: [".."],
			},
		},
	};
});
