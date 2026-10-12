import { createRequire } from "node:module";
import { createServer } from "node:http";
import { createHash } from "node:crypto";
import { brotliCompressSync, constants as zlibConstants } from "node:zlib";
import { readFile, stat } from "node:fs/promises";
import { extname, join, resolve, sep } from "node:path";

const [appRootArg, controlArg, candidateArg, outputArg] = process.argv.slice(2);
if (!appRootArg || !controlArg || !candidateArg || !outputArg) {
	throw new Error(
		"Usage: node frigate-static-fallback-smoke.mjs <frigate-web> <control-dist> <candidate-dist> <output.json>"
	);
}
const appRoot = resolve(appRootArg);
const browserRequire = createRequire(join(appRoot, "package.json"));
const { chromium } = browserRequire("playwright");
const roots = [
	{ label: "fallback-control", root: resolve(controlArg) },
	{ label: "static-fallback", root: resolve(candidateArg) },
];
const mime = {
	".css": "text/css; charset=utf-8",
	".html": "text/html; charset=utf-8",
	".js": "text/javascript; charset=utf-8",
	".json": "application/json; charset=utf-8",
	".svg": "image/svg+xml",
	".woff2": "font/woff2",
};

async function serve(root) {
	const server = createServer(async (request, response) => {
		const pathname = decodeURIComponent(
			new URL(request.url ?? "/", "http://127.0.0.1").pathname
		);
		if (pathname.startsWith("/api/")) {
			response.writeHead(404, { "content-type": "application/json" }).end("{}");
			return;
		}
		let filename = resolve(root, `.${pathname}`);
		if (filename !== root && !filename.startsWith(`${root}${sep}`)) {
			response.writeHead(403).end();
			return;
		}
		try {
			if (!(await stat(filename)).isFile()) filename = join(root, "index.html");
		} catch {
			filename = join(root, "index.html");
		}
		try {
			const source = await readFile(filename);
			const headers = {
				"cache-control": "no-store",
				"content-type": mime[extname(filename)] ?? "application/octet-stream",
				"x-content-type-options": "nosniff",
			};
			if (
				(request.headers["accept-encoding"] ?? "").includes("br") &&
				/\.(?:js|css|html|json|svg)$/i.test(filename) &&
				source.length > 256
			) {
				const encoded = brotliCompressSync(source, {
					params: { [zlibConstants.BROTLI_PARAM_QUALITY]: 4 },
				});
				headers["content-encoding"] = "br";
				headers.vary = "accept-encoding";
				headers["content-length"] = encoded.length;
				response.writeHead(200, headers).end(encoded);
			} else {
				headers["content-length"] = source.length;
				response.writeHead(200, headers).end(source);
			}
		} catch {
			response.writeHead(404).end();
		}
	});
	await new Promise((resolveListen) => server.listen(0, "127.0.0.1", resolveListen));
	const address = server.address();
	if (!address || typeof address === "string") throw new Error("No server address");
	return { server, origin: `http://127.0.0.1:${address.port}` };
}

