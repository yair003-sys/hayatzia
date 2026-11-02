import 'server-only'
import { cache } from 'react'
import { createClient } from '@/lib/supabase/server'
import type { Database } from '@/lib/supabase/database.types'
import { QUEUE_PAGE, type QueueStatus } from '../schema'

type Fns = Database['public']['Functions']
export type QueueRow = Fns['admin_report_queue']['Returns'][number]
export type BanRow = Fns['admin_ban_list']['Returns'][number]
export type ActionRow = Fns['admin_recent_actions']['Returns'][number]
export type RideSuspensionRow = Fns['admin_ride_suspensions']['Returns'][number]

/** True only for a signed-in admin (public.app_admins). Per request. Reads cookies: call inside <Suspense>. */
export const isAppAdmin = cache(async (): Promise<boolean> => {
  const supabase = await createClient()
  if (!supabase) return false
  const { data } = await supabase.rpc('is_app_admin')
  return data === true
})

/** Open reports, for the badge in "הכרטיס שלי". Null for everyone else. */
export async function getOpenReportCount(): Promise<number | null> {
  if (!(await isAppAdmin())) return null
  const supabase = await createClient()
  if (!supabase) return null
  const { data, error } = await supabase.rpc('admin_open_count')
  return error ? null : (data ?? 0)
}

export type Cursor = { before: string; beforeId: string }

/** One page of the queue, newest first (keyset by created_at, id). */
export async function getReportQueue(status: QueueStatus, cursor: Cursor | null): Promise<{ rows: QueueRow[]; next: Cursor | null }> {
  const supabase = await createClient()
  if (!supabase) return { rows: [], next: null }
  const { data, error } = await supabase.rpc('admin_report_queue', {
    p_status: status,
    p_limit: QUEUE_PAGE,
    ...(cursor ? { p_before: cursor.before, p_before_id: cursor.beforeId } : {}),
  })
  if (error || !data) return { rows: [], next: null }
  const last = data.at(-1)
  return { rows: data, next: data.length === QUEUE_PAGE && last ? { before: last.created_at, beforeId: last.id } : null }
}

export async function getBans(): Promise<BanRow[]> {
  const supabase = await createClient()
  if (!supabase) return []
  const { data } = await supabase.rpc('admin_ban_list', { p_limit: 50 })
  return data ?? []
}

export async function getRecentActions(): Promise<ActionRow[]> {
  const supabase = await createClient()
  if (!supabase) return []
  const { data } = await supabase.rpc('admin_recent_actions', { p_limit: 15 })
  return data ?? []
}

/** Fans suspended from rides right now (ride safety, rule 9). */
export type MostBlockedRow = Fns['admin_most_blocked']['Returns'][number]

/** Fans blocked by many different fans in the last 30 days (counts only, never message content), most first. */
export async function getMostBlocked(): Promise<MostBlockedRow[]> {
  const supabase = await createClient()
  if (!supabase) return []
  const { data } = await supabase.rpc('admin_most_blocked', { p_limit: 20 })
  return (data ?? []).filter((r) => r.blocked_by >= 2)
}

export type IncidentRow = Fns['admin_open_incidents']['Returns'][number]
export type VerificationIssueRow = Fns['admin_verification_issues']['Returns'][number]

/** Open ride emergencies, newest first (2026-10-16). */
export async function getOpenIncidents(): Promise<IncidentRow[]> {
  const supabase = await createClient()
  if (!supabase) return []
  const { data } = await supabase.rpc('admin_open_incidents', { p_limit: 50 })
  return data ?? []
}

/** Open emergencies no admin has acknowledged yet (the red badge). */
export async function getIncidentCount(): Promise<number> {
  const supabase = await createClient()
  if (!supabase) return 0
  const { data, error } = await supabase.rpc('admin_incident_count')
  return error ? 0 : (data ?? 0)
}

/** Fans stuck in verification in the last 30 days (rejected, or out of attempts). */
export async function getVerificationIssues(): Promise<VerificationIssueRow[]> {
  const supabase = await createClient()
  if (!supabase) return []
  const { data } = await supabase.rpc('admin_verification_issues', { p_limit: 50 })
  return data ?? []
}

