import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'

const createPostAction = vi.fn()

vi.mock('../server/actions', () => ({ createPostAction: (...a: unknown[]) => createPostAction(...a) }))
vi.mock('@/lib/supabase/client', () => ({ createClient: () => ({ storage: { from: () => ({ upload: vi.fn().mockResolvedValue({ error: null }) }) } }) }))
vi.mock('@/features/square/compress', () => ({ shrinkPhoto: async (f: File) => f }))

import { PostComposer } from './post-composer'

afterEach(() => {
  cleanup()
  createPostAction.mockReset()
})

describe('PostComposer', () => {
  it('disables publish until there is a body', () => {
    render(<PostComposer meId="me" onPublished={() => {}} />)
    expect(screen.getByRole('button', { name: /פרסם/ })).toBeDisabled()
  })

  it('publishes and clears on success', async () => {
    const onPublished = vi.fn()
    createPostAction.mockResolvedValue({ data: { post: { id: 'p1', body: 'שלום' } } })
    render(<PostComposer meId="me" onPublished={onPublished} />)
    const body = screen.getByPlaceholderText('כתוב עדכון…')
    fireEvent.change(body, { target: { value: 'שבת אלופים' } })
    fireEvent.click(screen.getByRole('button', { name: /פרסם/ }))
    await waitFor(() => expect(onPublished).toHaveBeenCalled())
    expect((body as HTMLTextAreaElement).value).toBe('')
  })

  it('rejects an oversized file before uploading', () => {
    const { container } = render(<PostComposer meId="me" onPublished={() => {}} />)
    const input = container.querySelector('input[type="file"]') as HTMLInputElement
    const big = new File(['x'], 'big.jpg', { type: 'image/jpeg' })
    Object.defineProperty(big, 'size', { value: 51 * 1024 * 1024 })
    fireEvent.change(input, { target: { files: [big] } })
    expect(screen.getByText('הקובץ גדול מדי (עד 50MB)')).toBeInTheDocument()
  })
})
