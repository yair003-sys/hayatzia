import { getPrivateProfile, getSessionProfile } from '../server/queries'
import { BirthDateSheet } from './birth-date-sheet'

/** Fans from before the birth date (2026-10-16) are asked for it. Use inside <Suspense>. */
export async function BirthDateGate() {
  const s = await getSessionProfile()
  if (s.status !== 'ready') return null
  const p = await getPrivateProfile()
  if (!p || p.birthDate) return null
  return <BirthDateSheet />
}
