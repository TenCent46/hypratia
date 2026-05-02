import i18n from 'i18next';
import LanguageDetector from 'i18next-browser-languagedetector';
import { initReactI18next } from 'react-i18next';
import en from './locales/en';
import ja from './locales/ja';
import zh from './locales/zh';
import de from './locales/de';
import fr from './locales/fr';
import ko from './locales/ko';
import es from './locales/es';

export type SupportedLanguage = 'en' | 'ja' | 'zh' | 'de' | 'fr' | 'ko' | 'es';

export const SUPPORTED_LANGUAGES: SupportedLanguage[] = [
  'en',
  'ja',
  'zh',
  'de',
  'fr',
  'ko',
  'es',
];

const resources = {
  en: { translation: en },
  ja: { translation: ja },
  zh: { translation: zh },
  de: { translation: de },
  fr: { translation: fr },
  ko: { translation: ko },
  es: { translation: es },
} as const;

void i18n
  .use(LanguageDetector)
  .use(initReactI18next)
  .init({
    resources,
    fallbackLng: 'en',
    supportedLngs: SUPPORTED_LANGUAGES,
    // Map regional codes (en-US, ja-JP, zh-CN, …) onto our supported set.
    load: 'languageOnly',
    nonExplicitSupportedLngs: true,
    interpolation: { escapeValue: false },
    detection: {
      // Settings store wins; LanguageDetector only used at first launch.
      order: ['localStorage', 'navigator', 'htmlTag'],
      caches: [],
    },
    returnNull: false,
  });

/**
 * Imperative setter used by the Settings UI. Wrapped so callers don't have
 * to import the full i18next module just to swap languages.
 */
export function setLanguage(lng: SupportedLanguage): void {
  void i18n.changeLanguage(lng);
}

export default i18n;
