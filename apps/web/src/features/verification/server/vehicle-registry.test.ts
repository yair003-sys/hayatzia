// @vitest-environment node
import { describe, expect, it, vi } from 'vitest'

vi.mock('server-only', () => ({}))

import { RegistryError, VEHICLE_RESOURCE_ID, lookupVehicle } from './vehicle-registry'

const ok = (records: unknown[]) =>
  vi.fn(async (_url: string | URL | Request, _init?: RequestInit) => Response.json({ success: true, result: { records } }))

describe('lookupVehicle (data.gov.il, mocked)', () => {
  it('asks the vehicle resource for the plate as a number and maps the record', async () => {
    const f = ok([{ mispar_rechev: 1234567, tozeret_nm: 'מאזדה יפן ', kinuy_mishari: 'MAZDA 3', tzeva_rechev: 'לבן', shnat_yitzur: 2019 }])
    expect(await lookupVehicle('1234567', { fetchImpl: f as unknown as typeof fetch })).toEqual({
      plate: '1234567',
      make: 'מאזדה יפן',
      model: 'MAZDA 3',
      colour: 'לבן',
      year: 2019,
    })
    const url = new URL(String(f.mock.calls[0]?.[0]))
    expect(url.origin + url.pathname).toBe('https://data.gov.il/api/3/action/datastore_search')
    expect(url.searchParams.get('resource_id')).toBe(VEHICLE_RESOURCE_ID)
    expect(JSON.parse(url.searchParams.get('filters') ?? '{}')).toEqual({ mispar_rechev: 1234567 })
    expect(f.mock.calls[0]?.[1]?.signal).toBeInstanceOf(AbortSignal)
  })

  it('falls back to the model name when there is no commercial name', async () => {
    const f = ok([{ mispar_rechev: 12345678, tozeret_nm: 'טויוטה', degem_nm: 'ZRE18', tzeva_rechev: 'כסף', shnat_yitzur: null }])
    expect(await lookupVehicle('12345678', { fetchImpl: f as unknown as typeof fetch })).toMatchObject({ model: 'ZRE18', year: null })
  })

  it('keeps the registry\'s own number, and a record for another plate is no match', async () => {
    const other = ok([{ mispar_rechev: 1234568, tozeret_nm: 'x', tzeva_rechev: 'y', shnat_yitzur: 2019 }])
    expect(await lookupVehicle('1234567', { fetchImpl: other as unknown as typeof fetch })).toBeNull()
    const same = ok([{ mispar_rechev: '1234567', tozeret_nm: 'x', tzeva_rechev: 'y', shnat_yitzur: 2019 }])
    expect(await lookupVehicle('1234567', { fetchImpl: same as unknown as typeof fetch })).toMatchObject({ plate: '1234567' })
  })

  it('null when the plate is not in the registry', async () => {
    expect(await lookupVehicle('7654321', { fetchImpl: ok([]) as unknown as typeof fetch })).toBeNull()
  })

  it('a slow or failing registry is "unavailable", never a guess', async () => {
    const down = vi.fn(async () => new Response('err', { status: 500 }))
    await expect(lookupVehicle('1234567', { fetchImpl: down as unknown as typeof fetch })).rejects.toBeInstanceOf(RegistryError)
    const hang = vi.fn(
      (_u: string | URL | Request, init?: RequestInit) =>
        new Promise<Response>((_, reject) => init?.signal?.addEventListener('abort', () => reject(new DOMException('t', 'TimeoutError')))),
    )
    await expect(lookupVehicle('1234567', { fetchImpl: hang as unknown as typeof fetch, timeoutMs: 20 })).rejects.toMatchObject({
      code: 'unavailable',
    })
    const notOk = vi.fn(async () => Response.json({ success: false }))
    await expect(lookupVehicle('1234567', { fetchImpl: notOk as unknown as typeof fetch })).rejects.toBeInstanceOf(RegistryError)
  })
})
