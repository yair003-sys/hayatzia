import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, render, screen } from '@testing-library/react'

vi.mock('../server/actions', () => ({
  markPostViewedAction: vi.fn().mockResolvedValue({ data: { ok: true } }),
  editPostAction: vi.fn(),
  deletePostAction: vi.fn(),
}))

import { PostCard } from './post-card'
import type { NewsPost } from '../schema'

const base: NewsPost = {
  id: '11111111-1111-4111-8111-111111111111',
  authorId: 'a',
  authorNick: 'דני',
  title: 'ניצחון',
  body: 'שבת אלופים',
  mediaUrl: null,
  mediaKind: null,
  views: 42,
  reactions: {},
  myReaction: null,
  comments: 3,
  createdAt: '2026-11-01T10:00:00+00:00',
  editedAt: null,
  official: true,
}

const noop = () => {}

afterEach(cleanup)

describe('PostCard', () => {
  it('renders the body and the comments count', () => {
    render(<PostCard post={base} isAdmin={false} onReact={noop} onOpenComments={noop} onReplace={noop} onRemove={noop} />)
    expect(screen.getByText('שבת אלופים')).toBeInTheDocument()
    expect(screen.getByText('תגובות (3)')).toBeInTheDocument()
  })

  it('renders a video when the media is a video, and no media when there is none', () => {
    const { container, rerender } = render(
      <PostCard post={{ ...base, mediaUrl: 'https://cdn/x.mp4', mediaKind: 'video' }} isAdmin={false} onReact={noop} onOpenComments={noop} onReplace={noop} onRemove={noop} />,
    )
    expect(container.querySelector('video')).not.toBeNull()
    rerender(<PostCard post={base} isAdmin={false} onReact={noop} onOpenComments={noop} onReplace={noop} onRemove={noop} />)
    expect(container.querySelector('video')).toBeNull()
    expect(container.querySelector('img:not([src*="/emoji/"])')).toBeNull()
  })

  it('shows edit/delete only to an admin', () => {
    const { rerender } = render(<PostCard post={base} isAdmin={false} onReact={noop} onOpenComments={noop} onReplace={noop} onRemove={noop} />)
    expect(screen.queryByLabelText('מחק פוסט')).toBeNull()
    rerender(<PostCard post={base} isAdmin onReact={noop} onOpenComments={noop} onReplace={noop} onRemove={noop} />)
    expect(screen.getByLabelText('מחק פוסט')).toBeInTheDocument()
  })
})
