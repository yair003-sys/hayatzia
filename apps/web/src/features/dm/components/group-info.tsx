'use client'

import { useState, useTransition } from 'react'
import { createPortal } from 'react-dom'
import { useRouter } from 'next/navigation'
import { Bell, BellOff, Check, LogOut, Pencil, UserPlus, X } from 'lucide-react'
import { ReportBlock } from '@/features/safety/components/report-block'
import { GROUP_MAX, membersLabel } from '../schema'
import type { GroupDetails } from '../server/queries'
import { inviteAction, leaveGroupAction, muteGroupAction, removeMemberAction, renameGroupAction } from '../server/actions'
import { Avatar } from './avatar'
import { FanList, SearchField, SheetHead, useTeammates, type Fan } from './new-sheet'

type Result = { data?: { error?: string } | unknown; serverError?: string; validationErrors?: unknown } | undefined

/** Hebrew error from a safe-action result, or null when it went through. */
function failure(r: Result): string | null {
  const err = r?.data && typeof r.data === 'object' && 'error' in r.data ? (r.data as { error?: string }).error : undefined
  if (err) return err
  if (r?.serverError || r?.validationErrors) return 'הפעולה נכשלה. נסה שוב'
  return null
}

/** Group info: members (admin badge), and the admin's invite / remove / rename; mute and leave for everyone. */
export function GroupInfo({ group, meId }: { group: GroupDetails; meId: string }) {
  const router = useRouter()
  const admin = group.role === 'admin'
  const [error, setError] = useState<string | null>(null)
  const [note, setNote] = useState<string | null>(null)
  const [pending, start] = useTransition()
  const [renaming, setRenaming] = useState(false)
  const [name, setName] = useState(group.name)
  const [muted, setMuted] = useState(group.muted)
  const [open, setOpen] = useState<string | null>(null) // member whose actions are shown
  const [confirmRemove, setConfirmRemove] = useState<string | null>(null)
  const [confirmLeave, setConfirmLeave] = useState(false)
  const [inviting, setInviting] = useState(false)

  const run = (fn: () => Promise<Result>, after?: () => void) =>
    start(async () => {
      setError(null)
      setNote(null)
      const msg = failure(await fn())
      if (msg) setError(msg)
      else {
        after?.()
        router.refresh()
      }
    })

  const members = [...group.members].sort((a, b) => (a.userId === meId ? -1 : b.userId === meId ? 1 : a.role === b.role ? a.nick.localeCompare(b.nick) : a.role === 'admin' ? -1 : 1))

  return (
    <div className="space-y-5">
      <header className="flex flex-col items-center gap-2 pt-2 text-center">
        <Avatar id={group.id} name={group.name} group />
        {renaming ? (
          <form
            className="flex w-full items-center gap-2"
            onSubmit={(e) => {
              e.preventDefault()
              run(() => renameGroupAction({ groupId: group.id, name: name.trim() }), () => setRenaming(false))
            }}
          >
            <label className="flex-1">
              <span className="sr-only">שם הקבוצה</span>
              <input value={name} onChange={(e) => setName(e.target.value)} maxLength={40} minLength={2} required autoFocus className="ib-input" />
            </label>
            <button type="submit" disabled={pending || name.trim().length < 2} aria-label="שמירת השם" className="ib-icon-btn text-ok">
              <Check className="size-5" aria-hidden="true" />
            </button>
            <button
              type="button"
              aria-label="ביטול"
              className="ib-icon-btn"
              onClick={() => {
                setName(group.name)
                setRenaming(false)
              }}
            >
              <X className="size-5" aria-hidden="true" />
            </button>
          </form>
        ) : (
          <div className="flex items-center gap-1">
            <h1 className="t-page">{group.name}</h1>
            {admin && (
              <button type="button" aria-label="שינוי שם הקבוצה" className="ib-icon-btn" onClick={() => setRenaming(true)}>
                <Pencil className="size-4" aria-hidden="true" />
              </button>
            )}
          </div>
        )}
        <p className="text-sm text-muted">{membersLabel(group.members.length)}</p>
      </header>

      <button
        type="button"
        role="switch"
        aria-checked={muted}
        disabled={pending}
        className="ib-pick justify-between rounded-xl border border-line-soft bg-surface px-3 py-3"
        onClick={() => {
          const next = !muted
          run(() => muteGroupAction({ groupId: group.id, muted: next }), () => setMuted(next))
        }}
      >
        <span className="flex items-center gap-2">
          {muted ? <BellOff className="size-5 text-dim" aria-hidden="true" /> : <Bell className="size-5 text-accent-text" aria-hidden="true" />}
          השתקת התראות
        </span>
        <span className="ib-check" data-on={muted} aria-hidden="true">
          {muted && <Check className="size-3.5" strokeWidth={3} />}
        </span>
      </button>

      <section className="space-y-2" aria-labelledby="members-title">
        <div className="flex items-center justify-between">
          <h2 id="members-title" className="t-sec">
            חברים
          </h2>
          {admin && group.members.length < GROUP_MAX && (
            <button type="button" className="flex items-center gap-1 text-sm text-accent-text" onClick={() => setInviting(true)}>
              <UserPlus className="size-4" aria-hidden="true" />
              הזמנת אוהדים
            </button>
          )}
        </div>
        <ul className="ib-list" aria-label="חברי הקבוצה">
          {members.map((m) => {
            const me = m.userId === meId
            const expanded = open === m.userId
            return (
              <li key={m.userId} className="py-0.5">
                {me ? (
                  <div className="ib-pick">
                    <MemberLine nick={m.nick} userId={m.userId} admin={m.role === 'admin'} me />
                  </div>
                ) : (
                  <button
                    type="button"
                    className="ib-pick"
                    aria-expanded={expanded}
                    onClick={() => {
                      setOpen(expanded ? null : m.userId)
                      setConfirmRemove(null)
                    }}
                  >
                    <MemberLine nick={m.nick} userId={m.userId} admin={m.role === 'admin'} />
                  </button>
                )}
                {expanded && !me && (
                  <div className="space-y-2 ps-12 pb-2">
                    {admin &&
                      (confirmRemove === m.userId ? (
                        <div className="flex items-center gap-2 text-sm">
                          <span className="text-muted">להוציא את {m.nick}?</span>
                          <button
                            type="button"
                            disabled={pending}
                            className="rounded-full bg-live px-3 py-1 text-xs font-semibold text-white"
                            onClick={() => run(() => removeMemberAction({ groupId: group.id, userId: m.userId }), () => setOpen(null))}
                          >
                            הוצאה
                          </button>
                          <button type="button" className="text-xs text-muted" onClick={() => setConfirmRemove(null)}>
                            ביטול
                          </button>
                        </div>
                      ) : (
                        <button type="button" className="text-sm text-live" onClick={() => setConfirmRemove(m.userId)}>
                          הוצאה מהקבוצה
                        </button>
                      ))}
                    <ReportBlock kind="user" refId={m.userId} userId={m.userId} userNick={m.nick} />
                  </div>
                )}
              </li>
            )
          })}
        </ul>
      </section>

      {error && (
        <p role="alert" className="text-sm text-live">
          {error}
        </p>
      )}
      {note && (
        <p role="status" className="text-sm text-ok">
          {note}
        </p>
      )}

      {confirmLeave ? (
        <div className="space-y-2 rounded-xl border border-line bg-surface p-3">
          <p className="text-sm">לעזוב את הקבוצה? לא תוכל לקרוא בה הודעות עד שיזמינו אותך שוב.</p>
          <div className="flex gap-2">
            <button type="button" disabled={pending} className="ib-pill bg-live! text-white" onClick={() => run(() => leaveGroupAction({ groupId: group.id }))}>
              עזיבה
            </button>
            <button type="button" className="ib-pill" onClick={() => setConfirmLeave(false)}>
              ביטול
            </button>
          </div>
        </div>
      ) : (
        <button type="button" className="flex items-center gap-2 text-live" onClick={() => setConfirmLeave(true)}>
          <LogOut className="size-5 -scale-x-100" aria-hidden="true" />
          עזיבת הקבוצה
        </button>
      )}

      {inviting && (
        <InviteSheet
          groupId={group.id}
          memberIds={group.members.map((m) => m.userId)}
          onClose={() => setInviting(false)}
          onDone={(n) => {
            setInviting(false)
            setNote(n === 1 ? 'ההזמנה נשלחה' : `${n} הזמנות נשלחו`)
            router.refresh()
          }}
        />
      )}
    </div>
  )
}

