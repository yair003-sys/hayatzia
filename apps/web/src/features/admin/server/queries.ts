import 'server-only'
import { cache } from 'react'
import { createClient } from '@/lib/supabase/server'
import type { Database } from '@/lib/supabase/database.types'
import { QUEUE_PAGE, type QueueStatus } from '../schema'

type Fns = Database['public']['Functions']
export type QueueRow = Fns['admin_report_queue']['Returns'][number]
export type BanRow = Fns['admin_ban_list']['Returns'][number]
export type ActionRow = Fns['admin_recent_actions']['Returns'][number]

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
