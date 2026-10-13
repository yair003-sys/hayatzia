'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import type { Route } from 'next'
import { usePathname, useRouter } from 'next/navigation'
import type { EncryptedRow } from '@/features/dm/use-device-key'
import { teamAccent } from '@/features/stand-home/schema'
import { decryptMessage } from '@/lib/e2e/crypto'
import { peekDeviceKey } from '@/lib/e2e/keystore'
import { createClient } from '@/lib/supabase/client'
import { listenPrivate } from '@/lib/supabase/shared-channel'
import {
  BANNER_MS,
  PREFS_EVENT,
  arrivalGate,
  bannerAlertSchema,
  bannerHref,
  inviteLine,
  messageLine,
  parseAlertPayload,
  parseInboxEvent,
  shouldShow,
  type BannerContext,
  type BannerEvent,
} from '../banner'
import { prefsSchema, type NotificationPrefs } from '../schema'
import { BannerView, type ShownBanner } from './alert-banner-view'

const COLS = 'id,sender_id,sender_device,iv,ciphertext,wrapped_keys,created_at'
/** Up to this long a random wait before asking for an alert's text. */
const FETCH_JITTER_MS = 1500

type Content = Omit<ShownBanner, 'seq'>
type Client = ReturnType<typeof createClient>
type Hold = { seq: number; hover: boolean; focus: boolean }

/**
 * Decrypts one message on this device, read only: the banner never creates a device key (the inbox and the threads
 * do). No key on this device, a message not written for it, or any failure → null, and the fallback line is shown.
 */
async function decryptOne(supabase: Client, meId: string, row: unknown): Promise<string | null> {
  if (!row) return null
  try {
    const m = row as EncryptedRow
    const key = await peekDeviceKey(meId)
    if (!key || !m.wrapped_keys[key.id]) return null
    const { data } = await supabase
      .from('device_keys')
      .select('public_jwk')
      .eq('user_id', m.sender_id)
      .eq('device_id', m.sender_device)
      .maybeSingle()
    return data ? await decryptMessage(m, key, data.public_jwk) : null
  } catch {
    return null
  }
}

/**
 * The in-app banner: goals and full time (topic `alerts`) and private / group messages and invites (`inbox:<me>`),
 * one at a time at the top of any screen. Message text is decrypted here, on the device, and never leaves it.
 * Settings come from the server and follow the settings card live (PREFS_EVENT).
 */
