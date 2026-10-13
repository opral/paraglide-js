import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
const root=path.dirname(new URL(import.meta.url).pathname);
const frozen=process.env.FROZEN_PARAGLIDE_DIR || '/root/repos-iii/librechat-per-locale-ab/client/src/paraglide';
const locales=Object.keys(JSON.parse(fs.readFileSync(path.join(root,'catalog-counts.json'))).counts);
const catalogs=Object.fromEntries(locales.map(l=>[l,JSON.parse(fs.readFileSync(path.join(root,'client/src/locales',l,'translation.json'),'utf8'))]));
const allKeys=[...new Set(Object.values(catalogs).flatMap(c=>Object.keys(c)))];
const bindings={};const hashes=[];
for(const key of allKeys){
 const original=fs.readFileSync(path.join(frozen,'messages',key+'.js'),'utf8');
 const byLocale=Object.fromEntries([...original.matchAll(/if \(locale === "([^"]+)"\) return ([\w$]+)\(inputs\)/g)].map(m=>[m[1],m[2]]));
 const en=[...original.matchAll(/return ([\w$]+)\(inputs\)/g)].at(-1)?.[1];
 const exports=[];
 for(const [index,l] of locales.entries())if(Object.hasOwn(catalogs[l],key)){
  const symbol=l==='en'?en:byLocale[l];if(!symbol)throw new Error('Missing compiled locale function '+l+':'+key);
  const alias=`pg_${index}_${key}`;bindings[l+'\0'+key]=alias;exports.push(`${symbol} as ${alias}`);
 }
 const derived=original+'\n// Isolated integration export aliases; compiler-produced function bodies remain unchanged.\nexport { '+exports.join(', ')+' };\n';
 fs.writeFileSync(path.join(root,'client/src/paraglide/messages',key+'.js'),derived);
 hashes.push({key,frozenSHA256:crypto.createHash('sha256').update(original).digest('hex'),derivedSHA256:crypto.createHash('sha256').update(derived).digest('hex')});
}
const facadeRoot=path.join(root,'client/src/i18n/facades');fs.mkdirSync(facadeRoot,{recursive:true});
for(const [index,l] of locales.entries()){
 const keys=Object.keys(catalogs[l]);
 const imports=keys.map(k=>`import { ${bindings[l+'\0'+k]} as m_${k} } from '../../paraglide/messages/${k}.js';`).join('\n');
 fs.writeFileSync(path.join(facadeRoot,l+'.js'),imports+`\nexport const messages${index} = {${keys.map(k=>JSON.stringify(k)+': m_'+k).join(',')}};\n`);
}
const enIndex=locales.indexOf('en');
let selected=locales.map((l,i)=>`globalThis.__PARAGLIDE_STATIC_LOCALE__===${JSON.stringify(l)}?messages${i}:`).join('')+`messages${enIndex}`;
fs.writeFileSync(path.join(root,'client/src/i18n/compiled.js'),locales.map((l,i)=>`import {messages${i}} from './facades/${l}.js';`).join('\n')+`\nexport const selectedLocale=globalThis.__PARAGLIDE_STATIC_LOCALE__;\nexport const selectedMessages=${selected};\nexport const englishMessages=messages${enIndex};\n`);
fs.writeFileSync(path.join(root,'derived-exports-provenance.json'),JSON.stringify({compilerCommit:'490a5c0d0c4c44b93f61ad494b28f74987e5f245',catalogs:41,originalGeneratedExports:allKeys.length,physicalLocaleFunctions:50209,note:'Frozen compiler function bodies untouched; added export aliases only. All physical native keys retained; SDK/compiler not invoked again.',messages:hashes},null,2));
