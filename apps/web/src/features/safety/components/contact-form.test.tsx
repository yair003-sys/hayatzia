import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'

const s = vi.hoisted(() => ({ calls: [] as unknown[] }))
vi.mock('../server/actions', () => ({
  contactAction: async (input: unknown) => {
    s.calls.push(input)
    return { data: { ok: true } }
  },
}))

import { ContactForm } from './contact-form'

afterEach(() => {
  cleanup()
  s.calls = []
})

describe('ContactForm', () => {
  it('sends the request and keeps the acknowledgement on screen', async () => {
    render(<ContactForm />)
    fireEvent.click(screen.getByRole('button', { name: 'צור קשר' }))
    fireEvent.change(screen.getByLabelText(/^מה הבקשה/), { target: { value: 'בקשה למחוק את המידע שלי' } })
    fireEvent.click(screen.getByRole('button', { name: 'שלח' }))
    await waitFor(() =>
      expect(screen.getByRole('status')).toHaveTextContent('קיבלנו את הפנייה. נחזור אליך תוך 48 שעות לכתובת המייל של החשבון.'),
    )
    expect(s.calls).toEqual([{ topic: 'פרטיות', text: 'בקשה למחוק את המידע שלי' }])
    // Typing again does not make it disappear.
    fireEvent.change(screen.getByLabelText(/^מה הבקשה/), { target: { value: 'עוד משהו' } })
    expect(screen.getByRole('status')).toHaveTextContent('קיבלנו את הפנייה')
  })
})
