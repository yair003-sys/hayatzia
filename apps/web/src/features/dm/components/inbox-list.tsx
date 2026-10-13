'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { BellOff, MessagesSquare, Plus, Search } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import { chatTime } from '@/features/chat/schema'
import { filterInbox, membersLabel, previewText, unreadLabel, type InboxRow, type Invite } from '../schema'
import { useDeviceKey, type EncryptedRow } from '../use-device-key'
import { Avatar } from './avatar'
import { InviteCard } from './invite-card'
import { NewSheet, type SheetMode } from './new-sheet'

const COLS = 'id,sender_id,sender_device,iv,ciphertext,wrapped_keys,created_at'
const rowKey = (r: { kind: string; id: string }) => `${r.kind}:${r.id}`

/**
 * The inbox list: private chats and groups mixed, newest first. Last-message previews are fetched as
 * ciphertext (one query per kind) and decrypted here on the device; the server never sees them.
 */
export function InboxList({ meId, rows, invites }: { meId: string; rows: InboxRow[]; invites: Invite[] }) {
  const [supabase] = useState(() => createClient())
  const { key, status, reveal } = useDeviceKey(meId)
  const [previews, setPreviews] = useState<Map<string, string>>(() => new Map())
  const [q, setQ] = useState('')
  const [sheet, setSheet] = useState<SheetMode | null>(null)

  useEffect(() => {
    if (!key && !status) return // wait for this device's key (status means it will never come)
    let cancelled = false
    void (async () => {
      const ids = (kind: InboxRow['kind']) => rows.filter((r) => r.kind === kind && r.lastMessageId).map((r) => r.lastMessageId as string)
      const dmIds = ids('dm')
      const groupIds = ids('group')
      const [dm, group] = await Promise.all([
        dmIds.length ? supabase.from('dm_messages').select(COLS).in('id', dmIds) : null,
        groupIds.length ? supabase.from('dm_group_messages').select(COLS).in('id', groupIds) : null,
      ])
      const [dmShown, groupShown] = await Promise.all([
        reveal((dm?.data ?? []) as unknown as EncryptedRow[]),
        reveal((group?.data ?? []) as unknown as EncryptedRow[]),
      ])
      const senders = [...new Set(groupShown.map((m) => m.sender_id).filter((id) => id !== meId))]
      const nicks = new Map<string, string>()
      if (senders.length > 0) {
        const { data } = await supabase.from('profiles').select('user_id,nick').in('user_id', senders)
        for (const p of data ?? []) nicks.set(p.user_id, p.nick)
      }
      const text = new Map<string, { text: string | null; sender: string }>()
      for (const m of [...dmShown, ...groupShown]) text.set(m.id, { text: m.text, sender: m.sender_id })
      const next = new Map<string, string>()
      for (const r of rows) {
        if (!r.lastMessageId) continue
        const m = text.get(r.lastMessageId)
        const sender = m?.sender ?? r.lastFrom
        next.set(
          rowKey(r),
          previewText({
            text: m?.text ?? null,
            senderNick: sender ? (nicks.get(sender) ?? null) : null,
            mine: r.lastFrom === meId,
            group: r.kind === 'group',
          }),
        )
      }
      if (!cancelled) setPreviews(next)
    })()
    return () => {
      cancelled = true
    }
  }, [rows, key, status, reveal, meId, supabase])

  const shown = filterInbox(rows, q)
  const empty = rows.length === 0 && invites.length === 0

  return (
    <>
      {empty ? (
        <div className="ib-empty">
          <span className="ib-empty-ico" aria-hidden="true">
            <MessagesSquare className="size-7" strokeWidth={1.6} />
          </span>
          <p className="t-sec">עוד אין שיחות</p>
          <p className="mb-3 text-sm text-muted">כתוב לאוהד מהקבוצה, או פתח קבוצה קטנה לחבר׳ה שאיתך ביציע.</p>
          <button type="button" className="su-btn su-btn-blue" onClick={() => setSheet('dm')}>
            שיחה חדשה
          </button>
          <button type="button" className="su-btn ib-btn-soft" onClick={() => setSheet('group')}>
            קבוצה חדשה
          </button>
        </div>
      ) : (
        <div className="space-y-3 pb-20">
          {rows.length > 0 && (
            <label className="ib-search">
              <Search className="size-4 shrink-0" aria-hidden="true" />
              <span className="sr-only">חיפוש בשיחות</span>
              <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="חיפוש" type="search" />
            </label>
          )}
          {invites.length > 0 && (
            <ul className="space-y-2" aria-label="הזמנות לקבוצות">
              {invites.map((i) => (
                <InviteCard key={i.groupId} invite={i} />
              ))}
            </ul>
          )}
          <ul className="ib-list" aria-label="שיחות">
            {shown.map((r) => (
              <li key={rowKey(r)}>
                <Row row={r} preview={previewOf(r, previews)} />
              </li>
            ))}
            {rows.length > 0 && shown.length === 0 && <li className="py-8 text-center text-sm text-muted">לא נמצאו שיחות</li>}
          </ul>
        </div>
      )}

      <button type="button" className="ib-fab" aria-label="שיחה או קבוצה חדשה" onClick={() => setSheet('menu')}>
        <Plus className="size-6" strokeWidth={2.2} aria-hidden="true" />
      </button>
      <NewSheet mode={sheet} onMode={setSheet} />
    </>
  )
}

function previewOf(r: InboxRow, previews: Map<string, string>): string | null {
  if (!r.lastMessageId) return r.kind === 'group' ? `עוד אין הודעות · ${membersLabel(r.members ?? 1)}` : 'עוד אין הודעות'
  return previews.get(rowKey(r)) ?? null // null while decrypting
}

function Row({ row, preview }: { row: InboxRow; preview: string | null }) {
  const badge = unreadLabel(row.unread)
  return (
    <Link href={row.kind === 'group' ? `/inbox/g/${row.id}` : `/inbox/${row.id}`} className="ib-row" data-unread={badge ? 'true' : undefined}>
      <Avatar id={row.kind === 'group' ? row.id : (row.otherId ?? row.id)} name={row.name} group={row.kind === 'group'} />
      <div className="ib-body">
        <div className="flex items-baseline gap-2">
          <b className="ib-name">{row.name}</b>
          {row.muted && <BellOff className="size-3.5 shrink-0 self-center text-dim" aria-label="מושתק" />}
          <time dateTime={row.lastAt} className="ib-time">
            {chatTime(row.lastAt)}
          </time>
        </div>
        <div className="flex items-center gap-2">
          <p className="ib-preview">{preview ?? <span className="ib-preview-wait" aria-hidden="true" />}</p>
          {badge && (
            <span className="ib-badge" data-muted={row.muted ? 'true' : undefined} aria-label={`${badge} הודעות שלא נקראו`}>
              {badge}
            </span>
          )}
        </div>
      </div>
    </Link>
  )
}
