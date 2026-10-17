import 'server-only'
import { createClient } from '@/lib/supabase/server'
import { GROUP_MAX, QR_CODE_RE, requestOf, type InboxRow, type Invite, type RequestSide } from '../schema'

export type ThreadInfo = { id: string; otherId: string; otherNick: string; otherTeam: string | null; request: RequestSide }

export async function getThread(id: string, userId: string): Promise<ThreadInfo | null> {
  const supabase = await createClient()
  if (!supabase) return null
  const { data } = await supabase
    .from('dm_threads')
    .select('id,user_a,user_b,nick_a,nick_b,team_a,team_b,accepted_at,opened_by')
    .eq('id', id)
    .maybeSingle()
  if (!data) return null
  const mineA = data.user_a === userId
  return {
    id: data.id,
    otherId: mineA ? data.user_b : data.user_a,
    otherNick: mineA ? data.nick_b : data.nick_a,
    otherTeam: mineA ? data.team_b : data.team_a,
    request: requestOf(data, userId),
  }
}

/** The card behind a scanned QR code (nick and club only), or null for a bad or reset code. */
export async function getQrCard(code: string): Promise<{ nick: string; teamId: string } | null> {
  if (!QR_CODE_RE.test(code)) return null
  const supabase = await createClient()
  if (!supabase) return null
  const { data, error } = await supabase.rpc('qr_card', { p_code: code })
  const row = data?.[0]
  if (error || !row) return null
  return { nick: row.nick, teamId: row.team_id }
}

/** Fans of the same club to start a conversation with (RLS shows only teammates' profiles). */
export async function searchTeammates(userId: string, q: string) {
  const supabase = await createClient()
  if (!supabase) return []
  let query = supabase.from('profiles').select('user_id,nick').neq('user_id', userId).order('nick').limit(30)
  if (q) query = query.ilike('nick', `%${q.replace(/[%_\\]/g, '\\$&')}%`)
  const { data } = await query
  return data ?? []
}

export type GroupDetails = {
  id: string
  name: string
  role: 'admin' | 'member'
  muted: boolean
  members: { userId: string; nick: string; role: 'admin' | 'member' }[]
  /** Live (not expired) invites waiting for an answer. Filled for the admin only (who can cancel them). */
  invites: { userId: string; nick: string }[]
}

/**
 * The inbox: private threads and groups merged, newest first, plus pending group invites.
 * One query per kind and one nicknames query; metadata only (message contents are never read here). Message requests
 * (unaccepted threads) come in the same thread query, marked, so the inbox needs no extra round trip.
 * null when any of the three reads failed: the inbox says "could not load" instead of showing part of the list (load
 * test 2026-10-17, finding 6: 1 chat on screen while the fan had 5).
 */
