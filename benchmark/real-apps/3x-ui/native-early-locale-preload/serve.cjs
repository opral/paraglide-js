const fs = require('node:fs');
const http = require('node:http');
const path = require('node:path');
const { brotliCompressSync, constants } = require('node:zlib');

const root = path.resolve(process.env.DIST_ROOT ?? '');
const port = Number(process.env.PORT ?? 4173);
if (!process.env.DIST_ROOT) throw new Error('Set DIST_ROOT to the production dist directory');
const brCache = new Map();
const types = {
	'.html': 'text/html; charset=utf-8',
	'.js': 'text/javascript; charset=utf-8',
	'.css': 'text/css; charset=utf-8',
	'.svg': 'image/svg+xml',
	'.png': 'image/png',
	'.woff2': 'font/woff2',
	'.json': 'application/json; charset=utf-8',
};
const compressible = new Set(['.html', '.js', '.css', '.svg', '.json']);
http.createServer((req, res) => {
	const url = new URL(req.url, 'http://127.0.0.1');
	if (url.pathname === '/csrf-token') {
		res.writeHead(200, { 'content-type': 'application/json' });
		return res.end(JSON.stringify({ success: true, obj: 'read-only-test-token' }));
	}
	if (url.pathname.endsWith('/getTwoFactorEnable')) {
		res.writeHead(200, { 'content-type': 'application/json' });
		return res.end(JSON.stringify({ success: true, obj: false }));
	}
	if (url.pathname.endsWith('/sponsors')) {
		res.writeHead(200, { 'content-type': 'application/json' });
		return res.end(JSON.stringify({ success: true, obj: { sponsors: [] } }));
	}
	const relative = url.pathname === '/login' || url.pathname === '/login/'
		? 'login.html'
		: decodeURIComponent(url.pathname).replace(/^\//, '');
	const file = path.resolve(root, relative);
	if (!file.startsWith(root + path.sep)) {
		res.writeHead(403).end('forbidden');
		return;
	}
	fs.readFile(file, (error, source) => {
		if (error) {
			res.writeHead(404, { 'content-type': 'text/plain' }).end('not found');
			return;
		}
		const headers = {
			'content-type': types[path.extname(file)] || 'application/octet-stream',
			'cache-control': 'no-store',
			'x-content-type-options': 'nosniff',
		};
		if ((req.headers['accept-encoding'] || '').includes('br') && compressible.has(path.extname(file)) && source.length > 256) {
			headers['content-encoding'] = 'br';
			headers.vary = 'accept-encoding';
			let encoded = brCache.get(file);
			if (!encoded) {
				encoded = brotliCompressSync(source, { params: { [constants.BROTLI_PARAM_QUALITY]: 4 } });
				brCache.set(file, encoded);
			}
			headers['content-length'] = encoded.length;
			res.writeHead(200, headers).end(encoded);
		} else {
			headers['content-length'] = source.length;
			res.writeHead(200, headers).end(source);
		}
	});
}).listen(port, '127.0.0.1');
