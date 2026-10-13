import fs from 'node:fs';
import path from 'node:path';
import {brotliCompressSync,constants} from 'node:zlib';
import {createHash} from 'node:crypto';
const cache=new Map();
const roots=process.argv.slice(2);
for(const root of roots){
 const walk=p=>{for(const entry of fs.readdirSync(p,{withFileTypes:true})){const file=path.join(p,entry.name);if(entry.isDirectory())walk(file);else if(!/\.(?:br|gz|map)$/.test(file)){const body=fs.readFileSync(file);const key=createHash('sha256').update(body).digest('hex');let compressed=cache.get(key);if(!compressed){compressed=brotliCompressSync(body,{params:{[constants.BROTLI_PARAM_QUALITY]:4}});cache.set(key,compressed);}fs.writeFileSync(file+'.br',compressed);}}};walk(root);
}
