import { afterEach, describe, expect, it } from 'vitest'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { NewsTabs } from './news-tabs'

const startUrl = window.location.href

afterEach(() => {
  cleanup()
  window.history.replaceState(null, '', startUrl)
})

describe('NewsTabs', () => {
  it('shows the initial tab, keeps the other mounted but hidden, and syncs ?tab=', () => {
    render(<NewsTabs initialTab="chat" chat={<p>chat body</p>} news={<p>news body</p>} unread={false} />)
    expect(screen.getByText('chat body')).toBeVisible()
    expect(screen.getByText('news body')).not.toBeVisible()
    fireEvent.click(screen.getByRole('tab', { name: 'חדשות' }))
    expect(screen.getByText('news body')).toBeVisible()
    expect(screen.getByText('chat body')).not.toBeVisible()
    expect(window.location.search).toBe('?tab=news')
  })

  it('opening on the news tab shows the news panel', () => {
    render(<NewsTabs initialTab="news" chat={<p>chat body</p>} news={<p>news body</p>} unread />)
    expect(screen.getByText('news body')).toBeVisible()
  })
})
