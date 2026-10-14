'use client'

import { useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { listenPrivate } from '@/lib/supabase/shared-channel'

/**
 * Refreshes the inbox when a private or group message or a group invite arrives (the broadcast carries ids only,
 * never content). The in-app banner listens to the same `inbox:<me>` topic, so the channel is shared (listenPrivate).
 */
export function InboxLive({ meId }: { meId: string }) {
  const router = useRouter()
  useEffect(() => {
    const off = listenPrivate(createClient(), `inbox:${meId}`, (m) => {
      if (m.event === 'message' || m.event === 'invite') router.refresh()
    })
    return () => {
      off()
    }
  }, [meId, router])
  return null
}
