import { cleanup, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'

vi.mock('next/navigation', () => ({ useRouter: () => ({ refresh: vi.fn() }) }))
vi.mock('../server/actions', () => ({ confirmRideSafetyAction: vi.fn(), rateRideAction: vi.fn(), setGenderAction: vi.fn() }))
vi.mock('@/features/profile/server/actions', () => ({ setBirthDateAction: vi.fn() }))

import { SafetyGate } from './ride-safety'

afterEach(cleanup)

describe('SafetyGate: 18+ comes from the birth date (2026-10-16)', () => {
  it('an adult by birth date sees the tips and continues, with no "I am 18+" tap', () => {
    render(<SafetyGate age="adult" onDone={vi.fn()} onCancel={vi.fn()} />)
    expect(screen.queryByRole('checkbox')).toBeNull()
    expect(screen.getByRole('button', { name: 'הבנתי, אפשר להמשיך' })).toBeEnabled()
  })

  it('under 18: a plain line, no way on', () => {
    render(<SafetyGate age="minor" onDone={vi.fn()} onCancel={vi.fn()} />)
    expect(screen.getByText('נסיעות דרך onefan הן מגיל 18 בלבד')).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'הבנתי, אפשר להמשיך' })).toBeNull()
    expect(screen.queryByRole('checkbox')).toBeNull()
  })

  it('no birth date yet: asks for it', () => {
    render(<SafetyGate age="none" onDone={vi.fn()} onCancel={vi.fn()} />)
    expect(screen.getByText('כדי לנסוע צריך להשלים תאריך לידה')).toBeInTheDocument()
    expect(screen.getByRole('combobox', { name: 'יום' })).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'הבנתי, אפשר להמשיך' })).toBeNull()
  })
})
