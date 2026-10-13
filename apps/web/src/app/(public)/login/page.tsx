import type { Metadata } from 'next'
import Link from 'next/link'
import { GoogleSignIn } from '@/features/auth/components/google-sign-in'
import { InAppBrowserNote } from '@/features/auth/components/in-app-browser-note'
import { PhoneSignIn } from '@/features/auth/components/phone-sign-in'
import { FirstRunIntro } from '@/features/first-run/components/first-run-intro'
import { env } from '@/lib/env'
import { supabaseConfig } from '@/lib/supabase/config'

export const metadata: Metadata = { title: 'כניסה' }

export default function LoginPage() {
  const enabled = supabaseConfig() !== null
  return (
    <main className="mx-auto flex min-h-dvh max-w-md flex-col justify-center gap-8 px-6">
      <FirstRunIntro then="close" />
      <div className="space-y-3">
        <h1 className="font-display text-4xl font-black">כניסה ל-onefan</h1>
        <p className="text-muted">כל אוהד מאומת. אחרי הכניסה בוחרים קבוצה, פעם אחת ולתמיד.</p>
      </div>
      {enabled ? (
        <div className="space-y-4">
          <InAppBrowserNote />
          <GoogleSignIn />
          {env.NEXT_PUBLIC_PHONE_AUTH === 'on' && (
            <>
              <div className="flex items-center gap-3 text-xs text-dim" aria-hidden="true">
                <span className="h-px flex-1 bg-line" />
                או
                <span className="h-px flex-1 bg-line" />
              </div>
              <PhoneSignIn />
            </>
          )}
        </div>
      ) : (
        <p className="rounded-md bg-surface p-4 text-sm text-muted">
          ההתחברות לא מחוברת בסביבה הזאת.{' '}
          <Link href="/stand" className="text-accent-text underline">
            המשך בלי חשבון
          </Link>
        </p>
      )}
    </main>
  )
}
