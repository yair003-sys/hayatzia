import { ALERT_NOT_FOUND, alertExists, getBannerAlert } from '@/features/push/server/banner-alert'

const NO_STORE = { 'Cache-Control': 'no-store' }

/**
 * The in-app banner's text for one goal / full-time alert (same words as the phone notification). Public match data
 * only (teams, score, minute, scorers, two team ids and a colour), no cookies read or set (the session proxy skips
 * /api/alerts), so the CDN may share one answer between all fans for a minute. Misses and errors are never cached.
 */
export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }): Promise<Response> {
  const { id } = await params
  if (!/^[1-9]\d{0,15}$/.test(id)) return Response.json({ error: 'not_found' }, { status: 404, headers: NO_STORE })
  try {
    const alert = await getBannerAlert(Number(id))
    return Response.json(alert, { headers: { 'Cache-Control': 'public, max-age=0, s-maxage=60, stale-while-revalidate=60' } })
  } catch (e) {
    // The sentinel's message survives in development and tests; a production build hides messages thrown inside
    // 'use cache', so then one uncached lookup tells a miss (404) from a failure (503).
    const missing =
      String(e instanceof Error ? e.message : e).includes(ALERT_NOT_FOUND) || (await alertExists(Number(id))) === false
    if (missing) return Response.json({ error: 'not_found' }, { status: 404, headers: NO_STORE })
    console.warn('banner alert failed')
    return Response.json({ error: 'unavailable' }, { status: 503, headers: NO_STORE })
  }
}
