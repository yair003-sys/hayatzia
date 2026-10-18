import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { Clip } from '@/features/square/schema'
import { StoryViewer, type ViewerItem } from './story-viewer'

// The Square's post card is tested on its own; here it only shows which post is on screen.
vi.mock('@/features/square/components/clip-card', () => ({
  ClipCard: ({ clip }: { clip: Clip }) => <article aria-label={`פוסט ${clip.id}`} />,
}))

const clip = (id: string): Clip => ({
  id,
  user_id: 'u1',
  team_id: 'mta',
  nick: 'יציע_דרומי',
  kind: 'image',
  caption: '',
  captions: [],
  tags: '',
  once: false,
  likes_count: 0,
  respects_count: 0,
  comments_count: 0,
  views_count: 0,
  created_at: '2026-10-14T10:00:00Z',
  expires_at: '2026-10-15T10:00:00Z',
  audience: 'team',
  url: 'https://example.test/a.jpg',
  liked: false,
  respected: false,
})
const items: ViewerItem[] = ['c1', 'c2', 'c3'].map((id) => ({ clip: clip(id), group: 0 }))

function setup(start = 0) {
  const opener = document.createElement('button')
  opener.textContent = 'עיגול'
  document.body.appendChild(opener)
  opener.focus()
  const props = { onSeen: vi.fn(), onClose: vi.fn() }
  render(<StoryViewer items={items} start={start} meId="me" myTeamId="mta" label="סטוריז" {...props} />)
  return { ...props, opener }
}
const showing = (id: string) => expect(screen.getByRole('article', { name: `פוסט ${id}` })).toBeInTheDocument()

beforeEach(() => {
  window.history.replaceState(null, '', '/stand')
})
afterEach(() => {
  cleanup()
  vi.restoreAllMocks()
  document.body.innerHTML = ''
  document.body.style.overflow = ''
})

describe('StoryViewer', () => {
  it('a modal with its own history entry, focus on ✕, the page behind inert and its scroll locked', () => {
    const { opener } = setup()
    expect(screen.getByRole('dialog', { name: 'סטוריז' })).toHaveAttribute('aria-modal', 'true')
    expect(screen.getByRole('button', { name: 'סגור' })).toHaveFocus()
    expect(window.history.state).toMatchObject({ storyViewer: true })
    expect(opener.inert).toBe(true)
    expect(document.body.style.overflow).toBe('hidden')
  })

  it('keyboard: "next" twice keeps focus on it and the viewer open (focus never jumps to ✕ on a clip change)', () => {
    const p = setup()
    const next = screen.getByRole('button', { name: 'הסטורי הבא' })
    act(() => {
      next.focus()
    })
    // Enter on the focused button = a click on document.activeElement.
    act(() => {
      ;(document.activeElement as HTMLElement).click()
    })
    showing('c2')
    expect(next).toHaveFocus()
    act(() => {
      ;(document.activeElement as HTMLElement).click()
    })
    showing('c3')
    expect(screen.getByRole('dialog')).toBeInTheDocument()
    expect(p.onClose).not.toHaveBeenCalled()
    expect(p.onSeen.mock.calls.map((c) => c[0])).toEqual(['c2', 'c3'])
  })

  it('"back" on the first clip starts it over instead of closing', () => {
    const p = setup()
    fireEvent.click(screen.getByRole('button', { name: 'הסטורי הקודם' }))
    showing('c1')
    expect(screen.getByRole('dialog')).toBeInTheDocument()
    expect(p.onClose).not.toHaveBeenCalled()
  })

  it("closes on the phone's back button (popstate), once, and gives focus and the page back", () => {
    const back = vi.spyOn(window.history, 'back')
    const p = setup()
    window.dispatchEvent(new PopStateEvent('popstate', { state: null }))
    expect(p.onClose).toHaveBeenCalledTimes(1)
    // A late tap on ✕ after back: our entry is already gone, so no extra history step.
    fireEvent.click(screen.getByRole('button', { name: 'סגור' }))
    window.dispatchEvent(new PopStateEvent('popstate', { state: null }))
    expect(back).not.toHaveBeenCalled()
    expect(p.onClose).toHaveBeenCalledTimes(1)
    cleanup()
    expect(p.opener.inert).toBe(false)
    expect(p.opener).toHaveFocus()
    expect(document.body.style.overflow).toBe('')
  })

  it('a double close (✕ then Escape) goes back only once', async () => {
    const back = vi.spyOn(window.history, 'back')
    const p = setup()
    fireEvent.click(screen.getByRole('button', { name: 'סגור' }))
    fireEvent.keyDown(document, { key: 'Escape' })
    fireEvent.click(screen.getByRole('button', { name: 'סגור' }))
    await waitFor(() => expect(p.onClose).toHaveBeenCalledTimes(1))
    expect(back).toHaveBeenCalledTimes(1)
  })

  it('past the last clip it closes through history', async () => {
    const back = vi.spyOn(window.history, 'back')
    const p = setup(2)
    fireEvent.click(screen.getByRole('button', { name: 'הסטורי הבא' }))
    await waitFor(() => expect(p.onClose).toHaveBeenCalledTimes(1))
    expect(back).toHaveBeenCalledTimes(1)
  })
})
