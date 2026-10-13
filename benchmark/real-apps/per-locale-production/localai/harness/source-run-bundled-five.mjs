import {spawnSync} from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
const out=path.dirname(new URL(import.meta.url).pathname), results=[];
for(const profile of ['desktop','mobile'])for(let pair=0;pair<5;pair++)for(const variant of pair%2?['candidate','native']:['native','candidate']) {
 const output=path.join(out,`bundled-repeat-${variant}-${profile}-${pair}.json`);
 const run=spawnSync(process.execPath,[path.join(out,'probe.mjs')],{env:{...process.env,ORIGIN:`http://127.0.0.1:${variant==='native'?4324:4322}`,VARIANT:variant==='native'?'optimized-i18next-bundled-auth-fallback':'private-per-locale-paraglide',PROFILE:profile,OUTPUT_FILE:output},stdio:['ignore','ignore','inherit']});
 if(run.status!==0)throw Error(`Failed ${variant}/${profile}/${pair}`);
 const report=JSON.parse(fs.readFileSync(output)),s=report.sample;
 const result={variant,profile,pair,bytes:s.resources.reduce((n,r)=>n+r.encodedBodyBytes,0)+s.navigation.reduce((n,r)=>n+r.encodedBodyBytes,0),readyMs:s.firstLoginControlsReadyMs,fcpMs:s.paint['first-contentful-paint'],errors:report.errors,failures:report.failures,resources:s.resources.length};
 results.push(result);console.log(JSON.stringify(result));
}
fs.writeFileSync(path.join(out,'bundled-five-pair-summary.json'),JSON.stringify(results,null,2)+'\n');