export async function getInbox(userId: string): Promise<{ rows: InboxRow[]; invites: Invite[] } | null> {
  const supabase = await createClient()
  if (!supabase) return { rows: [], invites: [] }
  const [threadsRes, memberships, blocksRes] = await Promise.all([
    supabase
      .from('dm_threads')
      .select('id,user_a,user_b,nick_a,nick_b,team_a,team_b,last_at,last_from,last_message_id,unread_a,unread_b,accepted_at,opened_by')
      .order('last_at', { ascending: false })
      .limit(100),
    supabase
      .from('dm_group_members')
      .select('group_id,role,invited_by,invited_at,unread,muted,dm_groups(id,name,last_at,last_from,last_message_id,members_count)')
      .eq('user_id', userId)
      .limit(100),
    supabase.from('blocks').select('blocked_id'),
  ])
  if (threadsRes.error || memberships.error || blocksRes.error || !threadsRes.data || !memberships.data || !blocksRes.data) return null
  const blocked = new Set(blocksRes.data.map((b) => b.blocked_id))

  const rows: InboxRow[] = threadsRes.data
    .map((t) => {
      const mineA = t.user_a === userId
      return {
        kind: 'dm' as const,
        id: t.id,
        name: mineA ? t.nick_b : t.nick_a,
        otherId: mineA ? t.user_b : t.user_a,
        lastAt: t.last_at,
        lastFrom: t.last_from,
        lastMessageId: t.last_message_id,
        unread: mineA ? t.unread_a : t.unread_b,
        members: null,
        muted: false,
        request: requestOf(t, userId),
        otherTeam: mineA ? t.team_b : t.team_a,
      }
    })
    // Fans I blocked are hidden; so is a request the other fan opened but never wrote in (nothing to decide on yet).
    .filter((t) => !blocked.has(t.otherId) && !(t.request === 'incoming' && !t.lastMessageId))

  const invites: Invite[] = []
  const inviterIds = new Set<string>()
  const pending: { groupId: string; name: string; invitedBy: string; members: number; invitedAt: string }[] = []
  for (const m of memberships.data) {
    const g = m.dm_groups
    if (!g) continue
    if (m.role === 'invited') {
      if (!m.invited_by) continue
      inviterIds.add(m.invited_by)
      pending.push({ groupId: g.id, name: g.name, invitedBy: m.invited_by, members: g.members_count, invitedAt: m.invited_at })
    } else {
      rows.push({
        kind: 'group',
        id: g.id,
        name: g.name,
        otherId: null,
        lastAt: g.last_at,
        lastFrom: g.last_from,
        lastMessageId: g.last_message_id,
        unread: m.unread,
        members: g.members_count,
        muted: m.muted,
        request: null,
        otherTeam: null,
      })
    }
  }
  if (pending.length > 0) {
    const nicks = await nicknames([...inviterIds])
    for (const p of pending) invites.push({ ...p, invitedBy: nicks.get(p.invitedBy) ?? 'אוהד' })
    invites.sort((a, b) => b.invitedAt.localeCompare(a.invitedAt))
  }
  rows.sort((a, b) => b.lastAt.localeCompare(a.lastAt))
  return { rows, invites }
}

async function nicknames(ids: string[]): Promise<Map<string, string>> {
  const supabase = await createClient()
  if (!supabase || ids.length === 0) return new Map()
  const { data } = await supabase.from('profiles').select('user_id,nick').in('user_id', ids)
  return new Map((data ?? []).map((p) => [p.user_id, p.nick]))
}

/** A group I belong to, with its members (and, for the admin, live invites). Null for non-members and invitees. */
export async function getGroup(groupId: string, userId: string): Promise<GroupDetails | null> {
  const supabase = await createClient()
  if (!supabase) return null
  // RLS: a member sees the group's rows, expired invites hidden.
  const [{ data: group }, { data: rows }] = await Promise.all([
    supabase.from('dm_groups').select('id,name').eq('id', groupId).maybeSingle(),
    supabase.from('dm_group_members').select('user_id,role,muted').eq('group_id', groupId).limit(GROUP_MAX + 5),
  ])
  const members = (rows ?? []).filter((m) => m.role === 'admin' || m.role === 'member')
  const mine = members.find((m) => m.user_id === userId)
  if (!group || !mine) return null
  const admin = mine.role === 'admin'
  // Expired invites (older than 7 days) are already hidden by RLS.
  const invited = admin ? (rows ?? []).filter((m) => m.role === 'invited') : []
  const nicks = await nicknames([...members, ...invited].map((m) => m.user_id))
  return {
    id: group.id,
    name: group.name,
    role: admin ? 'admin' : 'member',
    muted: mine.muted,
    members: members.map((m) => ({
      userId: m.user_id,
      nick: nicks.get(m.user_id) ?? 'אוהד',
      role: m.role === 'admin' ? ('admin' as const) : ('member' as const),
    })),
    invites: invited.map((m) => ({ userId: m.user_id, nick: nicks.get(m.user_id) ?? 'אוהד' })),
  }
}
