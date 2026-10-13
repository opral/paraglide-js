import ts from '/root/repos-iii/paraglide-client-split-current-api/node_modules/typescript/lib/typescript.js';import fs from 'node:fs';import path from 'node:path';
const walk=p=>fs.readdirSync(p,{withFileTypes:true}).flatMap(d=>d.isDirectory()?(d.name==='paraglide'?[]:walk(path.join(p,d.name))):/\.[jt]sx?$/.test(d.name)?[path.join(p,d.name)]:[]);
const files=walk('src'),program=ts.createProgram(files,{allowJs:true,jsx:ts.JsxEmit.ReactJSX,noResolve:true}),checker=program.getTypeChecker();const visit=(n,f)=>{f(n);ts.forEachChild(n,x=>visit(x,f));};let migrated=[];
for(const file of files){if(file.includes('/i18n/'))continue;const sf=program.getSourceFile(file),edits=[];
 visit(sf,n=>{
 if(!ts.isVariableDeclaration(n)||!ts.isObjectBindingPattern(n.name)||n.name.elements.length!==1||n.name.elements[0].name.getText(sf)!=='i18n'||!n.initializer||!ts.isCallExpression(n.initializer)||n.initializer.expression.getText(sf)!=='useTranslation')return;
 const binding=n.name.elements[0].name,symbol=checker.getSymbolAtLocation(binding),refs=[];
 visit(sf,x=>{if(ts.isIdentifier(x)&&x!==binding&&checker.getSymbolAtLocation(x)===symbol)refs.push(x);});
 if(!refs.every(x=>ts.isPropertyAccessExpression(x.parent)&&x.parent.expression===x&&['language','resolvedLanguage','isInitialized'].includes(x.parent.name.text)))return;
 edits.push([n.initializer.getStart(sf),n.initializer.end,'useLocaleMetadata()']);
 });
 if(!edits.length)continue;let src=sf.text;for(const[a,b,v]of edits.sort((a,b)=>b[0]-a[0]))src=src.slice(0,a)+v+src.slice(b);src="import { useLocaleMetadata } from '@/i18n/paraglide-static';\n"+src;fs.writeFileSync(file,src);migrated.push(file);
}
console.log(migrated);fs.writeFileSync('.real-apps/locale-metadata-codemod-report.json',JSON.stringify(migrated,null,2));
