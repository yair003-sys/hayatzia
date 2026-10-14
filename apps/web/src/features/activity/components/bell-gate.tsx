import { getSessionProfile } from '@/features/profile/server/queries'
import { getUnreadCount } from '../server/queries'
import { FloatingBell } from './bell'

/** The floating bell (not on screens with their own, like the home), for a signed-in fan with a profile only, with the count at render. Reads cookies: use inside <Suspense>. */
export async function BellGate() {
  const s = await getSessionProfile()
  if (s.status !== 'ready') return null
  const count = await getUnreadCount()
  return <FloatingBell meId={s.userId} count={count} />
}
