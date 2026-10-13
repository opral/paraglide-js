import fs from 'node:fs';
import path from 'node:path';
const root=path.dirname(new URL(import.meta.url).pathname);
const locales=fs.readdirSync(path.join(root,'client/src/locales')).filter(x=>fs.existsSync(path.join(root,'client/src/locales',x,'translation.json'))).sort();
fs.mkdirSync(path.join(root,'client/project.inlang/messages'),{recursive:true});
const counts={};const keys=new Set();const localeKeys={};
for(const locale of locales){
 const original=JSON.parse(fs.readFileSync(path.join(root,'client/src/locales',locale,'translation.json'),'utf8'));
 const converted={};for(const [k,v] of Object.entries(original)){
  if(typeof v!=='string')throw new Error(`Non-string ${locale}:${k}`);
  if(!/^[a-zA-Z_$][\w$]*$/.test(k))throw new Error(`Non identifier ${k}`);
  converted[k]=v.replaceAll('\\','\\\\').replaceAll('{','\\{').replaceAll('}','\\}');keys.add(k);
 }
 counts[locale]=Object.keys(converted).length;localeKeys[locale]=Object.keys(converted);
 fs.writeFileSync(path.join(root,'client/project.inlang/messages',locale+'.json'),JSON.stringify(converted,null,2));
}
fs.writeFileSync(path.join(root,'client/project.inlang/settings.json'),JSON.stringify({baseLocale:'en',locales,modules:['./project.inlang/plugin/index.js'],'plugin.inlang.messageFormat':{pathPattern:'./project.inlang/messages/{locale}.json'}},null,2));
fs.writeFileSync(path.join(root,'catalog-counts.json'),JSON.stringify({counts,unionKeys:keys.size,localeCount:locales.length},null,2));
const keyExpression=locales.map(locale=>`globalThis.__PARAGLIDE_STATIC_LOCALE__===${JSON.stringify(locale)}?${JSON.stringify(localeKeys[locale])}:`).join('')+'[]';
fs.writeFileSync(path.join(root,'client/src/locales/compiled.ts'),`import * as messages from '../paraglide/messages.js';\nimport { getLocale } from '../paraglide/runtime.js';\nexport const compiledLocale = getLocale();\n// Keep original locale membership: synthesized English plural variants would use the wrong locale's plural rules.\nconst keys = new Set<string>(${keyExpression});\nexport const compiledResources: Record<string,string> = Object.fromEntries(Object.entries(messages).filter(([key,value])=>keys.has(key)&&typeof value==='function').map(([key,fn])=>[key,(fn as ()=>string)()]));\n`);
