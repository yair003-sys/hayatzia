/**
 * Sharing a Square clip into a private chat (2026-11-14).
 *
 * Private messages are end-to-end encrypted: the app server never sees their text. So a shared clip travels as a tiny
 * reference — `onefan:clip/<id>` — inside the encrypted message. Nothing of the clip itself (its file, its link) ever
 * reaches the server through the chat; the receiving device recognises the reference and fetches the clip on its own,
 * exactly as it would in the Square, guarded by the same row-level security.
 */
export const CLIP_PREFIX = 'onefan:clip/'

const CLIP_RE = /^onefan:clip\/([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})$/

/** The reference text that stands in for a clip inside a private message. */
export const clipToken = (clipId: string): string => CLIP_PREFIX + clipId

/** The clip id when a whole message is just a clip reference, otherwise null (an ordinary message). */
export function parseClipToken(text: string | null | undefined): string | null {
  if (!text) return null
  const m = CLIP_RE.exec(text.trim())
  return m ? m[1] : null
}

/** What the receiving device shows for a shared clip: only what a preview needs, signed and scoped like the Square. */
export type ClipRef = {
  id: string
  nick: string
  teamId: string
  kind: 'image' | 'video'
  caption: string
  /** A short-lived signed URL, or null when the clip is gone or out of this fan's reach. */
  url: string | null
}
