import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { PostReactions } from './post-reactions'

afterEach(cleanup)

describe('PostReactions', () => {
  it('renders reaction chips as bundled Twemoji images', () => {
    const { container } = render(<PostReactions reactions={{ '❤️': 3 }} myReaction={null} onReact={() => {}} />)
    const img = container.querySelector('img[src*="/emoji/"]')
    expect(img).not.toBeNull()
    expect(screen.getByText('3')).toBeInTheDocument()
  })

  it('ignores a malformed reaction count without throwing', () => {
    const reactions = { '❤️': 'x' } as unknown as Record<string, number>
    const { container } = render(<PostReactions reactions={reactions} myReaction={null} onReact={() => {}} />)
    expect(container.querySelector('.chat-react-chip')).toBeNull()
  })

  it('double-tap sends a quick ❤️', () => {
    const onReact = vi.fn()
    const { container } = render(<PostReactions reactions={{}} myReaction={null} onReact={onReact} />)
    fireEvent.doubleClick(container.querySelector('.chat-react')!)
    expect(onReact).toHaveBeenCalledWith('❤️')
  })

  it('opening the bar and tapping an emoji reacts with it', () => {
    const onReact = vi.fn()
    render(<PostReactions reactions={{}} myReaction={null} onReact={onReact} />)
    fireEvent.click(screen.getAllByRole('button')[0]!) // the add button opens the bar
    fireEvent.click(screen.getByRole('button', { name: '🔥' }))
    expect(onReact).toHaveBeenCalledWith('🔥')
  })
})
