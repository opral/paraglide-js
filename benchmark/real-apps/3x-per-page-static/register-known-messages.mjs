import ts from '/root/repos-iii/paraglide-client-split-current-api/node_modules/typescript/lib/typescript.js';
import fs from 'node:fs';
const files=JSON.parse(fs.readFileSync('/root/repos-iii/3x-ui-per-locale-message-calls/frontend/.real-apps/literal-codemod-report.json','utf8')).changedFiles;
const report={sourceFiles:files.length,registeredFiles:[],registeredImports:0};
for(const file of files){
 const source=fs.readFileSync(file,'utf8');
 const sf=ts.createSourceFile(file,source,ts.ScriptTarget.Latest,true,file.endsWith('.tsx')?ts.ScriptKind.TSX:ts.ScriptKind.TS);
 const entries=[];let lastImport=0;
 for(const n of sf.statements){
  if(!ts.isImportDeclaration(n))continue;
  lastImport=n.end;
  if(!n.moduleSpecifier.text.startsWith('@/paraglide/messages/')||!n.importClause?.namedBindings||!ts.isNamedImports(n.importClause.namedBindings))continue;
  for(const e of n.importClause.namedBindings.elements){if(e.isTypeOnly)continue;entries.push([e.propertyName?.text??e.name.text,e.name.text]);}
 }
 if(!entries.length)continue;
 if(source.includes('__pg_register_known'))throw Error('Already registered '+file);
 const registration=`\nimport { registerKnownMessages as __pg_register_known } from '@/i18n/known-messages';\n__pg_register_known([${entries.map(([key,binding])=>`[${JSON.stringify(key)}, ${binding}]`).join(', ')}]);\n`;
 fs.writeFileSync(file,source.slice(0,lastImport)+registration+source.slice(lastImport));
 report.registeredFiles.push({file,imports:entries.length});report.registeredImports+=entries.length;
}
fs.writeFileSync('.real-apps/registration-report.json',JSON.stringify(report,null,2));console.log(JSON.stringify({files:report.sourceFiles,registeredFiles:report.registeredFiles.length,registeredImports:report.registeredImports}));
