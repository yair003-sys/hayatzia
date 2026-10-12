import { redirect } from 'next/navigation'
import { OnlineTracker } from '@/features/stand-home/components/presence'
import { getSessionProfile } from '../server/queries'

/** Sends signed-out fans to login and new fans to onboarding. Renders only the presence tracker. Use inside <Suspense>. */
export async function SessionGate() {
  const s = await getSessionProfile()
  if (s.status === 'signed-out') redirect('/login')
  if (s.status === 'no-profile') redirect('/onboarding')
  // Keeps the fan in "online now" of their club while any page of the app is open.
  if (s.status === 'ready') return <OnlineTracker teamId={s.team.id} userId={s.userId} />
  return null
}
