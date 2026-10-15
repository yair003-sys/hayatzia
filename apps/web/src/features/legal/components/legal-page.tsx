import type { ReactNode } from 'react'
import Link from 'next/link'
import { Brand } from '@/components/brand'
import { LEGAL_CONTACT_EMAIL, LEGAL_UPDATED } from '@/lib/legal'
import { LegalLinks } from './legal-links'

/** Shell of the public legal pages: brand, title, last-updated line, the draft note, the text, and the links row. */
export function LegalPage({ title, lead, children }: { title: string; lead: string; children: ReactNode }) {
  return (
    <main className="lg-page">
      <header className="flex items-center justify-between">
        <Link href="/" aria-label="onefan, לדף הבית">
          <Brand className="text-lg" size={26} />
        </Link>
        <span className="lg-draft">טיוטה – בבדיקה משפטית</span>
      </header>
      <article className="lg-body">
        <h1>{title}</h1>
        <p className="lg-updated">עודכן לאחרונה: {LEGAL_UPDATED}</p>
        <p className="lg-lead">{lead}</p>
        {children}
      </article>
      <LegalLinks className="mt-10" />
    </main>
  )
}

/** How to reach the operator. While no address is published, "צור קשר" in "הכרטיס שלי" is the way. */
export function LegalContact({ topic }: { topic: string }) {
  if (LEGAL_CONTACT_EMAIL)
    return (
      <p>
        {topic} אפשר לשלוח בדואר אלקטרוני לכתובת{' '}
        <a href={`mailto:${LEGAL_CONTACT_EMAIL}`} dir="ltr">
          {LEGAL_CONTACT_EMAIL}
        </a>
        , או דרך „צור קשר” במסך „הכרטיס שלי” באפליקציה.
      </p>
    )
  return (
    <p>
      {topic} אפשר לשלוח דרך „צור קשר” במסך „הכרטיס שלי” באפליקציה. נחזור אליך לפי פרטי החשבון. כתובת דואר אלקטרוני
      ליצירת קשר תפורסם כאן בקרוב.
    </p>
  )
}
