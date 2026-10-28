// Locale basics, shared by server and client. Hebrew is the default and the only RTL locale for now; the rest are
// LTR. Israel-first: with no cookie set everything resolves to Hebrew, so nothing changes until a locale is chosen.
export const LOCALES = ['he', 'en', 'de', 'fr', 'es'] as const
export type Locale = (typeof LOCALES)[number]

export const DEFAULT_LOCALE: Locale = 'he'
export const RTL_LOCALES: readonly Locale[] = ['he']
export const LOCALE_COOKIE = 'NEXT_LOCALE'

export const LOCALE_LABELS: Record<Locale, string> = {
  he: 'עברית',
  en: 'English',
  de: 'Deutsch',
  fr: 'Français',
  es: 'Español',
}

export function isLocale(value: unknown): value is Locale {
  return typeof value === 'string' && (LOCALES as readonly string[]).includes(value)
}

export function dirOf(locale: Locale): 'rtl' | 'ltr' {
  return RTL_LOCALES.includes(locale) ? 'rtl' : 'ltr'
}
