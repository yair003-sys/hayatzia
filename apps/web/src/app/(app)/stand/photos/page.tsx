import { redirect } from 'next/navigation'

// "תמונות מהיציע" moved into the Square's club tab (owner, 2026-10-12).
export default function Page() {
  redirect('/square?f=team')
}
