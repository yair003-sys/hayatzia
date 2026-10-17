// @vitest-environment node
// Load test 2026-10-17, finding 7: `next start` logged "Date.now() while prerendering" on every page, because the bell
// and the alert banner (both in the app layout) created the browser Supabase client while rendering on the server.
// Rendering them on the server must not create it.
import { renderToString } from 'react-dom/server'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const h = vi.hoisted(() => ({ created: 0 }))
vi.mock('next/link', () => ({
  default: ({ href, children, ...rest }: { href: string; children: React.ReactNode }) => (
    <a href={href} {...rest}>
      {children}
    </a>
  ),
}))
vi.mock('next/navigation', () => ({ usePathname: () => '/me', useRouter: () => ({ push: () => {}, refresh: () => {} }) }))
vi.mock('@/lib/supabase/client', () => ({
  createClient: () => {
    h.created++
    throw new Error('the browser Supabase client was created during server rendering')
  },
}))

const { Bell, FloatingBell } = await import('./bell')
const { AlertBanner } = await import('@/features/push/components/alert-banner')

beforeEach(() => {
  h.created = 0
})

describe('server rendering of the layout widgets', () => {
  it('the bell renders its count without creating the browser client', () => {
    const html = renderToString(<FloatingBell meId="me" count={3} />)
    expect(html).toContain('התראות, 3 חדשות')
    expect(renderToString(<Bell meId="me" count={null} inline />)).toContain('לא הצלחנו לטעון')
    expect(h.created).toBe(0)
  })

  it('the alert banner renders without creating the browser client', () => {
    renderToString(<AlertBanner meId="me" prefs={{ matches: 'all', messages: true }} myClubApiIds={[604]} />)
    expect(h.created).toBe(0)
  })
})
