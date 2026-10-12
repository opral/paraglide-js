import fs from 'node:fs/promises';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { parse } from '/root/repos-iii/paraglide-native-route-survey/.real-apps/stirling-pdf-source/frontend/node_modules/smol-toml/dist/index.js';
const src='/root/repos-iii/paraglide-native-route-survey/.real-apps/stirling-pdf-source/frontend/editor/public/locales';
const compiler='/root/repos-iii/paraglide-dispatch-pr3/dist';
const outRoot='/root/repos-iii/paraglide-real-apps/.real-apps/stirling/locale-modules-route';
const routeInventory='/root/repos-iii/paraglide-real-apps/benchmark/real-apps/results/stirling-route-key-inventory.json';
const {compileBundle}=await import(pathToFileURL(path.join(compiler,'compiler/compile-bundle.js')).href);
const output=await import(pathToFileURL(path.join(compiler,'compiler/output-structure/locale-modules.js')).href);
const {createRuntimeFile}=await import(pathToFileURL(path.join(compiler,'compiler/runtime/create-runtime.js')).href);
const {defaultCompilerOptions}=await import(pathToFileURL(path.join(compiler,'compiler/compiler-options.js')).href);
const {createRegistry}=await import(pathToFileURL(path.join(compiler,'compiler/registry.js')).href);
const locales=(await fs.readdir(src)).sort(); const catalogs={};
function flatten(o,p='',r={}) {for(const [k,v] of Object.entries(o)){const full=p?`${p}.${k}`:k;if(typeof v==='string')r[full]=v;else if(v&&typeof v==='object'&&!Array.isArray(v))flatten(v,full,r);else throw Error(`Unsupported ${full}: ${typeof v}`)}return r}
for(const locale of locales)catalogs[locale]=flatten(parse(await fs.readFile(path.join(src,locale,'translation.toml'),'utf8')));
const allKeys=[...new Set(Object.values(catalogs).flatMap(x=>Object.keys(x)))].sort();
const suffix=/_((zero)|(one)|(two)|(few)|(many)|(other))$/;
const basePluralLocales={};for(const locale of locales)for(const key of Object.keys(catalogs[locale])){const m=key.match(suffix);if(m){const base=key.slice(0,-m[0].length);(basePluralLocales[base]??=new Set()).add(locale);}}
const pluralBases=new Set([...Object.keys(basePluralLocales)].filter(base=>!allKeys.includes(base)));
const allLogicalKeys=allKeys.filter(k=>!suffix.test(k)).concat([...pluralBases]).sort();
const fullMapping=Object.fromEntries(allLogicalKeys.map((k,i)=>[k,`k${i}`])); for(const base of pluralBases) for(const l of locales) for(const k of Object.keys(catalogs[l]))if(k.startsWith(base+'_')&&suffix.test(k))fullMapping[k]=fullMapping[base];
const routeData=JSON.parse(await fs.readFile(routeInventory,'utf8'));
const selectedKeys=new Set(routeData.keys);
for(const id of ['ai','signing','documentSecurity','verification','documentReview','pageFormatting','extraction','removal','automation','general','advancedFormatting','developerTools']) selectedKeys.add(`toolPicker.subcategories.${id}`);
const logicalKeys=allLogicalKeys.filter(key=>selectedKeys.has(key));
const selectedIds=new Set(logicalKeys.map(key=>fullMapping[key]));
const mapping=Object.fromEntries(Object.entries(fullMapping).filter(([,id])=>selectedIds.has(id)));
const fallbackMap=Object.fromEntries(locales.map(l=>[l,l==='en-US'?undefined:'en-US']));const bundles=[];const excluded=[];
function pattern(text){const parts=[];let offset=0;for(const m of text.matchAll(/\{\{\s*([^{}]+?)\s*\}\}/g)){if(/[,-]/.test(m[1]))throw Error(`unsupported interpolation ${m[0]}`);if(m.index>offset)parts.push({type:'text',value:text.slice(offset,m.index)});parts.push({type:'expression',arg:{type:'variable-reference',name:m[1]}});offset=m.index+m[0].length;}if(offset<text.length||!parts.length)parts.push({type:'text',value:text.slice(offset)});return parts;}
const input=(name)=>({type:'input-variable',name});
for(const key of logicalKeys){const plural=pluralBases.has(key);let valueEntries=[]; if(plural){for(const locale of locales)for(const category of ['zero','one','two','few','many','other']){const value=catalogs[locale][`${key}_${category}`];if(value!==undefined)valueEntries.push({locale,category,value});}}else{for(const locale of locales){const value=catalogs[locale][key];if(value!==undefined)valueEntries.push({locale,category:null,value});}}
const values=valueEntries.map(x=>x.value);if(values.some(v=>/\$t\(|\{\{[^}]*[,-][^}]*\}\}/.test(v))){excluded.push(key);continue;}
const names=[...new Set(values.flatMap(v=>[...v.matchAll(/\{\{\s*([^{}]+?)\s*\}\}/g)].map(m=>m[1])))];
const declarations=names.filter(x=>!(plural&&x==='count')).map(name=>input(name));
if(plural){declarations.push(input('count'));declarations.push({type:'local-variable',name:'countPlural',value:{type:'expression',arg:{type:'variable-reference',name:'count'},annotation:{type:'function-reference',name:'plural',options:[]}}});}
const messages=locales.flatMap(locale=>{const here=valueEntries.filter(x=>x.locale===locale);if(!here.length)return[];if(!plural)return[{id:`${mapping[key]}-${locale}`,bundleId:mapping[key],locale,selectors:[],variants:[{id:'v',matches:[],pattern:pattern(here[0].value)}]}];return[{id:`${mapping[key]}-${locale}`,bundleId:mapping[key],locale,selectors:[{type:'variable-reference',name:'countPlural'}],variants:here.map(v=>({id:`${mapping[key]}-${locale}-${v.category}`,matches:[{type:'literal-match',key:'countPlural',value:v.category}],pattern:pattern(v.value)}))}];});
bundles.push({id:mapping[key],declarations,messages});}
const settings={baseLocale:'en-US',locales};const fln=new Map(locales.map(locale=>[locale,output.createLocaleFunctionLocalNames(bundles,locale)]));const compiled=bundles.map(bundle=>compileBundle({bundle,fallbackMap,settings,inlineMessages:false,messageReferenceExpression:output.messageReferenceExpression}));
const files={...output.generateOutput(compiled,settings,fallbackMap,false,fln),'runtime.js':createRuntimeFile({...settings,compilerOptions:{...defaultCompilerOptions,strategy:['localStorage','preferredLanguage','baseLocale']}}),'registry.js':createRegistry(),'messages.js':"export * from './messages/_index.js'",'package.json':'{"type":"module"}'};
const routeCatalogs=Object.fromEntries(locales.map(locale=>[
	locale,
	Object.fromEntries(Object.entries(catalogs[locale]).filter(([key])=>
		selectedKeys.has(key)||[...selectedKeys].some(base=>key.startsWith(`${base}_`))
	)),
]));
await fs.rm(outRoot,{recursive:true,force:true});
for(const [name,code] of Object.entries(files)){
	const p=path.join(outRoot,name);
	await fs.mkdir(path.dirname(p),{recursive:true});
	await fs.writeFile(p,code);
}
await fs.writeFile(path.join(outRoot,'mapping.json'),JSON.stringify(mapping));
await fs.writeFile(path.join(outRoot,'mapping.full.json'),JSON.stringify(fullMapping));
await fs.writeFile(path.join(outRoot,'catalogs.json'),JSON.stringify(routeCatalogs));
const z=await import('node:zlib');const stats=[];for(const locale of ['en-US','fr-FR']){const b=await fs.readFile(path.join(outRoot,'messages',`${locale}.js`));stats.push({locale,raw:b.length,gzip:z.gzipSync(b,{level:9}).length,brotli:z.brotliCompressSync(b,{params:{[z.constants.BROTLI_PARAM_QUALITY]:4}}).length});}
console.log(JSON.stringify({locales:locales.length,allCatalogKeys:allKeys.length,allLogicalKeys:allLogicalKeys.length,routeKeys:logicalKeys.length,routeKeyPct:+(logicalKeys.length/allLogicalKeys.length*100).toFixed(1),pluralBases:pluralBases.size,bundles:bundles.length,excluded:excluded.length,excludedSamples:excluded.slice(0,20),files:Object.keys(files).length,stats},null,2));
