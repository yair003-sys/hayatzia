import 'server-only'

// The Ministry of Transport's open vehicle registry on data.gov.il ("כלי רכב פרטיים ומסחריים"; public, no key), queried
// server-side through CKAN datastore_search. Any real plate found counts (ownership is not proven: owner's decision).
export const REGISTRY_URL = 'https://data.gov.il/api/3/action/datastore_search'
export const VEHICLE_RESOURCE_ID = '053cea08-09bc-40ec-8f7a-156f0677aff3'
const TIMEOUT_MS = 5000

export type Vehicle = { plate: string; make: string; model: string; colour: string; year: number | null }

export class RegistryError extends Error {
  constructor(readonly code: 'unavailable') {
    super(code)
    this.name = 'RegistryError'
  }
}

type RegistryRecord = {
  mispar_rechev?: unknown
  tozeret_nm?: unknown
  kinuy_mishari?: unknown
  degem_nm?: unknown
  tzeva_rechev?: unknown
  shnat_yitzur?: unknown
}

const text = (v: unknown, max: number) => (typeof v === 'string' ? v.trim().slice(0, max) : '')

/** The car of a normalised plate (7–8 digits), null when not in the registry. Slow or failing → RegistryError. */
export async function lookupVehicle(
  plate: string,
  { fetchImpl = fetch, timeoutMs = TIMEOUT_MS }: { fetchImpl?: typeof fetch; timeoutMs?: number } = {},
): Promise<Vehicle | null> {
  const url = new URL(REGISTRY_URL)
  url.searchParams.set('resource_id', VEHICLE_RESOURCE_ID)
  url.searchParams.set('filters', JSON.stringify({ mispar_rechev: Number(plate) }))
  url.searchParams.set('limit', '1')
  let body: { success?: boolean; result?: { records?: RegistryRecord[] } }
  try {
    const res = await fetchImpl(url.toString(), {
      signal: AbortSignal.timeout(timeoutMs),
      headers: { accept: 'application/json' },
      cache: 'no-store',
    })
    if (!res.ok) throw new RegistryError('unavailable')
    body = (await res.json()) as typeof body
  } catch {
    throw new RegistryError('unavailable')
  }
  if (body?.success !== true) throw new RegistryError('unavailable')
  const r = body.result?.records?.[0]
  // The registry's own number, as text, must be the plate asked for (plates never start with 0, so it is exact).
  if (!r || String(r.mispar_rechev ?? '') !== plate) return null
  const year = Number(r.shnat_yitzur)
  return {
    plate: String(r.mispar_rechev),
    make: text(r.tozeret_nm, 40),
    model: text(r.kinuy_mishari, 60) || text(r.degem_nm, 60),
    colour: text(r.tzeva_rechev, 30),
    year: Number.isInteger(year) && year >= 1900 && year <= 2100 ? year : null,
  }
}
