import json,re,hashlib
from pathlib import Path
root=Path(__file__).resolve().parents[1]; web=root/'web'; bench=root/'benchmark'
locales=re.findall(r'"([^\"]+)"',(web/'src/lib/const.ts').read_text().split('export const supportedLanguageKeys = [')[1].split('] as const')[0])
ns=[str(p.relative_to(web/'public/locales/en')).removesuffix('.json') for p in sorted((web/'public/locales/en').rglob('*.json'))]
def flatten(o,p=()):
 r={}
 if isinstance(o,dict):
  for k,v in o.items(): r.update(flatten(v,p+tuple(k.split('.'))))
 elif isinstance(o,str):r[p]=o
 else: raise ValueError((p,type(o)))
 return r
catalogs={}; keys=set(); physical=[]
for l in locales:
 c={}
 for n in ns:
  p=web/'public/locales'/l/(n+'.json')
  if not p.exists(): continue
  physical.append({'path':str(p.relative_to(web)), 'sha256':hashlib.sha256(p.read_bytes()).hexdigest()})
  for k,v in flatten(json.loads(p.read_text())).items(): c[n,k]=v;keys.add((n,k))
 catalogs[l]=c
rows=[{'id':'f'+str(i),'namespace':n,'path':list(k)} for i,(n,k) in enumerate(sorted(keys))]
(bench/'messages').mkdir(exist_ok=True)
for l,c in catalogs.items():
 (bench/'messages'/(l+'.json')).write_text(json.dumps({r['id']: re.sub(r'[{}]',lambda m:'__PGVAR_'+m.group(0).encode().hex()+'__',c[r['namespace'],tuple(r['path'])]) for r in rows if (r['namespace'],tuple(r['path'])) in c},ensure_ascii=False))
project=bench/'paraglide-project.inlang';(bench/'route-message-map.json').write_text(json.dumps(rows))
(bench/'metadata.json').write_text(json.dumps({'locales':locales,'namespaces':ns,'unionMessageCount':len(rows),'messageIds':rows},indent=2))
(bench/'input-provenance.json').write_text(json.dumps({'catalogFiles':physical,'locales':len(locales),'namespaces':len(ns),'unionMessageCount':len(rows),'perLocale':{l:len(c) for l,c in catalogs.items()}},indent=2))
facades=web/'src/compiled-namespaces';facades.mkdir(exist_ok=True)
loaders=[]
for i,n in enumerate(ns):
 entries=[r for r in rows if r['namespace']==n]
 code=''.join('import { '+r['id']+' } from "../paraglide/messages/'+r['id']+'.js";\n' for r in entries)
 code+='const rows = ['+','.join('['+json.dumps(r['path'])+','+r['id']+']' for r in entries)+'];\n'
 code+='export function resources() {const out={};for(const [keys,fn] of rows){let cursor=out;for(const key of keys.slice(0,-1)) cursor=cursor[key]??={};cursor[keys.at(-1)]=fn().replace(/__PGVAR_([0-9a-f]+)__/g,(_,hex)=>new TextDecoder().decode(Uint8Array.from(hex.match(/../g).map(x=>parseInt(x,16)))));}return out;}\n'
 (facades/(str(i)+'.js')).write_text(code)
 loaders.append(json.dumps(n)+':()=>import("./'+str(i)+'.js")')
