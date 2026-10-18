import { act, cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { ChatPreview } from './chat-preview'
import { FansOfWeek } from './fans-of-week'
import { HotClips } from './hot-clips'
import { OnlineTile } from './online-tile'

const h = vi.hoisted(() => ({ online: null as number | null }))
vi.mock('next/link', () => ({
  default: ({ href, children, ...rest }: { href: string; children: React.ReactNode }) => (
    <a href={href} {...rest}>
      {children}
    </a>
  ),
}))
vi.mock('next/navigation', () => ({ useRouter: () => ({ refresh: vi.fn() }), usePathname: () => '/stand' }))
vi.mock('@/lib/while-visible', () => ({ whileVisible: () => () => {} }))
vi.mock('@/lib/supabase/client', () => ({ createClient: () => ({}) }))
vi.mock('@/lib/supabase/channel', () => ({ openChannel: vi.fn() }))
vi.mock('@/features/square/server/actions', () => ({ createClipAction: vi.fn() }))
vi.mock('@/features/square/components/clip-card', () => ({ ClipCard: () => null }))
vi.mock('../server/actions', () => ({ markStorySeenAction: vi.fn() }))
vi.mock('@/features/stand-home/components/presence', () => ({ useOnlineCount: () => h.online }))

afterEach(() => {
  cleanup()
})

describe('home sections always show (owner, 2026-10-14)', () => {
  it('"החם בכיכר היום" without posts: an empty card whose button opens the Square upload sheet', () => {
    render(<HotClips clips={[]} meId="me" myTeamId="mta" myNick="אני" teamShort="מכבי ת״א" />)
    expect(screen.getByText('עוד אין פוסטים היום')).toBeInTheDocument()
    act(() => {
      fireEvent.click(screen.getByRole('button', { name: 'העלה את הראשון' }))
    })
    expect(screen.getByRole('dialog', { name: 'פוסט חדש' })).toHaveTextContent('נעלם אחרי 24 שעות')
    expect(screen.getByRole('button', { name: 'בחירה מהגלריה' })).toBeInTheDocument()
  })

  it('the chat without messages invites the first one, with "הצטרף לשיחה"', () => {
    render(<ChatPreview teamId="mta" initial={[]} hidden={[]} />)
    expect(screen.getByRole('heading', { name: 'צ׳אט היציע' })).toBeInTheDocument()
    expect(screen.getByText('הצ׳אט שקט כרגע — כתוב את ההודעה הראשונה')).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'הצטרף לשיחה' })).toHaveAttribute('href', '/stand/chat')
  })

  it('fans of the week, none yet: says how to get in; with fans: medals and points', () => {
    const { rerender } = render(<FansOfWeek fans={[]} />)
    expect(screen.getByRole('heading', { name: 'אוהדי השבוע' })).toBeInTheDocument()
    expect(screen.getByText(/עוד אין אוהדים מצטיינים השבוע/)).toBeInTheDocument()
    rerender(<FansOfWeek fans={[{ nick: 'צהוב', points: 12 }]} />)
    expect(screen.getByRole('listitem')).toHaveTextContent('מקום 1:')
    expect(screen.getByRole('listitem')).toHaveTextContent('12 נק׳')
  })

  it('"מחוברים עכשיו" keeps its place with a placeholder until presence connects', () => {
    h.online = null
    const { container, rerender } = render(<OnlineTile />)
    expect(screen.getByText('מחוברים עכשיו')).toBeInTheDocument()
    expect(container.querySelector('.skeleton')).not.toBeNull()
    h.online = 7
    rerender(<OnlineTile />)
    expect(container.querySelector('.skeleton')).toBeNull()
    expect(screen.getByText('7')).toBeInTheDocument()
  })
})
