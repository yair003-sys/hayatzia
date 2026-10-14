import { getSessionProfile } from '@/features/profile/server/queries'
import { getUnreadCount } from '../server/queries'
import { Bell } from './bell'

/** The bell, for a signed-in fan with a profile only, with the count at render. Reads cookies: use inside <Suspense>. */
export async function BellGate() {
  const s = await getSessionProfile()
  if (s.status !== 'ready') return null
  const count = await getUnreadCount()
  return <Bell meId={s.userId} count={count} />
}
