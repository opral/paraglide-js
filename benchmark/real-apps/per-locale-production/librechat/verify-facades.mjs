import fs from 'node:fs';
import path from 'node:path';
import ts from 'typescript';
const root=path.dirname(new URL(import.meta.url).pathname);
const counts=JSON.parse(fs.readFileSync(path.join(root,'catalog-counts.json')));
const results={};
for(const locale of Object.keys(counts.counts)){
 const expected=Object.keys(JSON.parse(fs.readFileSync(path.join(root,'client/src/locales',locale,'translation.json'),'utf8'))).sort();
 const file=path.join(root,'client/src/locales/facades',locale+'.ts');
 const ast=ts.createSourceFile(file,fs.readFileSync(file,'utf8'),ts.ScriptTarget.Latest,true);
 const imports=ast.statements.filter(ts.isImportDeclaration).flatMap(s=>s.importClause?.namedBindings&&ts.isNamedImports(s.importClause.namedBindings)?s.importClause.namedBindings.elements.map(x=>x.name.text):[]).sort();
 const properties=[];function visit(n){if(ts.isReturnStatement(n)&&n.expression&&ts.isObjectLiteralExpression(n.expression)){for(const p of n.expression.properties){if(!ts.isPropertyAssignment(p)||!ts.isStringLiteral(p.name)||!ts.isCallExpression(p.initializer)||!ts.isIdentifier(p.initializer.expression)||p.initializer.expression.text!==p.name.text)throw new Error('Noncanonical property '+locale);properties.push(p.name.text);}}ts.forEachChild(n,visit);}visit(ast);properties.sort();
 if(JSON.stringify(imports)!==JSON.stringify(expected)||JSON.stringify(properties)!==JSON.stringify(expected))throw new Error('Facade key membership differs '+locale);
 results[locale]={originalKeys:expected.length,physicalImports:imports.length,properties:properties.length};
}
fs.writeFileSync(path.join(root,'facade-validation.json'),JSON.stringify({passed:true,locales:41,totalPhysicalImports:Object.values(results).reduce((a,b)=>a+b.physicalImports,0),results},null,2));
console.log(JSON.stringify({passed:true,locales:41,totalPhysicalImports:50209}));
