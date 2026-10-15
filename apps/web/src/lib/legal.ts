/**
 * Legal pages (owner, 2026-10-15): terms, privacy and accessibility. Drafts until a lawyer reviews them.
 * The contact address is one constant: while it is null the pages point to "צור קשר" in "הכרטיס שלי" and say
 * that an address will be published soon. Never invent an address.
 */
export const LEGAL_CONTACT_EMAIL: string | null = null

/** Shown on every legal page ("עודכן לאחרונה"). */
export const LEGAL_UPDATED = '15 באוקטובר 2026'

/** Minimum age to use onefan (owner, 2026-10-15). */
export const MIN_AGE = 16

export const LEGAL_LINKS = [
  { href: '/terms', label: 'תנאי שימוש' },
  { href: '/privacy', label: 'פרטיות' },
  { href: '/accessibility', label: 'נגישות' },
] as const

export const NOT_AFFILIATED = 'onefan אינה קשורה לאף מועדון, לליגה או להתאחדות.'
