// Engine-free fixed-locale compatibility surface for this Frigate experiment.
// Resource suppliers preserve the original sparse locale trees; no merging.
const own=(o,k)=>o!=null&&Object.prototype.hasOwnProperty.call(o,k);
export function lookup(tree,key,separator='.') {
 if(!tree)return undefined;
 const parts=separator?String(key).split(separator):[key];
 let cur=tree;
 for(const part of parts){if(!own(cur,part)){cur=undefined;break;}cur=cur[part];}
 if(cur!==undefined)return cur;
 // i18next ignoreJSONStructure: retry paths whose physical keys include dots.
 function find(node,i){if(!node||typeof node!=='object')return undefined;for(let j=i;j<parts.length;j++){const k=parts.slice(i,j+1).join(separator);if(own(node,k)){const v=j===parts.length-1?node[k]:find(node[k],j+1);if(v!==undefined)return v;}}}
 return find(tree,0);
}
const list=x=>Array.isArray(x)?x:typeof x==='string'?[x]:[];
export function missingKey(key){const p=key.split('.');if(p[0]==='time'&&p[1]?.includes('formattedTimestamp')){const v={'12hour':'h:mm aaa','24hour':'HH:mm'}[p.at(-1)];if(v)return v;}const part=(p[0]==='object'||p[0]==='audio')?p[1]||key:p.at(-1);return part.split('_').map(w=>w.charAt(0).toUpperCase()+w.slice(1).toLowerCase()).join(' ');}
export function createRuntime({locale,resourceChain,loaders={},fallbacks={}}){
 const resources=resourceChain||{},pending=new Map(),listeners=new Map(),rules=new Map();
 const chain=()=>[locale,...Object.keys(fallbacks),...(!resourceChain?[]:Object.keys(resources).filter(l=>l!==locale))].filter((l,i,a)=>a.indexOf(l)===i);
 function candidates(key,o,l){const out=[key],count=o.count!==undefined&&typeof o.count!=='string',context=(typeof o.context==='string'||typeof o.context==='number')&&o.context!=='';let suffix='';if(count){const type=o.ordinal?'ordinal':'cardinal',id=l+type;let rule=rules.get(id);if(!rule){rule=new Intl.PluralRules(l,{type});rules.set(id,rule);}suffix='_'+(o.ordinal?'ordinal_':'')+rule.select(o.count);if(o.ordinal)out.push(key+suffix.replace('_ordinal_','_'));out.push(key+suffix);if(!o.ordinal&&o.count===0)out.push(key+'_zero');}if(context){const ck=key+'_'+o.context;out.push(ck);if(count){if(o.ordinal)out.push(ck+suffix.replace('_ordinal_','_'));out.push(ck+suffix);if(!o.ordinal&&o.count===0)out.push(ck+'_zero');}}return out.reverse();}
 function resolve(keys,o={},fixedNs=['common'],prefix){for(const raw of list(keys)){const q=String(raw).indexOf(':'),ns=q>=0?[String(raw).slice(0,q)]:list(o.ns).length?list(o.ns):fixedNs;let key=q>=0?String(raw).slice(q+1):String(raw);const pre=o.keyPrefix??prefix;if(pre)key=pre+'.'+key;for(const n of ns)for(const l of chain())for(const k of candidates(key,o,l)){const v=lookup(resources[l]?.[n],k,o.keySeparator===false?false:'.');if(v!==undefined&&v!==null)return {value:v,key,ns:n,locale:l};}}return null;}
 function interpolate(text,o){const data=o.replace&&typeof o.replace==='object'?o.replace:o;return String(text).replace(/\{\{(-)?\s*([^}]+?)\s*\}\}/g,(match,unescape,name)=>{const [path,format]=name.split(',').map(x=>x.trim());const value=lookup(data,path);if(value===undefined)return match;if(format){try{if(format==='number')return new Intl.NumberFormat(locale).format(value);if(format==='datetime')return new Intl.DateTimeFormat(locale).format(value);}catch{}}return String(value);});}
 function getFixedT(_lng,ns='common',prefix){const fn=(keys,options={})=>{let o=typeof options==='string'?{defaultValue:options}:options||{};const result=resolve(keys,o,list(ns),prefix);let value=result?.value;if(value===undefined){let def=o.defaultValue;if(o.count!==undefined){const c=candidates('defaultValue',o,locale).find(k=>own(o,k));if(c)def=o[c];}value=missingKey((prefix?prefix+'.':'')+String(list(keys).at(-1)||'').split(':').at(-1));}
 if(value&&typeof value==='object'){if(Array.isArray(value)&&typeof o.joinArrays==='string')return interpolate(value.join(o.joinArrays),o);if(!o.returnObjects)return `key '${result?.key} (${locale})' returned an object instead of string.`;const rec=(v,path)=>{if(v&&typeof v==='object')return Array.isArray(v)?v.map((_,i)=>rec(v[i],path+'.'+i)):Object.fromEntries(Object.entries(v).map(([k,x])=>[k,rec(x,path+'.'+k)]));const r=resolve(path,{...o,ns:result.ns},[result.ns]);return interpolate(r?.value??v,o);};return rec(value,result.key);}
 return interpolate(value,o);};fn.lng=locale;fn.ns=ns;fn.keyPrefix=prefix;return fn;}
 const runtime={language:locale,resolvedLanguage:locale,isInitialized:true,options:{defaultNS:'common',react:{transSupportBasicHtmlNodes:true,transKeepBasicHtmlNodesFor:['br','strong','i','em','li','p','code','span','ul','ol']},interpolation:{escapeValue:false}},getFixedT,
 exists:(keys,o={})=>!!resolve(keys,o,list(o.ns||'common')),
 hasLoadedNamespace:ns=>chain().every(l=>resources[l]&&own(resources[l],ns)),
 loadNamespaces:async ns=>{await Promise.all(list(ns).map(n=>{if(pending.has(n))return pending.get(n);const p=Promise.all(chain().map(async l=>{const loader=l===locale?loaders[n]:fallbacks[l]?.[n];const m=loader?await loader():{};(resources[l]??={})[n]=m.resources?m.resources():m.default??m;})).finally(()=>pending.delete(n));pending.set(n,p);return p;}));},
 on:(e,cb)=>{for(const n of e.split(' ')){const s=listeners.get(n)||new Set();s.add(cb);listeners.set(n,s);}return runtime;},off:(e,cb)=>{for(const n of e.split(' '))listeners.get(n)?.delete(cb);return runtime;},
 changeLanguage:async (l,cb)=>{if(l!==locale){if(typeof window!=='undefined'){localStorage.setItem('frigate-ui-language',l);window.location.reload();}}cb?.(null,runtime.t);return runtime.t;},
 };runtime.t=getFixedT(locale,'common');return runtime;
}
