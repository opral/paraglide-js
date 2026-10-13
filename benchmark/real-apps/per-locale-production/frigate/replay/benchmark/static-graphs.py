import re,json,brotli
from pathlib import Path
root=Path(__file__).resolve().parents[1];rows=[]
for label,out in [('native-earlylocale',root/'web/native-earlylocale-dist'),('compiled-fr',root/'web/candidate-dist/__paraglide/fr-6672'),('compiled-single-fr',root/'web/candidate-single-dist/__paraglide/fr-6672')]:
 html=(out/'index.html').read_text();starts=[s.lstrip('/') for s in re.findall(r'(?:src|href)="([^"]+\.(?:js|css))"',html)];entry=next(s for s in starts if 'main-' in s);source=(out/entry).read_text();live=re.search(r'assets/Live-[A-Za-z0-9_-]+\.js',source)[0]
 def closure(starts):
  seen=set();pending=list(starts)
  while pending:
   name=pending.pop()
   if name in seen:continue
   seen.add(name);p=out/name
   if p.suffix=='.js':
    for _,ref in re.findall(r'(?:\bfrom\s*|\bimport\s*)(["\x27`])([^"\x27`]+)\1',p.read_text()):
     if ref.startswith('.'):pending.append(str((p.parent/ref).relative_to(out)).replace('/./','/'))
  return sorted(seen)
 def summarize(names):
  files=[]
  for name in ['index.html']+names:
   data=(out/name).read_bytes();files.append({'path':name,'bytes':len(data),'brotliQ4Bytes':len(brotli.compress(data,quality=4))})
  return {'files':files,'rawBytes':sum(f['bytes'] for f in files),'brotliQ4Bytes':sum(f['brotliQ4Bytes'] for f in files)}
 rows.append({'label':label,'HTMLModulepreloads':len(re.findall('rel="modulepreload"',html)),'HTMLStaticClosure':summarize(closure(starts)),'HTMLAndLiveStaticClosure':summarize(closure(starts+[live]))})
result={'definition':'Static HTML/script/stylesheet/import graph, then add Live route static imports. Excludes lazy namespace requests, font choices and media/API responses; actual initial whole-page bytes must come from readiness request capture.','rows':rows};(root/'benchmark/static-graphs.json').write_text(json.dumps(result,indent=2));print([{k:(v['brotliQ4Bytes'] if isinstance(v,dict) else v) for k,v in row.items()} for row in rows])
