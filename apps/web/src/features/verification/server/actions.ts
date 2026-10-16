'use server'

import { revalidatePath } from 'next/cache'
import { actionClient } from '@/lib/safe-action'
import { createAdminClient } from '@/lib/supabase/admin'
import { createClient } from '@/lib/supabase/server'
import { MOCK_SIGNATURE_HEADER, buildMockBody, signMock } from '../mock-provider'
import { VERIFY_ERRORS, emptySchema, kindSchema, normalisePlate, plateSchema, sessionSchema, verificationErrorHe } from '../schema'
import { getVerificationProvider, mockWebhookSecret } from './select-provider'
import { RegistryError, lookupVehicle } from './vehicle-registry'
import { handleVerificationWebhook } from './webhook'

const PAGE = '/me/verify'

async function session() {
  const supabase = await createClient()
  if (!supabase) return null
  const { data } = await supabase.auth.getClaims()
  const me = data?.claims.sub
  return me ? { supabase, me } : null
}

/** Opens a provider session (one of the fan's three attempts) and returns where to continue. */
export const startVerificationAction = actionClient.inputSchema(kindSchema).action(async ({ parsedInput: { kind } }) => {
  const provider = getVerificationProvider()
  if (!provider) return { error: 'האימות עוד לא זמין. נעדכן כשייפתח' }
  const s = await session()
  if (!s) return { error: 'צריך להתחבר מחדש' }
  const { data: sessionId, error } = await s.supabase.rpc('begin_verification', { p_kind: kind })
  if (error || !sessionId) return { error: verificationErrorHe(error?.message) ?? 'לא הצלחנו להתחיל אימות. נסה שוב' }
  const next = await provider.startSession({ sessionId, userId: s.me, kind })
  if (!('url' in next)) return { error: 'האימות עוד לא זמין. נעדכן כשייפתח' }
  revalidatePath(PAGE)
  return { ok: true as const, url: next.url }
})

const isoYearsAgo = (years: number) => {
  const d = new Date()
  d.setUTCFullYear(d.getUTCFullYear() - years)
  return d.toISOString().slice(0, 10)
}

/**
 * "אמת אותי (דמו)": the mock provider's fake session ends approved (staging and local only, never production). The
 * result goes through the same signed webhook path and database function as a real provider's: fake document number
 * DEMO-<user id> (so each demo account is a different "person"), the fan's own birth date, a licence from 5 years ago.
 */
export const demoApproveAction = actionClient.inputSchema(sessionSchema).action(async ({ parsedInput: { sessionId } }) => {
  if (getVerificationProvider()?.name !== 'mock') return { error: 'זמין רק בסביבת בדיקה' }
  const s = await session()
  if (!s) return { error: 'צריך להתחבר מחדש' }
  const [{ data: kind }, { data: priv }] = await Promise.all([
    s.supabase.rpc('my_verification_session', { p_session: sessionId }),
    s.supabase.rpc('my_private_profile'),
  ])
  if (kind !== 'identity' && kind !== 'licence') return { error: 'האימות הזה כבר הסתיים. אפשר להתחיל חדש' }
  const birthDate = priv?.[0]?.birth_date ?? undefined
  const body = buildMockBody({
    sessionId,
    providerRef: `mock-${sessionId}`,
    approved: true,
    documentNumber: `DEMO-${s.me}`,
    ...(birthDate ? { birthDate } : {}),
    ...(kind === 'licence' ? { licenceIssued: isoYearsAgo(5) } : {}),
  })
  const res = await handleVerificationWebhook(
    new Request('http://localhost/api/verification/webhook', {
      method: 'POST',
      headers: { [MOCK_SIGNATURE_HEADER]: signMock(body, mockWebhookSecret()), 'content-type': 'application/json' },
      body,
    }),
  )
  if (!res.ok) return { error: 'האימות לדוגמה נכשל. נסה שוב' }
  const { status } = (await res.json()) as { status?: string }
  revalidatePath(PAGE)
  revalidatePath('/stand/trips')
  return { ok: true as const, status: status === 'approved' ? ('approved' as const) : ('rejected' as const) }
})

/** "הרכב שלי": the plate is checked in the Ministry of Transport registry on the server, then stored (service role). */
export const registerCarAction = actionClient.inputSchema(plateSchema).action(async ({ parsedInput: { plate: typed } }) => {
  const plate = normalisePlate(typed)
  if (!plate) return { error: VERIFY_ERRORS.bad_plate }
  const s = await session()
  if (!s) return { error: 'צריך להתחבר מחדש' }
  let vehicle
  try {
    vehicle = await lookupVehicle(plate)
  } catch (e) {
    console.error('vehicle registry', e instanceof RegistryError ? e.code : 'error')
    return { error: VERIFY_ERRORS.registry_unavailable }
  }
  if (!vehicle) return { error: VERIFY_ERRORS.plate_not_found }
  const admin = createAdminClient()
  if (!admin) return { error: 'לא זמין בסביבה הזאת' }
  const { error } = await admin.rpc('set_fan_car', {
    p_user: s.me,
    p_plate: vehicle.plate,
    p_make: vehicle.make,
    p_model: vehicle.model,
    p_colour: vehicle.colour,
    ...(vehicle.year === null ? {} : { p_year: vehicle.year }),
  })
  if (error) {
    if (error.message.includes('rate_limit')) return { error: 'החלפת רכב הרבה פעמים היום. נסה שוב מחר' }
    console.error('set car', error.code)
    return { error: 'לא הצלחנו לשמור את הרכב. נסה שוב' }
  }
  revalidatePath(PAGE)
  return { ok: true as const }
})

export const removeCarAction = actionClient.inputSchema(emptySchema).action(async () => {
  const s = await session()
  if (!s) return { error: 'צריך להתחבר מחדש' }
  const { error } = await s.supabase.rpc('remove_my_car')
  if (error) return { error: 'לא הצלחנו להסיר את הרכב. נסה שוב' }
  revalidatePath(PAGE)
  return { ok: true as const }
})
