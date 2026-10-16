import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { RequestBar, WaitingNote } from './request-bar'

afterEach(cleanup)

describe('RequestBar (the recipient decides)', () => {
  it('shows "אשר והמשך שיחה" and "חסום" to the recipient', () => {
    const onAccept = vi.fn()
    const onBlock = vi.fn()
    render(<RequestBar state="decide" nick="יריב" onAccept={onAccept} onBlock={onBlock} />)
    expect(screen.getByText(/יריב רוצה לשלוח לך הודעה/)).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'אשר והמשך שיחה' }))
    fireEvent.click(screen.getByRole('button', { name: 'חסום' }))
    expect(onAccept).toHaveBeenCalledOnce()
    expect(onBlock).toHaveBeenCalledOnce()
  })

  it('shows nothing to the opener or in an accepted chat', () => {
    const { container, rerender } = render(<RequestBar state="waiting" nick="יריב" onAccept={vi.fn()} onBlock={vi.fn()} />)
    expect(container).toBeEmptyDOMElement()
    rerender(<RequestBar state="open" nick="יריב" onAccept={vi.fn()} onBlock={vi.fn()} />)
    expect(container).toBeEmptyDOMElement()
  })
})

describe('WaitingNote (the opener after the first message)', () => {
  it('says the message was sent and writing waits for the answer', () => {
    render(<WaitingNote state="waiting" />)
    expect(screen.getByRole('status')).toHaveTextContent('ההודעה נשלחה. אפשר לכתוב שוב כשיאשרו')
  })
  it('is empty otherwise', () => {
    const { container } = render(<WaitingNote state="open" />)
    expect(container).toBeEmptyDOMElement()
  })
})
