import '@testing-library/jest-dom/vitest'
import { vi } from 'vitest'
import heMessages from './messages/he.json'

// Component tests render client components that call next-intl's `useTranslations`, which needs a provider. Resolve
// against the Hebrew catalogue (the default, and what tests assert), so any component reads real strings without each
// test wrapping it in a provider.
type Messages = Record<string, Record<string, string>>
const messages = heMessages as Messages

vi.mock('next-intl', () => ({
  useTranslations: (namespace?: string) => (key: string) => {
    const table = namespace ? messages[namespace] : undefined
    return table?.[key] ?? (namespace ? `${namespace}.${key}` : key)
  },
  useLocale: () => 'he',
  NextIntlClientProvider: ({ children }: { children: unknown }) => children,
}))
