/*
 * The language of a project's writing (roadmap F38, plan Task G9, decision P6). The editor and every
 * export take it from the project, so the browser checks the spelling in that language and right-to-left
 * writing reads from the right. Vlo's own words stay in English until roadmap decision D3.
 */

/** The languages that the project picker offers, as BCP 47 tags. */
export const LANGUAGES = [
  'en',
  'es',
  'fr',
  'de',
  'it',
  'pt',
  'nl',
  'sv',
  'pl',
  'cs',
  'ru',
  'uk',
  'el',
  'tr',
  'he',
  'yi',
  'ar',
  'fa',
  'ur',
  'hi',
  'bn',
  'ta',
  'zh',
  'ja',
  'ko',
  'th',
  'vi',
  'id',
  'sw',
] as const;

/** The language when a project has none: Vlo's exports were English before F38. */
export const DEFAULT_LANGUAGE = 'en';

const RIGHT_TO_LEFT = new Set(['ar', 'dv', 'fa', 'he', 'ps', 'sd', 'ug', 'ur', 'yi']);

/** A stored tag in its standard form, or undefined for a tag that is not valid. */
export function cleanLanguage(value: unknown): string | undefined {
  if (typeof value !== 'string' || value === '') return undefined;
  try {
    return Intl.getCanonicalLocales(value)[0];
  } catch {
    return undefined;
  }
}

export function textDirection(language: string | undefined): 'ltr' | 'rtl' {
  const base = cleanLanguage(language)?.split('-')[0] ?? '';
  return RIGHT_TO_LEFT.has(base) ? 'rtl' : 'ltr';
}

/** The language's own name, with its English name after it when the two differ, such as "עברית (Hebrew)". */
export function languageLabel(language: string): string {
  const own = new Intl.DisplayNames([language], { type: 'language' }).of(language) ?? language;
  const english = new Intl.DisplayNames(['en'], { type: 'language' }).of(language) ?? language;
  return own === english ? own : `${own} (${english})`;
}
