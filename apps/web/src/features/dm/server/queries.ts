import 'server-only'
import { createClient } from '@/lib/supabase/server'
import type { InboxRow, Invite } from '../schema'

export async function getThread(id: string, userId: string) {
  const supabase = await createClient()
  if (!supabase) return null
  const { data } = await supabase.from('dm_threads').select('id,user_a,user_b,nick_a,nick_b').eq('id', id).maybeSingle()
  if (!data) return null
  const mineA = data.user_a === userId
  return { id: data.id, otherId: mineA ? data.user_b : data.user_a, otherNick: mineA ? data.nick_b : data.nick_a }
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
}

/**
 * The inbox: private threads and groups merged, newest first, plus pending group invites.
 * One query per kind and one nicknames query; metadata only (message contents are never read here).
 */
export async function getInbox(userId: string): Promise<{ rows: InboxRow[]; invites: Invite[] }> {
  const supabase = await createClient()
  if (!supabase) return { rows: [], invites: [] }
  const [threadsRes, memberships, blocksRes] = await Promise.all([
    supabase
      .from('dm_threads')
      .select('id,user_a,user_b,nick_a,nick_b,last_at,last_from,last_message_id,unread_a,unread_b')
      .order('last_at', { ascending: false })
      .limit(100),
    supabase
      .from('dm_group_members')
      .select('group_id,role,invited_by,invited_at,unread,muted,dm_groups(id,name,last_at,last_from,last_message_id,members_count)')
      .eq('user_id', userId)
      .limit(100),
    supabase.from('blocks').select('blocked_id'),
  ])
  const blocked = new Set(blocksRes.data?.map((b) => b.blocked_id))

  const rows: InboxRow[] = (threadsRes.data ?? [])
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
      }
    })
    .filter((t) => !blocked.has(t.otherId))

  const invites: Invite[] = []
  const inviterIds = new Set<string>()
  const pending: { groupId: string; name: string; invitedBy: string; members: number; invitedAt: string }[] = []
  for (const m of memberships.data ?? []) {
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

/** A group I belong to, with its members. Null for non-members and for invitees (who see only the invite). */
export async function getGroup(groupId: string, userId: string): Promise<GroupDetails | null> {
  const supabase = await createClient()
  if (!supabase) return null
  const [{ data: group }, { data: members }] = await Promise.all([
    supabase.from('dm_groups').select('id,name').eq('id', groupId).maybeSingle(),
    supabase.from('dm_group_members').select('user_id,role,muted').eq('group_id', groupId).in('role', ['admin', 'member']),
  ])
  const mine = members?.find((m) => m.user_id === userId)
  if (!group || !members || !mine) return null
  const nicks = await nicknames(members.map((m) => m.user_id))
  return {
    id: group.id,
    name: group.name,
    role: mine.role === 'admin' ? 'admin' : 'member',
    muted: mine.muted,
    members: members.map((m) => ({
      userId: m.user_id,
      nick: nicks.get(m.user_id) ?? 'אוהד',
      role: m.role === 'admin' ? ('admin' as const) : ('member' as const),
    })),
  }
}
