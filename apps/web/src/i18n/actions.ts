'use server'

import { isLocale } from './config'
import { setUserLocale } from './locale'

/** Set the viewer's language cookie. The caller refreshes so server components re-render in the new locale. */
export async function changeLocaleAction(locale: string): Promise<void> {
  if (isLocale(locale)) await setUserLocale(locale)
}
