import { act, cleanup, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { ACTIVITY_SEEN_EVENT } from '../activity'
import { Bell } from './bell'

type Listener = (m: { event: string; payload: unknown }) => void
const h = vi.hoisted(() => ({
  pathname: '/stand',
  rpc: vi.fn(),
  listeners: [] as { topic: string; fn: Listener }[],
}))

vi.mock('next/link', () => ({
  default: ({ href, children, ...rest }: { href: string; children: React.ReactNode }) => (
    <a href={href} {...rest}>
      {children}
    </a>
  ),
}))
vi.mock('next/navigation', () => ({ usePathname: () => h.pathname }))
vi.mock('@/lib/supabase/client', () => ({ createClient: () => ({ rpc: h.rpc }) }))
vi.mock('@/lib/supabase/shared-channel', () => ({
  listenPrivate: (_c: unknown, topic: string, fn: Listener) => {
    const entry = { topic, fn }
    h.listeners.push(entry)
    return () => {
      h.listeners = h.listeners.filter((e) => e !== entry)
    }
  },
}))

const ME = '11111111-1111-4111-8111-111111111111'
const emit = (event: string) => {
  for (const l of h.listeners) l.fn({ event, payload: { kind: 'clip_like' } })
}

describe('Bell', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    h.pathname = '/stand'
    h.rpc.mockReset()
    h.listeners = []
  })
  afterEach(() => {
    cleanup()
    vi.useRealTimers()
  })

  it('links to the list; the count from the server with an accessible label; 0 → no badge', () => {
    const { rerender } = render(<Bell meId={ME} count={3} />)
    const link = screen.getByRole('link', { name: 'התראות, 3 חדשות' })
    expect(link).toHaveAttribute('href', '/activity')
    expect(link).toHaveTextContent('3')
    rerender(<Bell meId={ME} count={0} />)
    expect(screen.getByRole('link', { name: 'התראות' })).toHaveTextContent('')
  })

  it('100 → "99+"', () => {
    render(<Bell meId={ME} count={100} />)
    expect(screen.getByRole('link', { name: 'התראות, 99+ חדשות' })).toHaveTextContent('99+')
  })

  it("listens on the fan's own inbox topic; `activity` events re-read the count once per burst", async () => {
    h.rpc.mockResolvedValue({ data: 7, error: null })
    render(<Bell meId={ME} count={1} />)
    expect(h.listeners.map((l) => l.topic)).toEqual([`inbox:${ME}`])
    act(() => {
      emit('message') // not ours
      emit('activity')
      emit('activity')
    })
    await act(async () => {
      await vi.advanceTimersByTimeAsync(1000)
    })
    expect(h.rpc).toHaveBeenCalledTimes(1)
    expect(h.rpc).toHaveBeenCalledWith('activity_unread_count')
    expect(screen.getByRole('link')).toHaveAccessibleName('התראות, 7 חדשות')
    // Screen readers hear the new count politely (the region has no role, so it is not another status).
    await act(async () => {
      await vi.advanceTimersByTimeAsync(0)
    })
    expect(document.querySelector('[aria-live="polite"]')).toHaveTextContent('7 התראות חדשות')
  })

  it('announcements are throttled: a second rise within 10 s waits', async () => {
    h.rpc.mockResolvedValueOnce({ data: 2, error: null }).mockResolvedValueOnce({ data: 3, error: null })
    render(<Bell meId={ME} count={1} />)
    const region = () => document.querySelector('[aria-live="polite"]')
    expect(region()).toHaveTextContent('') // nothing said on the first render
    act(() => {
      emit('activity')
    })
    await act(async () => {
      await vi.advanceTimersByTimeAsync(700)
    })
    expect(region()).toHaveTextContent('2 התראות חדשות')
    act(() => {
      emit('activity')
    })
    await act(async () => {
      await vi.advanceTimersByTimeAsync(700)
    })
    expect(screen.getByRole('link')).toHaveAccessibleName('התראות, 3 חדשות')
    expect(region()).toHaveTextContent('2 התראות חדשות')
    await act(async () => {
      await vi.advanceTimersByTimeAsync(10_000)
    })
    expect(region()).toHaveTextContent('3 התראות חדשות')
  })

  it('opening the list clears it, and a count read that started before cannot bring it back', async () => {
    let resolve: (v: unknown) => void = () => {}
    h.rpc.mockReturnValue(new Promise((r) => (resolve = r)))
    render(<Bell meId={ME} count={4} />)
    act(() => {
      emit('activity')
    })
    await act(async () => {
      await vi.advanceTimersByTimeAsync(1000)
    })
    act(() => {
      window.dispatchEvent(new Event(ACTIVITY_SEEN_EVENT))
    })
    await act(async () => {
      resolve({ data: 4, error: null })
    })
    expect(screen.getByRole('link')).toHaveAccessibleName('התראות')
    // Then the count is read again: rows that changed after what the list showed still count.
    h.rpc.mockResolvedValue({ data: 1, error: null })
    await act(async () => {
      await vi.advanceTimersByTimeAsync(1000)
    })
    expect(h.rpc).toHaveBeenCalledTimes(2)
    expect(screen.getByRole('link')).toHaveAccessibleName('התראות, 1 חדשות')
  })

  it('no badge while the list itself is open', () => {
    h.pathname = '/activity'
    render(<Bell meId={ME} count={5} />)
    const link = screen.getByRole('link', { name: 'התראות' })
    expect(link).toHaveAttribute('aria-current', 'page')
  })
})
