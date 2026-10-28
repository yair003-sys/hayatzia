import type { Metadata } from 'next'
import Link from 'next/link'
import { BrandBackdrop } from '@/components/brand-backdrop'
import { GoogleSignIn } from '@/features/auth/components/google-sign-in'
import { InAppBrowserNote } from '@/features/auth/components/in-app-browser-note'
import { SignupHeader, SignupKicker } from '@/features/auth/components/signup-header'
import { FirstRunIntro } from '@/features/first-run/components/first-run-intro'
import { LegalLinks } from '@/features/legal/components/legal-links'
import { supabaseConfig } from '@/lib/supabase/config'

export const metadata: Metadata = { title: 'כניסה' }

// Sign-up step 1 of 3 (owner, 2026-10-13): Google now; the phone check (step 2) prevents a second account.
export default function LoginPage() {
  const enabled = supabaseConfig() !== null
  return (
    <main className="su-page">
      <BrandBackdrop />
      <FirstRunIntro then="close" />
      <SignupHeader step={1} />
      <div className="flex-1" />
      <SignupKicker n="01">כניסה</SignupKicker>
      <h1 className="su-title">
        אוהד אחד, חשבון אחד
        <span>מאמתים פעם אחת. נשארים לתמיד.</span>
      </h1>
      <p className="su-lead">כדי לשמור על הקהילה אמיתית, כל אוהד נכנס עם Google ומאמת את מספר הטלפון שלו.</p>
      <div className="mt-7 space-y-4">
        {enabled ? (
          <>
            <InAppBrowserNote />
            <GoogleSignIn />
          </>
        ) : (
          <p className="rounded-2xl bg-surface p-4 text-sm text-muted">
            ההתחברות לא מחוברת בסביבה הזאת.{' '}
            <Link href="/stand" className="text-accent-text underline">
              המשך בלי חשבון
            </Link>
          </p>
        )}
      </div>
      <p className="su-fine">האוהדים האחרים רואים רק את הכינוי שלך.</p>
      <LegalLinks className="mt-3" />
    </main>
  )
}
