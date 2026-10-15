import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { MessageRow } from './chat-parts'

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
