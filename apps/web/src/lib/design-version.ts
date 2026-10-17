import 'server-only'
import { cookies } from 'next/headers'

// The visual-design switch (stadium redesign, 2026-10-17): a per-browser preference, read on the server. It is a
// display choice, not a secret and not an identity — a plain readable cookie. The default is the current design
// ("classic"), so nothing changes for any fan until they opt in, or until the owner flips the default later.

export const DESIGN_COOKIE = 'onefan_design'
export type DesignVersion = 'classic' | 'stadium'

/** Pure: only the value "stadium" opts in to the new look; anything else (missing, empty, unknown) is "classic". */
export function designFromValue(value: string | undefined): DesignVersion {
  return value === 'stadium' ? 'stadium' : 'classic'
}

/** The design version for this request, from the per-browser cookie. Reads cookies, so call inside <Suspense>. */
export async function designVersion(): Promise<DesignVersion> {
  const store = await cookies()
  return designFromValue(store.get(DESIGN_COOKIE)?.value)
}
