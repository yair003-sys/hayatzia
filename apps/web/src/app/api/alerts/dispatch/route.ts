import { env } from '@/lib/env'
import { bearerOk, dispatchAlerts } from '@/features/push/server/dispatch'

/**
 * Sends the pending goal / full-time alerts as phone notifications. Called by the ingest workflow after each ingest
 * (and by the staging demo-match script) with `Authorization: Bearer <ALERTS_SECRET>`. Anything else → 401.
 */
export async function POST(request: Request): Promise<Response> {
  if (!bearerOk(request.headers.get('authorization'), env.ALERTS_SECRET)) {
    return Response.json({ error: 'unauthorized' }, { status: 401 })
  }
  return Response.json(await dispatchAlerts())
}
