import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { emptyXI, type Role, type SquadPlayer, type XI } from '../schema'
import { LineupBuilder } from './lineup-builder'

const ROLES: Role[] = ['GK', 'DEF', 'DEF', 'DEF', 'DEF', 'MID', 'MID', 'MID', 'FWD', 'FWD', 'FWD', 'GK', 'MID', 'FWD']
const squad: SquadPlayer[] = ROLES.map((role, i) => ({
  id: `mta_${i + 1}`,
  number: i + 1,
  name: `שחקן ${i + 1}`,
  short: `ש${i + 1}`,
  role,
  injured: i === 13,
}))
const team = { short: 'מכבי ת״א', bg: '#FFD400', ring: '#1D3FA8' }
const fullXI = (): XI => squad.slice(0, 11).map((p) => p.id)

function setup(over: Partial<Parameters<typeof LineupBuilder>[0]> = {}) {
  const props = {
    fixtureId: 7,
    team,
    squad,
    initial: { formation: '4-3-3' as const, xi: emptyXI() },
    onSave: vi.fn(async () => ({ ok: true as const })),
    onSaved: vi.fn(),
    onClose: vi.fn(),
    ...over,
  }
  render(<LineupBuilder {...props} />)
  return props
}

const slot = (role: RegExp) => screen.getAllByRole('button', { name: role })
const card = (n: number) => screen.getByRole('button', { name: new RegExp(`^שחקן ${n},`) })
const strip = () => screen.getByRole('list', { name: /הסגל של/ })

/** jsdom has no layout: say which element is under the pointer. */
function pointAt(el: () => Element | null) {
  document.elementFromPoint = vi.fn(() => el()) as typeof document.elementFromPoint
}

function drag(from: Element, to: () => Element | null, pointerType: 'touch' | 'mouse') {
  pointAt(to)
  fireEvent.pointerDown(from, { pointerId: 3, pointerType, button: 0, clientX: 100, clientY: 400 })
  fireEvent.pointerMove(from, { pointerId: 3, pointerType, clientX: 102, clientY: 300 })
  fireEvent.pointerMove(from, { pointerId: 3, pointerType, clientX: 120, clientY: 120 })
  fireEvent.pointerUp(from, { pointerId: 3, pointerType, clientX: 120, clientY: 120 })
}

beforeEach(() => {
  window.history.replaceState(null, '', '/matches/7?tab=lineup')
})
afterEach(() => {
  cleanup()
  document.body.style.overflow = ''
})

