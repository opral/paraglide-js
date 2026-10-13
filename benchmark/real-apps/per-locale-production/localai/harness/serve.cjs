const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const zlib = require('node:zlib');
const appRoot = path.resolve(process.env.LOCALAI_SOURCE);
const distRoot = path.resolve(process.env.DIST_ROOT);
const port = Number(process.env.PORT || 4311);
const prefix = process.env.FIXTURE_PREFIX || '/';
if (!prefix.startsWith('/') || !prefix.endsWith('/')) throw Error('Prefix must start and end with /');
const manifestPath = path.join(distRoot, 'paraglide-vite-locales.json');
const manifest = fs.existsSync(manifestPath) ? JSON.parse(fs.readFileSync(manifestPath,'utf8')) : null;
const types = { '.html':'text/html; charset=utf-8', '.js':'text/javascript; charset=utf-8', '.css':'text/css; charset=utf-8', '.json':'application/json', '.svg':'image/svg+xml', '.png':'image/png', '.woff2':'font/woff2' };
const fixtures = {
 '/api/auth/status': {authEnabled:true,staticApiKeyRequired:false,user:null,providers:['local'],hasUsers:true,registrationMode:'open'},
 '/api/branding': {instance_name:'LocalAI',instance_tagline:'',logo_url:'/static/logo.png',logo_horizontal_url:'/static/logo_horizontal.png',favicon_url:'/favicon.svg'},
 '/api/operations': {operations:[]},
};
const encoded = new Map(), pool = new Map(), html = new Map();
const sha = data => crypto.createHash('sha256').update(data).digest('hex');
function responseRecord(data, file) {
 const mime = types[path.extname(file)] || 'application/octet-stream';
 const compress = /^(text\/|application\/(json|javascript))/.test(mime) || mime==='image/svg+xml';
 return {data,mime,body:compress?zlib.brotliCompressSync(data,{params:{[zlib.constants.BROTLI_PARAM_QUALITY]:4}}):data,compress};
}
function add(file, relative, locale) {
 const data=fs.readFileSync(file), hash=sha(data), prev=pool.get(relative);
 if(prev && prev.hash!==hash)throw Error('Asset filename collision '+relative+' between '+prev.locale+' and '+locale);
 if(!prev)pool.set(relative,{file,locale,hash,record:responseRecord(data,file)});
}
function walk(dir, relative='',locale='native') {
 for(const entry of fs.readdirSync(dir,{withFileTypes:true})){
  const name=relative+entry.name, file=path.join(dir,entry.name);
  if(entry.isDirectory()){if(entry.name!=='.vite')walk(file,name+'/',locale);}
  else if(entry.isFile() && !name.endsWith('.html'))add(file,name,locale);
 }
}
const variants=manifest?Object.entries(manifest.locales):[['native',{directory:''}]];
for(const [locale,entry] of variants){
 const dir=path.join(distRoot,entry.directory);walk(dir,'',locale);
 let data=fs.readFileSync(path.join(dir,'index.html'),'utf8');
 const base=`http://127.0.0.1:${port}${prefix}`;
 data=data.replace(/<head(?:\s[^>]*)?>/i,head=>head+'\n<base href="'+base+'" />');
 html.set(locale,responseRecord(Buffer.from(data),'index.html'));
}
function localeFromCookie(header){
 const value=(header||'').split(';').map(s=>s.trim()).find(s=>s.startsWith('localai-language='));
 let language='';try{language=decodeURIComponent(value?.slice('localai-language='.length)||'');}catch{}
 if(!manifest)return'native';
 return Object.hasOwn(manifest.locales,language)?language:manifest.baseLocale;
}
for(const [route,obj] of Object.entries(fixtures))encoded.set(route,responseRecord(Buffer.from(JSON.stringify(obj)),route+'.json'));
const server=http.createServer((req,res)=>{
 if(!['GET','HEAD'].includes(req.method)){res.writeHead(405).end('Read-only fixture');return;}
 let pathname;try{pathname=decodeURIComponent(new URL(req.url,'http://localhost').pathname);}catch{res.writeHead(400).end('Bad path');return;}
 // Root static logo requests are also retained under prefixed deployments.
 if(prefix!=='/' && pathname.startsWith(prefix))pathname='/'+pathname.slice(prefix.length);
 let record=encoded.get(pathname);
 if(!record){
  if(pathname==='/' || pathname==='/login' || pathname.startsWith('/invite/'))record=html.get(localeFromCookie(req.headers.cookie));
  else if(pathname.startsWith('/static/')){
   const file=path.resolve(appRoot,'core/http','.'+pathname), allowed=path.resolve(appRoot,'core/http/static')+path.sep;
   if(file.startsWith(allowed)&&fs.existsSync(file)&&fs.statSync(file).isFile()){
    if(!encoded.has(file))encoded.set(file,responseRecord(fs.readFileSync(file),file));record=encoded.get(file);
   }
  }else record=pool.get(pathname.replace(/^\//,''))?.record;
 }
 if(!record){res.writeHead(404).end('Missing fixture resource');return;}
 res.writeHead(200,{'Content-Type':record.mime,'Content-Length':record.body.length,'Cache-Control':'no-store',...(record.compress?{'Content-Encoding':'br'}:{}),...(manifest&&record.mime.startsWith('text/html')?{Vary:'Cookie'}:{})});
 res.end(req.method==='HEAD'?undefined:record.body);
});
if(process.env.POOL_REPORT)fs.writeFileSync(process.env.POOL_REPORT,JSON.stringify({distRoot,variants:variants.length,uniqueAssets:pool.size,assetCollisionCount:0,files:Object.fromEntries([...pool].map(([name,p])=>[name,{sha256:p.hash,bytes:p.record.data.length,encodedBytes:p.record.body.length}]))},null,2)+'\n');
server.listen(port,'127.0.0.1',()=>process.stdout.write(JSON.stringify({port,prefix,variants:variants.length,uniqueAssets:pool.size})+'\n'));
