import { getRequestConfig } from 'next-intl/server'
import { isLocale } from './config'
import { routing } from './routing'

// next-intl with i18n routing: the locale comes from the `[locale]` route segment (requestLocale). Invalid/absent →
// the default. The path is always a validated locale, so the dynamic import can never be steered elsewhere.
export default getRequestConfig(async ({ requestLocale }) => {
  const requested = await requestLocale
  const locale = isLocale(requested) ? requested : routing.defaultLocale
  return {
    locale,
    messages: (await import(`../../messages/${locale}.json`)).default,
  }
})
