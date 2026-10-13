'use client'

import { useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'

/** Refreshes the inbox when a private or group message or a group invite arrives (the broadcast carries ids only, never content). */
export function InboxLive({ meId }: { meId: string }) {
  const router = useRouter()
  useEffect(() => {
    const supabase = createClient()
    let cancelled = false
    const channel = supabase.channel(`inbox:${meId}`, { config: { private: true } })
    channel.on('broadcast', { event: 'message' }, () => router.refresh())
    channel.on('broadcast', { event: 'invite' }, () => router.refresh())
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
