'use client'

import type { ReactNode } from 'react'
import { NextIntlClientProvider } from 'next-intl'
import { DEFAULT_LOCALE } from '../config'
import heMessages from '../../../messages/he.json'

// Israel-first: a client-side provider so NextIntlClientProvider never reaches into the server request context
// (which reads cookies/headers and would make every route dynamic under Cache Components). Hebrew messages are the
// static baseline; per-viewer dynamic locale switching is a later stage that will feed these from the request.
export function IntlProvider({ children }: { children: ReactNode }) {
  return (
    <NextIntlClientProvider locale={DEFAULT_LOCALE} messages={heMessages} timeZone="Asia/Jerusalem">
      {children}
    </NextIntlClientProvider>
  )
}
