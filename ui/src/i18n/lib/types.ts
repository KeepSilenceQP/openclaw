export type TranslationMap = { [key: string]: string | TranslationMap };

/** Locale ids supported by the bundled UI translation registry. */
export type Locale =
  | "en"
  | "zh-CN"
  | "zh-TW"
  | "pt-BR"
  | "de"
  | "es"
  | "ja-JP"
  | "ko"
  | "fr"
  | "ar"
  | "it"
  | "tr"
  | "uk"
  | "id"
  | "pl"
  | "th"
  | "vi"
  | "nl"
  | "fa";

/** Full i18n configuration shape used by tests and future configuration surfaces. */
export interface I18nConfig {
  locale: Locale;
  fallbackLocale: Locale;
  translations: Record<Locale, TranslationMap>;
}
