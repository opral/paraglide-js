import { readdir, readFile, mkdir, writeFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { createHash } from 'node:crypto';
import assert from 'node:assert/strict';
import { pathToFileURL } from 'node:url';

const escape = value => value.replace(/\\/g, '\\\\').replace(/{/g, '\\{').replace(/}/g, '\\}');
const tokenPattern = /\{\{(.*?)\}\}/g;
function inputNames(text) {
 const names = [...text.matchAll(tokenPattern)].map(match => match[1].trim());
 for (const name of names) if (!/^[A-Za-z_][A-Za-z0-9_.]*$/.test(name)) throw new Error(`Unsupported interpolation requires adapter implementation: ${name}`);
 if (text.includes('$t(')) throw new Error('Nested translation requires adapter implementation');
 return names;
}
function walk(value, path, callback) {
 if (value !== null && typeof value === 'object') {
  for (const [key, child] of Object.entries(value)) {
   if (key.includes('.') || key.includes(':')) throw new Error(`Ambiguous flat key segment: ${key}`);
   walk(child, [...path, key], callback);
  }
 } else callback(path.join('.'), value);
}
export async function convertCatalogs({ source, output }) {
 const localeRoot = join(resolve(source), 'core/http/react-ui/public/locales');
 const locales = (await readdir(localeRoot, { withFileTypes: true })).filter(entry => entry.isDirectory()).map(entry => entry.name).sort();
 const trees = Object.create(null), catalogLeaves = Object.create(null), inventory = [];
 const allInputs = new Map();
 for (const locale of locales) {
  trees[locale] = Object.create(null); catalogLeaves[locale] = Object.create(null);
  const filenames = (await readdir(join(localeRoot, locale))).filter(name => name.endsWith('.json')).sort();
  for (const file of filenames) {
   const namespace = file.slice(0, -5);
   assert.match(namespace, /^[A-Za-z][A-Za-z0-9_-]*$/);
   const raw = await readFile(join(localeRoot, locale, file));
   const tree = JSON.parse(raw.toString('utf8'));
   trees[locale][namespace] = tree;
   let leaves = 0;
   walk(tree, [], (key, value) => {
    if (!key) throw new Error('Namespace root must be a container');
    const id = namespace + ':' + key;
    if (Object.hasOwn(catalogLeaves[locale], id)) throw new Error(`Flat collision: ${id}`);
    catalogLeaves[locale][id] = value; leaves++;
    if (typeof value === 'string') {
     const inputs = allInputs.get(id) ?? new Set();
     inputNames(value).forEach(name => inputs.add(name)); allInputs.set(id, inputs);
    }
   });
   inventory.push({ locale, namespace, file: `${locale}/${file}`, bytes: raw.length, leaves, sha256: createHash('sha256').update(raw).digest('hex') });
  }
 }
 const metadata = { schemaVersion: 1, baseLocale: 'en', locales, namespaces: [...new Set(inventory.map(file => file.namespace))].sort(), trees, leaves: {}, inventory };
 const catalogs = {};
 const shapesByLocale = {};
 await mkdir(join(output, 'project.inlang/messages'), { recursive: true });
 for (const locale of locales) {
  catalogs[locale] = {}; shapesByLocale[locale] = {};
  for (const [id, value] of Object.entries(catalogLeaves[locale])) {
   const names = [...(allInputs.get(id) ?? [])].sort();
   const inputs = names.map((name, index) => ({ slot: `p${index}`, name }));
   (metadata.leaves[id] ??= {})[locale] = { kind: value === null ? 'null' : typeof value, inputs };
   if (typeof value !== 'string') continue; // Exact non-string value retained in trees/shapes.
   let cursor = 0, pattern = '';
   for (const match of value.matchAll(tokenPattern)) {
    pattern += escape(value.slice(cursor, match.index)) + `{p${names.indexOf(match[1].trim())}}`;
    cursor = match.index + match[0].length;
   }
   catalogs[locale][id] = pattern + escape(value.slice(cursor));
  }
  await writeFile(join(output, 'project.inlang/messages', `${locale}.json`), JSON.stringify(catalogs[locale], null, 2));
  for (const [namespace, tree] of Object.entries(trees[locale])) {
   const shape = value => {
    if (Array.isArray(value)) return value.map(shape);
    if (value !== null && typeof value === 'object') return Object.fromEntries(Object.entries(value).map(([key, child]) => [key, shape(child)]));
    return value;
   };
   // A path-aware shape separates message text from per-locale containers/non-string data.
   const references = (value, path = []) => typeof value === 'string' ? { $message: path.join('.') } : Array.isArray(value) ? value.map((child, index) => references(child, [...path, String(index)])) : value !== null && typeof value === 'object' ? Object.fromEntries(Object.entries(value).map(([key, child]) => [key, references(child, [...path, key])])) : shape(value);
   const leafMetadata = Object.fromEntries(Object.keys(catalogLeaves[locale]).filter(id => id.startsWith(namespace + ':')).map(id => [id.slice(namespace.length + 1), metadata.leaves[id][locale]]));
   await mkdir(join(output, 'shapes', locale), { recursive: true });
   shapesByLocale[locale][namespace] = { tree: references(tree), leaves: leafMetadata };
   await writeFile(join(output, 'shapes', locale, namespace + '.json'), JSON.stringify(shapesByLocale[locale][namespace]));
  }
 }
 for (const locale of locales) {
  await mkdir(join(output, 'shapes-effective', locale), { recursive: true });
  for (const namespace of metadata.namespaces) {
   const selected = shapesByLocale[locale][namespace], base = shapesByLocale.en?.[namespace];
   const effective = { tree: selected?.tree, fallbackTree: locale === 'en' ? undefined : base?.tree, leaves: { ...base?.leaves, ...selected?.leaves } };
   await writeFile(join(output, 'shapes-effective', locale, namespace + '.json'), JSON.stringify(effective));
  }
 }
 await writeFile(join(output, 'catalog-metadata.json'), JSON.stringify(metadata, null, 2));
 return { metadata, catalogs };
}
if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) {
 const source = process.env.LOCALAI_SOURCE, output = process.env.CONVERTER_OUTPUT;
 assert.ok(source && output, 'Set LOCALAI_SOURCE and CONVERTER_OUTPUT');
 const { metadata, catalogs } = await convertCatalogs({ source, output: resolve(output) });
 console.log(JSON.stringify({ files: metadata.inventory.length, locales: metadata.locales, englishLeaves: metadata.inventory.filter(file => file.locale === 'en').reduce((sum, file) => sum + file.leaves, 0), englishCompiledStrings: Object.keys(catalogs.en).length, namespaces: metadata.namespaces.length }));
}
