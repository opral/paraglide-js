import http from "node:http";
import fs from "node:fs/promises";
import path from "node:path";
import { brotliCompressSync, gzipSync, constants } from "node:zlib";
import { settings } from "./config.mjs";

export async function startServer() {
	const bodies = new Map();
	async function walk(dir) {
		for (const entry of await fs.readdir(dir, { withFileTypes: true })) {
			const file = path.join(dir, entry.name);
			if (entry.isDirectory()) await walk(file);
			else {
				const raw = await fs.readFile(file);
				bodies.set(
					"/" + path.relative("dist", file).split(path.sep).join("/"),
					{
						identity: raw,
						br: brotliCompressSync(raw, {
							params: {
								[constants.BROTLI_PARAM_QUALITY]: settings.brotliQuality,
							},
						}),
						gzip: gzipSync(raw, { level: 6 }),
					}
				);
			}
		}
	}
	await walk("dist");
	const server = http.createServer((req, res) => {
		const url = new URL(req.url, "http://localhost");
		let file = url.pathname;
		if (file.endsWith("/")) file += "index.html";
		const data = bodies.get(file);
		if (!data) {
			res.writeHead(404);
			res.end("Not found");
			return;
		}
		const encoding = (req.headers["accept-encoding"] ?? "").includes(
			settings.compression
		)
			? settings.compression
			: "identity";
		const body = data[encoding];
		const ext = path.extname(file);
		res.writeHead(200, {
			"Content-Type":
				{
					".html": "text/html; charset=utf-8",
					".js": "text/javascript; charset=utf-8",
					".json": "application/json; charset=utf-8",
				}[ext] ?? "application/octet-stream",
			"Content-Length": body.length,
			...(encoding === "identity" ? {} : { "Content-Encoding": encoding }),
			Vary: "Accept-Encoding",
			"Cache-Control":
				ext === ".html" ? "no-cache" : "public, max-age=31536000, immutable",
		});
		res.end(body);
	});
	await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
	return { server, origin: `http://127.0.0.1:${server.address().port}` };
}