export async function getRideSuspensions(): Promise<RideSuspensionRow[]> {
  const supabase = await createClient()
  if (!supabase) return []
  const { data } = await supabase.rpc('admin_ride_suspensions', { p_limit: 50 })
  return data ?? []
}

// ---------- overview console (2026-11-02): browse everything across all clubs ----------

export type FansByTeamRow = Fns['admin_fans_by_team']['Returns'][number]
export type UserRow = Fns['admin_user_list']['Returns'][number]
export type ContentRow = Fns['admin_content_feed']['Returns'][number]

export const CONSOLE_PAGE = 30

/** Every count for the hub tiles, as a plain map metric → value (missing metric reads as 0). */
export async function getOverviewCounts(): Promise<Record<string, number>> {
  const supabase = await createClient()
  if (!supabase) return {}
  const { data } = await supabase.rpc('admin_overview_counts')
  const out: Record<string, number> = {}
  for (const r of data ?? []) out[r.metric] = r.value
  return out
}

/** Fans per club, biggest first. */
export async function getFansByTeam(): Promise<FansByTeamRow[]> {
  const supabase = await createClient()
  if (!supabase) return []
  const { data } = await supabase.rpc('admin_fans_by_team')
  return data ?? []
}

/** One page of fans across all clubs, newest first (keyset by created_at, user_id). Optional search and club filter. */
export async function getUserList(opts: { search?: string; team?: string; cursor?: Cursor | null }): Promise<{ rows: UserRow[]; next: Cursor | null }> {
  const supabase = await createClient()
  if (!supabase) return { rows: [], next: null }
  const { data, error } = await supabase.rpc('admin_user_list', {
    p_limit: CONSOLE_PAGE,
    ...(opts.search ? { p_search: opts.search } : {}),
    ...(opts.team ? { p_team: opts.team } : {}),
    ...(opts.cursor ? { p_before: opts.cursor.before, p_before_id: opts.cursor.beforeId } : {}),
  })
  if (error || !data) return { rows: [], next: null }
  const last = data.at(-1)
  return { rows: data, next: data.length === CONSOLE_PAGE && last ? { before: last.created_at, beforeId: last.user_id } : null }
}

/** One page of content of a single kind across all clubs, newest first (keyset by created_at, ref). */
export async function getContentFeed(kind: string, cursor: Cursor | null): Promise<{ rows: ContentRow[]; next: Cursor | null }> {
  const supabase = await createClient()
  if (!supabase) return { rows: [], next: null }
  const { data, error } = await supabase.rpc('admin_content_feed', {
    p_kind: kind,
    p_limit: CONSOLE_PAGE,
    ...(cursor ? { p_before: cursor.before, p_before_id: cursor.beforeId } : {}),
  })
  if (error || !data) return { rows: [], next: null }
  const last = data.at(-1)
  return { rows: data, next: data.length === CONSOLE_PAGE && last ? { before: last.created_at, beforeId: last.ref } : null }
}

// ---------- one fan's wall (2026-11-02) ----------

export type UserDetailRow = Fns['admin_user_detail']['Returns'][number]

/** One fan's profile header with counts, or null if there is no such fan. */
export async function getUserDetail(userId: string): Promise<UserDetailRow | null> {
  const supabase = await createClient()
  if (!supabase) return null
  const { data } = await supabase.rpc('admin_user_detail', { p_user: userId })
  return data?.[0] ?? null
}

/** One page of a single fan's own content of a kind (same shape and refs as the cross-club feed). */
export async function getUserContent(userId: string, kind: string, cursor: Cursor | null): Promise<{ rows: ContentRow[]; next: Cursor | null }> {
  const supabase = await createClient()
  if (!supabase) return { rows: [], next: null }
  const { data, error } = await supabase.rpc('admin_user_content', {
    p_user: userId,
    p_kind: kind,
    p_limit: CONSOLE_PAGE,
    ...(cursor ? { p_before: cursor.before, p_before_id: cursor.beforeId } : {}),
  })
  if (error || !data) return { rows: [], next: null }
  const last = data.at(-1)
  return { rows: data, next: data.length === CONSOLE_PAGE && last ? { before: last.created_at, beforeId: last.ref } : null }
}
