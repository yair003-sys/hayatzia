import { z } from 'zod'
import { cursorSchema, sendMessageSchema } from '@/features/chat/schema'

// Same timing as the database (match_room_open) and the legacy app.
export const OPEN_BEFORE_MIN = 30
export const MATCH_MIN = 110
export const CLOSE_AFTER_MIN = 60

export type RoomState = 'soon' | 'open' | 'closing' | 'closed'

/** Room state for a kick-off time (unix seconds) at a moment (ms). Writable while 'open' or 'closing'. */
export function roomState(kickoffSec: number, nowMs: number): RoomState {
  const min = (nowMs - kickoffSec * 1000) / 60_000
  if (min < -OPEN_BEFORE_MIN) return 'soon'
  if (min < MATCH_MIN) return 'open'
  if (min < MATCH_MIN + CLOSE_AFTER_MIN) return 'closing'
  return 'closed'
}

export const sendMatchMessageSchema = sendMessageSchema.extend({ fixtureId: z.number().int().positive() })
export const olderMatchMessagesSchema = cursorSchema.extend({ fixtureId: z.number().int().positive() })