export function AlertBanner({ meId, prefs: serverPrefs, myClubApiIds }: { meId: string; prefs: NotificationPrefs; myClubApiIds: number[] }) {
  const router = useRouter()
  const pathname = usePathname()
  const [supabase] = useState(() => createClient())
  const [banner, setBanner] = useState<ShownBanner | null>(null)
  // A mouse over the banner or focus inside it holds it. Kept per banner, so a dismissed one never holds the next,
  // and hover and focus apart, so leaving with the mouse does not release a keyboard focus (or the reverse).
  const [hold, setHold] = useState<Hold>({ seq: -1, hover: false, focus: false })
  const held = banner !== null && hold.seq === banner.seq && (hold.hover || hold.focus)

  // Server settings win when they change (a refresh); in between, the settings card's live updates.
  const [prefs, setPrefs] = useState(serverPrefs)
  const [seenServer, setSeenServer] = useState(serverPrefs)
  if (seenServer.matches !== serverPrefs.matches || seenServer.messages !== serverPrefs.messages) {
    setSeenServer(serverPrefs)
    setPrefs(serverPrefs)
  }

  useEffect(() => {
    const onPrefs = (e: Event) => {
      const p = prefsSchema.safeParse((e as CustomEvent<unknown>).detail)
      if (p.success) setPrefs(p.data)
    }
    window.addEventListener(PREFS_EVENT, onPrefs)
    return () => {
      window.removeEventListener(PREFS_EVENT, onPrefs)
    }
  }, [])

  // Live values for the Realtime handlers, which are set up once.
  const ctx = useRef<BannerContext>({ pathname, prefs, myClubApiIds, meId })
  useEffect(() => {
    ctx.current = { pathname, prefs, myClubApiIds, meId }
  }, [pathname, prefs, myClubApiIds, meId])

  // Opening the conversation or match the banner is about hides it.
  const [seenPath, setSeenPath] = useState(pathname)
  if (seenPath !== pathname) {
    setSeenPath(pathname)
    if (banner && banner.href === pathname) setBanner(null)
  }

  // Auto-hide after 5 s; hover or focus holds it.
  useEffect(() => {
    if (!banner || held) return
    const t = setTimeout(() => setBanner(null), BANNER_MS)
    return () => {
      clearTimeout(t)
    }
  }, [banner, held])

  const lookUp = useCallback(
    async (event: BannerEvent, alertId?: number): Promise<Content | null> => {
      const href = bannerHref(event)
      switch (event.kind) {
        case 'match': {
          // Every fan gets the broadcast at the same moment: a small random wait spreads the requests (the CDN then
          // answers most of them from one cached copy).
          await new Promise((r) => setTimeout(r, Math.random() * FETCH_JITTER_MS))
          const res = await fetch(`/api/alerts/${alertId}`).catch(() => null)
          if (!res?.ok) return null
          const a = bannerAlertSchema.safeParse(await res.json().catch(() => null))
          if (!a.success) return null
          // Now the two clubs are known: "my club only" can be decided.
          const full: BannerEvent = { ...event, homeApiId: a.data.homeApiId, awayApiId: a.data.awayApiId }
          if (!shouldShow(full, ctx.current)) return null
          return { title: a.data.title, body: a.data.body, href, tone: 'match', accent: a.data.bar ? teamAccent(a.data.bar) : null }
        }
        case 'dm': {
          const [thread, msg] = await Promise.all([
            supabase.from('dm_threads').select('user_a,nick_a,nick_b').eq('id', event.threadId).maybeSingle(),
            supabase
              .from('dm_messages')
              .select(COLS)
              .eq('thread_id', event.threadId)
              .eq('sender_id', event.from)
              .order('created_at', { ascending: false })
              .limit(1)
              .maybeSingle(),
          ])
          const nick = thread.data ? (thread.data.user_a === event.from ? thread.data.nick_a : thread.data.nick_b) : null
          return { title: messageLine({ nick, text: await decryptOne(supabase, meId, msg.data) }), body: '', href, tone: 'message', accent: null }
        }
        case 'group': {
          const [member, msg, sender] = await Promise.all([
            supabase.from('dm_group_members').select('muted,dm_groups(name)').eq('group_id', event.groupId).eq('user_id', meId).maybeSingle(),
            supabase
              .from('dm_group_messages')
              .select(COLS)
              .eq('group_id', event.groupId)
              .eq('sender_id', event.from)
              .order('created_at', { ascending: false })
              .limit(1)
              .maybeSingle(),
            supabase.from('profiles').select('nick').eq('user_id', event.from).maybeSingle(),
          ])
          if (member.data?.muted) return null // a muted group stays quiet, like its phone notifications
          const group = member.data?.dm_groups?.name ?? null
          const text = await decryptOne(supabase, meId, msg.data)
          return { title: messageLine({ nick: sender.data?.nick ?? null, text, group }), body: '', href, tone: 'message', accent: null }
        }
        case 'invite': {
          const { data } = await supabase.from('dm_group_members').select('dm_groups(name)').eq('group_id', event.groupId).eq('user_id', meId).maybeSingle()
          return { title: inviteLine(data?.dm_groups?.name), body: '', href, tone: 'message', accent: null }
        }
      }
    },
    [supabase, meId],
  )

  useEffect(() => {
    const gate = arrivalGate() // newer replaces older, also when lookups finish out of order
    const handle = async (event: BannerEvent, alertId?: number) => {
      const n = gate.arrive()
      // "My club only" needs the two clubs, known only after the lookup: the first check leaves it out.
      const c = ctx.current
      const first = event.kind === 'match' && c.prefs?.matches === 'team' ? { ...c, prefs: { ...c.prefs, matches: 'all' as const } } : c
      if (!shouldShow(event, first)) return
      const content = await lookUp(event, alertId).catch(() => null)
      // Check again: the fan may have opened that screen or changed a setting while we were looking it up.
      if (!content || (event.kind !== 'match' && !shouldShow(event, ctx.current))) return
      if (!gate.claim(n)) return
      setBanner({ ...content, seq: n })
    }
    // Listen only while the page is visible: a hidden tab or a phone in a pocket holds no Realtime join (the phone
    // push covers that time). Leaving goes through listenPrivate's counted off, so the inbox page's own listener on
    // inbox:<me> is unaffected.
    let offs: (() => void)[] = []
    const join = () => {
      if (offs.length) return
      offs = [
        listenPrivate(supabase, 'alerts', (m) => {
          if (m.event !== 'alert') return
          const a = parseAlertPayload(m.payload)
          if (a) void handle({ kind: 'match', fixtureId: a.fixtureId, homeApiId: 0, awayApiId: 0 }, a.id)
        }),
        listenPrivate(supabase, `inbox:${meId}`, (m) => {
          const e = parseInboxEvent(m.event, m.payload)
          if (e) void handle(e)
        }),
      ]
    }
    const leave = () => {
      for (const off of offs) off()
      offs = []
    }
    const onVisibility = () => {
      if (document.visibilityState === 'hidden') leave()
      else join()
    }
    if (document.visibilityState !== 'hidden') join()
    document.addEventListener('visibilitychange', onVisibility)
    return () => {
      document.removeEventListener('visibilitychange', onVisibility)
      leave()
    }
  }, [supabase, meId, lookUp])

  const open = useCallback(
    (href: string) => {
      setBanner(null)
      router.push(href as Route)
    },
    [router],
  )

  const onHold = (kind: 'hover' | 'focus', on: boolean) => {
    if (!banner) return
    const seq = banner.seq
    setHold((h) => ({ ...(h.seq === seq ? h : { seq, hover: false, focus: false }), [kind]: on }))
  }

  return <BannerView banner={banner} onOpen={open} onDismiss={() => setBanner(null)} onHold={onHold} />
}