describe('LineupBuilder (overlay)', () => {
  it('is a modal dialog with focus inside, its own history entry and a locked page scroll', () => {
    setup()
    const dialog = screen.getByRole('dialog', { name: /ההרכב שלי/ })
    expect(dialog).toHaveAttribute('aria-modal', 'true')
    expect(screen.getByRole('button', { name: 'סגור' })).toHaveFocus()
    expect(window.history.state).toMatchObject({ lineupBuilder: true })
    expect(document.body.style.overflow).toBe('hidden')
    expect(screen.getAllByRole('button', { name: /^עמדת / })).toHaveLength(11)
  })

  it('closes on Escape through history (the back button does the same), and frees the scroll', async () => {
    const p = setup()
    fireEvent.keyDown(document, { key: 'Escape' })
    await waitFor(() => expect(p.onClose).toHaveBeenCalledTimes(1))
    cleanup()
    expect(document.body.style.overflow).toBe('')
  })

  it('keeps Tab inside the dialog', () => {
    setup()
    const close = screen.getByRole('button', { name: 'סגור' })
    const save = screen.getByRole('button', { name: 'שמור את ההרכב שלי' })
    save.focus()
    fireEvent.keyDown(document, { key: 'Tab' })
    expect(close).toHaveFocus()
    fireEvent.keyDown(document, { key: 'Tab', shiftKey: true })
    expect(save).toHaveFocus()
  })

  it('tap a slot, then a player: he goes in and the next empty slot is selected (keyboard: same buttons)', () => {
    setup()
    fireEvent.click(slot(/^עמדת שוער: ריקה/)[0]!)
    expect(slot(/^עמדת שוער/)[0]).toHaveAttribute('aria-pressed', 'true')
    fireEvent.click(card(1))
    expect(screen.getByRole('button', { name: 'עמדת שוער: שחקן 1' })).toBeInTheDocument()
    expect(slot(/^עמדת מגן/)[0]).toHaveAttribute('aria-pressed', 'true')
    expect(card(1)).toHaveAccessibleName(/בהרכב/)
    expect(screen.getByRole('status')).toHaveTextContent('ש1 בשוער')
  })

  it('tap a player, then a slot', () => {
    setup()
    fireEvent.click(card(9))
    expect(card(9)).toHaveAttribute('aria-pressed', 'true')
    fireEvent.click(slot(/^עמדת חלוץ: ריקה/)[1]!)
    expect(screen.getByRole('button', { name: 'עמדת חלוץ: שחקן 9' })).toBeInTheDocument()
  })

  it('tap two slots to swap them, and "הוצא לספסל" sends one back', () => {
    const xi = emptyXI()
    xi[1] = 'mta_2'
    xi[2] = 'mta_3'
    setup({ initial: { formation: '4-3-3', xi } })
    fireEvent.click(screen.getByRole('button', { name: 'עמדת מגן: שחקן 2' }))
    fireEvent.click(screen.getByRole('button', { name: 'עמדת מגן: שחקן 3' }))
    const defs = slot(/^עמדת מגן/)
    expect(defs[0]).toHaveAccessibleName('עמדת מגן: שחקן 3')
    expect(defs[1]).toHaveAccessibleName('עמדת מגן: שחקן 2')
    fireEvent.click(defs[0]!)
    fireEvent.click(screen.getByRole('button', { name: 'הוצא לספסל' }))
    expect(slot(/^עמדת מגן/)[0]).toHaveAccessibleName('עמדת מגן: ריקה')
    expect(card(3)).not.toHaveAccessibleName(/בהרכב/)
  })

  it('drags a player from the squad onto a slot with touch', () => {
    setup()
    const target = () => slot(/^עמדת קשר/)[1]!
    drag(card(6), target, 'touch')
    expect(target()).toHaveAccessibleName('עמדת קשר: שחקן 6')
  })

  it('drags a pitch player onto a filled slot with the mouse: they swap', () => {
    const xi = emptyXI()
    xi[8] = 'mta_9'
    xi[10] = 'mta_11'
    setup({ initial: { formation: '4-3-3', xi } })
    drag(screen.getByRole('button', { name: 'עמדת חלוץ: שחקן 9' }), () => slot(/^עמדת חלוץ/)[2]!, 'mouse')
    const fwd = slot(/^עמדת חלוץ/)
    expect(fwd[0]).toHaveAccessibleName('עמדת חלוץ: שחקן 11')
    expect(fwd[2]).toHaveAccessibleName('עמדת חלוץ: שחקן 9')
  })

  it('drags a pitch player off onto the squad strip: back to the bench', () => {
    const xi = emptyXI()
    xi[0] = 'mta_1'
    setup({ initial: { formation: '4-3-3', xi } })
    drag(screen.getByRole('button', { name: 'עמדת שוער: שחקן 1' }), () => within(strip()).getAllByRole('listitem')[4]!, 'touch')
    expect(slot(/^עמדת שוער/)[0]).toHaveAccessibleName('עמדת שוער: ריקה')
  })

  it('does not move anything on a small wobble or when the browser takes the gesture (strip scroll)', () => {
    setup()
    pointAt(() => slot(/^עמדת שוער/)[0]!)
    fireEvent.pointerDown(card(1), { pointerId: 4, pointerType: 'touch', clientX: 10, clientY: 10 })
    fireEvent.pointerMove(card(1), { pointerId: 4, pointerType: 'touch', clientX: 12, clientY: 11 })
    fireEvent.pointerUp(card(1), { pointerId: 4, pointerType: 'touch', clientX: 12, clientY: 11 })
    fireEvent.pointerDown(card(1), { pointerId: 5, pointerType: 'touch', clientX: 10, clientY: 10 })
    fireEvent.pointerMove(card(1), { pointerId: 5, pointerType: 'touch', clientX: 10, clientY: 60 })
    fireEvent.pointerCancel(card(1), { pointerId: 5, pointerType: 'touch' })
    fireEvent.pointerUp(card(1), { pointerId: 5, pointerType: 'touch', clientX: 10, clientY: 60 })
    expect(slot(/^עמדת שוער/)[0]).toHaveAccessibleName('עמדת שוער: ריקה')
  })

  it('makes only filled slots and squad cards draggable surfaces (touch-action set in CSS by these hooks)', () => {
    const xi = emptyXI()
    xi[0] = 'mta_1'
    setup({ initial: { formation: '4-3-3', xi } })
    expect(slot(/^עמדת שוער/)[0]).toHaveAttribute('data-filled')
    expect(slot(/^עמדת מגן/)[0]).not.toHaveAttribute('data-filled')
    expect(card(14)).toHaveAttribute('data-injured')
  })

  it('changes formation and keeps the picked players', () => {
    setup({ initial: { formation: '4-3-3', xi: fullXI() } })
    fireEvent.click(screen.getByRole('button', { name: '3-5-2' }))
    expect(screen.getByRole('button', { name: '3-5-2' })).toHaveAttribute('aria-pressed', 'true')
    expect(slot(/^עמדת מגן/)).toHaveLength(3)
    expect(slot(/^עמדת קשר/)).toHaveLength(5)
    expect(screen.getAllByRole('button', { name: /^עמדת .*: שחקן/ })).toHaveLength(11)
  })

  it('will not save an incomplete XI and says why', () => {
    const p = setup()
    fireEvent.click(screen.getByRole('button', { name: 'שמור את ההרכב שלי' }))
    expect(screen.getByRole('alert')).toHaveTextContent('צריך 11 שחקנים בהרכב')
    expect(p.onSave).not.toHaveBeenCalled()
  })

  it('saves the 11 by slot, reports back and closes', async () => {
    const p = setup({ initial: { formation: '4-4-2', xi: fullXI() } })
    fireEvent.click(screen.getByRole('button', { name: 'שמור את ההרכב שלי' }))
    await waitFor(() => expect(p.onClose).toHaveBeenCalled())
    expect(p.onSave).toHaveBeenCalledWith({
      fixtureId: 7,
      formation: '4-4-2',
      slots: fullXI().map((playerId, slot) => ({ slot, playerId })),
    })
    expect(p.onSaved).toHaveBeenCalledWith({ formation: '4-4-2', xi: fullXI() })
  })

  it('shows the database refusal in Hebrew and stays open', async () => {
    const p = setup({ initial: { formation: '4-3-3', xi: fullXI() }, onSave: vi.fn(async () => ({ error: 'ההרכב ננעל — המשחק כבר התחיל' })) })
    fireEvent.click(screen.getByRole('button', { name: 'שמור את ההרכב שלי' }))
    expect(await screen.findByRole('alert')).toHaveTextContent('ההרכב ננעל — המשחק כבר התחיל')
    expect(p.onSaved).not.toHaveBeenCalled()
    expect(screen.getByRole('dialog')).toBeInTheDocument()
  })
})
