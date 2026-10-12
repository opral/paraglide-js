// Compare the actual client facade with its physical compiler graph.
// This is Node ESM parity, not browser hydration or page-load evidence.
import fs from 'node:fs/promises';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { createHash } from 'node:crypto';
import { createClientLocaleSplitPlugin } from '../../dist/bundler-plugins/client-locale-split/vite-plugin.js';

const [inputDirectory, bundleFile] = process.argv.slice(2);
if (!inputDirectory || !bundleFile) throw new Error('Usage: node benchmark/real-apps/verify-virtual-locale-catalog.mjs GENERATED_DIRECTORY BUNDLES_JSON');
const root = path.resolve('.real-apps/virtual-locale-catalog-probe');
await fs.rm(root, { recursive: true, force: true });
await fs.mkdir(root, { recursive: true });
await fs.cp(path.resolve(inputDirectory), root, { recursive: true });
await fs.writeFile(path.join(root, 'package.json'), '{"type":"module"}');
const manifestText = await fs.readFile(path.join(root, 'client-locale-split.json'), 'utf8');
const manifest = JSON.parse(manifestText);
const bundles = new Map(JSON.parse(await fs.readFile(bundleFile, 'utf8')).map((bundle) => [bundle.id, bundle]));
const plugin = createClientLocaleSplitPlugin({ state: { compilerOptions: { outdir: root } } });
const load = (id) => plugin.load.call({}, id);
let core = await load('\0paraglide:client-locale-split:core');
for (const locale of manifest.locales) {
  const variant = await load(`\0paraglide:client-locale-split:locale:${encodeURIComponent(locale)}`);
  const filename = path.join(root, `variant-${encodeURIComponent(locale)}.mjs`);
  await fs.writeFile(filename, variant);
  core = core.replaceAll(JSON.stringify(`virtual:paraglide/client-locale-split/locale/${encodeURIComponent(locale)}`), JSON.stringify(pathToFileURL(filename).href));
}
const corePath = path.join(root, 'probe-core.mjs');
await fs.writeFile(corePath, core);
const facade = (await load('\0paraglide:client-locale-split:root')).replaceAll(JSON.stringify('virtual:paraglide/client-locale-split/core'), JSON.stringify(pathToFileURL(corePath).href));
const facadePath = path.join(root, 'probe-facade.mjs');
await fs.writeFile(facadePath, facade);
const virtual = await import(pathToFileURL(facadePath).href);
const physical = await import(pathToFileURL(path.join(root, 'messages.js')).href);
const { loadLocale } = await import(pathToFileURL(corePath).href);
let textChecks = 0, partsChecks = 0;
for (const locale of manifest.locales) {
  await loadLocale(locale);
  for (const record of manifest.messages) {
    const bundle = bundles.get(record.publicName);
    if (!bundle) throw new Error(`Missing input bundle ${record.publicName}`);
    for (const count of [0, 1, 7]) {
      const inputs = Object.fromEntries((bundle.declarations ?? []).filter((item) => item.type === 'input-variable').map((item) => [item.name, item.name === 'count' ? count : 'SAMPLE']));
      const options = { locale };
      const expected = physical[record.publicName](inputs, options);
      const actual = virtual[record.publicName](inputs, options);
      if (expected !== actual) throw new Error(`Text mismatch ${locale}/${record.publicName}/${count}`);
      textChecks++;
      if (record.hasMarkup) {
        if (JSON.stringify(physical[record.publicName].parts(inputs, options)) !== JSON.stringify(virtual[record.publicName].parts(inputs, options))) throw new Error(`Parts mismatch ${locale}/${record.publicName}/${count}`);
        partsChecks++;
      }
    }
  }
}
const report = { mode: 'actual virtual facade versus physical compiler messages, Node ESM', locales: manifest.locales.length, keys: manifest.messages.length, textChecks, partsChecks, manifestSha256: createHash('sha256').update(manifestText).digest('hex'), result: 'passed', limitations: 'sample inputs 0/1/7 and SAMPLE; no browser or field metric claim' };
await fs.writeFile(path.join(root, 'report.json'), JSON.stringify(report, null, 2) + '\n');
process.stdout.write(JSON.stringify(report) + '\n');
