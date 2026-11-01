// Algorithm phase 6: lift the messages the room is reacting to above the noise. With emoji reactions (2026-11-01) a
// message is "hot" simply when enough fans reacted to it (any emoji). Pure, from the counts already on the message,
// computed on the client as reactions stream in — no new data.

import { totalReactions } from './schema'

export const HOT_REACTIONS = 5

export function isHotMessage(r: { reactions?: Record<string, number> | null }): boolean {
  return totalReactions(r.reactions) >= HOT_REACTIONS
}
