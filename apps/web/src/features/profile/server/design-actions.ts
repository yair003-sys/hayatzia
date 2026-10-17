'use server'

import { cookies } from 'next/headers'
import { revalidatePath } from 'next/cache'
import { DESIGN_COOKIE, designFromValue, type DesignVersion } from '@/lib/design-version'

const YEAR = 60 * 60 * 24 * 365

/**
 * Turns the new "stadium" design on or off for this browser (stadium redesign, 2026-10-17). It is a display
 * preference, not a secret: a plain cookie the server reads. "stadium" sets the cookie for a year; anything else
 * clears it (back to the current design). The whole app is revalidated so the choice shows at once, without a reload.
 */
export async function setDesignVersion(v: DesignVersion): Promise<{ ok: true; version: DesignVersion }> {
  // Never trust the argument blindly: only "stadium" opts in, everything else means the default.
  const version = designFromValue(v)
  const store = await cookies()
  if (version === 'stadium') {
    store.set(DESIGN_COOKIE, 'stadium', { path: '/', maxAge: YEAR, sameSite: 'lax' })
  } else {
    store.delete(DESIGN_COOKIE)
  }
  // Pages read the cookie on the server, so the change only shows after their cache is dropped.
  revalidatePath('/', 'layout')
  return { ok: true, version }
}
