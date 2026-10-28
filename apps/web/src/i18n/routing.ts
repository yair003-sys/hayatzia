import { defineRouting } from 'next-intl/routing'
import { DEFAULT_LOCALE, LOCALES } from './config'

// Locale routing. 'as-needed': the default locale (Hebrew) is served at the un-prefixed path exactly as today
// (`/matches`), and the other languages get a prefix (`/en/matches`). So existing links keep working for Hebrew, and
// each locale is its own static variant — performance is preserved.
export const routing = defineRouting({
  locales: LOCALES,
  defaultLocale: DEFAULT_LOCALE,
  localePrefix: 'as-needed',
})
