const fs = require('node:fs');
const http = require('node:http');
const path = require('node:path');

const root = path.resolve(process.env.LIBRECHAT_DIST_ROOT || path.join(process.cwd(), 'client/dist'));
const port = Number(process.env.PORT || 4176);
const contentTypes = {
  '.css': 'text/css; charset=utf-8',
  '.html': 'text/html; charset=utf-8',
  '.ico': 'image/x-icon',
  '.js': 'text/javascript; charset=utf-8',
  '.json': 'application/json',
  '.mp3': 'audio/mpeg',
  '.png': 'image/png',
  '.svg': 'image/svg+xml',
  '.webmanifest': 'application/manifest+json',
  '.webp': 'image/webp',
  '.woff': 'font/woff',
  '.woff2': 'font/woff2',
};
const startupConfig = {
  appTitle: 'LibreChat',
  emailLoginEnabled: true,
  registrationEnabled: false,
  passwordResetEnabled: true,
  socialLoginEnabled: false,
  discordLoginEnabled: false,
  facebookLoginEnabled: false,
  githubLoginEnabled: false,
  googleLoginEnabled: false,
  openidLoginEnabled: false,
  appleLoginEnabled: false,
  samlLoginEnabled: false,
  openidLabel: '',
  openidImageUrl: '',
  openidAutoRedirect: false,
  samlLabel: '',
  samlImageUrl: '',
  serverDomain: '',
  emailEnabled: false,
  allowEmailChange: false,
  showBirthdayIcon: false,
  helpAndFaqURL: '',
  sharedLinksEnabled: false,
  publicSharedLinksEnabled: false,
  minPasswordLength: 8,
  interface: {},
};

function sendJson(res, status, value) {
  const body = Buffer.from(JSON.stringify(value));
  res.writeHead(status, {
    'content-type': 'application/json; charset=utf-8',
    'content-length': body.length,
    'cache-control': 'no-store',
  });
  res.end(body);
}

function sendFile(req, res, file) {
  const accepted = req.headers['accept-encoding'] || '';
  let bodyFile = file;
  let encoding;
  if (accepted.includes('br') && fs.existsSync(`${file}.br`)) {
    bodyFile = `${file}.br`;
    encoding = 'br';
  } else if (accepted.includes('gzip') && fs.existsSync(`${file}.gz`)) {
    bodyFile = `${file}.gz`;
    encoding = 'gzip';
  }

  fs.readFile(bodyFile, (error, body) => {
    if (error) {
      res.writeHead(404, { 'content-type': 'text/plain; charset=utf-8' });
      res.end('not found');
      return;
    }
    res.writeHead(200, {
      'content-type': contentTypes[path.extname(file)] || 'application/octet-stream',
      'content-length': body.length,
      'cache-control': 'no-store',
      ...(encoding ? { 'content-encoding': encoding, vary: 'Accept-Encoding' } : {}),
    });
    res.end(body);
  });
}

if (!fs.existsSync(path.join(root, 'index.html'))) {
  throw new Error(`No built index.html under LIBRECHAT_DIST_ROOT: ${root}`);
}

http.createServer((req, res) => {
  const url = new URL(req.url, `http://127.0.0.1:${port}`);
  if (url.pathname === '/api/config') return sendJson(res, 200, startupConfig);
  if (url.pathname === '/api/banner') return sendJson(res, 200, {});
  if (url.pathname === '/api/auth/refresh') return sendJson(res, 200, {});
  if (url.pathname === '/api/user') return sendJson(res, 401, { message: 'Unauthenticated test fixture' });
  if (url.pathname.startsWith('/api/')) return sendJson(res, 404, { message: 'No fixture for this API' });

  let relative = decodeURIComponent(url.pathname).replace(/^\/+/, '');
  if (!relative || relative === 'login' || relative === 'login/') relative = 'index.html';
  let file = path.resolve(root, relative);
  if (!file.startsWith(`${root}${path.sep}`)) {
    res.writeHead(403);
    res.end('forbidden');
    return;
  }
  if (!fs.existsSync(file) || !fs.statSync(file).isFile()) file = path.join(root, 'index.html');
  sendFile(req, res, file);
}).listen(port, '127.0.0.1', () => {
  console.log(`Serving ${root} on http://127.0.0.1:${port}`);
});
