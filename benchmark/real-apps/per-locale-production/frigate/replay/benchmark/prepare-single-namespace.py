import json
from pathlib import Path
root=Path(__file__).resolve().parents[1];web=root/'web';bench=root/'benchmark';meta=json.load(open(bench/'metadata.json'));target=web/'src/compiled-namespaces-single';target.mkdir(exist_ok=True)
ids={(r['namespace'],tuple(r['path'])):r['id'] for r in meta['messageIds']}
def physical(node,ns,path=()):
 out=[]
 for key,value in node.items():
  nextpath=path+(key,)
  if isinstance(value,str):out.append({'id':ids[ns,tuple(part for k in nextpath for part in k.split('.'))],'path':list(nextpath)})
  else:out.extend(physical(value,ns,nextpath))
 return out
for index,ns in enumerate(meta['namespaces']):
 entries=[r for r in meta['messageIds'] if r['namespace']==ns]
 code='import { experimentalStaticLocale } from "../paraglide/runtime.js";\n'+''.join('import { '+r['id']+' } from "../paraglide/messages/'+r['id']+'.js";\n' for r in entries)
 choices=[]
 for locale in meta['locales']:
  file=web/'public/locales'/locale/(ns+'.json');raw=json.load(open(file)) if file.exists() else {}
  rows=physical(raw,ns)
  choices.append('experimentalStaticLocale==='+json.dumps(locale)+'?['+','.join('['+json.dumps(r['path'])+','+r['id']+']' for r in rows)+']')
 code+='const rows='+':'.join(choices)+':[];\nexport function resources() { const out={}; for(const [keys,fn] of rows){let cursor=out;for(const key of keys.slice(0,-1)) cursor=cursor[key]??={};cursor[keys.at(-1)]=fn().replace(/__PGVAR_([0-9a-f]+)__/g,(_,hex)=>new TextDecoder().decode(Uint8Array.from(hex.match(/../g).map(x=>parseInt(x,16)))));}return out;}\n'
 (target/(str(index)+'.js')).write_text(code)
old=(web/'src/compiled-namespaces/loaders.js').read_text();fallback=old[old.index('export const fallbacks='):]
(target/'loaders.js').write_text('import { experimentalStaticLocale } from "../paraglide/runtime.js";\nexport const loaders={'+','.join(json.dumps(ns)+':()=>import("./'+str(i)+'.js")' for i,ns in enumerate(meta['namespaces']))+'};\n'+fallback)
(bench/'candidate-single-i18n.ts').write_text((bench/'candidate-i18n.ts').read_text().replace('compiled-namespaces/loaders.js','compiled-namespaces-single/loaders.js'))
(bench/'vite.candidate-single.config.ts').write_text((bench/'vite.candidate.config.ts').read_text().replace("outDir:'candidate-dist'","outDir:'candidate-single-dist'").replace('candidate-i18n.ts','candidate-single-i18n.ts'))
(bench/'build-single.mjs').write_text((bench/'build.mjs').read_text().replace('vite.candidate.config.ts','vite.candidate-single.config.ts'))
print('Prepared 29 lazy namespace modules with all 33 sparse original locale branches; not built')
