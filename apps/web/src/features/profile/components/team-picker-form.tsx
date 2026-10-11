'use client'

import { useState } from 'react'
import { useAction } from 'next-safe-action/hooks'
import { TEAMS, type TeamId } from '@/features/teams/data'
import { TeamScarf } from '@/features/teams/components/team-scarf'
import { cn } from '@/lib/utils'
import { createProfileAction } from '../server/actions'

export function TeamPickerForm() {
  const [teamId, setTeamId] = useState<TeamId | null>(null)
  const [nick, setNick] = useState('')
  const [confirm, setConfirm] = useState(false)
  const { execute, result, isPending } = useAction(createProfileAction)
  const picked = TEAMS.find((t) => t.id === teamId)
  const error =
    result.serverError ??
    (result.data && 'error' in result.data ? result.data.error : undefined) ??
    result.validationErrors?.nick?._errors?.[0]

  return (
    <form
      className="space-y-6"
      onSubmit={(e) => {
        e.preventDefault()
        if (teamId && confirm) execute({ teamId, nick, confirm: true })
      }}
    >
      <fieldset className="space-y-3">
        <legend className="mb-3 font-bold">הקבוצה שלך. לתמיד.</legend>
        <div className="grid grid-cols-2 gap-2">
          {TEAMS.map((t) => (
            <button
              key={t.id}
              type="button"
              aria-pressed={teamId === t.id}
              onClick={() => setTeamId(t.id)}
              className={cn(
                'flex items-center gap-2 rounded-md border border-line-soft bg-surface px-3 py-3 text-start text-sm font-semibold transition-colors',
                teamId === t.id && 'border-accent bg-accent-soft',
              )}
            >
              <TeamScarf team={t} />
              {t.name}
            </button>
          ))}
        </div>
      </fieldset>

      <label className="block space-y-2">
        <span className="font-bold">איך יקראו לך ביציע?</span>
        <input
          value={nick}
          onChange={(e) => setNick(e.target.value)}
          maxLength={20}
          placeholder="הכינוי שלך"
          autoComplete="nickname"
          className="w-full rounded-md border border-line bg-surface px-4 py-3 text-lg"
        />
      </label>

      {picked && (
        <label className="flex items-start gap-3 rounded-md bg-surface p-4 text-sm">
          <input
            type="checkbox"
            checked={confirm}
            onChange={(e) => setConfirm(e.target.checked)}
            className="mt-0.5 size-5 accent-accent"
          />
          <span>
            אני אוהד של <b>{picked.name}</b>, והבנתי שהבחירה סופית ואי אפשר להחליף קבוצה, גם לא בהמשך.
          </span>
        </label>
      )}

      {error && (
        <p role="alert" className="text-sm text-live">
          {error}
        </p>
      )}

      <button
        type="submit"
        disabled={!teamId || !confirm || nick.trim().length < 2 || isPending}
        className="w-full rounded-lg bg-accent py-4 text-lg font-bold text-white disabled:opacity-40"
      >
        {isPending ? 'שומר…' : 'נעילת הקבוצה וכניסה ליציע'}
      </button>
    </form>
  )
}
