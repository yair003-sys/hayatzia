import { redirect } from 'next/navigation'
import { getSessionProfile } from '../server/queries'

/** Sends signed-out fans to login and new fans to onboarding. Renders nothing. Use inside <Suspense>. */
export async function SessionGate() {
  const s = await getSessionProfile()
  if (s.status === 'signed-out') redirect('/login')
  if (s.status === 'no-profile') redirect('/onboarding')
  return null
}
