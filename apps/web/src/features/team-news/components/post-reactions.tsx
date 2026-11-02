'use client'

import { useState } from 'react'
import { useTranslations } from 'next-intl'
import { Plus, SmilePlus } from 'lucide-react'
import { Emoji } from '@/components/emoji'
import { cn } from '@/lib/utils'
import { MORE_REACTIONS, POPULAR_REACTIONS, QUICK_LIKE } from '../schema'

/**
 * The emoji reaction control shared by channel posts — chips (emoji + count), a popular bar and a "+" picker, plus a
 * double-tap quick ❤️. Identical behaviour and styling to the chat reactions (reuses the chat-react-* CSS + Emoji).
 * onReact(emoji) sets my reaction; onReact(null) removes it. One reaction per fan.
 */
export function PostReactions({
  reactions,
  myReaction,
  onReact,
}: {
  reactions: Record<string, number>
  myReaction: string | null
  onReact: (emoji: string | null) => void
}) {
  const t = useTranslations('chat')
  const [active, setActive] = useState(false)
  const [picker, setPicker] = useState(false)

  const pick = (e: string) => {
    onReact(myReaction === e ? null : e)
    setActive(false)
    setPicker(false)
  }

  return (
    <div className="chat-react" onDoubleClick={() => onReact(myReaction === QUICK_LIKE ? null : QUICK_LIKE)}>
      {Object.entries(reactions).map(([emoji, count]) =>
        typeof count === 'number' && count > 0 ? (
          <button
            key={emoji}
            type="button"
            aria-pressed={myReaction === emoji}
            aria-label={`${emoji} ${count}`}
            className={cn('chat-react-chip', myReaction === emoji && 'on')}
            onClick={() => onReact(myReaction === emoji ? null : emoji)}
          >
            <Emoji emoji={emoji} size={16} decorative />
            <span className="t-num">{count}</span>
          </button>
        ) : null,
      )}
      {active ? (
        <div className="chat-react-bar" role="group" aria-label={t('addReaction')}>
          {POPULAR_REACTIONS.map((e) => (
            <button key={e} type="button" className="chat-react-emoji" aria-label={e} onClick={() => pick(e)}>
              <Emoji emoji={e} size={24} decorative />
            </button>
          ))}
          <button
            type="button"
            className="chat-react-more"
            aria-label={t('moreEmoji')}
            aria-expanded={picker}
            onClick={() => setPicker((v) => !v)}
          >
            <Plus className="size-4" aria-hidden="true" />
          </button>
          {picker && (
            <div className="chat-react-picker" role="group" aria-label={t('pickEmoji')}>
              {MORE_REACTIONS.map((e) => (
                <button key={e} type="button" className="chat-react-emoji" aria-label={e} onClick={() => pick(e)}>
                  <Emoji emoji={e} size={24} decorative />
                </button>
              ))}
            </div>
          )}
        </div>
      ) : (
        <button type="button" className="chat-react-add" aria-label={t('addReaction')} onClick={() => setActive(true)}>
          <SmilePlus className="size-3.5" aria-hidden="true" />
        </button>
      )}
    </div>
  )
}
