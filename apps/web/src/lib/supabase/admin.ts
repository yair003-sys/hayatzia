import 'server-only'
import { createClient } from '@supabase/supabase-js'
import { env } from '@/lib/env'
import { supabaseConfig } from './config'
import type { Database } from './database.types'

/**
 * Privileged client (secret key, bypasses RLS). Server only, and only for jobs that must read other fans' rows,
 * such as push subscriptions when sending a notification. Never use it for anything a fan's own session can do.
 */
export function createAdminClient() {
  const cfg = supabaseConfig()
  // Keys never contain whitespace; a pasted value can carry a line break, which makes every request fail.
  const key = env.SUPABASE_SECRET_KEY?.replace(/\s+/g, '')
  if (!cfg || !key) return null
  return createClient<Database>(cfg.url, key, { auth: { persistSession: false, autoRefreshToken: false } })
}
