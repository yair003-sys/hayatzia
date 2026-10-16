import 'server-only'
import { createClient } from '@/lib/supabase/server'
import type { VerifyStatus } from '../schema'
import { getVerificationProvider } from './select-provider'

export type KindState = { status: VerifyStatus; reason: string | null; left: number }
export type MyCar = { plate: string; make: string; model: string; colour: string; year: number | null }
export type MyVerification = {
  /** The rollout switch: rides need verification right now. */
  required: boolean
  identity: KindState
  licence: KindState
  car: MyCar | null
  /** A provider is configured in this environment (else the buttons explain it is not available yet). */
  available: boolean
  /** The provider is the mock: the demo path is shown, labelled as such. */
  demo: boolean
}

const STATUSES: readonly VerifyStatus[] = ['none', 'pending', 'approved', 'rejected', 'expired']
const status = (s: string | null | undefined): VerifyStatus => (STATUSES.includes(s as VerifyStatus) ? (s as VerifyStatus) : 'none')

/** The fan's own verification state, car and the switch, through my_verification(). Reads cookies: inside <Suspense>. */
export async function getMyVerification(): Promise<MyVerification | null> {
  const supabase = await createClient()
  if (!supabase) return null
  const { data, error } = await supabase.rpc('my_verification')
  const row = data?.[0]
  if (error || !row) return null
  const provider = getVerificationProvider()
  return {
    required: row.required,
    identity: { status: status(row.identity_status), reason: row.identity_reason ?? null, left: row.identity_left },
    licence: { status: status(row.licence_status), reason: row.licence_reason ?? null, left: row.licence_left },
    car: row.car_plate
      ? { plate: row.car_plate, make: row.car_make ?? '', model: row.car_model ?? '', colour: row.car_colour ?? '', year: row.car_year ?? null }
      : null,
    available: provider !== null,
    demo: provider?.name === 'mock',
  }
}
