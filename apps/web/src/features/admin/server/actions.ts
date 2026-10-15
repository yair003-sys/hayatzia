'use server'

import { revalidatePath } from 'next/cache'
import { actionClient } from '@/lib/safe-action'
import { createAdminClient } from '@/lib/supabase/admin'
import { createClient } from '@/lib/supabase/server'
import { adminErrorHe, banSchema, fileToRemove, removeSchema, statusSchema, unbanSchema } from '../schema'

// Every action runs the database function with the admin's own session: the database checks is_app_admin() and refuses
// anyone else ('not_admin'). The service key is used for one thing only: deleting the file of content that the
// database has already removed for an admin.

const PAGE = '/admin/reports'

export const removeContentAction = actionClient.inputSchema(removeSchema).action(async ({ parsedInput: { kind, ref } }) => {
  const supabase = await createClient()
  if (!supabase) return { error: 'לא זמין בסביבה הזאת' }
  const { data, error } = await supabase.rpc('admin_remove_content', { p_kind: kind, p_ref: ref })
  if (error) return { error: adminErrorHe(error.message) }
  const row = data?.[0]
  const file = fileToRemove(row?.bucket, row?.path)
  let fileLeft = false
  if (file) {
    const admin = createAdminClient()
    const removed = admin ? await admin.storage.from(file.bucket).remove([file.path]) : null
    if (!removed || removed.error) {
      // The row is gone, so fans no longer reach the file; the daily cleanup or a retry can remove it later.
      console.error('admin remove: file left in storage', file.bucket)
      fileLeft = true
    }
  }
  revalidatePath(PAGE)
  return { ok: true as const, removed: row?.removed ?? false, fileLeft }
})

export const banUserAction = actionClient.inputSchema(banSchema).action(async ({ parsedInput: { userId, days, reason } }) => {
  const supabase = await createClient()
  if (!supabase) return { error: 'לא זמין בסביבה הזאת' }
  // No days = for good (the function's default).
  const { data, error } = await supabase.rpc('admin_ban_user', { p_user: userId, p_reason: reason, ...(days === null ? {} : { p_days: days }) })
  if (error) return { error: adminErrorHe(error.message) }
  revalidatePath(PAGE)
  return { ok: true as const, until: data ?? null }
})

export const unbanUserAction = actionClient.inputSchema(unbanSchema).action(async ({ parsedInput: { userId } }) => {
  const supabase = await createClient()
  if (!supabase) return { error: 'לא זמין בסביבה הזאת' }
  const { error } = await supabase.rpc('admin_unban_user', { p_user: userId })
  if (error) return { error: adminErrorHe(error.message) }
  revalidatePath(PAGE)
  return { ok: true as const }
})

export const setReportStatusAction = actionClient.inputSchema(statusSchema).action(async ({ parsedInput: { reportId, status } }) => {
  const supabase = await createClient()
  if (!supabase) return { error: 'לא זמין בסביבה הזאת' }
  const { error } = await supabase.rpc('admin_set_report_status', { p_report: reportId, p_status: status })
  if (error) return { error: adminErrorHe(error.message) }
  revalidatePath(PAGE)
  return { ok: true as const }
})
