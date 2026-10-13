import json,statistics,hashlib
from pathlib import Path
root=Path(__file__).resolve().parents[1];rows=[]
for profile in ['desktop','mobile']:
 pairs=[]
 for i in range(1,6):
  vals={}
  for arm in ['native','single']:
   prefix=root/'benchmark/repeats'/f'pair-{i}-{arm}.{profile}';d=json.load(open(str(prefix)+'.json'));t=d['timing'];vals[arm]={'readyMs':t['frenchControlReadyAt'],'normalizedBrotliQ4Bytes':d['initialBrotliQ4Bytes'],'observedEncodedBodyBytes':t['navigation']['encodedBodySize']+sum(r['encodedBodySize'] for r in t['initialResources']),'requestCount':len(d['initialResponseBodies']),'missingBodies':[r for r in d['initialResponseBodies'] if r.get('bodyUnavailable') or r.get('failed')],'title':d['title'],'controls':t['frenchControl'],'actions':t['actionsBeforeFrenchControlReady'],'screenshotSHA256':hashlib.sha256(Path(str(prefix)+'.png').read_bytes()).hexdigest()}
  pairs.append({'pair':i,'order':['native','single'] if i%2 else ['single','native'],'arms':vals,'readyChangePercent':(vals['single']['readyMs']/vals['native']['readyMs']-1)*100,'screenshotsIdentical':vals['native']['screenshotSHA256']==vals['single']['screenshotSHA256']})
 medians={arm:{metric:statistics.median(p['arms'][arm][metric] for p in pairs) for metric in ['readyMs','normalizedBrotliQ4Bytes','observedEncodedBodyBytes','requestCount']} for arm in ['native','single']}
 deltas={metric:(medians['single'][metric]/medians['native'][metric]-1)*100 for metric in medians['native']}
 rows.append({'profile':profile,'pairs':pairs,'medians':medians,'medianChangesPercent':deltas,'pairedReadyChangesMedianPercent':statistics.median(p['readyChangePercent'] for p in pairs)})
result={'validPairs':5,'captures':20,'noExclusions':True,'freshContexts':True,'cache':'no-store, original identical mocks, no interactions','bytes':'Observed encodedBodySize includes document and all completed resource entries begun before ready. Normalized Q4 compresses text bodies including mocked API; binary identity.','rows':rows};(root/'benchmark/repeated-summary.json').write_text(json.dumps(result,indent=2));print(json.dumps([{k:v for k,v in row.items() if k!='pairs'} for row in rows],indent=2))
