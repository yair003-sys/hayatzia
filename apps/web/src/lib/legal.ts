/**
 * Legal pages (owner, 2026-10-15): terms, privacy and accessibility. Drafts until a lawyer reviews them.
 * The contact address is one constant: while it is null the pages point to "צור קשר" in "הכרטיס שלי" and say
 * that an address will be published soon. Never invent an address.
 */
export const LEGAL_CONTACT_EMAIL: string | null = null

/**
 * The terms version a new fan accepts at sign-up, stored in profiles.terms_version. The database refuses a fan's own
 * profile insert with any other value (policy profiles_insert_terms, migration 20261015180000): changing this needs a
 * migration that replaces that policy, in the same commit.
 */
export const TERMS_VERSION = '2026-10-15'

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
