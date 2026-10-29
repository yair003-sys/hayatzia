import '@testing-library/jest-dom/vitest'
import { vi } from 'vitest'
import heMessages from './messages/he.json'

// Component tests render client components that call next-intl's `useTranslations`, which needs a provider. Resolve
// against the Hebrew catalogue (the default, and what tests assert), so any component reads real strings without each
// test wrapping it in a provider.
type Messages = Record<string, Record<string, string>>
const messages = heMessages as Messages
type Values = Record<string, unknown>

const lookup = (namespace: string | undefined, key: string) =>
  (namespace ? messages[namespace] : undefined)?.[key] ?? (namespace ? `${namespace}.${key}` : key)

// Replace ICU `{name}` placeholders the way next-intl does, so tests that assert on interpolated text read real strings.
const interpolate = (str: string, values?: Values) =>
  values ? str.replace(/\{(\w+)\}/g, (_, k: string) => (k in values ? String(values[k]) : `{${k}}`)) : str

// A minimal stand-in for next-intl's rich-text renderer: splits `<tag>…</tag>` and hands the inner (interpolated) text
// to the matching callback, so a component can bold or wrap parts of a message without a real provider.
const rich = (namespace: string | undefined, key: string, values?: Values): Array<unknown> => {
  const raw = lookup(namespace, key)
  const parts: unknown[] = []
  const re = /<(\w+)>([\s\S]*?)<\/\1>/g
  let last = 0
  let m: RegExpExecArray | null
  while ((m = re.exec(raw))) {
    if (m.index > last) parts.push(interpolate(raw.slice(last, m.index), values))
    const tag = m[1] ?? ''
    const inner = interpolate(m[2] ?? '', values)
    const cb = values?.[tag]
    parts.push(typeof cb === 'function' ? (cb as (c: unknown) => unknown)(inner) : inner)
    last = m.index + m[0].length
  }
  if (last < raw.length) parts.push(interpolate(raw.slice(last), values))
  return parts
}

vi.mock('next-intl', () => ({
  useTranslations: (namespace?: string) => {
    const t = (key: string, values?: Values) => interpolate(lookup(namespace, key), values)
    t.rich = (key: string, values?: Values) => rich(namespace, key, values)
    t.has = (key: string) => (namespace ? messages[namespace]?.[key] : (messages as Record<string, unknown>)[key]) !== undefined
    return t
  },
  useLocale: () => 'he',
  NextIntlClientProvider: ({ children }: { children: unknown }) => children,
}))
