'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { DEMO_BUTTON, DEMO_LABEL } from '../schema'
import { demoApproveAction } from '../server/actions'

/** The mock provider's "session" (staging and local only): no camera, no document; labelled demo everywhere. */
export function DemoSession({ sessionId }: { sessionId: string }) {
  const router = useRouter()
  const [pending, start] = useTransition()
  const [error, setError] = useState<string | null>(null)
  return (
    <div className="space-y-4">
      <p role="note" className="rounded-lg border border-warn/60 bg-surface p-3 text-sm font-medium text-warn">
        {DEMO_LABEL}
      </p>
      <ol className="list-decimal space-y-1 ps-5 text-sm text-muted">
        <li>צילום התעודה (לדוגמה, בלי מצלמה)</li>
        <li>סריקת פנים חיה (לדוגמה)</li>
        <li>השוואה לתעודה ולתאריך הלידה בחשבון (לדוגמה)</li>
      </ol>
      <button
        type="button"
        disabled={pending}
        onClick={() =>
          start(async () => {
            const r = await demoApproveAction({ sessionId })
            const e = r?.data && 'error' in r.data ? r.data.error : r?.serverError
            if (e) return setError(e)
            router.push('/me/verify')
          })
        }
        className="min-h-11 w-full rounded-lg bg-accent font-semibold text-white disabled:opacity-40"
      >
        {pending ? 'רגע…' : DEMO_BUTTON}
      </button>
      {error && (
        <p role="alert" className="text-sm text-live">
          {error}
        </p>
      )}
    </div>
  )
}
