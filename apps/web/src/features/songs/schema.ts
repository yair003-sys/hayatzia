import { z } from 'zod'

export const SONGS_PAGE = 20
export const MAX_AUDIO_MB = 20
export const AUDIO_ACCEPT = 'audio/webm,audio/mp4,audio/mpeg,audio/ogg,audio/wav,audio/aac,audio/x-m4a'

/** A song in the greenhouse: a fan's recording (audio) + its lyrics, with its like and adoption counts. */
export type Song = {
  id: string
  user_id: string
  team_id: string
  nick: string
  title: string
  lyrics: string
  likes_count: number
  adopts_count: number
  created_at: string
  /** Short-lived signed URL for the audio (null if signing failed). */
  url: string | null
  liked: boolean
  adopted: boolean
  /** Shown optimistically from the phone while the upload finishes. */
  uploading?: boolean
}

export const songIdSchema = z.object({ songId: z.uuid() })
export const toggleSongSchema = songIdSchema.extend({ on: z.boolean() })
export const createSongSchema = z.object({
  path: z.string().min(1).max(200),
  title: z.string().trim().max(80).default(''),
  lyrics: z.string().trim().min(1, 'כתבו את מילות השיר').max(2000, 'עד 2000 תווים'),
})
