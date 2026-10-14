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
  pos: { GK: 'GK', DEF: 'CB', MID: 'CM', FWD: 'ST' }[role],
  role,
  injured: i === 13,
}))
const team = { short: 'מכבי ת״א', bg: '#FFD400', ring: '#1D3FA8', bar: '#FFD400' }
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
const grid = () => screen.getByRole('tabpanel').querySelector('ul')!
const tab = (name: string) => screen.getByRole('tab', { name })
const showTab = (name: string) => fireEvent.click(tab(name))

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

const realElementFromPoint = Object.getOwnPropertyDescriptor(document, 'elementFromPoint')

beforeEach(() => {
  window.history.replaceState(null, '', '/matches/7?tab=lineup')
})
afterEach(() => {
  cleanup()
  vi.restoreAllMocks()
  document.body.style.overflow = ''
  // Put back what jsdom had (usually nothing) so the stub never leaks into other test files.
  if (realElementFromPoint) Object.defineProperty(document, 'elementFromPoint', realElementFromPoint)
  else delete (document as { elementFromPoint?: unknown }).elementFromPoint
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

  it('opens a fresh entry even when a stale marker is left on the current one, keeping the router fields', async () => {
    window.history.replaceState({ __NA: true, tree: 'x', lineupBuilder: true }, '')
    const p = setup()
    expect(window.history.state).toMatchObject({ __NA: true, tree: 'x', lineupBuilder: true })
    fireEvent.click(screen.getByRole('button', { name: 'סגור' }))
    await waitFor(() => expect(p.onClose).toHaveBeenCalledTimes(1))
    // Back landed on the entry we came from, now clean.
    expect(window.history.state).toEqual({ __NA: true, tree: 'x' })
  })

  it('goes back only once on a double close (Escape then the close button, or two taps)', async () => {
    const back = vi.spyOn(window.history, 'back')
    const p = setup()
    fireEvent.keyDown(document, { key: 'Escape' })
    fireEvent.keyDown(document, { key: 'Escape' })
    fireEvent.click(screen.getByRole('button', { name: 'סגור' }))
    await waitFor(() => expect(p.onClose).toHaveBeenCalledTimes(1))
    expect(back).toHaveBeenCalledTimes(1)
  })

  it('closes on the phone’s back button (popstate) without going back a second time', () => {
    const back = vi.spyOn(window.history, 'back')
    const p = setup()
    window.dispatchEvent(new PopStateEvent('popstate', { state: null }))
    expect(p.onClose).toHaveBeenCalledTimes(1)
    // A late tap on close after back: our entry is already gone, so no extra history step.
    fireEvent.click(screen.getByRole('button', { name: 'סגור' }))
    expect(back).not.toHaveBeenCalled()
    window.dispatchEvent(new PopStateEvent('popstate', { state: null }))
    expect(p.onClose).toHaveBeenCalledTimes(1)
  })

  it('covers the page with a backdrop and makes the page behind inert while open', () => {
    const page = document.createElement('main')
    document.body.appendChild(page)
    setup()
    expect(screen.getByRole('dialog').parentElement).toHaveClass('lu-backdrop')
    expect(page.inert).toBe(true)
    cleanup()
    expect(page.inert).toBe(false)
    page.remove()
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
    // The next slot is a defender's, so the picker moved to the defenders.
    expect(tab('הגנה')).toHaveAttribute('aria-selected', 'true')
    expect(screen.getByRole('status')).toHaveTextContent('ש1 בשוער')
    showTab('שוערים')
    expect(card(1)).toHaveAccessibleName(/בהרכב/)
  })

  it('tap a player, then a slot', () => {
    setup()
    showTab('התקפה')
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
    showTab('קישור')
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

  it('drags a pitch player off onto the squad grid: back to the bench', () => {
    const xi = emptyXI()
    xi[0] = 'mta_1'
    setup({ initial: { formation: '4-3-3', xi } })
    drag(screen.getByRole('button', { name: 'עמדת שוער: שחקן 1' }), () => within(grid()).getAllByRole('listitem')[2]!, 'touch')
    expect(slot(/^עמדת שוער/)[0]).toHaveAccessibleName('עמדת שוער: ריקה')
  })

  it('a swipe on a picked (✓) card that ends over the grid changes nothing (scroll attempts never bench)', () => {
    const xi = emptyXI()
    xi[0] = 'mta_1'
    setup({ initial: { formation: '4-3-3', xi } })
    showTab('שוערים')
    expect(card(1)).toHaveAccessibleName(/בהרכב/)
    drag(card(1), () => within(grid()).getAllByRole('listitem')[1]!, 'touch')
    expect(slot(/^עמדת שוער/)[0]).toHaveAccessibleName('עמדת שוער: שחקן 1')
  })

  it('ignores a second finger while one drag is under way', () => {
    setup()
    pointAt(() => slot(/^עמדת שוער/)[0]!)
    fireEvent.pointerDown(card(1), { pointerId: 1, pointerType: 'touch', clientX: 10, clientY: 400 })
    fireEvent.pointerDown(card(12), { pointerId: 2, pointerType: 'touch', clientX: 50, clientY: 400 })
    fireEvent.pointerMove(card(12), { pointerId: 2, pointerType: 'touch', clientX: 50, clientY: 100 })
    fireEvent.pointerUp(card(12), { pointerId: 2, pointerType: 'touch', clientX: 50, clientY: 100 })
    expect(slot(/^עמדת שוער/)[0]).toHaveAccessibleName('עמדת שוער: ריקה')
    fireEvent.pointerMove(card(1), { pointerId: 1, pointerType: 'touch', clientX: 10, clientY: 100 })
    fireEvent.pointerUp(card(1), { pointerId: 1, pointerType: 'touch', clientX: 10, clientY: 100 })
    expect(slot(/^עמדת שוער/)[0]).toHaveAccessibleName('עמדת שוער: שחקן 1')
  })

  it('does not move anything on a small wobble or when the browser cancels the gesture', () => {
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

  it('drags even when the first move jumps straight onto the slot (fast mouse)', () => {
    setup()
    const target = () => slot(/^עמדת שוער/)[0]!
    pointAt(target)
    fireEvent.pointerDown(card(1), { pointerId: 7, pointerType: 'mouse', button: 0, clientX: 300, clientY: 700 })
    // With the pointer captured on press, the far move still reaches the card.
    fireEvent.pointerMove(card(1), { pointerId: 7, pointerType: 'mouse', clientX: 200, clientY: 500 })
    fireEvent.pointerUp(card(1), { pointerId: 7, pointerType: 'mouse', clientX: 200, clientY: 500 })
    expect(target()).toHaveAccessibleName('עמדת שוער: שחקן 1')
  })

  it('a sideways first move on a card drags too (no strip to scroll any more)', () => {
    setup()
    const target = () => slot(/^עמדת שוער/)[0]!
    pointAt(target)
    fireEvent.pointerDown(card(1), { pointerId: 8, pointerType: 'touch', clientX: 200, clientY: 700 })
    fireEvent.pointerMove(card(1), { pointerId: 8, pointerType: 'touch', clientX: 170, clientY: 702 })
    fireEvent.pointerUp(card(1), { pointerId: 8, pointerType: 'touch', clientX: 170, clientY: 702 })
    expect(target()).toHaveAccessibleName('עמדת שוער: שחקן 1')
  })

  it('marks filled slots (the only slots that start a drag) and injured players for styling', () => {
    const xi = emptyXI()
    xi[0] = 'mta_1'
    setup({ initial: { formation: '4-3-3', xi } })
    expect(slot(/^עמדת שוער/)[0]).toHaveAttribute('data-filled')
    expect(slot(/^עמדת מגן/)[0]).not.toHaveAttribute('data-filled')
    showTab('התקפה')
    expect(card(14)).toHaveAttribute('data-injured')
  })

  it('shows the squad by line in four tabs, one line at a time, as a grid with no strip', () => {
    setup()
    expect(screen.getAllByRole('tab').map((t) => t.textContent)).toEqual(['שוערים', 'הגנה', 'קישור', 'התקפה'])
    expect(tab('שוערים')).toHaveAttribute('aria-selected', 'true')
    expect(within(grid()).getAllByRole('button').map((b) => b.getAttribute('aria-label')?.split(',')[0])).toEqual(['שחקן 1', 'שחקן 12'])
    showTab('הגנה')
    expect(within(grid()).getAllByRole('button')).toHaveLength(4)
    expect(screen.queryByRole('button', { name: /^שחקן 1,/ })).toBeNull()
    expect(screen.getByRole('tabpanel')).toHaveAttribute('aria-labelledby', 'lu-tab-DEF')
  })

  it('tapping a slot opens the tab of that slot’s line', () => {
    setup()
    fireEvent.click(slot(/^עמדת חלוץ/)[0]!)
    expect(tab('התקפה')).toHaveAttribute('aria-selected', 'true')
    fireEvent.click(card(9))
    expect(slot(/^עמדת חלוץ/)[0]).toHaveAccessibleName('עמדת חלוץ: שחקן 9')
  })

  it('opens on the line of the first empty slot', () => {
    const xi = emptyXI()
    xi[0] = 'mta_1'
    setup({ initial: { formation: '4-3-3', xi } })
    expect(tab('הגנה')).toHaveAttribute('aria-selected', 'true')
  })

  it('keyboard: arrows move between the tabs (RTL: left is next), and every card and slot is a focusable button', () => {
    setup()
    tab('שוערים').focus()
    fireEvent.keyDown(tab('שוערים'), { key: 'ArrowLeft' })
    expect(tab('הגנה')).toHaveAttribute('aria-selected', 'true')
    expect(tab('הגנה')).toHaveFocus()
    expect(tab('שוערים')).toHaveAttribute('tabindex', '-1')
    fireEvent.keyDown(tab('הגנה'), { key: 'End' })
    expect(tab('התקפה')).toHaveFocus()
    fireEvent.keyDown(tab('התקפה'), { key: 'ArrowRight' })
    expect(tab('קישור')).toHaveFocus()
    // Enter/Space on a native button is a click: slot, then card.
    const s0 = slot(/^עמדת קשר/)[0]!
    s0.focus()
    fireEvent.click(s0)
    card(6).focus()
    expect(card(6)).toHaveFocus()
    fireEvent.click(card(6))
    expect(slot(/^עמדת קשר/)[0]).toHaveAccessibleName('עמדת קשר: שחקן 6')
  })

  it('counts the picked players of each line on its tab', () => {
    setup({ initial: { formation: '4-3-3', xi: fullXI() } })
    expect(tab('הגנה')).toHaveTextContent('4')
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
