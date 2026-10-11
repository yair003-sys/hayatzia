import type { Metadata } from 'next'
import { ScreenPlaceholder } from '@/components/screen-placeholder'

export const metadata: Metadata = { title: 'הכרטיס שלי' }

export default function Page() {
  return <ScreenPlaceholder title="הכרטיס שלי" phase="שלב 1" note="הפרופיל שלך, הקבוצה שלך והגדרות הפרטיות." />
}
