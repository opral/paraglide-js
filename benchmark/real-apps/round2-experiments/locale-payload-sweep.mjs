// Research only: changes private locale payload representation, not a public API.
import fs from 'node:fs/promises';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { createHash } from 'node:crypto';
import { gzipSync, brotliCompressSync, constants } from 'node:zlib';
import { parse } from 'acorn';
import { packLocaleFunctionChunk } from '../../../dist/bundler-plugins/locale-function-packer.js';

const root = path.resolve('.real-apps/payload-experiment');
const generated = path.join(root, 'input');
const results = [];
for (const locale of ['en', 'fr']) {
  const filename = path.join(generated, 'messages', `${locale}.js`);
  const source = await fs.readFile(filename, 'utf8');
  const ast = parse(source, { ecmaVersion: 'latest', sourceType: 'module' });
  const declarations = new Map();
  const parts = new Set();
  const exports = [];
  for (const node of ast.body) {
    if (node.type === 'VariableDeclaration') for (const item of node.declarations) declarations.set(item.id.name, item.init);
    if (node.type === 'ExpressionStatement' && node.expression.type === 'AssignmentExpression') {
      const left = node.expression.left;
      if (left.type === 'MemberExpression' && left.property.name === 'parts') parts.add(left.object.name);
    }
    if (node.type === 'ExportNamedDeclaration') for (const item of node.specifiers) exports.push({ name: item.exported.name, local: item.local.name });
  }
  for (const item of exports) {
    const fn = declarations.get(item.local);
    const body = fn?.type === 'ArrowFunctionExpression' && fn.body.type === 'BlockStatement' ? fn.body.body : [];
    const ret = body.length === 1 && body[0].type === 'ReturnStatement' ? body[0].argument : undefined;
    if (!parts.has(item.local) && ret?.type === 'Literal' && typeof ret.value === 'string') item.text = ret.value;
    if (!parts.has(item.local) && ret?.type === 'TemplateLiteral' && ret.expressions.length === 0) item.text = ret.quasis[0].value.cooked;
  }
  for (const viteVersion of ['6', '8']) {
    const { build } = await import(pathToFileURL(path.resolve(viteVersion === '6' ? 'benchmark/node_modules/vite/dist/node/index.js' : 'node_modules/vite/dist/node/index.js')).href);
    for (const mode of ['functions', 'object-values', 'array-values']) {
      const dir = path.join(root, `${locale}-${viteVersion}-${mode}`);
      await fs.mkdir(dir, { recursive: true });
      const entries = exports.map((item) => mode !== 'functions' && item.text !== undefined ? JSON.stringify(item.text) : `original[${JSON.stringify(item.name)}]`);
      const payload = mode === 'array-values' ? `[${entries.join(',')}]` : `{${exports.map((item, i) => `${JSON.stringify(item.name)}:${entries[i]}`).join(',')}}`;
      await fs.writeFile(path.join(dir, 'entry.js'), `import * as original from ${JSON.stringify(filename)};\nglobalThis.__payload = ${payload};\n`);
      const built = await build({ configFile: false, logLevel: 'silent', plugins: [{ name: 'same-locale-packer', renderChunk(code, chunk, options) { return packLocaleFunctionChunk(code, { fileName: chunk.fileName, sourcemap: options.sourcemap }); } }], build: { write: false, minify: true, target: 'esnext', lib: { entry: path.join(dir, 'entry.js'), formats: ['es'] } } });
      const chunk = (Array.isArray(built) ? built[0] : built).output.find((x) => x.type === 'chunk');
      await fs.writeFile(path.join(dir, 'built.mjs'), chunk.code);
      delete globalThis.__payload;
      await import(`${pathToFileURL(path.join(dir, 'built.mjs')).href}?${Date.now()}`);
      const payloadResult = globalThis.__payload;
      let parity = 0;
      for (const [i, item] of exports.entries()) if (item.text !== undefined) {
        const value = mode === 'array-values' ? payloadResult[i] : payloadResult[item.name];
        const actual = typeof value === 'function' ? value() : value;
        if (actual !== item.text) throw new Error(`Literal parity failure ${locale}/${mode}/${item.name}`);
        parity++;
      }
      const row = { locale, viteVersion, mode, exportedKeys: exports.length, staticStringKeys: parity, raw: Buffer.byteLength(chunk.code), gzip9: gzipSync(chunk.code, { level: 9 }).length, brotli4: brotliCompressSync(chunk.code, { params: { [constants.BROTLI_PARAM_QUALITY]: 4 } }).length, sha256: createHash('sha256').update(chunk.code).digest('hex') };
      results.push(row);
      process.stdout.write(JSON.stringify(row) + '\n');
    }
  }
}
await fs.writeFile(path.join(root, 'results.json'), JSON.stringify({ limitation: 'Private payload representation experiment; static string parity only, no browser-route or dynamic rich/plural parity proof. Identical Vite packing/minification per control.', results }, null, 2) + '\n');
