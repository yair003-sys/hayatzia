import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'

const loadCommentsAction = vi.fn()
const commentPostAction = vi.fn()

vi.mock('../server/actions', () => ({
  loadCommentsAction: (...a: unknown[]) => loadCommentsAction(...a),
  commentPostAction: (...a: unknown[]) => commentPostAction(...a),
  loadOlderCommentsAction: vi.fn(),
}))
vi.mock('@/lib/supabase/client', () => ({
  createClient: () => ({ realtime: { setAuth: async () => {} }, removeChannel: async () => {} }),
}))
vi.mock('@/lib/supabase/channel', () => ({
  openChannel: async () => ({ on() { return this }, subscribe() {} }),
}))

import { PostComments } from './post-comments'

afterEach(() => {
  cleanup()
  loadCommentsAction.mockReset()
  commentPostAction.mockReset()
})

describe('PostComments', () => {
  it('shows the empty state when there are no comments', async () => {
    loadCommentsAction.mockResolvedValue({ data: { comments: [] } })
    render(<PostComments postId="p1" onClose={() => {}} />)
    await waitFor(() => expect(screen.getByText('עוד אין תגובות. כתוב את הראשונה.')).toBeInTheDocument())
  })

  it('sends a comment and appends it', async () => {
    loadCommentsAction.mockResolvedValue({ data: { comments: [] } })
    commentPostAction.mockResolvedValue({ data: { comment: { id: 'c1', userId: 'u', nick: 'דני', body: 'יאללה', createdAt: '2026-11-01T10:00:00+00:00' } } })
    render(<PostComments postId="p1" onClose={() => {}} />)
    const input = await screen.findByPlaceholderText('כתוב תגובה…')
    fireEvent.change(input, { target: { value: 'יאללה' } })
    fireEvent.submit(input.closest('form')!)
    await waitFor(() => expect(commentPostAction).toHaveBeenCalledWith({ postId: 'p1', body: 'יאללה' }))
    expect(screen.getByText('יאללה')).toBeInTheDocument()
  })
})
