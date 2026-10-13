import fs from 'node:fs';
import path from 'node:path';
import plugin from './client/project.inlang/plugin/index.js';
const root=path.dirname(new URL(import.meta.url).pathname);
const info=JSON.parse(fs.readFileSync(path.join(root,'catalog-counts.json')));
const originals={};const files=Object.keys(info.counts).map(locale=>{originals[locale]=JSON.parse(fs.readFileSync(path.join(root,'client/src/locales',locale,'translation.json'),'utf8'));return {locale,content:new Uint8Array(fs.readFileSync(path.join(root,'client/messages',locale+'.json')))};});
const rows=await plugin.importFiles({files});
if(rows.bundles.length!==info.unionKeys)throw new Error('Bundle mismatch');
let checked=0;
for(const row of rows.variants){
 if(row.pattern.some(x=>x.type!=='text'))throw new Error('Unexpected expression '+row.messageBundleId);
 const actual=row.pattern.map(x=>x.value).join('');const expected=originals[row.messageLocale][row.messageBundleId];
 if(actual!==expected)throw new Error('Literal differs '+row.messageLocale+':'+row.messageBundleId);
 checked++;
}
if(checked!==Object.values(info.counts).reduce((a,b)=>a+b,0))throw new Error('Message count differs');
fs.writeFileSync(path.join(root,'converter-parity.json'),JSON.stringify({bundles:rows.bundles.length,messages:rows.messages.length,variants:rows.variants.length,checked,passed:true},null,2));
console.log(JSON.stringify({bundles:rows.bundles.length,checked,passed:true}));
