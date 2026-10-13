import { createRuntime } from './runtime.js'
import {selectedLocale,selectedMessages,englishMessages} from './compiled.js'
import metadata from '../../../locale-metadata.json'
const lower=Object.fromEntries(metadata.supportedLocales.map(x=>[x.toLowerCase(),x]))
export function normalizeLocale(language){const requested=language==='auto'?(globalThis.navigator?.language||'en'):language;if(!requested)return'en';const normalized=requested.replaceAll('_','-').toLowerCase();const base=normalized.split('-')[0];return lower[normalized]||metadata.aliases[normalized]||lower[base]||metadata.aliases[base]||'en'}
export function detectInitialLanguage(){const cookie=globalThis.document?.cookie.split(';').map(x=>x.trim()).find(x=>x.startsWith('lang='))?.slice(5);let stored;try{const raw=globalThis.localStorage?.getItem('lang');try{stored=JSON.parse(raw)}catch{stored=raw}}catch{}return normalizeLocale(cookie||stored||globalThis.navigator?.language||'en')}
async function navigate(language){const normalized=normalizeLocale(language);if(normalized===selectedLocale)return normalized;document.cookie='lang='+normalized+';path=/;SameSite=Lax';try{localStorage.setItem('lang',JSON.stringify(normalized))}catch{}location.reload();return new Promise(()=>{})}
const i18n=createRuntime({locale:selectedLocale,locales:metadata.supportedLocales,resources:{en:englishMessages,[selectedLocale]:selectedMessages},onLocaleChange:navigate})
export const defaultNS='translation'
export const supportedLocales=metadata.supportedLocales
export const resources={en:{translation:englishMessages},[selectedLocale]:{translation:selectedMessages}}
export const i18nInitPromise=Promise.resolve(i18n)
export const ensureNamespaces=()=>Promise.resolve(i18n)
export const getTranslationFunction=(namespaces,prefix)=>i18n.getFixedT(selectedLocale,namespaces,prefix)
export function syncDocumentLanguage(language=selectedLocale){if(typeof document!=='undefined'){document.documentElement.lang=language;document.documentElement.dir=i18n.dir(language)}}
export async function ensureLocale(language){const normalized=normalizeLocale(language);if(normalized!==selectedLocale)await navigate(normalized);return normalized}
export async function changeLanguageSafely(language){const normalized=normalizeLocale(language);if(normalized!==selectedLocale)await navigate(normalized);syncDocumentLanguage(normalized);return normalized}
export async function initializeI18n(){await changeLanguageSafely(detectInitialLanguage());return selectedLocale}
/** @returns {()=>void} */
export function __setLocaleLoaderForTests(locale,loader){throw new Error('Fixed locale builds switch documents; loader injection is not an app runtime API')}
export function __resetLocaleForTests(locale){}
export {selectedLocale}
export default i18n
