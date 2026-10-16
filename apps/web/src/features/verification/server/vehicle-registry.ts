import 'server-only'
export const VEHICLE_RESOURCE_ID = ''
export type Vehicle = { plate: string; make: string; model: string; colour: string; year: number | null }
export class RegistryError extends Error {
  constructor(readonly code: 'unavailable') {
    super(code)
  }
}
export async function lookupVehicle(_p: string, _o: { fetchImpl?: typeof fetch; timeoutMs?: number } = {}): Promise<Vehicle | null> {
  throw new Error('not implemented')
}
