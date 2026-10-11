import type { Metadata } from 'next'
import Link from 'next/link'
import { GoogleSignIn } from '@/features/auth/components/google-sign-in'
import { supabaseConfig } from '@/lib/supabase/config'

export const metadata: Metadata = { title: 'כניסה' }

export default function LoginPage() {
  const enabled = supabaseConfig() !== null
  return (
    <main className="mx-auto flex min-h-dvh max-w-md flex-col justify-center gap-8 px-6">
      <div className="space-y-3">
        <h1 className="font-display text-4xl font-black">כניסה ליציע</h1>
        <p className="text-muted">כל אוהד מאומת. אחרי הכניסה בוחרים קבוצה, פעם אחת ולתמיד.</p>
      </div>
      {enabled ? (
        <GoogleSignIn />
      ) : (
        <p className="rounded-md bg-surface p-4 text-sm text-muted">
          ההתחברות לא מחוברת בסביבה הזאת.{' '}
          <Link href="/stand" className="text-accent-text underline">
            המשך בלי חשבון
          </Link>
        </p>
      )}
      <p className="text-center text-xs text-dim">הכניסה בטלפון תתווסף בשלב הבא.</p>
    </main>
  )
}
