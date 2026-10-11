'use client'

import { createBrowserClient } from '@supabase/ssr'
import { supabaseConfig } from './config'
import type { Database } from './database.types'

export function createClient() {
  const cfg = supabaseConfig()
  if (!cfg) throw new Error('Supabase is not configured for this environment')
  return createBrowserClient<Database>(cfg.url, cfg.key)
}
