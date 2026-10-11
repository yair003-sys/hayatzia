import { env } from '@/lib/env'

export type SupabaseConfig = { url: string; key: string }

/** null when no project is configured (CI and plain local runs): the app then runs without sign-in. */
export function supabaseConfig(): SupabaseConfig | null {
  const url = env.NEXT_PUBLIC_SUPABASE_URL
  const key = env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY
  return url && key ? { url, key } : null
}
