import { cp, mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const frontendRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const translationRoot = path.resolve(frontendRoot, '../internal/web/translation');
const scratchRoot = path.dirname(fileURLToPath(import.meta.url));
const projectRoot = path.resolve(scratchRoot, '../project.inlang');
const messagesRoot = path.resolve(scratchRoot, '../messages');
const compilerRoot = process.env.PARAGLIDE_REPO;
if (!compilerRoot) throw new Error('Set PARAGLIDE_REPO to the pinned Paraglide checkout');
const pluginPath = path.join(compilerRoot, 'node_modules/@inlang/plugin-message-format/dist/index.js');

function isInterpolationAt(text, index) {
  const match = /^\{([A-Za-z_$][\w$]*)\}/.exec(text.slice(index));
  return match?.[0];
}

function toMessageFormat(text) {
  let output = '';
  for (let index = 0; index < text.length;) {
    if (text[index] === '\\') {
      output += '\\\\';
      index += 1;
      continue;
    }
    if (text.startsWith('{{', index)) {
      const close = text.indexOf('}}', index + 2);
      if (close >= 0) {
        output += `\\{\\{${text.slice(index + 2, close).replaceAll('\\', '\\\\')}\\}\\}`;
        index = close + 2;
        continue;
      }
    }
    const interpolation = text[index] === '{' && isInterpolationAt(text, index);
    if (interpolation) {
      output += interpolation;
      index += interpolation.length;
      continue;
    }
    if (text[index] === '{') output += '\\{';
    else if (text[index] === '}') output += '\\}';
    else output += text[index];
    index += 1;
  }
  return output;
}

function mapStrings(value) {
  if (typeof value === 'string') return toMessageFormat(value);
  if (Array.isArray(value)) return value.map(mapStrings);
  if (value && typeof value === 'object') {
    return Object.fromEntries(Object.entries(value).map(([key, child]) => [key, mapStrings(child)]));
  }
  return value;
}

const settings = {
  $schema: 'https://inlang.com/schema/project-settings',
  baseLocale: 'en-US',
  locales: ['ar-EG', 'en-US', 'es-ES', 'fa-IR', 'id-ID', 'ja-JP', 'pt-BR', 'ru-RU', 'tr-TR', 'uk-UA', 'vi-VN', 'zh-CN', 'zh-TW'],
  modules: [pluginPath],
  'plugin.inlang.messageFormat': { pathPattern: './messages/{locale}.json' },
};

await mkdir(messagesRoot, { recursive: true });
await mkdir(projectRoot, { recursive: true });
await writeFile(path.join(projectRoot, 'settings.json'), `${JSON.stringify(settings, null, 2)}\n`);
await writeFile(path.join(projectRoot, 'project_id'), '3x-ui-paraglide-route-study\n');

for (const locale of settings.locales) {
  const source = path.join(translationRoot, `${locale}.json`);
  const destination = path.join(messagesRoot, `${locale}.json`);
  const json = JSON.parse(await readFile(source, 'utf8'));
  const converted = mapStrings(json);
  converted.$schema = 'https://inlang.com/schema/inlang-message-format';
  await writeFile(destination, `${JSON.stringify(converted, null, 2)}\n`);
}

console.log(JSON.stringify({ projectRoot, locales: settings.locales.length, pluginPath }));
