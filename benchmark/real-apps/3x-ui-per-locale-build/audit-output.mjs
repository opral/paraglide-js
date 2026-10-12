import { readFile, readdir, writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { gzipSync, brotliCompressSync, constants } from 'node:zlib';
import path from 'node:path';
const root=path.resolve(import.meta.dirname,'../per-locale-dist');
const manifest=JSON.parse(await readFile(path.join(root,'paraglide-vite-locales.json'),'utf8'));
const shared=new Map(), variants={};
async function walk(dir,prefix=''){const files=[];for(const item of await readdir(dir,{withFileTypes:true})){const rel=prefix+item.name;if(item.isDirectory())files.push(...await walk(path.join(dir,item.name),rel+'/'));else files.push(rel);}return files;}
for(const [locale,entry] of Object.entries(manifest.locales)){
 const dir=path.join(root,entry.directory),files=await walk(dir);let bytes=0;
 for(const file of files){if(file.endsWith('.html')||file.startsWith('.vite/'))continue;const source=await readFile(path.join(dir,file));bytes+=source.length;const sha=createHash('sha256').update(source).digest('hex');const prev=shared.get(file);if(prev&&prev.sha256!==sha)throw new Error(`Asset pool collision ${file}: ${prev.locale} / ${locale}`);shared.set(file,{sha256:sha,locale,path:path.join(dir,file),bytes:source.length});}
 variants[locale]={directory:entry.directory,fileCount:files.length,nonHtmlBytes:bytes,entryCount:Object.keys(entry.entries).length};
}
const native='/root/repos-iii/3x-ui-native-early-locale/internal/web/dist';
async function graph(dir,kind){const m=JSON.parse(await readFile(path.join(dir,'.vite/manifest.json'),'utf8'));const byFile=new Map(Object.entries(m).map(([key,value])=>[value.file,key]));const files=new Set(['login.html']);const seen=new Set();function visit(key){if(seen.has(key))return;seen.add(key);const entry=m[key];if(!entry)throw Error('Missing '+key);files.add(entry.file);for(const css of entry.css??[])files.add(css);for(const imp of entry.imports??[])visit(imp);}visit('login.html');const html=await readFile(path.join(dir,'login.html'),'utf8');for(const match of html.matchAll(/(?:src|href)="\/?(assets\/[^"?#]+)"/g)){files.add(match[1]);const key=byFile.get(match[1]);if(key)visit(key);}if(kind==='native'){const selected=Object.keys(m).find(key=>key.endsWith('/es-ES.json'));if(!selected)throw Error('No native selected locale');visit(selected);}const assets=[];for(const file of [...files].sort()){const bytes=await readFile(path.join(dir,file));assets.push({file,bytes:bytes.length,gzip9:gzipSync(bytes,{level:9}).length,brotliQ4:brotliCompressSync(bytes,{params:{[constants.BROTLI_PARAM_QUALITY]:4}}).length,sha256:createHash('sha256').update(bytes).digest('hex')});}return{kind,files:assets.length,raw:assets.reduce((n,a)=>n+a.bytes,0),gzip9:assets.reduce((n,a)=>n+a.gzip9,0),brotliQ4:assets.reduce((n,a)=>n+a.brotliQ4,0),assets};}
const candidate=await graph(path.join(root,manifest.locales['es-ES'].directory),'per-locale-es-ES');const control=await graph(native,'native');
const report={variantCount:Object.keys(variants).length,variants,assetPoolCollisionCount:0,sharedUniqueAssetCount:shared.size,sharedUniqueBytes:[...shared.values()].reduce((n,a)=>n+a.bytes,0),candidate,control,graphBrotliReductionPercent:(1-candidate.brotliQ4/control.brotliQ4)*100};
await writeFile(path.join(import.meta.dirname,'output-audit.json'),JSON.stringify(report,null,2)+'\n');
await writeFile(path.join(import.meta.dirname,'asset-pool.json'),JSON.stringify(Object.fromEntries(shared),null,2)+'\n');
console.log(JSON.stringify({variants:report.variantCount,pool:shared.size,collisions:0,candidate:candidate.brotliQ4,native:control.brotliQ4,percent:report.graphBrotliReductionPercent}));
