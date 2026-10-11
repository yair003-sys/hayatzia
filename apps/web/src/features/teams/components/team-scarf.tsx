import type { Team } from '../data'
import { cn } from '@/lib/utils'

/** The striped scarf mark used for a club throughout the app. */
export function TeamScarf({ team, className }: { team: Team; className?: string }) {
  return (
    <span
      aria-hidden="true"
      className={cn('inline-block h-6 w-2.5 shrink-0 rounded-sm', className)}
      style={{
        backgroundImage: `repeating-linear-gradient(180deg, ${team.bg} 0 6px, ${team.ring} 6px 9px)`,
        boxShadow: `0 0 0 1px ${team.ring}55`,
      }}
    />
  )
}
