const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');
const root = path.resolve(__dirname, '../../../internal/web/dist');
const types = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.woff2': 'font/woff2',
  '.json': 'application/json',
};
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
    res.writeHead(403);
    return res.end('forbidden');
  }
  fs.readFile(file, (error, data) => {
    if (error) {
      res.writeHead(404, { 'content-type': 'text/plain' });
      return res.end('not found');
    }
    res.writeHead(200, {
      'content-type': types[path.extname(file)] || 'application/octet-stream',
      'cache-control': 'no-store',
    });
    res.end(data);
  });
}).listen(4173, '127.0.0.1');
