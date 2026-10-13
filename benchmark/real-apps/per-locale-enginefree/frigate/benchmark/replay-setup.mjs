import fs from 'node:fs/promises';import path from 'node:path';import {execFileSync} from 'node:child_process';import crypto from 'node:crypto';
const root=path.resolve(new URL('..',import.meta.url).pathname);
const target=process.env.FRIGATE_ENGINEFREE_WORKDIR,source=process.env.FRIGATE_CHECKOUT,compiled=process.env.PARAGLIDE_COMPILED_SOURCE;
if(!target||!source||!compiled)throw Error('Set FRIGATE_ENGINEFREE_WORKDIR, FRIGATE_CHECKOUT and PARAGLIDE_COMPILED_SOURCE.');
if(execFileSync('git',['-C',source,'rev-parse','HEAD'],{encoding:'utf8'}).trim()!=='ff9eb8f18430198548d9c9d2cf138ed9ac7b526b')throw Error('Wrong Frigate source commit');
const old=path.resolve(root,'../../per-locale-production/frigate/replay');
const proof=JSON.parse(await fs.readFile(path.join(root,'provenance.json')));for(const [file,hash] of Object.entries(proof.sourceLeafHashes)){if(crypto.createHash('sha256').update(await fs.readFile(path.join(compiled,file))).digest('hex')!==hash)throw Error('Wrong frozen compiled source leaf '+file);}

const excluded=new Set(['node_modules','.git','.real-apps','dist','native-dist','native-earlylocale-dist','candidate-dist','candidate-single-dist','enginefree-dist','test-results','playwright-report']);
await fs.mkdir(target,{recursive:true});await fs.cp(path.join(source,'web'),path.join(target,'web'),{recursive:true,filter:p=>!path.relative(path.join(source,'web'),p).split(path.sep).some(s=>excluded.has(s)||s.startsWith('.env'))});
await fs.cp(path.join(old,'source-overrides/web'),path.join(target,'web'),{recursive:true});await fs.cp(path.join(root,'source-overrides/web'),path.join(target,'web'),{recursive:true});await fs.cp(path.join(old,'catalogs'),path.join(target,'web/public/locales'),{recursive:true});
await fs.cp(path.join(root,'benchmark'),path.join(target,'benchmark'),{recursive:true});await fs.copyFile(path.join(old,'benchmark/metadata.json'),path.join(target,'benchmark/metadata.json'));await fs.cp(compiled,path.join(target,'web/src/paraglide'),{recursive:true});
await fs.writeFile(path.join(target,'package.json'),'{"type":"module","private":true}\n');try{await fs.symlink(path.join(target,'web/node_modules'),path.join(target,'node_modules'),'dir')}catch(e){if(e.code!=='EEXIST')throw e;}
execFileSync('python3',[path.join(target,'benchmark/generate-namespaces.py')],{stdio:'inherit'});console.log('Prepared '+target+'; install locked web deps then run README commands.');
