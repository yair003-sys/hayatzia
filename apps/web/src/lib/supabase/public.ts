import 'server-only'
import { createClient } from '@supabase/supabase-js'
import { supabaseConfig } from './config'

/**
 * Cookie-less client for public, read-only data (league tables).
 * Safe inside `'use cache'` because it never reads the request; RLS still applies (role `anon`).
 */
export function createPublicClient() {
  const cfg = supabaseConfig()
  if (!cfg) return null
  return createClient(cfg.url, cfg.key, { auth: { persistSession: false, autoRefreshToken: false } })
}
