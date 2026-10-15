import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'

const s = vi.hoisted(() => ({ calls: [] as unknown[] }))
vi.mock('../server/actions', () => ({
  reportAction: async (input: unknown) => {
    s.calls.push(input)
    return { data: { ok: true } }
  },
  blockAction: async () => ({ data: { ok: true } }),
}))

import { ReportForm } from './report-block'

afterEach(() => {
  cleanup()
  s.calls = []
})

describe('ReportForm', () => {
  it('files a report on the given message with the chosen reason and note', async () => {
    const onDone = vi.fn()
    render(<ReportForm kind="team_message" refId="m-123" onDone={onDone} />)
    fireEvent.change(screen.getByLabelText(/^סיבה/), { target: { value: 'גזענות או שנאה' } })
    fireEvent.change(screen.getByLabelText('פרטים'), { target: { value: 'קללות על הקבוצה' } })
    fireEvent.click(screen.getByRole('button', { name: 'שלח דיווח' }))
    await waitFor(() => expect(onDone).toHaveBeenCalledWith('תודה. הדיווח הגיע לצוות.'))
    expect(s.calls).toEqual([{ kind: 'team_message', ref: 'm-123', reason: 'גזענות או שנאה', note: 'קללות על הקבוצה' }])
  })

  it('reports a Square comment by its id', async () => {
    const onDone = vi.fn()
    render(<ReportForm kind="clip_comment" refId="c-9" onDone={onDone} />)
    fireEvent.click(screen.getByRole('button', { name: 'שלח דיווח' }))
    await waitFor(() => expect(onDone).toHaveBeenCalled())
    expect(s.calls).toEqual([{ kind: 'clip_comment', ref: 'c-9', reason: 'הטרדה', note: '' }])
  })
})
