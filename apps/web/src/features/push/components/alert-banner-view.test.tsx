import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { BannerView, type ShownBanner } from './alert-banner-view'

const goal: ShownBanner = {
  seq: 1,
  title: '⚽ שער! מכבי תל אביב 2:1 הפועל חיפה',
  body: '67′ · E. Zahavi',
  href: '/matches/77',
  tone: 'match',
  accent: { accent: '#FFD400', accent2: '#ffdb2e', rgb: '255 212 0', text: '#FFD400', on: '#0b0d12' },
}

describe('BannerView', () => {
  it('is a polite live region, empty when there is nothing to show', () => {
    render(<BannerView banner={null} onOpen={() => {}} onDismiss={() => {}} />)
    const region = screen.getByRole('status')
    expect(region).toHaveAttribute('aria-live', 'polite')
    expect(region).toBeEmptyDOMElement()
  })

  it('shows the text as a link to the target, in the club colours', () => {
    render(<BannerView banner={goal} onOpen={() => {}} onDismiss={() => {}} />)
    const link = screen.getByRole('link', { name: /שער! מכבי תל אביב 2:1 הפועל חיפה/ })
    expect(link).toHaveAttribute('href', '/matches/77')
    expect(link).toHaveTextContent('67′ · E. Zahavi')
    const card = link.closest('.ab') as HTMLElement
    expect(card.style.getPropertyValue('--ab-bg')).toBe('#FFD400')
    expect(card.style.getPropertyValue('--ab-on')).toBe('#0b0d12')
  })

  it('tap opens the target through the router', () => {
    const onOpen = vi.fn()
    render(<BannerView banner={goal} onOpen={onOpen} onDismiss={() => {}} />)
    fireEvent.click(screen.getByRole('link'))
    expect(onOpen).toHaveBeenCalledWith('/matches/77')
  })

  it('dismisses with the close button and with Escape', () => {
    const onDismiss = vi.fn()
    render(<BannerView banner={goal} onOpen={() => {}} onDismiss={onDismiss} />)
    fireEvent.click(screen.getByRole('button', { name: 'סגירת ההתראה' }))
    fireEvent.keyDown(screen.getByRole('link'), { key: 'Escape' })
    expect(onDismiss).toHaveBeenCalledTimes(2)
  })

  it('a sideways swipe dismisses without opening', () => {
    const onOpen = vi.fn()
    const onDismiss = vi.fn()
    render(<BannerView banner={goal} onOpen={onOpen} onDismiss={onDismiss} />)
    const card = screen.getByRole('link').closest('.ab') as HTMLElement
    fireEvent.pointerDown(card, { clientX: 200, clientY: 10, pointerId: 1 })
    fireEvent.pointerMove(card, { clientX: 60, clientY: 14, pointerId: 1 })
    fireEvent.pointerUp(card, { clientX: 60, clientY: 14, pointerId: 1 })
    fireEvent.click(screen.getByRole('link'))
    expect(onDismiss).toHaveBeenCalledOnce()
    expect(onOpen).not.toHaveBeenCalled()
  })

  it('a message banner without club colours uses the neutral style', () => {
    render(<BannerView banner={{ ...goal, tone: 'message', accent: null, title: 'דני: היי', body: '' }} onOpen={() => {}} onDismiss={() => {}} />)
    const card = screen.getByRole('link').closest('.ab') as HTMLElement
    expect(card).toHaveAttribute('data-tone', 'message')
    expect(card.style.getPropertyValue('--ab-bg')).toBe('')
  })
})
