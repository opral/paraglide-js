import fs from 'node:fs';
import path from 'node:path';
import { brotliCompressSync, constants } from 'node:zlib';
import { init,parse } from './node_modules/es-module-lexer/dist/lexer.js';
await init;
function graph(root,extra=[]){
 const html=fs.readFileSync(path.join(root,'index.html'),'utf8');
 const starts=[...html.matchAll(/(?:src|href)="([^" ]+\.js)"/g)].map(x=>x[1].replace(/^\.\//,''));
 starts.push(...extra);const visited=new Set();
 function visit(relative){if(visited.has(relative))return;const file=path.join(root,relative);if(!fs.existsSync(file))throw new Error(file);visited.add(relative);const [imports]=parse(fs.readFileSync(file,'utf8'));for(const i of imports)if(i.d===-1&&i.n?.startsWith('.'))visit(path.posix.normalize(path.posix.join(path.posix.dirname(relative),i.n)));}
 starts.forEach(visit);
 const files=[...visited].sort().map(relative=>{const b=fs.readFileSync(path.join(root,relative));return {path:relative,decodedBytes:b.length,brotliQ4Bytes:brotliCompressSync(b,{params:{[constants.BROTLI_PARAM_QUALITY]:4}}).length};});
 return {files,decodedBytes:files.reduce((a,b)=>a+b.decodedBytes,0),brotliQ4Bytes:files.reduce((a,b)=>a+b.brotliQ4Bytes,0)};
}
const nativeRoot='/root/repos-iii/librechat-per-locale-ab/native-source/client/dist-native';
const native=graph(nativeRoot,fs.readdirSync(path.join(nativeRoot,'assets')).filter(x=>/^locale-fr\..*\.js$/.test(x)).map(x=>'assets/'+x));
const outputRoot=path.join(path.dirname(new URL(import.meta.url).pathname),'client/dist-enginefree');
const localeManifest=JSON.parse(fs.readFileSync(path.join(outputRoot,'paraglide-vite-locales.json'),'utf8'));
const candidate=graph(path.join(outputRoot,localeManifest.locales.fr.directory));
const result={native,candidate,savings:{decodedPercent:100*(1-candidate.decodedBytes/native.decodedBytes),brotliQ4Percent:100*(1-candidate.brotliQ4Bytes/native.brotliQ4Bytes)}};
fs.writeFileSync(new URL('./initial-graph.json',import.meta.url),JSON.stringify(result,null,2));console.log(JSON.stringify({native: native.brotliQ4Bytes,candidate:candidate.brotliQ4Bytes,savings:result.savings}));
