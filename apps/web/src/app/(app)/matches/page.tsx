import type { Metadata } from 'next'
import { ScreenPlaceholder } from '@/components/screen-placeholder'

export const metadata: Metadata = { title: 'משחקים' }

export default function Page() {
  return <ScreenPlaceholder title="משחקים" phase="שלב 1" note="תוצאות, טבלה וחדרי משחק חיים לכל משחק בליגה." />
}
