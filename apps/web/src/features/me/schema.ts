// "הכרטיס שלי" (owner, 2026-10-13): a private fan card with the fan's own numbers.

const MONTHS = ['ינואר', 'פברואר', 'מרץ', 'אפריל', 'מאי', 'יוני', 'יולי', 'אוגוסט', 'ספטמבר', 'אוקטובר', 'נובמבר', 'דצמבר']

/** Order of joining within the club, as on a membership card. */
export function fanNumber(n: number): string {
  return `#${String(n).padStart(4, '0')}`
}

/** "אוקטובר 2026", in Israel time. */
export function memberSince(iso: string): string {
  const parts = new Intl.DateTimeFormat('en-GB', { timeZone: 'Asia/Jerusalem', year: 'numeric', month: 'numeric' }).formatToParts(new Date(iso))
  const month = Number(parts.find((p) => p.type === 'month')?.value ?? '1')
  const year = parts.find((p) => p.type === 'year')?.value ?? ''
  return `${MONTHS[month - 1]} ${year}`
}

export type FanCard = {
  joinedAt: string
  number: number
  games: number
  away: number
  points: number
  exact: number
  rank: number | null
  rated: number
}
