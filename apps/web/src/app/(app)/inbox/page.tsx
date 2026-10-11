import type { Metadata } from 'next'
import { ScreenPlaceholder } from '@/components/screen-placeholder'

export const metadata: Metadata = { title: 'הודעות' }

export default function Page() {
  return <ScreenPlaceholder title="הודעות" phase="שלב 3" note="הודעות פרטיות עם הצפנה מקצה לקצה." />
}
