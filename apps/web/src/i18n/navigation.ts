import { createNavigation } from 'next-intl/navigation'
import { routing } from './routing'

// Locale-aware navigation. These keep the viewer's language across clicks. Components migrate to these from
// `next/link` / `next/navigation` gradually; Hebrew (the un-prefixed default) works either way.
export const { Link, redirect, usePathname, useRouter, getPathname } = createNavigation(routing)
