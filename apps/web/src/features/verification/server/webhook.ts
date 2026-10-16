import 'server-only'
import type { VerificationProvider } from '../provider'
type Deps = { provider: VerificationProvider | null; admin: unknown; secret: string | null }
export async function handleVerificationWebhook(_r: Request, _d?: Partial<Deps>): Promise<Response> {
  throw new Error('not implemented')
}
