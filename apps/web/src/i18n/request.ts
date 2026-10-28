import { getRequestConfig } from 'next-intl/server'
import { getUserLocale } from './locale'

// next-intl without i18n routing: the locale comes from the cookie (getUserLocale), and the matching message catalogue
// is loaded per request. Adding a language later is just another messages/<locale>.json.
export default getRequestConfig(async () => {
  const locale = await getUserLocale()
  return {
    locale,
    messages: (await import(`../../messages/${locale}.json`)).default,
  }
})
