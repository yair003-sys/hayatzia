import { pollFromRow } from '@/features/crowd-verdict/schema'

// The goal moment (stadium redesign, stage 4). The match room already receives a realtime 'poll' broadcast for every
// goal in the game (a "הגול של <שחקן> חוקי?" poll, kind 'goal'). That is the one real goal event the room consumes, so
// the celebration is gated on it — nothing is invented and no fake trigger exists in production. The reducer is pure
// and tested; the overlay (goal-overlay.tsx) only reacts to what this returns.

/** A goal to celebrate: the scorer's name when we can read it from the poll question, else null. */
export type GoalMoment = { scorer: string | null }

/** Pull the scorer's name out of a goal poll's question ("הגול של דני אבדיה חוקי?" → "דני אבדיה"); null if it is not there. */
export function scorerFromGoalQuestion(question: string): string | null {
  const m = /^הגול של\s+(.+?)\s+חוקי\?*$/u.exec(question.trim())
  const name = m?.[1]?.trim()
  return name ? name : null
}

/**
 * Decide whether a channel broadcast is a goal to celebrate. Only a 'poll' broadcast that parses into a poll of
 * kind 'goal' counts; everything else (tally, poll_closed, a non-goal poll, malformed payloads) returns null.
 */
export function goalFromChannelEvent(event: string, payload: unknown): GoalMoment | null {
  if (event !== 'poll') return null
  const poll = pollFromRow(payload)
  if (!poll || poll.kind !== 'goal') return null
  return { scorer: scorerFromGoalQuestion(poll.question) }
}
