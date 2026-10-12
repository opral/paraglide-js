const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');
const zlib = require('node:zlib');

const appRoot = path.resolve(process.env.LOCALAI_SOURCE);
const distRoot = path.resolve(process.env.DIST_ROOT);
const port = Number(process.env.PORT || 4251);
const fixtures = {
  '/api/auth/status': { authEnabled: true, staticApiKeyRequired: false, user: null, providers: ['local'], hasUsers: true, registrationMode: 'open' },
  '/api/branding': { instance_name: 'LocalAI', instance_tagline: '', logo_url: '/static/logo.png', logo_horizontal_url: '/static/logo_horizontal.png', favicon_url: '/favicon.svg' },
  '/api/operations': { operations: [] },
};
const types = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.svg': 'image/svg+xml', '.png': 'image/png', '.woff2': 'font/woff2' };
const server = http.createServer((req, res) => {
  const pathname = new URL(req.url, 'http://localhost').pathname;
  if (req.method !== 'GET' && req.method !== 'HEAD') {
    res.writeHead(405).end('Read-only fixture');
    return;
  }
  let content;
  let mime;
  if (Object.hasOwn(fixtures, pathname)) {
    content = Buffer.from(JSON.stringify(fixtures[pathname]));
    mime = 'application/json';
  } else {
    let file = path.resolve(distRoot, '.' + pathname);
    if (pathname.startsWith('/static/')) file = path.resolve(appRoot, 'core/http', '.' + pathname);
    if (pathname === '/' || pathname === '/login') file = path.join(distRoot, 'index.html');
    const allowed = file.startsWith(distRoot + path.sep) || file.startsWith(path.join(appRoot, 'core/http/static') + path.sep);
    if (!allowed || !fs.existsSync(file) || !fs.statSync(file).isFile()) {
      res.writeHead(404).end('Missing fixture resource');
      return;
    }
    content = fs.readFileSync(file);
    mime = types[path.extname(file)] || 'application/octet-stream';
    if (file === path.join(distRoot, 'index.html')) {
      // Mirror production serveIndex's root-deployment absolute base injection.
      content = Buffer.from(content.toString().replace('<head>', `<head>\n<base href="http://127.0.0.1:${port}/" />`));
    }
  }
  const compress = /^(text\/|application\/(json|javascript))/.test(mime) || mime === 'image/svg+xml';
  const body = compress ? zlib.brotliCompressSync(content, { params: { [zlib.constants.BROTLI_PARAM_QUALITY]: 4 } }) : content;
  res.writeHead(200, { 'Content-Type': mime, 'Content-Length': body.length, 'Cache-Control': 'no-store', ...(compress ? { 'Content-Encoding': 'br' } : {}) });
  res.end(req.method === 'HEAD' ? undefined : body);
});
server.listen(port, '127.0.0.1', () => process.stdout.write(`LocalAI read-only fixture: http://127.0.0.1:${port}\n`));
