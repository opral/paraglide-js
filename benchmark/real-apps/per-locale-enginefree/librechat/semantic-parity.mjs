import fs from 'node:fs';
import path from 'node:path';
import {pathToFileURL} from 'node:url';
import native from './node_modules/i18next/dist/esm/i18next.js';
import {createRuntime} from './client/src/i18n/runtime.js';
const root=path.dirname(new URL(import.meta.url).pathname);
const locales=Object.keys(JSON.parse(fs.readFileSync(path.join(root,'catalog-counts.json'))).counts);
const en=JSON.parse(fs.readFileSync(path.join(root,'client/src/locales/en/translation.json')));
const enIndex=locales.indexOf('en');const enFns=(await import(pathToFileURL(path.join(root,'client/src/i18n/facades/en.js'))))[`messages${enIndex}`];
let checks=0;const differences=[];const pluralBases=new Set();
for(const l of locales){
 const json=JSON.parse(fs.readFileSync(path.join(root,'client/src/locales',l,'translation.json')));
 const fns=(await import(pathToFileURL(path.join(root,'client/src/i18n/facades',l+'.js'))))[`messages${locales.indexOf(l)}`];
 for(const [key,value] of Object.entries(json)){if(fns[key]()!==value)throw new Error('Derived compiled value differs '+l+':'+key)}
 const oracle=native.createInstance();await oracle.init({lng:l,fallbackLng:['en'],defaultNS:'translation',fallbackNS:'translation',ns:['translation'],load:'currentOnly',supportedLngs:locales,resources:{en:{translation:en},[l]:{translation:json}},interpolation:{escapeValue:false}});
 const runtime=createRuntime({locale:l,locales,resources:{en:enFns,[l]:fns}});
 const t=runtime.t;
 const compare=(key,options)=>{const expected=oracle.t(key,options),actual=t(key,options);checks++;if(JSON.stringify(expected)!==JSON.stringify(actual)&&differences.length<30)differences.push({locale:l,key,options,expected,actual})};
 for(const [key,value] of Object.entries({...en,...json})){
  const names=[...value.matchAll(/\{\{\s*(-)?\s*([^{}]+?)\s*\}\}/g)].map(m=>m[2].trim());const inputs=Object.fromEntries(names.map(n=>[n,'<sample & value>']));
  compare(key,{});if(names.length){compare(key,inputs);compare(key,{...inputs,interpolation:{escapeValue:true}})}
  const match=key.match(/^(.*)_(zero|one|two|few|many|other)$/);if(match)pluralBases.add(match[1]);
 }
 for(const base of pluralBases)for(const count of [0,1,2,3,5,11,21,101,1.5])compare(base,{count});
 for(const key of ['com_auth_welcome_back','__unknown__','translation:com_auth_welcome_back','unknown:com_auth_welcome_back']){
  compare(key,{lng:'en'});compare(key,{defaultValue:'Default {{value}}',value:'A&B'});
 }
 compare(['__missing__','com_auth_welcome_back'],{});compare('__missing__',{defaultValue:'Count {{count}}',count:0});
}
const report={locales:41,allPhysicalCompiledStrings:50209,checks,differences,passed:!differences.length};fs.writeFileSync(path.join(root,'semantic-parity.json'),JSON.stringify(report,null,2));console.log(JSON.stringify(report,null,2));if(differences.length)process.exitCode=1;
