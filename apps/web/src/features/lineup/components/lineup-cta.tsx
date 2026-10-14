import Link from 'next/link'
import { ChevronLeft, Shirt } from 'lucide-react'

/** "בנה את ההרכב שלך": the call to build the fan lineup for the club's next match (open until kick-off). */
export function LineupCta({ fixtureId, detail }: { fixtureId: number; detail: string }) {
  return (
    <Link href={`/matches/${fixtureId}?tab=lineup`} className="lu-home">
      <i aria-hidden="true">
        <Shirt className="size-5" strokeWidth={1.75} />
      </i>
      <span>
        <b>בנה את ההרכב שלך</b>
        <small>{detail}</small>
      </span>
      <ChevronLeft className="size-4 text-dim" aria-hidden="true" />
    </Link>
  )
}
