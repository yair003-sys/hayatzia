'use client'

import { useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'

/** Refreshes the inbox when a new private message arrives (the broadcast carries ids only, never content). */
export function InboxLive({ meId }: { meId: string }) {
  const router = useRouter()
  useEffect(() => {
    const supabase = createClient()
    let cancelled = false
    const channel = supabase.channel(`inbox:${meId}`, { config: { private: true } })
    channel.on('broadcast', { event: 'message' }, () => router.refresh())
    void supabase.realtime.setAuth().then(() => {
      if (!cancelled) channel.subscribe()
    })
    return () => {
      cancelled = true
      void supabase.removeChannel(channel)
    }
  }, [meId, router])
  return null
}
