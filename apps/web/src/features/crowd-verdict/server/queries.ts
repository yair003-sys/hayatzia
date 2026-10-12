import 'server-only'
import { createClient } from '@/lib/supabase/server'
import { pollFromRow, type MyVote, type Poll, type Tally } from '../schema'

export type CrowdState = { polls: Poll[]; tallies: Record<string, Tally[]>; mine: Record<string, MyVote> }

const EMPTY: CrowdState = { polls: [], tallies: {}, mine: {} }
const RECENT = 20

/** The match's latest polls (oldest first) with their tallies and my votes: three queries, no N+1. Reads the session: never cached. */
export async function getCrowd(fixtureId: number): Promise<CrowdState> {
  const supabase = await createClient()
  if (!supabase) return EMPTY
  const { data: rows, error } = await supabase
    .from('match_polls')
    .select('id,fixture_id,kind,question,options,options_in,source,voter_scope,opens_at,closes_at,summary')
    .eq('fixture_id', fixtureId)
    .order('opens_at', { ascending: false })
    .limit(RECENT)
  if (error || !rows?.length) return EMPTY
  const polls = rows.map(pollFromRow).filter((p): p is Poll => p !== null).reverse()
  const ids = polls.map((p) => p.id)
  const [t, m] = await Promise.all([
    supabase.from('match_poll_tallies').select('poll_id,row_kind,option_id,voter_group,n').in('poll_id', ids),
    supabase.from('match_poll_votes').select('poll_id,option_id,option_in').in('poll_id', ids),
  ])
  const tallies: Record<string, Tally[]> = {}
  for (const r of t.data ?? []) {
    ;(tallies[r.poll_id] ??= []).push({
      row: r.row_kind === 'i' ? 'i' : 'o',
      option: r.option_id,
      group: r.voter_group === 'h' || r.voter_group === 'a' ? r.voter_group : 'n',
      n: r.n,
    })
  }
  const mine: Record<string, MyVote> = {}
  for (const r of m.data ?? []) mine[r.poll_id] = { option: r.option_id, optionIn: r.option_in }
  return { polls, tallies, mine }
}
