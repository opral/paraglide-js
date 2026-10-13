import fs from 'node:fs/promises';
const locale=process.argv[2];globalThis.__PARAGLIDE_STATIC_LOCALE__=locale;
const meta=JSON.parse(await fs.readFile(new URL('./metadata.json',import.meta.url)));
const canonical=v=>v&&typeof v==='object'?Object.fromEntries(Object.keys(v).sort().map(k=>[k,canonical(v[k])])):v;
const failures=[];for(let i=0;i<meta.namespaces.length;i++){const ns=meta.namespaces[i];let original;try{original=JSON.parse(await fs.readFile(new URL('../web/public/locales/'+locale+'/'+ns+'.json',import.meta.url)));}catch{original={};}const mod=await import(new URL('../web/src/compiled-namespaces-single/'+i+'.js',import.meta.url));const actual=mod.resources();if(JSON.stringify(canonical(actual))!==JSON.stringify(canonical(original)))failures.push(ns);}console.log(JSON.stringify({locale,checks:meta.namespaces.length,failures}));if(failures.length)process.exitCode=1;
