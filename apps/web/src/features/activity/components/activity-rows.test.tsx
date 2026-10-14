import { cleanup, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { ActivityItem } from '../server/queries'
import { ActivityRows } from './activity-rows'

vi.mock('next/link', () => ({
  default: ({ href, children, ...rest }: { href: string; children: React.ReactNode }) => (
    <a href={href} {...rest}>
      {children}
    </a>
  ),
}))

const base: ActivityItem = {
  id: 1,
  kind: 'clip_like',
  updatedAt: '2026-10-14T10:00:00+00:00',
  actorId: '22222222-2222-4222-8222-222222222222',
  nick: 'דני',
  line: 'דני ועוד 12 אהבו את הסרטון שלך',
  when: 'לפני 5 דק׳',
  href: '/square',
  thumb: 'https://example.test/x.jpg',
  video: false,
  sub: null,
}

describe('ActivityRows', () => {
  afterEach(() => {
    cleanup()
  })

  it('a row is one link with the sentence, the time and a "new" mark when unseen', () => {
    render(<ActivityRows items={[base]} seenAt="2026-10-14T09:00:00+00:00" />)
    const link = screen.getByRole('link')
    expect(link).toHaveAttribute('href', '/square')
    expect(link).toHaveTextContent('דני ועוד 12 אהבו את הסרטון שלך')
    expect(link).toHaveTextContent('לפני 5 דק׳')
    expect(link).toHaveTextContent('חדש')
    expect(link).toHaveAttribute('data-unseen')
    expect(link.querySelector('img')).toHaveAttribute('src', 'https://example.test/x.jpg')
  })

  it('a seen trip row: the trip summary, no thumbnail, no "new" mark; unknown fan → "א"', () => {
    const trip: ActivityItem = { ...base, id: 2, kind: 'trip_request', actorId: null, nick: null, line: 'אוהד ביקש להצטרף לנסיעה שלך', href: '/stand/trips?trip=t', thumb: null, sub: 'נסיעה מחיפה' }
    render(<ActivityRows items={[trip]} seenAt="2026-10-14T10:00:00+00:00" />)
    const link = screen.getByRole('link')
    expect(link).toHaveTextContent('נסיעה מחיפה · לפני 5 דק׳')
    expect(link).not.toHaveTextContent('חדש')
    expect(link).not.toHaveAttribute('data-unseen')
    expect(link.querySelector('img')).toBeNull()
    expect(link.querySelector('.ib-avatar')).toHaveTextContent('א')
  })
})
