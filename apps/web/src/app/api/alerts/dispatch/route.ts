import { env } from '@/lib/env'
import { bearerOk, dispatchAlerts } from '@/features/push/server/dispatch'

// Literal (Next reads it statically); equals DISPATCH_MAX_SECONDS, which the dispatcher plans its rounds against.
// 60 s is within the limits of Vercel Hobby and Pro with Fluid compute. web-ingest.yml's curl waits 75 s.
export const maxDuration = 60

/**
 * Sends the pending goal / full-time alerts as phone notifications. Called by the ingest workflow after each ingest
 * (and by the staging demo-match script) with `Authorization: Bearer <ALERTS_SECRET>`. Anything else → 401.
 */
export async function POST(request: Request): Promise<Response> {
  if (!bearerOk(request.headers.get('authorization'), env.ALERTS_SECRET?.replace(/\s+/g, ''))) {
    return Response.json({ error: 'unauthorized' }, { status: 401 })
  }
  return Response.json(await dispatchAlerts())
}