function MemberLine({ nick, userId, admin, me = false }: { nick: string; userId: string; admin: boolean; me?: boolean }) {
  return (
    <>
      <Avatar id={userId} name={nick} size="sm" />
      <span className="min-w-0 flex-1 truncate">
        {nick}
        {me && <span className="text-dim"> (אתה)</span>}
      </span>
      {admin && <span className="rounded-full bg-surface-3 px-2 py-0.5 text-xs text-accent-text">מנהל</span>}
    </>
  )
}

/** Admin's teammate picker: multi-select, current members left out. Each pick gets an invite to accept. */
function InviteSheet({ groupId, memberIds, onClose, onDone }: { groupId: string; memberIds: string[]; onClose: () => void; onDone: (n: number) => void }) {
  const { q, fans, search } = useTeammates()
  const [picked, setPicked] = useState<Fan[]>([])
  const [error, setError] = useState<string | null>(null)
  const [pending, start] = useTransition()
  const room = GROUP_MAX - memberIds.length
  const full = picked.length >= room
  const candidates = fans?.filter((f) => !memberIds.includes(f.user_id)) ?? null

  const toggle = (f: Fan) => setPicked((cur) => (cur.some((p) => p.user_id === f.user_id) ? cur.filter((p) => p.user_id !== f.user_id) : cur.length >= room ? cur : [...cur, f]))

  const send = () =>
    start(async () => {
      setError(null)
      const msg = failure(await inviteAction({ groupId, memberIds: picked.map((p) => p.user_id) }))
      if (msg) setError(msg)
      else onDone(picked.length)
    })

  return createPortal(
    <div
      className="sq-sheet-wrap"
      onClick={onClose}
      onKeyDown={(e) => {
        if (e.key === 'Escape') onClose()
      }}
    >
      <div className="sq-sheet ib-sheet" role="dialog" aria-modal="true" aria-label="הזמנת אוהדים" onClick={(e) => e.stopPropagation()}>
        <span className="sq-grip" aria-hidden="true" />
        <SheetHead title="הזמנת אוהדים" onBack={onClose} />
        {picked.length > 0 && (
          <ul className="flex flex-wrap gap-1.5" aria-label="נבחרו">
            {picked.map((p) => (
              <li key={p.user_id}>
                <button type="button" className="ib-chip" onClick={() => toggle(p)} aria-label={`הסר את ${p.nick}`}>
                  {p.nick}
                  <X className="size-3.5" aria-hidden="true" />
                </button>
              </li>
            ))}
          </ul>
        )}
        <p className="text-xs text-dim">
          נבחרו <span className="t-num">{picked.length}</span> מתוך <span className="t-num">{room}</span> מקומות פנויים
        </p>
        <SearchField q={q} onChange={search} />
        <FanList fans={candidates}>
          {(f) => {
            const on = picked.some((p) => p.user_id === f.user_id)
            return (
              <button type="button" disabled={!on && full} aria-label={f.nick} aria-pressed={on} onClick={() => toggle(f)} className="ib-pick">
                <Avatar id={f.user_id} name={f.nick} size="sm" />
                <span className="truncate">{f.nick}</span>
                <span className="ib-check" data-on={on} aria-hidden="true">
                  {on && <Check className="size-3.5" strokeWidth={3} />}
                </span>
              </button>
            )
          }}
        </FanList>
        {error && (
          <p role="alert" className="text-sm text-live">
            {error}
          </p>
        )}
        <button type="button" disabled={picked.length === 0 || pending} onClick={send} className="su-btn su-btn-blue">
          שליחת הזמנות
        </button>
      </div>
    </div>,
    document.body,
  )
}
