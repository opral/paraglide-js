import { loadLocale } from '@/paraglide/locale-loader.js';
import { LanguageManager, type LanguageScope } from '@/utils';
import i18n, { setActiveLocale } from './paraglide-compat';

const FALLBACK = 'en-US';

export async function readyI18n(scope: LanguageScope = 'panel') {
  const requested = LanguageManager.getLanguage(scope);
  const locale = LanguageManager.isSupportLanguage(requested) ? requested : FALLBACK;
  await loadLocale(locale);
  setActiveLocale(locale);
  return i18n;
}

export { i18n };
