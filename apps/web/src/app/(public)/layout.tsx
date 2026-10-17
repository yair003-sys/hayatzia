import { Suspense } from 'react'
import { PublicStadiumDecor } from '@/features/stadium/components/stadium-decor'

// The public shell (landing, login, onboarding, legal). It adds nothing for the classic design — the children render
// exactly as before — and, when the stadium design is on, lays the stadium backdrop and club-colour tint behind the
// sign-up screens so a new fan meets the new look. The auth behaviour itself is unchanged.
export default function PublicLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <>
      <Suspense fallback={null}>
        <PublicStadiumDecor />
      </Suspense>
      {children}
    </>
  )
}
