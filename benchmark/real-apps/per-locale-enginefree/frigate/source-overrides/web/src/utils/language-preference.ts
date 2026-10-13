import { supportedLanguageKeys } from "@/lib/const";
export function getSystemLanguage(defaultLanguage = "en") {
  if (typeof window === "undefined") return defaultLanguage;
  const systemLanguage = window.navigator.language;
  if (supportedLanguageKeys.includes(systemLanguage)) return systemLanguage;
  if (systemLanguage.includes("-")) {
    const shortenedSystemLanguage = systemLanguage.split("-")[0];
    if (supportedLanguageKeys.includes(shortenedSystemLanguage)) return shortenedSystemLanguage;
  }
  return defaultLanguage;
}
export function getInitialLanguage(defaultLanguage = "en", storageKey = "frigate-ui-language") {
  if (typeof window === "undefined") return defaultLanguage;
  try { return localStorage.getItem(storageKey) || getSystemLanguage(defaultLanguage); } catch { return defaultLanguage; }
}
