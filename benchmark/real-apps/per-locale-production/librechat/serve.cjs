const fs = require('node:fs');
const http = require('node:http');
const path = require('node:path');

const root = path.resolve(process.env.LIBRECHAT_DIST_ROOT || path.join(process.cwd(), 'client/dist'));
const port = Number(process.env.PORT || 4176);
const localeMetadata=JSON.parse(fs.readFileSync(path.join(__dirname,'locale-metadata.json'),'utf8'));
function normalizeLocale(requested) {
 const normalized=(requested||'en').replaceAll('_','-').toLowerCase();
 const byLower=Object.fromEntries(localeMetadata.supportedLocales.map(x=>[x.toLowerCase(),x]));
 const base=normalized.split('-')[0];
 return byLower[normalized]||localeMetadata.aliases[normalized]||byLower[base]||localeMetadata.aliases[base]||'en';
}
const localeManifest=process.env.PER_LOCALE==='1' ? JSON.parse(fs.readFileSync(path.join(root,'paraglide-vite-locales.json'),'utf8')) : null;
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
  if (/\.(mp3|mp4|webm|ogg)$/.test(file)) {
    const body=fs.readFileSync(file);
    const range=req.headers.range?.match(/^bytes=(\d+)-(\d*)$/);
    const start=range ? Number(range[1]) : 0;
    const end=range && range[2] ? Math.min(Number(range[2]),body.length-1) : body.length-1;
    res.writeHead(range?206:200,{'content-type':contentTypes[path.extname(file)]||'application/octet-stream','content-length':end-start+1,'accept-ranges':'bytes','cache-control':'no-store',...(range?{'content-range':`bytes ${start}-${end}/${body.length}`}:{})});
    res.end(body.subarray(start,end+1));
    return;
  }
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

if (!fs.existsSync(path.join(root, process.env.PER_LOCALE === '1' ? 'paraglide-vite-locales.json' : 'index.html'))) {
  throw new Error(`No built index.html under LIBRECHAT_DIST_ROOT: ${root}`);
}

http.createServer((req, res) => {
  const url = new URL(req.url, `http://127.0.0.1:${port}`);
  if (url.pathname === '/api/config') return sendJson(res, 200, startupConfig);
  if (url.pathname === '/api/banner') return sendJson(res, 200, {});
  if (url.pathname === '/api/auth/refresh') return sendJson(res, 200, {});
  if (url.pathname === '/api/user') return sendJson(res, 401, { message: 'Unauthenticated test fixture' });
  if (url.pathname.startsWith('/api/')) return sendJson(res, 404, { message: 'No fixture for this API' });

  let selectedRoot = root;
  if (process.env.PER_LOCALE === '1') {
    const manifest=localeManifest;
    const browser=(req.headers['accept-language']||'en').split(',')[0].split(';')[0];
    const preference=(req.headers.cookie||'').match(/(?:^|;\s*)lang=([^;]+)/)?.[1];
    const locale=normalizeLocale(preference && preference!=='auto' ? preference : browser);
    selectedRoot=path.join(root,manifest.locales[locale].directory);
  }
  let relative = decodeURIComponent(url.pathname).replace(/^\/+/, '');
  if (!relative || relative === 'login' || relative === 'login/') relative = 'index.html';
  let file = path.resolve(selectedRoot, relative);
  if (!file.startsWith(`${selectedRoot}${path.sep}`)) {
    res.writeHead(403);
    res.end('forbidden');
    return;
  }
  if (!fs.existsSync(file) || !fs.statSync(file).isFile()) file = path.join(selectedRoot, 'index.html');
  sendFile(req, res, file);
}).listen(port, '127.0.0.1', () => {
  console.log(`Serving ${root} on http://127.0.0.1:${port}`);
});
