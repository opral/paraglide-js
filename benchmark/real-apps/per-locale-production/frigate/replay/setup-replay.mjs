import fs from 'node:fs/promises';import path from 'node:path';import {execFileSync} from 'node:child_process';import crypto from 'node:crypto';
const root=path.dirname(new URL(import.meta.url).pathname),checkout=process.env.FRIGATE_CHECKOUT,compiler=process.env.PARAGLIDE_COMPILER_ENTRY;
if(!checkout||!compiler)throw new Error('Set FRIGATE_CHECKOUT and PARAGLIDE_COMPILER_ENTRY.');
const expected='ff9eb8f18430198548d9c9d2cf138ed9ac7b526b';if(execFileSync('git',['-C',checkout,'rev-parse','HEAD'],{encoding:'utf8'}).trim()!==expected)throw new Error('Frigate checkout revision differs from pinned source.');
const provenance=JSON.parse(await fs.readFile(path.join(root,'benchmark/build-provenance.json')));for(const [leaf,hash]of Object.entries(provenance.compilerHashes)){const bytes=await fs.readFile(path.join(path.dirname(compiler),leaf));if(crypto.createHash('sha256').update(bytes).digest('hex')!==hash)throw new Error('Compiler leaf hash differs: '+leaf);}
const excluded=new Set(['node_modules','.git','.real-apps','dist','native-dist','native-earlylocale-dist','candidate-dist','candidate-single-dist','test-results','playwright-report']);
await fs.cp(path.join(checkout,'web'),path.join(root,'web'),{recursive:true,filter:source=>!path.relative(path.join(checkout,'web'),source).split(path.sep).some(segment=>excluded.has(segment)||segment.startsWith('.env'))});
await fs.cp(path.join(root,'source-overrides/web'),path.join(root,'web'),{recursive:true});
await fs.cp(path.join(root,'catalogs'),path.join(root,'web/public/locales'),{recursive:true});
await fs.writeFile(path.join(root,'package.json'),'\u007b"type":"module","private":true\u007d\n');
try{await fs.symlink(path.join(root,'web/node_modules'),path.join(root,'node_modules'),'dir');}catch(error){if(error.code!=='EEXIST')throw error;}
for(const filename of ['vite.candidate.config.ts','vite.candidate-single.config.ts']){const file=path.join(root,'benchmark',filename);let source=await fs.readFile(file,'utf8');source=source.replace(/from ["']\/root\/repos-iii\/paraglide-locale-namespaces-main\/dist\/index\.js["']/, 'from '+JSON.stringify(path.resolve(compiler)));await fs.writeFile(file,source);}
console.log('Replay prepared at '+root+'; install locked web dependencies, then run the documented commands.');
