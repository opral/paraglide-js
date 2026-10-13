import json,shutil,gzip
from pathlib import Path
root=Path(__file__).resolve().parents[1];dest=Path('/root/repos-iii/paraglide-client-split-pr4/benchmark/real-apps/per-locale-production/frigate');dest.mkdir(parents=True,exist_ok=True)
# Preserve raw cases and scripts, including explicit hidden project settings; omit build caches and SDK source copies.
bench=dest/'replay/benchmark';shutil.copytree(root/'benchmark',bench,dirs_exist_ok=True,ignore=shutil.ignore_patterns('cache','.lix','stock-sdk','ui-probe-report.json','probe-list.json'))
for name in ['package.json','package-lock.json','vite.config.ts','postcss.config.js','tailwind.config.cjs','tsconfig.json','tsconfig.node.json','index.html','login.html']:
 target=dest/'replay/web'/name;target.parent.mkdir(parents=True,exist_ok=True);shutil.copy2(root/'web'/name,target)
for rel in ['src/utils/i18n.ts','src/utils/language-preference.ts','src/context/language-provider.tsx','src/lib/const.ts','e2e/specs/per-locale-probe.spec.ts']:
 target=dest/'replay/source-overrides/web'/rel;target.parent.mkdir(parents=True,exist_ok=True);shutil.copy2(root/'web'/rel,target)
shutil.copytree(root/'web/patches',dest/'replay/web/patches',dirs_exist_ok=True)
# Input sources allow conversion without network; app source is reconstructed from the pinned public checkout.
shutil.copytree(root/'web/public/locales',dest/'replay/catalogs',dirs_exist_ok=True)
shutil.copy2('/root/repos-iii/frigate-lazy-native-probe/LICENSE',dest/'replay/FRIGATE-LICENSE')
for layout,directory in [('first','candidate-dist'),('single','candidate-single-dist')]:
 m=json.load(open(root/'web'/directory/'paraglide-vite-locales.json'));aggregate={k:v for k,v in m.items() if k!='locales'};aggregate['locales']={l:{'directory':v['directory'],'entries':v['entries'],'fileCount':len(v['files']),'rawBytes':sum(f['bytes'] for f in v['files'])} for l,v in m['locales'].items()};aggregate['measuredFrench']=m['locales']['fr'];(dest/f'{layout}-locale-manifest.json').write_text(json.dumps(aggregate,indent=2))
for name in ['repeated-summary.json','first-ui-pair-summary.json','compiled-single-parity.json','compiled-single-inventory.json','luna-single-layout-review.md','input-provenance.json','build-provenance.json','sdk-stock-comparison.json','lix-sdk-stock-comparison.json']:
 shutil.copy2(root/'benchmark'/name,dest/name)
print(dest)
