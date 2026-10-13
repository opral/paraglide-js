const own=(o,k)=>Object.prototype.hasOwnProperty.call(o,k)
const pathValue=(o,key)=>{if(o==null)return undefined;if(own(Object(o),key))return o[key];return key.split('.').reduce((v,k)=>v==null?undefined:v[k],o)}
const escape=value=>String(value).replace(/[&<>"'\/]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;','/':'&#x2F;'}[c]))
const pluralRules=new Map()
function suffix(locale,count,ordinal){const id=locale+':'+!!ordinal;let r=pluralRules.get(id);if(!r){r=new Intl.PluralRules(locale,{type:ordinal?'ordinal':'cardinal'});pluralRules.set(id,r)}return (ordinal?'_ordinal_':'_')+r.select(count)}
function candidates(key,options,locale){
 const counted=options.count!==undefined&&typeof options.count!=='string';const s=counted?suffix(locale,options.count,options.ordinal):'';const zero=counted&&!options.ordinal&&options.count===0;
 const context=(typeof options.context==='string'||typeof options.context==='number')&&options.context!==''?key+'_'+options.context:null;
 const names=[key];const add=k=>{if(s){if(options.ordinal)names.push(k+s.replace('_ordinal_','_'));names.push(k+s)}if(zero)names.push(k+'_zero')};add(key);if(context){names.push(context);add(context)}return [...new Set(names)].reverse()
}
export function interpolate(text,values,options={}){
 if(typeof text!=='string')return text;const config=options.interpolation||{};
 return text.replace(/\{\{\s*(-)?\s*([^{}]+?)\s*\}\}/g,(match,unescaped,name)=>{
  const value=pathValue(values,name.trim());if(value===undefined)return config.skipOnVariables===false?'':match;
  if(value===null)return '';return config.escapeValue&&!unescaped?escape(value):String(value)
 })
}
export function createRuntime({locale,locales,resources,defaultNamespace='translation',onLocaleChange}){
 const listeners=new Map();const loaded=new Map(Object.entries(resources));
 const chain=language=>{const exact=language||locale;return [...new Set([exact,exact.split('-')[0],'en'])]};
 function find(key,options,language,namespace){
  for(const lang of chain(language)){
   const data=loaded.get(lang);if(!data)continue;
   for(const name of candidates(key,options,lang)){
    const fn=data[name];const value=typeof fn==='function'?fn():fn;
    if(value!==undefined&&value!==null&&(value!==''||options.returnEmptyString!==false))return {value,lang,key:name}
   }
  }return null
 }
 function getFixedT(language,namespace=defaultNamespace,keyPrefix){
  const t=(rawKey,rawOptions={},thirdOptions)=>{
   const options=typeof rawOptions==='string'?{...thirdOptions,defaultValue:rawOptions}:rawOptions||{};const keys=Array.isArray(rawKey)?rawKey:[rawKey];let last='';
   for(const raw of keys){
    let key=String(raw??'');let ns=options.ns||namespace;const separator=options.nsSeparator===false?null:':';if(separator&&key.includes(separator)){[ns,key]=[key.slice(0,key.indexOf(separator)),key.slice(key.indexOf(separator)+1)]}
    const prefix=options.keyPrefix===undefined?keyPrefix:options.keyPrefix;if(prefix)key=prefix+'.'+key;last=key;
    const hit=find(key,options,options.lng||language||locale,ns);if(hit)return interpolate(hit.value,options,options)
   }
   const lang=options.lng||language||locale;const defaultSuffix=options.count!==undefined&&typeof options.count!=='string'?suffix(lang,options.count,options.ordinal):'';
   const fallback=options['defaultValue'+defaultSuffix]??options.defaultValue??last;return interpolate(fallback,options,options)
  };t.lng=language||locale;t.ns=namespace;t.keyPrefix=keyPrefix;return t
 }
 const runtime={language:locale,resolvedLanguage:Object.keys(resources[locale]||{}).length?locale:'en',isInitialized:true,options:{defaultNS:defaultNamespace,interpolation:{escapeValue:false},react:{useSuspense:false}},getFixedT,
  t:getFixedT(locale),exists:(key,options={})=>find(key,options,options.lng||locale,defaultNamespace)!==null,
  dir:(language=locale)=>/^(ar|he|fa|ug)(-|$)/.test(language)?'rtl':'ltr',
  hasLoadedNamespace:namespace=>namespace===defaultNamespace,loadNamespaces:()=>Promise.resolve(runtime),loadNamespace:()=>Promise.resolve(runtime),
  hasResourceBundle:language=>loaded.has(language),addResourceBundle:(language,namespace,data)=>{if(namespace===defaultNamespace)loaded.set(language,{...loaded.get(language),...data});return runtime},removeResourceBundle:language=>{loaded.delete(language);return runtime},
  on:(event,fn)=>{const set=listeners.get(event)||new Set();set.add(fn);listeners.set(event,set);return runtime},off:(event,fn)=>{listeners.get(event)?.delete(fn);return runtime},
  changeLanguage:async(language,callback)=>{if(language!==locale&&onLocaleChange)await onLocaleChange(language);callback?.(null,runtime.t);return runtime.t},
  use:()=>runtime,init:async()=>runtime,
 };
 return runtime
}
