'use client'

import { useRef, useState } from 'react'
import { useTranslations } from 'next-intl'
import { ImagePlus, SendHorizontal } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import { shrinkPhoto } from '@/features/square/compress'
import { createPostAction } from '../server/actions'
import { POST_BODY_MAX, POST_TITLE_MAX, type NewsPost } from '../schema'

const MAX_MB = 50
const ACCEPT = 'image/jpeg,image/png,image/webp,image/gif,video/mp4,video/quicktime,video/webm'
const EXT: Record<string, string> = {
  'image/jpeg': 'jpg',
  'image/png': 'png',
  'image/webp': 'webp',
  'image/gif': 'gif',
  'video/mp4': 'mp4',
  'video/quicktime': 'mov',
  'video/webm': 'webm',
}

/** Admin-only composer: title + body + optional one media item. Uploads to the public `channel` bucket, then creates
 *  the post. Not rendered for non-admins. */
export function PostComposer({ meId, onPublished }: { meId: string; onPublished: (post: NewsPost) => void }) {
  const t = useTranslations('teamNews')
  const [title, setTitle] = useState('')
  const [body, setBody] = useState('')
  const [file, setFile] = useState<File | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const fileRef = useRef<HTMLInputElement>(null)

  const pickFile = (f: File | null) => {
    setError(null)
    if (f && f.size > MAX_MB * 1024 * 1024) {
      setError(t('tooBig'))
      return
    }
    setFile(f)
  }

  const publish = async () => {
    if (!body.trim() || busy) return
    setBusy(true)
    setError(null)
    let mediaPath: string | undefined
    let mediaKind: 'image' | 'video' | undefined
    if (file) {
      const ready = await shrinkPhoto(file)
      const ext = EXT[ready.type]
      if (!ext) {
        setError(t('postFailed'))
        setBusy(false)
        return
      }
      const path = `${meId}/${crypto.randomUUID()}.${ext}`
      const up = await createClient().storage.from('channel').upload(path, ready, { contentType: ready.type, cacheControl: '3600', upsert: false })
      if (up.error) {
        setError(t('postFailed'))
        setBusy(false)
        return
      }
      mediaPath = path
      mediaKind = ready.type.startsWith('video') ? 'video' : 'image'
    }
    const r = await createPostAction({ title: title.trim() || undefined, body: body.trim(), mediaPath, mediaKind })
    setBusy(false)
    if (r.data && 'post' in r.data && r.data.post) {
      setTitle('')
      setBody('')
      setFile(null)
      if (fileRef.current) fileRef.current.value = ''
      onPublished(r.data.post)
    } else {
      setError((r.data && 'error' in r.data ? r.data.error : null) ?? t('postFailed'))
    }
  }

  return (
    <div className="mb-3 space-y-2 rounded-2xl border border-line bg-surface-2 p-3">
      <input
        value={title}
        onChange={(e) => setTitle(e.target.value)}
        maxLength={POST_TITLE_MAX}
        placeholder={t('titlePlaceholder')}
        className="w-full rounded-lg border border-line bg-surface px-3 py-2 text-sm"
      />
      <textarea
        value={body}
        onChange={(e) => setBody(e.target.value)}
        maxLength={POST_BODY_MAX}
        rows={3}
        placeholder={t('postPlaceholder')}
        className="w-full rounded-lg border border-line bg-surface px-3 py-2 text-sm"
      />
      {file && <p className="truncate text-xs text-muted">{file.name}</p>}
      {error && <p className="text-xs text-red-400">{error}</p>}
      <div className="flex items-center justify-between">
        <button type="button" aria-label={t('addMedia')} className="rounded-md p-2 text-muted hover:text-fg" onClick={() => fileRef.current?.click()}>
          <ImagePlus className="size-5" aria-hidden="true" />
        </button>
        <input ref={fileRef} type="file" accept={ACCEPT} hidden onChange={(e) => pickFile(e.target.files?.[0] ?? null)} />
        <button
          type="button"
          disabled={busy || !body.trim()}
          className="flex items-center gap-1 rounded-lg bg-accent px-4 py-1.5 text-sm text-accent-text disabled:opacity-50"
          onClick={() => void publish()}
        >
          <SendHorizontal className="size-4" aria-hidden="true" />
          {busy ? t('publishing') : t('publish')}
        </button>
      </div>
    </div>
  )
}
