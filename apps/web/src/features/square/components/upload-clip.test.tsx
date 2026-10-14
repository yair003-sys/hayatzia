import { act, cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { UploadClip } from './upload-clip'
import { setSoundOn } from '../sound'

vi.mock('@/lib/supabase/client', () => ({
  createClient: () => ({ storage: { from: () => ({ upload: async () => ({ error: { code: 'test' } }) }) } }),
}))
vi.mock('../server/actions', () => ({ createClipAction: vi.fn() }))

beforeEach(() => {
  vi.stubGlobal('URL', Object.assign(URL, { createObjectURL: () => 'blob:x', revokeObjectURL: () => {} }))
})
afterEach(() => {
  cleanup()
  vi.unstubAllGlobals()
})

function openCompose(audience: 'all' | 'team') {
  const onStart = vi.fn()
  const { container } = render(
    <UploadClip
      meId="me"
      myTeamId="mta"
      myNick="אני"
      audience={audience}
      teamShort="מכבי ת״א"
      onStart={onStart}
      onDone={() => {}}
      choosing={false}
      setChoosing={() => {}}
    />,
  )
  const input = container.querySelector('input[type=file]') as HTMLInputElement
  act(() => {
    fireEvent.change(input, { target: { files: [new File(['x'], 'a.jpg', { type: 'image/jpeg' })] } })
  })
  return onStart
}

describe('posting asks who sees the post (owner, 2026-10-15)', () => {
  it('starts on the open tab and lets the fan switch before publishing', () => {
    const onStart = openCompose('team')
    expect(screen.getByText('למי לפרסם?')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'רק לאוהדי מכבי ת״א' })).toHaveAttribute('aria-pressed', 'true')
    act(() => {
      fireEvent.click(screen.getByRole('button', { name: 'לכל הליגה' }))
    })
    expect(screen.getByRole('button', { name: 'לכל הליגה' })).toHaveAttribute('aria-pressed', 'true')
    act(() => {
      fireEvent.click(screen.getByRole('button', { name: 'פרסום לכל הליגה' }))
    })
    expect(onStart).toHaveBeenCalledWith(expect.objectContaining({ audience: 'all' }))
  })
})

describe('sound choice is remembered (owner, 2026-10-15)', () => {
  it('keeps the last choice on this phone', () => {
    setSoundOn(true)
    expect(localStorage.getItem('onefan:sound')).toBe('1')
    setSoundOn(false)
    expect(localStorage.getItem('onefan:sound')).toBe('0')
  })
})
