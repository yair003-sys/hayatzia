import Link from 'next/link'

/** A home section's title row, with an optional "more" link at the end (44px target). */
export function SectionHead({ id, title, emoji, more }: { id: string; title: string; emoji?: string; more?: { href: '/stand/players' | '/square' | '/matches'; label: string } }) {
  return (
    <div className="hm-sec-h">
      <h2 id={id} className="hm-h2">
        {emoji && <span aria-hidden="true">{emoji} </span>}
        {title}
      </h2>
      {more && (
        <Link href={more.href} className="hm-more">
          {more.label}
        </Link>
      )}
    </div>
  )
}
