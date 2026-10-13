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
(target/'loaders.js').write_text((bench/'namespace-loaders.js').read_text())
print('Prepared all 33 sparse locale branches in 29 lazy namespaces')
