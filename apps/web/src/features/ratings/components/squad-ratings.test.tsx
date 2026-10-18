import { act, cleanup, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { PlayerRow } from '../schema'
import { SquadRatings } from './squad-ratings'

const h = vi.hoisted(() => ({ reviews: vi.fn(), allReviews: vi.fn(), rate: vi.fn(), like: vi.fn() }))
vi.mock('../server/actions', () => ({ reviewsAction: h.reviews, allReviewsAction: h.allReviews, ratePlayerAction: h.rate, likeReviewAction: h.like }))

const row = (id: string, number: number): PlayerRow => ({
  id,
  number,
  name_he: `שחקן ${number}`,
  name_short: `ש${number}`,
  position: 'CM',
  injured: false,
  in_xi: false,
  pitch_x: null,
  pitch_y: null,
  avg: null,
  count: 0,
  myStars: null,
  myReview: '',
})

afterEach(() => {
  cleanup()
  vi.restoreAllMocks()
})

describe('SquadRatings opened from the home (?p=<id>)', () => {
  it("opens that player, loads the existing reviews at once and scrolls the row into view", async () => {
    const scroll = vi.fn()
    Element.prototype.scrollIntoView = scroll
    h.reviews.mockResolvedValue({
      data: {
        reviews: [
          { user_id: '22222222-2222-4222-8222-222222222222', nick: 'יציע', stars: 4, review: 'קשר מעולה', updated_at: '2026-10-14T10:00:00Z', likes_count: 2, liked: false, mine: false },
        ],
      },
    })
    await act(async () => {
      render(<SquadRatings initial={[row('mta_8', 8), row('mta_10', 10)]} openId="mta_10" />)
    })
    expect(h.reviews).toHaveBeenCalledWith({ playerId: 'mta_10' })
    expect(screen.getByRole('button', { name: /שחקן 10/ })).toHaveAttribute('aria-expanded', 'true')
    expect(screen.getByRole('list', { name: 'תגובות הקהל' })).toHaveTextContent('קשר מעולה')
    expect(scroll).toHaveBeenCalledTimes(1)
    expect(scroll.mock.contexts[0]).toHaveAttribute('id', 'p-mta_10')
  })
})
