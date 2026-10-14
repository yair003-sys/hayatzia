import { act, cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { Review } from '../schema'
import { ReviewLike, useReviewLikes } from './review-like'

const h = vi.hoisted(() => ({ like: vi.fn() }))
vi.mock('../server/actions', () => ({ likeReviewAction: h.like }))

const AUTHOR = '22222222-2222-4222-8222-222222222222'
const review = (over: Partial<Review> = {}): Review => ({
  user_id: AUTHOR,
  nick: 'יציע_דרומי',
  stars: 5,
  review: 'המוח של הקבוצה',
  updated_at: '2026-10-14T10:00:00Z',
  likes_count: 3,
  liked: false,
  mine: false,
  ...over,
})

function Harness({ r }: { r: Review }) {
  const likes = useReviewLikes()
  return (
    <>
      <ReviewLike nick={r.nick} mine={r.mine} state={likes.view('mta_10', r)} onToggle={() => void likes.toggle('mta_10', r)} />
      {likes.error && <p role="alert">{likes.error}</p>}
    </>
  )
}

describe('review ♥', () => {
  beforeEach(() => {
    h.like.mockReset()
  })
  afterEach(() => {
    cleanup()
  })

  it('likes at once (optimistic), then unlikes; the action gets the review and the wanted state', async () => {
    h.like.mockResolvedValue({ data: { ok: true } })
    render(<Harness r={review()} />)
    const btn = screen.getByRole('button', { name: 'לייק לביקורת של יציע_דרומי, 3 לייקים' })
    expect(btn).toHaveAttribute('aria-pressed', 'false')
    await act(async () => {
      fireEvent.click(btn)
    })
    expect(h.like).toHaveBeenLastCalledWith({ playerId: 'mta_10', authorId: AUTHOR, on: true })
    expect(btn).toHaveAttribute('aria-pressed', 'true')
    expect(btn).toHaveTextContent('4')
    await act(async () => {
      fireEvent.click(btn)
    })
    expect(h.like).toHaveBeenLastCalledWith({ playerId: 'mta_10', authorId: AUTHOR, on: false })
    expect(btn).toHaveAttribute('aria-pressed', 'false')
    expect(btn).toHaveTextContent('3')
  })

  it('goes back and says so when the server refuses', async () => {
    let answer: (v: unknown) => void = () => {}
    h.like.mockReturnValue(new Promise((r) => (answer = r)))
    render(<Harness r={review({ liked: true, likes_count: 1 })} />)
    const btn = screen.getByRole('button')
    act(() => {
      fireEvent.click(btn)
    })
    // Optimistic while waiting; a second tap meanwhile is ignored.
    expect(btn).toHaveAttribute('aria-pressed', 'false')
    expect(btn).toHaveTextContent('0')
    act(() => {
      fireEvent.click(btn)
    })
    expect(h.like).toHaveBeenCalledTimes(1)
    await act(async () => {
      answer({ data: { error: 'הלייק לא נשמר. נסה שוב' } })
    })
    expect(btn).toHaveAttribute('aria-pressed', 'true')
    expect(btn).toHaveTextContent('1')
    expect(screen.getByRole('alert')).toHaveTextContent('הלייק לא נשמר. נסה שוב')
  })

  it('my own review shows the count without a button', () => {
    render(<Harness r={review({ mine: true })} />)
    expect(screen.queryByRole('button')).toBeNull()
    expect(screen.getByLabelText('3 לייקים לביקורת שלך')).toBeInTheDocument()
  })
})
