import { cleanup, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'

vi.mock('next/navigation', () => ({ useRouter: () => ({ refresh: vi.fn() }) }))
vi.mock('../server/actions', () => ({ confirmRideSafetyAction: vi.fn(), rateRideAction: vi.fn(), setGenderAction: vi.fn() }))
vi.mock('@/features/profile/server/actions', () => ({ setBirthDateAction: vi.fn() }))

import { SafetyGate, GenderPicker } from './ride-safety'

afterEach(cleanup)

describe('GenderPicker: gender is set once (2026-10-17)', () => {
  it('lets a fan choose while unset', () => {
    render(<GenderPicker initial={null} />)
    for (const label of ['אוהד', 'אוהדת', 'לא מציין']) expect(screen.getByRole('button', { name: label })).toBeEnabled()
    expect(screen.getByText('מוצג רק בנסיעות; זו הצהרה שלך')).toBeInTheDocument()
  })

  it('is read-only once set, with a note to contact support (no dead-end retry)', () => {
    render(<GenderPicker initial="m" />)
    for (const label of ['אוהד', 'אוהדת', 'לא מציין']) expect(screen.getByRole('button', { name: label })).toBeDisabled()
    expect(screen.getByRole('button', { name: 'אוהד' })).toHaveAttribute('aria-pressed', 'true')
    expect(screen.getByText('המגדר כבר נקבע ומוצג רק בנסיעות. לשינוי פנו לתמיכה.')).toBeInTheDocument()
  })
})

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
    expect(screen.getAllByRole('combobox')).toHaveLength(3) // day, month, year
    expect(screen.queryByRole('button', { name: 'הבנתי, אפשר להמשיך' })).toBeNull()
  })
})
