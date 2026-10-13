import fs from 'node:fs';
import path from 'node:path';
const root=path.dirname(new URL(import.meta.url).pathname);
const locales=fs.readdirSync(path.join(root,'client/src/locales')).filter(x=>fs.existsSync(path.join(root,'client/src/locales',x,'translation.json'))).sort();
fs.mkdirSync(path.join(root,'client/messages'),{recursive:true});
const counts={};const keys=new Set();const localeKeys={};
for(const locale of locales){
 const original=JSON.parse(fs.readFileSync(path.join(root,'client/src/locales',locale,'translation.json'),'utf8'));
 const converted={};for(const [k,v] of Object.entries(original)){
  if(typeof v!=='string')throw new Error(`Non-string ${locale}:${k}`);
  if(!/^[a-zA-Z_$][\w$]*$/.test(k))throw new Error(`Non identifier ${k}`);
  converted[k]=v.replaceAll('\\','\\\\').replaceAll('{','\\{').replaceAll('}','\\}');keys.add(k);
 }
 counts[locale]=Object.keys(converted).length;localeKeys[locale]=Object.keys(converted);
 fs.writeFileSync(path.join(root,'client/messages',locale+'.json'),JSON.stringify(converted,null,2));
}
fs.writeFileSync(path.join(root,'client/project.inlang/settings.json'),JSON.stringify({baseLocale:'en',locales,modules:['./project.inlang/plugin/index.js'],'plugin.inlang.messageFormat':{pathPattern:'./messages/{locale}.json'}},null,2));
fs.writeFileSync(path.join(root,'catalog-counts.json'),JSON.stringify({counts,unionKeys:keys.size,localeCount:locales.length},null,2));
const facades=path.join(root,'client/src/locales/facades');fs.mkdirSync(facades,{recursive:true});
for(const [index,locale] of locales.entries()){
 const keys=localeKeys[locale];
 const source=(keys.length?`import { ${keys.join(', ')} } from '../../paraglide/messages.js';\n`:'')+`export function resource${index}(): Record<string,string> {return {${keys.map(key=>`${JSON.stringify(key)}: ${key}()`).join(',')}};}\n`;
 fs.writeFileSync(path.join(facades,locale+'.ts'),source);
}
const imports=locales.map((locale,index)=>`import { resource${index} } from './facades/${locale}';`).join('\n');
const resourceExpression=locales.map((locale,index)=>`globalThis.__PARAGLIDE_STATIC_LOCALE__===${JSON.stringify(locale)}?resource${index}():`).join('')+'{}';
fs.writeFileSync(path.join(root,'client/src/locales/compiled.ts'),`${imports}\nimport { getLocale } from '../paraglide/runtime.js';\nexport const compiledLocale = getLocale();\n// Preserve original locale membership so English fallback uses English plural rules.\nexport const compiledResources: Record<string,string> = ${resourceExpression};\n`);
fs.writeFileSync(path.join(root,'facade-counts.json'),JSON.stringify(Object.fromEntries(locales.map(locale=>[locale,localeKeys[locale].length])),null,2));

const localeSource=fs.readFileSync(path.join(root,'client/src/locales/i18n.ts'),'utf8');
const aliasBody=localeSource.match(/const localeAliases[^=]*=\s*\{([^}]+)\}/s)?.[1];
if(!aliasBody)throw new Error('Missing locale aliases');
const aliases=Object.fromEntries([...aliasBody.matchAll(/(?:'([^']+)'|(\w+)):\s*'([^']+)'/g)].map(m=>[m[1]||m[2],m[3]]));
fs.writeFileSync(path.join(root,'locale-metadata.json'),JSON.stringify({supportedLocales:locales,aliases},null,2));
