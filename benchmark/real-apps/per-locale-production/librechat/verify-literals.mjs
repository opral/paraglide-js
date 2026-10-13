import fs from 'node:fs';
import path from 'node:path';
import {pathToFileURL} from 'node:url';
const root=path.dirname(new URL(import.meta.url).pathname);
const locales=Object.keys(JSON.parse(fs.readFileSync(path.join(root,'catalog-counts.json'))).counts);
const en=JSON.parse(fs.readFileSync(path.join(root,'client/src/locales/en/translation.json'),'utf8'));
const messages=await import(pathToFileURL(path.join(root,'client/src/paraglide/messages.js')));
let checked=0;
for(const locale of locales){
 globalThis.__PARAGLIDE_STATIC_LOCALE__=locale;
 const original=JSON.parse(fs.readFileSync(path.join(root,'client/src/locales',locale,'translation.json'),'utf8'));
 for(const [key,value] of Object.entries({...en,...original})){
  const actual=messages[key]();
  if(actual!==value)throw new Error(`${locale}:${key} differs expected=${JSON.stringify(value)} actual=${JSON.stringify(actual)}`);
  checked++;
 }
}
fs.writeFileSync(path.join(root,'literal-parity.json'),JSON.stringify({locales:locales.length,checked,passed:true},null,2));
console.log(JSON.stringify({locales:locales.length,checked,passed:true}));
