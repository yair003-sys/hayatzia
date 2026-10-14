import { getSessionProfile } from '@/features/profile/server/queries'
import { getClubApiIds, getMyPrefs } from '../server/queries'
import { AlertBanner } from './alert-banner'

/** The in-app banner, for a signed-in fan with a profile only. Reads cookies: use inside <Suspense>. */
export async function AlertBannerGate() {
  const s = await getSessionProfile()
  if (s.status !== 'ready') return null
  const [prefs, myClubApiIds] = await Promise.all([getMyPrefs(s.userId), getClubApiIds(s.team.id)])
  return <AlertBanner meId={s.userId} prefs={prefs} myClubApiIds={myClubApiIds} />
}
