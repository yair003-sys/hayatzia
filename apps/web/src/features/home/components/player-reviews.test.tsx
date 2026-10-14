import { act, cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { Review } from '@/features/ratings/schema'
import type { HomePlayer } from '../server/queries'
import { PlayerReviews } from './player-reviews'

const h = vi.hoisted(() => ({
  like: vi.fn(),
  io: null as null | ((entries: { isIntersecting: boolean }[]) => void),
  reduced: false,
}))
vi.mock('@/features/ratings/server/actions', () => ({ likeReviewAction: h.like }))
vi.mock('next/link', () => ({
  default: ({ href, children, ...rest }: { href: string; children: React.ReactNode }) => (
    <a href={href} {...rest}>
      {children}
    </a>
  ),
}))

const rv = (n: number, likes: number): Review => ({
  user_id: `0000000${n}-0000-4000-8000-000000000000`,
  nick: `אוהד${n}`,
  stars: 5,
  review: `ביקורת ${n}`,
  updated_at: '2026-10-14T10:00:00Z',
  likes_count: likes,
  liked: false,
  mine: false,
})
const players: HomePlayer[] = [
  { id: 'mta_10', number: 10, name_short: 'שחקן א', position: 'CM', avg: 4.6, count: 12, reviews: [rv(1, 9), rv(2, 5), rv(3, 1)] },
  { id: 'mta_9', number: 9, name_short: 'שחקן ב', position: 'ST', avg: 4.1, count: 8, reviews: [rv(4, 3), rv(5, 2)] },
]

const line = (id: string) => screen.getByTestId(`review-${id}`).querySelector('p')?.textContent
const onScreen = (yes: boolean) =>
  act(() => {
    h.io?.([{ isIntersecting: yes }])
  })
const wait = async (ms: number) => {
  await act(async () => {
    await vi.advanceTimersByTimeAsync(ms)
  })
}

describe('PlayerReviews rotation', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    h.io = null
    h.reduced = false
    vi.stubGlobal(
      'IntersectionObserver',
      class {
        constructor(cb: (entries: { isIntersecting: boolean }[]) => void) {
          h.io = cb
        }
        observe() {}
        disconnect() {}
      },
    )
    vi.stubGlobal('matchMedia', (q: string) => ({ matches: q.includes('reduce') && h.reduced, addEventListener() {}, removeEventListener() {} }))
  })
  afterEach(() => {
    cleanup()
    vi.unstubAllGlobals()
    vi.useRealTimers()
  })

  it('starts with the most-liked review; cards are a step apart', () => {
    render(<PlayerReviews players={players} />)
    expect(line('mta_10')).toBe('״ביקורת 1״')
    expect(line('mta_9')).toBe('״ביקורת 5״')
  })

  it('every 4 s (after the fade) the next review, in like order, while on screen', async () => {
    render(<PlayerReviews players={players} />)
    onScreen(true)
    await wait(4000)
    expect(screen.getByTestId('review-mta_10')).toHaveStyle({ opacity: '0' })
    await wait(350)
    expect(line('mta_10')).toBe('״ביקורת 2״')
    expect(screen.getByTestId('review-mta_10')).toHaveStyle({ opacity: '1' })
    await wait(4350 * 2)
    expect(line('mta_10')).toBe('״ביקורת 1״')
  })

  it('pauses off screen and resumes when back', async () => {
    render(<PlayerReviews players={players} />)
    await wait(12_000) // never seen yet
    expect(line('mta_10')).toBe('״ביקורת 1״')
    onScreen(true)
    await wait(4350)
    expect(line('mta_10')).toBe('״ביקורת 2״')
    onScreen(false)
    await wait(20_000)
    expect(line('mta_10')).toBe('״ביקורת 2״')
    expect(screen.getByTestId('review-mta_10')).toHaveStyle({ opacity: '1' })
    onScreen(true)
    await wait(4350)
    expect(line('mta_10')).toBe('״ביקורת 3״')
  })

  it('paused in the middle of a fade: the line is back at once and stays visible when the rotation resumes', async () => {
    render(<PlayerReviews players={players} />)
    onScreen(true)
    await wait(4100) // 100 ms into the fade
    expect(screen.getByTestId('review-mta_10')).toHaveStyle({ opacity: '0' })
    onScreen(false)
    expect(screen.getByTestId('review-mta_10')).toHaveStyle({ opacity: '1' })
    onScreen(true)
    expect(screen.getByTestId('review-mta_10')).toHaveStyle({ opacity: '1' })
    await wait(1000)
    expect(screen.getByTestId('review-mta_10')).toHaveStyle({ opacity: '1' })
    expect(line('mta_10')).toBe('״ביקורת 1״')
    await wait(3350)
    expect(line('mta_10')).toBe('״ביקורת 2״')
  })

  it('never rotates under reduced motion', async () => {
    h.reduced = true
    render(<PlayerReviews players={players} />)
    await wait(0)
    onScreen(true)
    await wait(20_000)
    expect(line('mta_10')).toBe('״ביקורת 1״')
  })

  it('holds still while focus is inside (reading or liking)', async () => {
    h.like.mockResolvedValue({ data: { ok: true } })
    render(<PlayerReviews players={players} />)
    onScreen(true)
    const heart = screen.getByRole('button', { name: 'לייק לביקורת של אוהד1, 9 לייקים' })
    act(() => {
      heart.focus()
    })
    await act(async () => {
      fireEvent.click(heart)
    })
    expect(h.like).toHaveBeenCalledWith({ playerId: 'mta_10', authorId: players[0]!.reviews[0]!.user_id, on: true })
    await wait(20_000)
    expect(line('mta_10')).toBe('״ביקורת 1״')
    expect(screen.getByRole('button', { name: 'לייק לביקורת של אוהד1, 10 לייקים' })).toHaveAttribute('aria-pressed', 'true')
  })
})
