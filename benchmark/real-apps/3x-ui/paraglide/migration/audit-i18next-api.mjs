import { readdir, readFile } from 'node:fs/promises';
import path from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';

const compilerRoot = process.env.PARAGLIDE_REPO;
if (!compilerRoot) throw new Error('Set PARAGLIDE_REPO to the pinned Paraglide checkout');
const compilerRequire = createRequire(path.join(compilerRoot, 'package.json'));
const ts = compilerRequire('typescript');

const scratch = path.dirname(fileURLToPath(import.meta.url));
const srcRoot = path.resolve(scratch, '../../src');
const files = [];

async function walk(dir) {
  for (const entry of await readdir(dir, { withFileTypes: true })) {
    if (entry.name === 'test' || entry.name === '__tests__') continue;
    const file = path.join(dir, entry.name);
    if (entry.isDirectory()) await walk(file);
    else if (/\.(?:tsx?|jsx?)$/.test(entry.name) && !/\.(?:test|stories)\./.test(entry.name)) files.push(file);
  }
}

await walk(srcRoot);
const optionCounts = new Map();
const dynamicKeys = [];
const useTranslationCalls = [];
const callExamples = [];

function isStringKey(node) {
  return ts.isStringLiteral(node) || ts.isNoSubstitutionTemplateLiteral(node);
}

for (const file of files) {
  const text = await readFile(file, 'utf8');
  const source = ts.createSourceFile(file, text, ts.ScriptTarget.Latest, true);
  function visit(node) {
    if (ts.isCallExpression(node)) {
      const expr = node.expression;
      if ((ts.isIdentifier(expr) && expr.text === 't') || (ts.isPropertyAccessExpression(expr) && expr.name.text === 't')) {
        const first = node.arguments[0];
        const second = node.arguments[1];
        if (first && !isStringKey(first)) dynamicKeys.push({ file: path.relative(srcRoot, file), text: first.getText(source) });
        if (second && ts.isObjectLiteralExpression(second)) {
          const names = second.properties.flatMap((prop) => {
            if (ts.isPropertyAssignment(prop) || ts.isShorthandPropertyAssignment(prop)) {
              return [prop.name && (ts.isIdentifier(prop.name) || ts.isStringLiteral(prop.name)) ? prop.name.text : '<computed>'];
            }
            return ['<spread-or-method>'];
          });
          for (const name of names) optionCounts.set(name, (optionCounts.get(name) ?? 0) + 1);
          if (callExamples.length < 30) callExamples.push({ file: path.relative(srcRoot, file), key: first?.getText(source), options: names });
        }
      }
      if (ts.isIdentifier(expr) && expr.text === 'useTranslation') {
        if (node.arguments.length) useTranslationCalls.push({ file: path.relative(srcRoot, file), args: node.arguments.map((arg) => arg.getText(source)) });
      }
    }
    ts.forEachChild(node, visit);
  }
  visit(source);
}

console.log(JSON.stringify({
  scannedFiles: files.length,
  dynamicKeys: dynamicKeys.length,
  dynamicKeyExamples: dynamicKeys.slice(0, 30),
  optionCounts: Object.fromEntries([...optionCounts].sort()),
  useTranslationCallsWithArguments: useTranslationCalls.length,
  useTranslationCallExamples: useTranslationCalls.slice(0, 20),
  optionCallExamples: callExamples,
}, null, 2));
