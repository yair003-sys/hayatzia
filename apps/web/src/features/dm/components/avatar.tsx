import type { CSSProperties } from 'react'
import { Users } from 'lucide-react'
import { cn } from '@/lib/utils'
import { avatarOf } from '../schema'

/** Round letter avatar: the name's first letter on a colour stable per id; groups show a people icon. */
export function Avatar({ id, name, group = false, size = 'md' }: { id: string; name: string; group?: boolean; size?: 'sm' | 'md' }) {
  const { initial, hue } = avatarOf(id, name)
  return (
    <span className={cn('ib-avatar', size === 'sm' && 'ib-avatar-sm')} style={{ '--hue': hue } as CSSProperties} aria-hidden="true">
      {group ? <Users className="size-[45%]" strokeWidth={2} /> : initial}
    </span>
  )
}