const browser = await chromium.launch({ headless: true, args: ["--no-sandbox"] });
const rows = [];
try {
	for (const build of roots) {
		const { server, origin } = await serve(build.root);
		try {
			const context = await browser.newContext({
				locale: "fr-FR",
				serviceWorkers: "block",
				viewport: { width: 1365, height: 768 },
			});
			const page = await context.newPage();
			const pageErrors = [];
			const consoleErrors = [];
			const requests = [];
			page.on("pageerror", (error) => pageErrors.push(error.message));
			page.on("console", (message) => {
				if (message.type() === "error") consoleErrors.push(message.text());
			});
			page.on("request", (request) => {
				const url = new URL(request.url());
				if (url.origin === origin) requests.push(url.pathname);
			});
			await page.addInitScript(() =>
				localStorage.setItem("frigate-ui-language", "fr")
			);
			await page.goto(`${origin}/#front_door`, {
				waitUntil: "domcontentloaded",
				timeout: 30000,
			});
			let readinessError = null;
			try {
				await page.waitForFunction(
				() =>
					document.documentElement.lang === "fr" &&
					(document.body?.innerText ?? "").includes("Le système est sain"),
				undefined,
				{ timeout: 20000 }
				);
			} catch (error) {
				readinessError = error.message;
			}
			await page.waitForTimeout(300);
			const visible = await page.evaluate(() => ({
				title: document.title,
				lang: document.documentElement.lang,
				text: document.body?.innerText ?? "",
				controls: [...document.querySelectorAll("button")]
					.filter((element) => {
						const rect = element.getBoundingClientRect();
						return rect.width > 0 && rect.height > 0;
					})
					.map((element) => ({
						text: element.innerText,
						ariaLabel: element.getAttribute("aria-label"),
						labelledBy: element.getAttribute("aria-labelledby"),
					}))
					.slice(0, 30),
				resources: performance
					.getEntriesByType("resource")
					.filter((entry) => entry.name.startsWith(location.origin))
					.map((entry) => ({
						path: new URL(entry.name).pathname,
						encodedBodySize: entry.encodedBodySize,
						transferSize: entry.transferSize,
					}))
			}));
			const resourceMap = new Map(visible.resources.map((item) => [item.path, item]));
			rows.push({
				label: build.label,
				path: "/#front_door",
				...visible,
				readinessError,
				requestedPaths: [...new Set(requests)].sort(),
				requestedResourceCount: resourceMap.size,
				requestedEncodedBodyBytes: visible.resources.reduce(
					(total, item) => total + item.encodedBodySize,
					0
				),
				pageErrors,
				consoleErrors,
			});
			await context.close();
		} finally {
			await new Promise((resolveClose, reject) =>
				server.close((error) => (error ? reject(error) : resolveClose()))
			);
		}
	}
} finally {
	await browser.close();
}

const [control, candidate] = rows;
const union = [...new Set([...control.requestedPaths, ...candidate.requestedPaths])].sort();
const report = {
	method:
		"One functional cold browser capture per frozen build; Brotli-Q4 local static assets; APIs return empty 404 JSON; no timing or performance comparison.",
	browser: chromium.executablePath(),
	appRoot,
	builds: rows,
	assetUnion: union.map((pathname) => ({
		path: pathname,
		controlRequested: control.requestedPaths.includes(pathname),
		candidateRequested: candidate.requestedPaths.includes(pathname),
		control: control.resources.find((item) => item.path === pathname) ?? null,
		candidate: candidate.resources.find((item) => item.path === pathname) ?? null,
	})),
	functionalParity: {
		sameVisibleBodyText: control.text === candidate.text,
		sameTitle: control.title === candidate.title,
		bothFrench: control.lang === "fr" && candidate.lang === "fr",
		noPageErrors: control.pageErrors.length === 0 && candidate.pageErrors.length === 0,
	},
	buildTreeHashes: await Promise.all(
		rows.map(async (row, index) => ({
			label: row.label,
			root: roots[index].root,
			fileCount: await treeFileCount(roots[index].root),
			treeSha256: await treeHash(roots[index].root),
		}))
	),
};
await (await import("node:fs/promises")).writeFile(
	resolve(outputArg),
	JSON.stringify(report, null, 2) + "\n"
);
console.log(JSON.stringify(report.functionalParity, null, 2));

async function listFiles(root) {
	const { readdir } = await import("node:fs/promises");
	const out = [];
	async function visit(directory) {
		for (const entry of await readdir(directory, { withFileTypes: true })) {
			const path = join(directory, entry.name);
			if (entry.isDirectory()) await visit(path);
			else if (entry.isFile()) out.push(path);
		}
	}
	await visit(root);
	return out.sort();
}
async function treeFileCount(root) {
	return (await listFiles(root)).length;
}
async function treeHash(root) {
	const files = await listFiles(root);
	const hash = createHash("sha256");
	for (const file of files) {
		const relative = file.slice(root.length + 1).split("\\").join("/");
		const digest = createHash("sha256").update(await readFile(file)).digest("hex");
		hash.update(relative).update("\0").update(digest).update("\n");
	}
	return hash.digest("hex");
}
