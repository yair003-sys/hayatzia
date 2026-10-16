import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'

const report = vi.hoisted(() => vi.fn(async () => ({ data: { ok: true as const, created: true } })))
vi.mock('../server/emergency', () => ({ reportEmergencyAction: report }))

import { EmergencyButton } from './emergency-button'

afterEach(cleanup)

describe('EmergencyButton', () => {
  it('is a 56px link that dials 100, with the spec label', () => {
    render(<EmergencyButton tripId="t1" />)
    const link = screen.getByRole('link', { name: 'חירום – חיוג ל-100' })
    expect(link).toHaveAttribute('href', 'tel:100')
    expect(link.className).toContain('min-h-14')
    expect(screen.getByText(/onefan אינה מוקד חירום 24\/7/)).toBeInTheDocument()
  })

  it('a tap alerts the team without stopping the call', () => {
    render(<EmergencyButton tripId="t1" />)
    const link = screen.getByRole('link', { name: 'חירום – חיוג ל-100' })
    const event = new MouseEvent('click', { bubbles: true, cancelable: true })
    fireEvent(link, event)
    expect(report).toHaveBeenCalledWith({ tripId: 't1' })
    expect(event.defaultPrevented).toBe(false)
  })
})
