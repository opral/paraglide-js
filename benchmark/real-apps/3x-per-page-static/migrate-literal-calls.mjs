import ts from '/root/repos-iii/paraglide-client-split-current-api/node_modules/typescript/lib/typescript.js';
import fs from 'node:fs';
import path from 'node:path';
const root=process.cwd();
const walk=p=>fs.readdirSync(p,{withFileTypes:true}).flatMap(d=>d.isDirectory()?(d.name==='paraglide'?[]:walk(path.join(p,d.name))):/\.[jt]sx?$/.test(d.name)?[path.join(p,d.name)]:[]);
const files=walk(path.join(root,'src'));
const program=ts.createProgram(files,{allowJs:true,jsx:ts.JsxEmit.ReactJSX,noResolve:true});
const checker=program.getTypeChecker();
const json=JSON.parse(fs.readFileSync('.real-apps/messages/en-US.json','utf8'));
const flatten=(v,p='')=>Object.entries(v).flatMap(([k,x])=>x&&typeof x==='object'?flatten(x,p+k+'.'):[p+k]);
const keys=new Set(flatten(json));
const report={sourceFiles:files.length,knownLiteral:0,unknownLiteral:0,dynamic:0,changedFiles:[]};
for(const file of files){
 if(file.includes('/src/i18n/')||file.includes('/src/paraglide/'))continue;
 const sf=program.getSourceFile(file),translators=new Set(),i18ns=new Set(),hooks=new Set();
 const visit=(n,f)=>{f(n);ts.forEachChild(n,x=>visit(x,f));};
 visit(sf,n=>{
  if(ts.isImportDeclaration(n)&&['i18next','react-i18next'].includes(n.moduleSpecifier.text)){
   const c=n.importClause;if(c?.name)i18ns.add(checker.getSymbolAtLocation(c.name));
   if(c?.namedBindings&&ts.isNamedImports(c.namedBindings))for(const el of c.namedBindings.elements){
    const orig=el.propertyName?.text??el.name.text;
    if(orig==='t')translators.add(checker.getSymbolAtLocation(el.name));
    if(orig==='useTranslation')hooks.add(checker.getSymbolAtLocation(el.name));
   }
  }
 });
 visit(sf,n=>{
  if(ts.isVariableDeclaration(n)&&ts.isObjectBindingPattern(n.name)&&n.initializer&&ts.isCallExpression(n.initializer)&&hooks.has(checker.getSymbolAtLocation(n.initializer.expression))){
   for(const el of n.name.elements){const orig=el.propertyName?.text??el.name.text; if(orig==='t')translators.add(checker.getSymbolAtLocation(el.name));if(orig==='i18n')i18ns.add(checker.getSymbolAtLocation(el.name));}
  }
 });
 const edits=[],imports=new Map();let unknown=false;
 visit(sf,n=>{
  if(!ts.isCallExpression(n))return;
  const ex=n.expression;
  const matched=ts.isIdentifier(ex)?translators.has(checker.getSymbolAtLocation(ex)):ts.isPropertyAccessExpression(ex)&&ex.name.text==='t'&&i18ns.has(checker.getSymbolAtLocation(ex.expression));
  if(!matched)return;
  const arg=n.arguments[0];
  if(!arg||!(ts.isStringLiteral(arg)||ts.isNoSubstitutionTemplateLiteral(arg))||n.arguments.length>2){report.dynamic++;return;}
  const key=arg.text,opts=n.arguments[1]?.getText(sf),exists=keys.has(key);
  let rep;
  if(exists){if(!imports.has(key))imports.set(key,`__pg_${imports.size}`);rep=`translateMessage(${imports.get(key)}${opts?', '+opts:''})`;report.knownLiteral++;}
  else{rep=`translateUnknown(${JSON.stringify(key)}${opts?', '+opts:''})`;unknown=true;report.unknownLiteral++;}
  edits.push([n.getStart(sf),n.end,rep]);
 });
 if(!edits.length)continue;
 const resolved = new Map();
 const render = edit => {
  if (resolved.has(edit)) return resolved.get(edit);
  let value = edit[2];
  const children = edits.filter(x => x!==edit && x[0]>edit[0] && x[1]<=edit[1] && !edits.some(y=>y!==edit&&y!==x&&y[0]>edit[0]&&y[0]<x[0]&&y[1]>=x[1]&&y[1]<=edit[1]));
  for(const child of children)value=value.replace(sf.text.slice(child[0],child[1]),render(child));
  resolved.set(edit,value);return value;
 };
 const outer=edits.filter(x=>!edits.some(y=>y!==x&&y[0]<x[0]&&y[1]>=x[1]));
 let src=sf.text;for(const edit of outer.sort((a,b)=>b[0]-a[0]))src=src.slice(0,edit[0])+render(edit)+src.slice(edit[1]);
 src=`import { ${[...imports].map(([k,a])=>`${JSON.stringify(k)} as ${a}`).join(', ')} } from '@/paraglide/messages.js';\nimport { translateMessage${unknown?', translateUnknown':''} } from '@/i18n/paraglide-static';\n`+src;
 fs.writeFileSync(file,src);report.changedFiles.push(path.relative(root,file));
}
fs.writeFileSync('.real-apps/literal-codemod-report.json',JSON.stringify(report,null,2));console.log(JSON.stringify({...report,changedFiles:report.changedFiles.length}));
