'use client'

import { useRef, useState, useTransition, type KeyboardEvent } from 'react'
import { useTranslations } from 'next-intl'
import { PREFS_EVENT } from '../banner'
import { MATCH_PREFS, type NotificationPrefs } from '../schema'
import { savePrefsAction } from '../server/actions'

/**
 * "התראות משחקים" (three-way) and "הודעות פרטיות וקבוצות" (on/off). Saved at once; reverts if saving fails.
 * Controls are disabled while a save is in flight, so saves never overlap or revert each other.
 */
export function NotificationSettings({ initial }: { initial: NotificationPrefs }) {
  const t = useTranslations('push')
  const MATCH_LABELS: Record<NotificationPrefs['matches'], string> = { all: t('matchAll'), team: t('matchTeam'), off: t('matchOff') }
  const [prefs, setPrefs] = useState(initial)
  const [error, setError] = useState<string | null>(null)
  const [pending, start] = useTransition()
  const radios = useRef<(HTMLButtonElement | null)[]>([])

  const save = (next: NotificationPrefs) => {
    const before = prefs
    setPrefs(next)
    setError(null)
    start(async () => {
      const r = await savePrefsAction(next)
      if (!r.data?.ok) {
        setPrefs(before)
        setError(r.data?.error ?? r.serverError ?? t('saveFailed'))
        return
      }
      // The in-app banner follows the new settings at once, without a reload.
      window.dispatchEvent(new CustomEvent<NotificationPrefs>(PREFS_EVENT, { detail: next }))
    })
  }

  const pickMatches = (m: NotificationPrefs['matches']) => {
    if (!pending && m !== prefs.matches) save({ ...prefs, matches: m })
  }

  // Arrow keys move between the three choices (radio group pattern); in RTL, left is "next".
  const onKey = (e: KeyboardEvent<HTMLButtonElement>, i: number) => {
    const step = e.key === 'ArrowLeft' || e.key === 'ArrowDown' ? 1 : e.key === 'ArrowRight' || e.key === 'ArrowUp' ? -1 : 0
    if (!step) return
    e.preventDefault()
    const j = (i + step + MATCH_PREFS.length) % MATCH_PREFS.length
    radios.current[j]?.focus()
    pickMatches(MATCH_PREFS[j]!)
  }

  return (
    <div className="me-prefs" aria-busy={pending}>
      <div className="me-pref">
        <div>
          <p id="pref-matches" className="me-pref-title">
            {t('matchesTitle')}
          </p>
          <p className="me-pref-hint">{t('matchesHint')}</p>
        </div>
        <div className="me-seg" role="radiogroup" aria-labelledby="pref-matches">
          {MATCH_PREFS.map((m, i) => (
            <button
              key={m}
              ref={(el) => {
                radios.current[i] = el
              }}
              type="button"
              role="radio"
              aria-checked={prefs.matches === m}
              tabIndex={prefs.matches === m ? 0 : -1}
              disabled={pending}
              onClick={() => pickMatches(m)}
              onKeyDown={(e) => onKey(e, i)}
            >
              {MATCH_LABELS[m]}
            </button>
          ))}
        </div>
      </div>

      <button
        type="button"
        role="switch"
        aria-checked={prefs.messages}
        disabled={pending}
        className="me-pref me-pref-row"
        onClick={() => save({ ...prefs, messages: !prefs.messages })}
      >
        <span>
          <span className="me-pref-title block">{t('messagesTitle')}</span>
          <span className="me-pref-hint block">{t('messagesHint')}</span>
        </span>
        <span className="me-switch" data-on={prefs.messages} aria-hidden="true" />
      </button>

      {error && (
        <p role="alert" className="px-4 pb-3 text-sm text-live">
          {error}
        </p>
      )}
    </div>
  )
}
