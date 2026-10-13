import { getBannerAlert } from '@/features/push/server/banner-alert'

/**
 * The in-app banner's text for one goal / full-time alert (same words as the phone notification). Public match data
 * only (teams and score), no cookies read, so the CDN may share one answer between all fans for a minute.
 */
export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }): Promise<Response> {
  const { id } = await params
  if (!/^[1-9]\d{0,15}$/.test(id)) return Response.json({ error: 'not_found' }, { status: 404 })
  const alert = await getBannerAlert(Number(id))
  if (!alert) return Response.json({ error: 'not_found' }, { status: 404, headers: { 'Cache-Control': 'no-store' } })
  return Response.json(alert, { headers: { 'Cache-Control': 'public, max-age=0, s-maxage=60, stale-while-revalidate=60' } })
}