(facades/'loaders.js').write_text('export const loaders={'+','.join(loaders)+'};\n')
source=(web/'src/utils/i18n.ts').read_text().replace('import HttpBackend from "i18next-http-backend";','import { loaders } from "../compiled-namespaces/loaders.js";\nimport { getLocale } from "../paraglide/runtime.js";\nconst CompiledBackend={type:"backend",init(){},read(_lng,ns,callback){const load=loaders[ns];if(!load){callback(new Error("Unknown namespace "+ns),false);return;}load().then(module=>callback(null,module.resources()),error=>callback(error,false));}};')
source=source.replace('.use(HttpBackend)','.use(CompiledBackend as any)').replace('fallbackLng: "en",','lng: getLocale(),\n    fallbackLng: "en",')
(bench/'candidate-i18n.ts').write_text(source.replace('"../compiled-namespaces/loaders.js"','"../web/src/compiled-namespaces/loaders.js"').replace('"../paraglide/runtime.js"','"../web/src/paraglide/runtime.js"'))
print(json.dumps({'locales':len(locales),'namespaces':len(ns),'messages':len(rows),'perLocale':{l:len(c) for l,c in catalogs.items()}}))
# Preserve sparse physical locale shapes and keep native English fallback separate.
loaders=[]
for i,n in enumerate(ns):
 choices=[]
 for l in locales:
  folder=facades/l;folder.mkdir(exist_ok=True)
  p=web/'public/locales'/l/(n+'.json')
  raw=json.loads(p.read_text()) if p.exists() else {}
  ids={(r['namespace'],tuple(r['path'])):r['id'] for r in rows}
  def physical(node,path=()):
   result=[]
   for key,value in node.items():
    nextpath=path+(key,)
    if isinstance(value,str): result.append({'id':ids[n,tuple(part for k in nextpath for part in k.split('.'))],'path':list(nextpath)})
    else:result.extend(physical(value,nextpath))
   return result
  entries=physical(raw)
  code=''.join('import { '+r['id']+' } from "../../paraglide/messages/'+r['id']+'.js";\n' for r in {r['id']:r for r in entries}.values())
  code+='const rows = ['+','.join('['+json.dumps(r['path'])+','+r['id']+']' for r in entries)+'];\n'
  code+='export function resources() {const out={};for(const [keys,fn] of rows){let cursor=out;for(const key of keys.slice(0,-1)) cursor=cursor[key]??={};cursor[keys.at(-1)]=fn().replace(/__PGVAR_([0-9a-f]+)__/g,(_,hex)=>new TextDecoder().decode(Uint8Array.from(hex.match(/../g).map(x=>parseInt(x,16)))));}return out;}\n'
  (folder/(str(i)+'.js')).write_text(code)
  choices.append('experimentalStaticLocale==='+json.dumps(l)+'?()=>import("./'+l+'/'+str(i)+'.js")')
 loaders.append(json.dumps(n)+':'+':'.join(choices)+':null')
(facades/'loaders.js').write_text('import { experimentalStaticLocale } from "../paraglide/runtime.js";\nexport const loaders={'+','.join(loaders)+'};\nexport const english={'+','.join(json.dumps(n)+':()=>import("../../'+str((Path('public/locales/en')/(n+'.json')))+'")' for n in ns)+'};\n')
source=(web/'src/utils/i18n.ts').read_text().replace('import HttpBackend from "i18next-http-backend";','import { loaders, english } from "../web/src/compiled-namespaces/loaders.js";\nimport { getLocale } from "../web/src/paraglide/runtime.js";\nconst CompiledBackend={type:"backend",init(){},read(lng,ns,callback){const load=lng===getLocale()?loaders[ns]:lng==="en"?english[ns]:null;if(!load){callback(null,{});return;}load().then(module=>callback(null,module.resources?module.resources():module.default),error=>callback(error,false));}};').replace('.use(HttpBackend)','.use(CompiledBackend as any)').replace('fallbackLng: "en",','lng: getLocale(),\n    fallbackLng: "en",')
(bench/'candidate-i18n.ts').write_text(source)
# Native i18next also tries regional parent language before English.
fallback_choices=[]
for l in locales:
 parents=[]
 current=l
 while '-' in current:
  current=current.rsplit('-',1)[0]
  if current in locales:parents.append(current)
 if l!='en' and 'en' not in parents:parents.append('en')
 table='{'+','.join(json.dumps(lang)+':{'+','.join(json.dumps(n)+':()=>import("../../public/locales/'+lang+'/'+n+'.json")' for n in ns if (web/'public/locales'/lang/(n+'.json')).exists())+'}' for lang in parents)+'}'
 fallback_choices.append('experimentalStaticLocale==='+json.dumps(l)+'?'+table)
with (facades/'loaders.js').open('a') as f:f.write('export const fallbacks='+':'.join(fallback_choices)+':{};\n')
source=(bench/'candidate-i18n.ts').read_text().replace('{ loaders, english }','{ loaders, fallbacks }').replace('lng==="en"?english[ns]:null','fallbacks[lng]?.[ns]??null')
(bench/'candidate-i18n.ts').write_text(source)
