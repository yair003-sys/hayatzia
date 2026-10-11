import type { Metadata } from 'next'
import { ScreenPlaceholder } from '@/components/screen-placeholder'

export const metadata: Metadata = { title: 'היציע שלי' }

export default function Page() {
  return <ScreenPlaceholder title="היציע שלי" phase="שלב 1–2" note="הבית של הקבוצה שלך: ההרכב, דירוג השחקנים, תמונות היציע ויום המשחק." />
}
