import type { Metadata } from 'next'
import { ScreenPlaceholder } from '@/components/screen-placeholder'

export const metadata: Metadata = { title: 'הכיכר' }

export default function Page() {
  return <ScreenPlaceholder title="הכיכר" phase="שלב 2" note="הפיד המשותף לכל אוהדי הליגה. כל פוסט נעלם אחרי 24 שעות." />
}
