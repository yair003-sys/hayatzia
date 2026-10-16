import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { MessageAuthor, MessageRow } from './chat-parts'

afterEach(cleanup)

function row(props: { mine?: boolean; onReply?: () => void; onReport?: () => void }) {
  const onActive = vi.fn()
  render(
    <ol>
      <MessageRow id="m1" mine={props.mine ?? false} active={false} onActive={onActive} onReply={props.onReply} onReport={props.onReport}>
        <div>שלום</div>
      </MessageRow>
    </ol>,
  )
  return { onActive }
}

describe('MessageRow actions', () => {
  it('shows "דווח" next to "השב" and files the report for this message', () => {
    const onReply = vi.fn()
    const onReport = vi.fn()
    const { onActive } = row({ onReply, onReport })
    expect(screen.getByRole('button', { name: 'השב להודעה' })).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'דווח על ההודעה' }))
    expect(onReport).toHaveBeenCalledOnce()
    expect(onReply).not.toHaveBeenCalled()
    expect(onActive).toHaveBeenCalledWith(null)
  })

  it('has no "דווח" when the chat does not offer it (my own message, private chats)', () => {
    row({ mine: true, onReply: vi.fn() })
    expect(screen.getByRole('button', { name: 'השב להודעה' })).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'דווח על ההודעה' })).toBeNull()
  })

  it('keeps "דווח" in a closed room, where there is no reply', () => {
    row({ onReport: vi.fn() })
    expect(screen.queryByRole('button', { name: 'השב להודעה' })).toBeNull()
    expect(screen.getByRole('button', { name: 'דווח על ההודעה' })).toBeInTheDocument()
  })
})

describe('MessageAuthor: private message from the chat (2026-10-16)', () => {
  it('another fan\'s message has an avatar button that opens the private-message sheet', () => {
    const onFan = vi.fn()
    render(<MessageAuthor mine={false} userId="u2" nick="יריב" onFan={onFan} />)
    fireEvent.click(screen.getByRole('button', { name: 'שלח הודעה פרטית ל-יריב' }))
    expect(onFan).toHaveBeenCalledOnce()
  })

  it('my own message has none', () => {
    render(<MessageAuthor mine userId="u1" nick="אני" onFan={vi.fn()} />)
    expect(screen.queryByRole('button')).toBeNull()
  })

  it('no button when the chat does not offer private messages', () => {
    render(<MessageAuthor mine={false} userId="u2" nick="יריב" />)
    expect(screen.queryByRole('button')).toBeNull()
  })
})
