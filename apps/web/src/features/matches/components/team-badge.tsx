import type { DisplayTeam } from '../api-teams'
import { cn } from '@/lib/utils'

export function TeamBadge({ team, align = 'start' }: { team: DisplayTeam; align?: 'start' | 'end' }) {
  return (
    <span className={cn('flex min-w-0 items-center gap-2', align === 'end' && 'flex-row-reverse text-end')}>
      <span
        aria-hidden="true"
        className="size-3 shrink-0 rounded-full"
        style={{ background: team.bg, boxShadow: `0 0 0 2px ${team.ring}` }}
      />
      <span className="truncate font-semibold">{team.short}</span>
    </span>
  )
}
