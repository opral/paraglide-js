import fs from 'node:fs';
import path from 'node:path';
import { brotliCompressSync, constants as zlibConstants, gzipSync } from 'node:zlib';
import ts from 'typescript';
import type { Plugin } from 'vite';

const PLACEHOLDER = '__LIBRECHAT_NATIVE_LOCALE_PRELOAD__';

function readStringArray(source: ts.SourceFile, name: string): string[] {
  for (const statement of source.statements) {
    if (!ts.isVariableStatement(statement)) continue;
    for (const declaration of statement.declarationList.declarations) {
      if (!ts.isIdentifier(declaration.name) || declaration.name.text !== name) continue;
      let initializer = declaration.initializer;
      if (initializer && (ts.isAsExpression(initializer) || ts.isSatisfiesExpression(initializer))) {
        initializer = initializer.expression;
      }
      if (!initializer || !ts.isArrayLiteralExpression(initializer)) {
        throw new Error(`Expected ${name} to be a string array`);
      }
      return initializer.elements.map((element) => {
        if (!ts.isStringLiteral(element)) throw new Error(`Expected string literal in ${name}`);
        return element.text;
      });
    }
  }
  throw new Error(`Could not find ${name} in native locale source`);
}

function readStringMap(source: ts.SourceFile, name: string): Record<string, string> {
  for (const statement of source.statements) {
    if (!ts.isVariableStatement(statement)) continue;
    for (const declaration of statement.declarationList.declarations) {
      if (!ts.isIdentifier(declaration.name) || declaration.name.text !== name) continue;
      if (!declaration.initializer || !ts.isObjectLiteralExpression(declaration.initializer)) {
        throw new Error(`Expected ${name} to be an object literal`);
      }
      const values: Record<string, string> = {};
      for (const property of declaration.initializer.properties) {
        if (!ts.isPropertyAssignment(property) || !ts.isStringLiteral(property.initializer)) {
          throw new Error(`Expected string mapping in ${name}`);
        }
        const key = ts.isIdentifier(property.name)
          ? property.name.text
          : ts.isStringLiteral(property.name)
            ? property.name.text
            : undefined;
        if (!key) throw new Error(`Expected a literal key in ${name}`);
        values[key] = property.initializer.text;
      }
      return values;
    }
  }
  throw new Error(`Could not find ${name} in native locale source`);
}

function inlinePreloader(
  chunks: Record<string, string>,
  supportedLocales: string[],
  aliases: Record<string, string>,
) {
  const locales = JSON.stringify(supportedLocales);
  const aliasMap = JSON.stringify(aliases);
  const chunkMap = JSON.stringify(chunks);
  return `(function(){try{var locales=${locales};var aliases=${aliasMap};var chunks=${chunkMap};var byLowercase={};locales.forEach(function(locale){byLowercase[locale.toLowerCase()]=locale;});function cookie(name){var prefix=name+'=';return document.cookie.split(';').map(function(item){return item.trim();}).filter(function(item){return item.indexOf(prefix)===0;})[0]?.slice(prefix.length);}function stored(){var raw=localStorage.getItem('lang');if(!raw)return undefined;try{var parsed=JSON.parse(raw);return typeof parsed==='string'?parsed:raw;}catch(_){return raw;}}function browserLanguage(){return navigator.language||navigator.languages?.[0]||'en';}function normalize(locale){var requested=locale==='auto'?browserLanguage():locale;if(!requested)return'en';var normalized=requested.replace(/_/g,'-').toLowerCase();var exact=byLowercase[normalized];if(exact)return exact;var alias=aliases[normalized];if(alias)return alias;var base=normalized.split('-')[0];return byLowercase[base]||aliases[base]||'en';}var requested=cookie('lang')||stored()||browserLanguage();var locale=normalize(requested);var file=chunks[locale];if(!file)return;var link=document.createElement('link');link.rel='modulepreload';link.href=new URL(file,document.baseURI).href;link.crossOrigin='';link.setAttribute('data-native-locale-preload',locale);document.head.appendChild(link);}catch(_){/* The preload is advisory; native initialization remains authoritative. */}})();`;
}

export default function nativeLocalePreloadControl(): Plugin {
  let locales: string[] = [];
  let aliases: Record<string, string> = {};

  return {
    name: 'benchmark-native-selected-locale-preload',
    apply: 'build',
    buildStart() {
      const sourcePath = path.resolve(import.meta.dirname, 'src/locales/i18n.ts');
      const text = fs.readFileSync(sourcePath, 'utf8');
      const source = ts.createSourceFile(sourcePath, text, ts.ScriptTarget.Latest, true);
      locales = readStringArray(source, 'supportedLocales');
      aliases = readStringMap(source, 'localeAliases');
    },
    transformIndexHtml: {
      order: 'post',
      handler() {
        return [
          {
            tag: 'script',
            attrs: { 'data-native-locale-preload-control': '' },
            children: PLACEHOLDER,
            injectTo: 'head-prepend',
          },
        ];
      },
    },
    generateBundle: {
      order: 'post',
      handler(_options, bundle) {
        const expectedLocales = new Set(locales.filter((locale) => locale !== 'en'));
        const chunks: Record<string, string> = {};
        for (const output of Object.values(bundle)) {
          if (output.type !== 'chunk' || !output.name.startsWith('locale-')) continue;
          const locale = output.name.slice('locale-'.length);
          if (!expectedLocales.has(locale)) continue;
          chunks[locale] = output.fileName;
        }

        const missing = [...expectedLocales].filter((locale) => !chunks[locale]);
        const unexpected = Object.keys(chunks).filter((locale) => !expectedLocales.has(locale));
        if (
          missing.length ||
          unexpected.length ||
          Object.keys(chunks).length !== expectedLocales.size
        ) {
          throw new Error(
            `Locale preload map mismatch; missing=${missing.join(',')} unexpected=${unexpected.join(',')}`,
          );
        }

        const html = Object.values(bundle).find(
          (output) => output.type === 'asset' && output.fileName === 'index.html',
        );
        if (!html || html.type !== 'asset') throw new Error('Expected the built index.html asset');
        const source = typeof html.source === 'string' ? html.source : Buffer.from(html.source).toString();
        if (!source.includes(PLACEHOLDER)) throw new Error('Locale preload placeholder was not injected');
        const updated = source.replace(PLACEHOLDER, inlinePreloader(chunks, locales, aliases));
        html.source = updated;

        // The app's compression plugin runs before this post-order hook. Keep its
        // prebuilt HTML sidecars in sync with the final HTML and native Q5 settings.
        const htmlBytes = Buffer.from(updated);
        const gzip = Object.values(bundle).find(
          (output) => output.type === 'asset' && output.fileName === 'index.html.gz',
        );
        const brotli = Object.values(bundle).find(
          (output) => output.type === 'asset' && output.fileName === 'index.html.br',
        );
        if (gzip?.type === 'asset') gzip.source = gzipSync(htmlBytes, { level: 9 });
        if (brotli?.type === 'asset') {
          brotli.source = brotliCompressSync(htmlBytes, {
            params: { [zlibConstants.BROTLI_PARAM_QUALITY]: 5 },
          });
        }
      },
    },
  };
}
