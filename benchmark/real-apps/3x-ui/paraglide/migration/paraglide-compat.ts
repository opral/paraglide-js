import { m } from '@/paraglide/messages.js';
import { getLocale } from '@/paraglide/runtime.js';

type Message = (inputs?: Record<string, unknown>, options?: { locale?: string }) => string;
type TranslateOptions = Record<string, unknown> & {
  defaultValue?: string;
  lng?: string;
  locale?: string;
};

const catalog = m as unknown as Record<string, Message>;
const locales = new Set(['ar-EG', 'en-US', 'es-ES', 'fa-IR', 'id-ID', 'ja-JP', 'pt-BR', 'ru-RU', 'tr-TR', 'uk-UA', 'vi-VN', 'zh-CN', 'zh-TW']);
let activeLocale: string | undefined;

export function setActiveLocale(locale: string): void {
  activeLocale = locales.has(locale) ? locale : 'en-US';
}

export function t(key: string, options: TranslateOptions = {}): string {
  const message = catalog[key];
  if (typeof message !== 'function') return options.defaultValue ?? key;

  const inputs = { ...options };
  delete inputs.defaultValue;
  delete inputs.lng;
  delete inputs.locale;
  for (const [name, value] of Object.entries(inputs)) {
    if (value == null) inputs[name] = '';
  }
  const requestedLocale = options.lng ?? options.locale ?? activeLocale ?? getLocale();
  const locale = locales.has(requestedLocale) ? requestedLocale : 'en-US';
  return message(inputs, { locale });
}

const i18n = {
  t,
  get language() {
    return activeLocale ?? getLocale();
  },
  get resolvedLanguage() {
    return activeLocale ?? getLocale();
  },
  get isInitialized() {
    return true;
  },
};

export function useTranslation() {
  return { t, i18n, ready: true };
}

export default i18n;
