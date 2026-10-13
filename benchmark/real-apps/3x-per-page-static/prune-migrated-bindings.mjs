import ts from '/root/repos-iii/paraglide-client-split-current-api/node_modules/typescript/lib/typescript.js';
import fs from 'node:fs';import path from 'node:path';
const walk=p=>fs.readdirSync(p,{withFileTypes:true}).flatMap(d=>d.isDirectory()?(d.name==='paraglide'?[]:walk(path.join(p,d.name))):/\.[jt]sx?$/.test(d.name)?[path.join(p,d.name)]:[]);
let files=walk('src');
let substitutions=0,bindings=0,unusedImports=0;
for(let pass=0;pass<2;pass++){
 const program=ts.createProgram(files,{allowJs:true,jsx:ts.JsxEmit.ReactJSX,noResolve:true}),checker=program.getTypeChecker();
 const visit=(n,f)=>{f(n);ts.forEachChild(n,x=>visit(x,f));};
 for(const file of files){if(file.includes('/i18n/')||file.includes('/paraglide/'))continue;
  const sf=program.getSourceFile(file),refs=new Map(),edits=[];
  visit(sf,n=>{if(ts.isIdentifier(n)){const symbol=ts.isShorthandPropertyAssignment(n.parent)?checker.getShorthandAssignmentValueSymbol(n.parent):ts.isExportSpecifier(n.parent)?checker.getExportSpecifierLocalTargetSymbol(n.parent):checker.getSymbolAtLocation(n);if(symbol){if(!refs.has(symbol))refs.set(symbol,[]);refs.get(symbol).push(n);}}});
  visit(sf,n=>{
   if(ts.isVariableDeclaration(n)&&ts.isObjectBindingPattern(n.name)&&n.initializer&&ts.isCallExpression(n.initializer)&&n.initializer.expression.getText(sf)==='useTranslation'){
    for(const el of n.name.elements){
     if((el.propertyName?.text??el.name.text)!=='t')continue;
     const r=(refs.get(checker.getSymbolAtLocation(el.name))??[]).filter(x=>x!==el.name);
     if(r.length&&r.every(x=>ts.isArrayLiteralExpression(x.parent))&&sf.text.includes('import { translateMessage'))for(const x of r){edits.push([x.getStart(sf),x.end,'translateMessage']);substitutions++;}
    }
    if(pass===1){
     const remaining=n.name.elements.filter(el=>(refs.get(checker.getSymbolAtLocation(el.name))??[]).some(x=>x!==el.name));
     if(!remaining.length&&ts.isVariableStatement(n.parent.parent)){edits.push([n.parent.parent.getStart(sf),n.parent.parent.end,'']);bindings++;}
     else if(remaining.length!==n.name.elements.length){edits.push([n.name.getStart(sf),n.name.end,`{ ${remaining.map(el=>el.getText(sf)).join(', ')} }`]);bindings++;}
    }
   }
   if(pass===1&&ts.isImportDeclaration(n)&&n.importClause&&['i18next','react-i18next'].includes(n.moduleSpecifier.text)){
    const c=n.importClause;if(c.isTypeOnly)return;
    const used=id=>(refs.get(checker.getSymbolAtLocation(id))??[]).some(x=>x!==id);
    const defaultName=c.name&&used(c.name)?c.name.getText(sf):null;
    let named=[];
    if(c.namedBindings&&ts.isNamedImports(c.namedBindings))named=c.namedBindings.elements.filter(x=>used(x.name)).map(x=>x.getText(sf));
    else if(c.namedBindings) return;
    const total=(c.name?1:0)+(c.namedBindings?.elements?.length??0);const kept=(defaultName?1:0)+named.length;
    if(kept===total)return;
    const clause=[defaultName,named.length?`{ ${named.join(', ')} }`:null].filter(Boolean).join(', ');
    edits.push([n.getStart(sf),n.end,clause?`import ${clause} from ${n.moduleSpecifier.getText(sf)};`:'']);unusedImports+=total-kept;
   }
  });
  if(edits.length){let s=sf.text;for(const[a,b,v]of edits.sort((a,b)=>b[0]-a[0]))s=s.slice(0,a)+v+s.slice(b);fs.writeFileSync(file,s);}
 }
}
console.log({substitutions,bindings,unusedImports});
