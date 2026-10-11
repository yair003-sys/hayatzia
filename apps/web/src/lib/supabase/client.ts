'use client'

import { createBrowserClient } from '@supabase/ssr'
import { supabaseConfig } from './config'

export function createClient() {
  const cfg = supabaseConfig()
  if (!cfg) throw new Error('Supabase is not configured for this environment')
  return createBrowserClient(cfg.url, cfg.key)
}
