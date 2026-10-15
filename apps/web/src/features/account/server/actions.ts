'use server'

import { redirect } from 'next/navigation'
import { actionClient } from '@/lib/safe-action'
import { createAdminClient } from '@/lib/supabase/admin'
import { createClient } from '@/lib/supabase/server'
import { USER_BUCKETS, deleteAccountSchema } from '../schema'

type Admin = NonNullable<ReturnType<typeof createAdminClient>>

const PAGE = 1000
const MAX_ROUNDS = 50
const MAX_DEPTH = 3

/** Removes every file under `prefix` in a bucket (files first, sub-folders recursively). False on any error. */
async function removeFolder(admin: Admin, bucket: string, prefix: string, depth = 0): Promise<boolean> {
  const store = admin.storage.from(bucket)
  for (let round = 0; round < MAX_ROUNDS; round++) {
    const { data, error } = await store.list(prefix, { limit: PAGE })
    if (error || !data) return false
    // Folders come back without an id (they are only name prefixes).
    const folders = data.filter((o) => !o.id)
    const files = data.filter((o) => o.id).map((o) => `${prefix}/${o.name}`)
    if (depth < MAX_DEPTH) {
      for (const f of folders) if (!(await removeFolder(admin, bucket, `${prefix}/${f.name}`, depth + 1))) return false
    }
    if (files.length === 0) return true
    const { error: removeError } = await store.remove(files)
    if (removeError) return false
    if (data.length < PAGE) return true
  }
  return false
}

/**
 * "מחיקת החשבון": deletes the signed-in fan's auth user. Every table that holds the fan's rows references auth.users
 * with ON DELETE CASCADE (a few "who did it" columns are SET NULL), so one delete removes the profile and the fan's
 * content. Files in Storage are not rows: they are removed first, folder by folder. The user id is taken from the
 * session only.
 */
export const deleteAccountAction = actionClient.inputSchema(deleteAccountSchema).action(async () => {
  const supabase = await createClient()
  if (!supabase) return { error: 'לא זמין בסביבה הזאת' }
  const { data } = await supabase.auth.getClaims()
  const userId = data?.claims.sub
  if (!userId) return { error: 'צריך להתחבר מחדש כדי למחוק את החשבון' }

  const admin = createAdminClient()
  if (!admin) return { error: 'מחיקת החשבון לא זמינה כרגע. נסה שוב מאוחר יותר' }

  for (const bucket of USER_BUCKETS) {
    if (!(await removeFolder(admin, bucket, userId))) {
      console.error('account delete: storage cleanup failed', bucket)
      return { error: 'המחיקה נכשלה. נסה שוב' }
    }
  }

  const { error } = await admin.auth.admin.deleteUser(userId)
  if (error) {
    // The code / status only: never the message (it may echo request details).
    console.error('account delete failed', error.code ?? error.status ?? 'unknown')
    return { error: 'המחיקה נכשלה. נסה שוב' }
  }

  // The user no longer exists: clear this browser's session cookies only (no server call needed).
  await supabase.auth.signOut({ scope: 'local' })
  redirect('/?deleted=1')
})
