'use client'

import { useState } from 'react'
import { useAction } from 'next-safe-action/hooks'
import { Mail } from 'lucide-react'
import { CONTACT_ACK_HE, CONTACT_MAX, CONTACT_TOPICS } from '../schema'
import { contactAction } from '../server/actions'

type Topic = (typeof CONTACT_TOPICS)[number]

/** "צור קשר" in "הכרטיס שלי": privacy, accessibility or anything else, straight to the operator. */
export function ContactForm() {
  const [open, setOpen] = useState(false)
  const [topic, setTopic] = useState<Topic>(CONTACT_TOPICS[0])
  const [text, setText] = useState('')
  const { execute, result, isPending, reset } = useAction(contactAction, {
    onSuccess: ({ data }) => {
      if (data && 'ok' in data) setText('')
    },
  })
  const sent = Boolean(result.data && 'ok' in result.data)
  const error =
    result.serverError ??
    (result.data && 'error' in result.data ? result.data.error : undefined) ??
    result.validationErrors?.text?._errors?.[0]

  if (!open)
    return (
      <button
        type="button"
        onClick={() => {
          reset()
          setOpen(true)
        }}
        className="flex min-h-11 w-full items-center justify-center gap-2 rounded-2xl border border-line py-3 font-medium"
      >
        <Mail className="size-4" aria-hidden="true" />
        צור קשר
      </button>
    )

  return (
    <form
      className="space-y-3 rounded-2xl border border-line bg-surface p-4"
      aria-labelledby="contact-title"
      onSubmit={(e) => {
        e.preventDefault()
        execute({ topic, text })
      }}
    >
      <h3 id="contact-title" className="font-semibold">
        צור קשר
      </h3>
      <p className="text-sm leading-relaxed text-muted">
        בקשות בנושא פרטיות (עיון, תיקון או מחיקה של מידע), נגישות או כל דבר אחר. הפנייה מגיעה לצוות onefan, ונחזור אליך לפי
        פרטי החשבון.
      </p>
      <fieldset className="space-y-2">
        <legend className="mb-2 text-sm">נושא</legend>
        <div className="flex flex-wrap gap-2">
          {CONTACT_TOPICS.map((t) => (
            <label key={t} className="flex min-h-11 cursor-pointer items-center gap-2 rounded-xl border border-line px-3 has-checked:border-accent">
              <input type="radio" name="topic" value={t} checked={topic === t} onChange={() => setTopic(t)} />
              {t}
            </label>
          ))}
        </div>
      </fieldset>
      <label className="block">
        <span className="mb-2 block text-sm">מה הבקשה?</span>
        <textarea
          value={text}
          onChange={(e) => setText(e.target.value)}
          maxLength={CONTACT_MAX}
          rows={4}
          aria-invalid={error ? true : undefined}
          aria-describedby="contact-count"
          className="w-full rounded-xl border border-line bg-elev px-3 py-2"
        />
        <span id="contact-count" className="mt-1 block text-xs text-dim">
          {text.length}/{CONTACT_MAX}
        </span>
      </label>
      {error && (
        <p role="alert" className="text-sm text-live">
          {error}
        </p>
      )}
      {sent && (
        <p role="status" className="rounded-xl bg-accent-soft p-3 text-sm leading-relaxed">
          {CONTACT_ACK_HE}
        </p>
      )}
      <div className="flex gap-2">
        <button type="submit" disabled={isPending || text.trim().length < 2} className="min-h-11 flex-1 rounded-xl bg-accent py-2.5 font-semibold text-white disabled:opacity-50">
          {isPending ? 'שולח…' : 'שלח'}
        </button>
        <button type="button" onClick={() => setOpen(false)} className="min-h-11 rounded-xl border border-line px-4">
          סגור
        </button>
      </div>
    </form>
  )
}
