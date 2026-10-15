'use client'

import { useState } from 'react'
import { useAction } from 'next-safe-action/hooks'
import { Trash2 } from 'lucide-react'
import { DELETE_WORD } from '../schema'
import { deleteAccountAction } from '../server/actions'

/** "מחיקת החשבון" in "הכרטיס שלי": explains what is deleted, then asks the fan to type the word to confirm. */
export function DeleteAccount() {
  const [open, setOpen] = useState(false)
  const [word, setWord] = useState('')
  const { execute, result, isPending } = useAction(deleteAccountAction)
  const ready = word.trim() === DELETE_WORD
  const error =
    result.serverError ??
    (result.data && 'error' in result.data ? result.data.error : undefined) ??
    result.validationErrors?.confirm?._errors?.[0]

  if (!open)
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="flex min-h-11 w-full items-center justify-center gap-2 rounded-2xl border border-line py-3 font-medium text-live"
      >
        <Trash2 className="size-4" aria-hidden="true" />
        מחיקת החשבון
      </button>
    )

  return (
    <form
      className="space-y-3 rounded-2xl border border-live/40 bg-surface p-4"
      aria-labelledby="delete-title"
      onSubmit={(e) => {
        e.preventDefault()
        if (ready) execute({ confirm: word })
      }}
    >
      <h3 id="delete-title" className="font-semibold">
        מחיקת החשבון
      </h3>
      <p className="text-sm leading-relaxed text-muted">המחיקה סופית ואי אפשר לבטל אותה. יימחקו:</p>
      <ul className="list-disc space-y-1 ps-5 text-sm leading-relaxed text-muted">
        <li>החשבון, הכינוי, הקבוצה ומספר האוהד</li>
        <li>ההודעות שלך בצ׳אט הקבוצה ובחדרי המשחק, הפוסטים, התמונות והתגובות</li>
        <li>השיחות הפרטיות שלך (גם אצל מי שדיברת איתו) וההודעות שלך בקבוצות</li>
        <li>ניחושים, דירוגים, ביקורות, הרכבים, הצבעות וצ׳ק-אינים</li>
        <li>נסיעות, אירועים ומודעות בשוק, וכל הקבצים שהעלית</li>
        <li>התראות, הגדרות וחסימות</li>
      </ul>
      <p className="text-sm leading-relaxed text-muted">דיווחים ופניות ששלחת נשמרים בלי השם שלך, כדי שנוכל לסיים לטפל בהם.</p>
      <p className="text-sm leading-relaxed text-muted">
        סיכומים כלליים בלי שם (למשל מספר האוהדים בקבוצה) מתעדכנים בהתאם. אפשר להירשם שוב אחר כך, אבל הנתונים לא יחזרו.
      </p>
      <label className="block">
        <span className="mb-2 block text-sm">כדי לאשר, הקלד „{DELETE_WORD}”</span>
        <input
          value={word}
          onChange={(e) => setWord(e.target.value)}
          autoComplete="off"
          aria-invalid={error ? true : undefined}
          className="min-h-11 w-full rounded-xl border border-line bg-elev px-3 py-2"
        />
      </label>
      {error && (
        <p role="alert" className="text-sm text-live">
          {error}
        </p>
      )}
      <div className="flex gap-2">
        <button type="submit" disabled={!ready || isPending} className="min-h-11 flex-1 rounded-xl bg-live py-2.5 font-semibold text-white disabled:opacity-50">
          {isPending ? 'מוחק…' : 'מחק את החשבון לצמיתות'}
        </button>
        <button
          type="button"
          onClick={() => {
            setOpen(false)
            setWord('')
          }}
          className="min-h-11 rounded-xl border border-line px-4"
        >
          ביטול
        </button>
      </div>
    </form>
  )
}
