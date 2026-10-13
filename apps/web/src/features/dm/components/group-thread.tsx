'use client'

import { useCallback, useEffect, useRef, useState, useTransition } from 'react'
import { createClient } from '@/lib/supabase/client'
import { encryptMessage } from '@/lib/e2e/crypto'
import { notifyGroupAction } from '@/features/push/server/actions'
import { avatarOf, DEVICES_PER_FAN, DM_PAGE, eventLine, pickDevices, recipientsFor, type GroupEventKind } from '../schema'
import { markReadAction } from '../server/actions'
import { useDeviceKey, type EncryptedRow } from '../use-device-key'
import { Bubble, Composer, E2eNote } from './thread-parts'

type Msg = { type: 'msg'; id: string; sender_id: string; created_at: string; text: string | null }
type Ev = { type: 'event'; id: string; kind: GroupEventKind; subject: string | null; created_at: string }
type Item = Msg | Ev
type EventRow = { id: string; kind: string; subject: string | null; created_at: string }

const COLS = 'id,sender_id,sender_device,iv,ciphertext,wrapped_keys,created_at'
const byTime = (a: Item, b: Item) => a.created_at.localeCompare(b.created_at) || a.id.localeCompare(b.id)

// Group messages never pass through the app server: encrypted on this device for every device of every
// current member, written and read straight against the database with the fan's own session.
export function GroupThread({ groupId, meId, nicks: initialNicks }: { groupId: string; meId: string; nicks: Record<string, string> }) {
  const [supabase] = useState(() => createClient())
  const { key, status: keyStatus, devicesOf, reveal } = useDeviceKey(meId)
  const [items, setItems] = useState<Item[]>([])
  const [nicks, setNicks] = useState<Record<string, string>>(initialNicks)
  const [status, setStatus] = useState<string | null>(null)
  const [sending, start] = useTransition()
  const blocked = useRef(new Set<string>())
  const known = useRef(new Set(Object.keys(initialNicks)))
  const bottom = useRef<HTMLDivElement>(null)

  // Nicknames of senders or subjects who are no longer members: one query for the missing ones.
  const learnNicks = useCallback(
    async (ids: (string | null)[]) => {
      const missing = [...new Set(ids.filter((id): id is string => !!id && !known.current.has(id)))]
      if (missing.length === 0) return
      for (const id of missing) known.current.add(id)
      const { data } = await supabase.from('profiles').select('user_id,nick').in('user_id', missing)
      if (data?.length) setNicks((cur) => ({ ...cur, ...Object.fromEntries(data.map((p) => [p.user_id, p.nick])) }))
    },
    [supabase],
  )

  // Opening the group clears its unread counter.
  useEffect(() => {
    void markReadAction({ kind: 'group', id: groupId })
  }, [groupId])

  // History (messages + system lines, merged by time) + live messages.
  useEffect(() => {
    if (!key) return
    let cancelled = false
    // My blocks first: the live channel does not know who I blocked, so it waits for this list.
    const blocksReady = supabase
      .from('blocks')
      .select('blocked_id')
      .then(({ data }) => {
        blocked.current = new Set(data?.map((b) => b.blocked_id))
      })
    void (async () => {
      const [msgs, evs] = await Promise.all([
        supabase.from('dm_group_messages').select(COLS).eq('group_id', groupId).order('created_at', { ascending: false }).limit(DM_PAGE),
        supabase.from('dm_group_events').select('id,kind,subject,created_at').eq('group_id', groupId).order('created_at', { ascending: false }).limit(DM_PAGE),
        blocksReady,
      ])
      const rows = (msgs.data ?? []) as unknown as EncryptedRow[]
      // A full page of messages: show only the system lines from the same stretch of time.
      const since = rows.length === DM_PAGE ? rows[rows.length - 1]?.created_at : undefined
      const events = ((evs.data ?? []) as EventRow[]).filter((e) => !since || e.created_at >= since)
      const shown = await reveal(rows)
      void learnNicks([...rows.map((r) => r.sender_id), ...events.map((e) => e.subject)])
      if (cancelled) return
      const history: Item[] = [
        ...shown.map((m): Item => ({ type: 'msg', id: m.id, sender_id: m.sender_id, created_at: m.created_at, text: m.text })),
        ...events.map((e): Item => ({ type: 'event', id: e.id, kind: e.kind as GroupEventKind, subject: e.subject, created_at: e.created_at })),
      ]
      // Keep anything that arrived live while the history was loading.
      setItems((cur) => [...history, ...cur.filter((x) => !history.some((h) => h.id === x.id))].sort(byTime))
    })()

    const channel = supabase.channel(`grp:${groupId}`, { config: { private: true } })
    channel.on('broadcast', { event: 'INSERT' }, async ({ payload }) => {
      const r = (payload as { record?: EncryptedRow }).record
      if (!r?.id || blocked.current.has(r.sender_id)) return // the channel does not know who I blocked
      const [m] = await reveal([r])
      // Not readable here (e.g. the sender blocked me): show it only if the database lets me read the row.
      if (m && m.text === null && r.sender_id !== meId) {
        const { data } = await supabase.from('dm_group_messages').select('id').eq('id', r.id).maybeSingle()
        if (!data) return
      }
      void learnNicks([r.sender_id])
      if (m) setItems((cur) => (cur.some((x) => x.id === m.id) ? cur : [...cur, { type: 'msg' as const, id: m.id, sender_id: m.sender_id, created_at: m.created_at, text: m.text }]))
      if (r.sender_id !== meId) void markReadAction({ kind: 'group', id: groupId })
    })
    void Promise.all([supabase.realtime.setAuth(), blocksReady]).then(() => {
      if (!cancelled) channel.subscribe()
    })
    return () => {
      cancelled = true
      void supabase.removeChannel(channel)
    }
  }, [key, groupId, meId, supabase, reveal, learnNicks])

  // Braces: newer Chrome returns a Promise from scrollIntoView, and React would call it as a cleanup.
  useEffect(() => {
    bottom.current?.scrollIntoView({ block: 'end' })
  }, [items])

  const send = (text: string) =>
    new Promise<boolean>((resolve) => {
      if (!key) return resolve(false)
      start(async () => {
        setStatus(null)
        try {
          // Current members at the moment of sending: never invitees or removed fans, never fans I blocked.
          const [mem, blk] = await Promise.all([
            supabase.from('dm_group_members').select('user_id,role').eq('group_id', groupId),
            supabase.from('blocks').select('blocked_id'),
          ])
          if (mem.error || blk.error) {
            setStatus('ההודעה לא נשלחה')
            return resolve(false)
          }
          blocked.current = new Set(blk.data.map((b) => b.blocked_id))
          const ids = recipientsFor(
            mem.data.map((m) => ({ userId: m.user_id, role: m.role })),
            [...blocked.current],
            meId,
          )
          const found = await devicesOf(ids)
          // This device may not be listed yet if its key was published a moment ago.
          const all = found.some((d) => d.id === key.id) ? found : [...found, { user_id: meId, id: key.id, publicJwk: key.publicJwk, created_at: new Date().toISOString() }]
          const devices = pickDevices(all, DEVICES_PER_FAN, { user_id: meId, id: key.id })
          const enc = await encryptMessage(text, key, devices)
          const { data, error } = await supabase.from('dm_group_messages').insert({ group_id: groupId, ...enc }).select('id,sender_id,created_at').single()
          if (error) {
            setStatus(error.message.includes('rate_limit') ? 'רגע, לאט יותר' : error.message.includes('not_member') ? 'אתה כבר לא בקבוצה הזאת' : 'ההודעה לא נשלחה')
            return resolve(false)
          }
          setItems((cur) => (cur.some((x) => x.id === data.id) ? cur : [...cur, { type: 'msg' as const, ...data, text }]))
          void notifyGroupAction({ groupId })
          resolve(true)
        } catch {
          setStatus('ההודעה לא נשלחה')
          resolve(false)
        }
      })
    })

  const shownStatus = status ?? keyStatus
  const nickOf = (id: string | null) => (id && nicks[id]) || 'אוהד'

  return (
    <div className="flex min-h-[65dvh] flex-col">
      <E2eNote />
      <ol className="flex flex-1 flex-col gap-2" aria-label="הודעות">
        {items.length === 0 && <li className="py-10 text-center text-muted">עוד אין הודעות. כתוב ראשון</li>}
        {items.map((it) =>
          it.type === 'event' ? (
            <li key={it.id} className="self-center rounded-full bg-surface px-3 py-1 text-xs text-muted">
              {eventLine(it.kind, nickOf(it.subject))}
            </li>
          ) : (
            <Bubble
              key={it.id}
              mine={it.sender_id === meId}
              text={it.text}
              createdAt={it.created_at}
              sender={it.sender_id === meId ? undefined : { nick: nickOf(it.sender_id), hue: avatarOf(it.sender_id, '').hue }}
            />
          ),
        )}
        <div ref={bottom} />
      </ol>
      <Composer ready={!!key} sending={sending} placeholder="הודעה לקבוצה…" label="הודעה לקבוצה" onSend={send} />
      {shownStatus && (
        <p role="alert" className="mt-2 text-sm text-live">
          {shownStatus}
        </p>
      )}
    </div>
  )
}
