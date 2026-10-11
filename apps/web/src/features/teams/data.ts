export type TeamId =
  | 'mta' | 'hta' | 'mhf' | 'bei' | 'hbs' | 'hhf' | 'hjr'
  | 'mpt' | 'hpt' | 'ikn' | 'itb' | 'hrg' | 'mnt' | 'snk'

export type Team = {
  readonly id: TeamId
  readonly name: string
  readonly short: string
  /** Primary kit colour. */
  readonly bg: string
  /** Secondary colour used for rings and text on `bg`. */
  readonly ring: string
  /** Brighter variant for bars and charts on the dark canvas. */
  readonly bar: string
}

// Identical to the legacy app (index.html, `TEAMS`). Moves to the `teams` table in P1.
export const TEAMS = [
  { id: 'mta', name: 'מכבי תל אביב', short: 'מכבי ת״א', bg: '#FFD400', ring: '#1D3FA8', bar: '#FFD400' },
  { id: 'hta', name: 'הפועל תל אביב', short: 'הפועל ת״א', bg: '#E0242F', ring: '#ffffff', bar: '#E0242F' },
  { id: 'mhf', name: 'מכבי חיפה', short: 'מכבי חיפה', bg: '#0E9F4A', ring: '#ffffff', bar: '#14B85A' },
  { id: 'bei', name: 'בית״ר ירושלים', short: 'בית״ר', bg: '#FFD400', ring: '#111111', bar: '#FFD400' },
  { id: 'hbs', name: 'הפועל באר שבע', short: 'הפועל ב״ש', bg: '#C8102E', ring: '#ffffff', bar: '#E0243F' },
  { id: 'hhf', name: 'הפועל חיפה', short: 'הפועל חיפה', bg: '#A30F1F', ring: '#111111', bar: '#D3182B' },
  { id: 'hjr', name: 'הפועל ירושלים', short: 'הפועל י-ם', bg: '#D63A3A', ring: '#ffffff', bar: '#E04A4A' },
  { id: 'mpt', name: 'מכבי פתח תקווה', short: 'מכבי פ״ת', bg: '#1F4FD8', ring: '#ffffff', bar: '#3B6BF0' },
  { id: 'hpt', name: 'הפועל פתח תקווה', short: 'הפועל פ״ת', bg: '#1B2F7A', ring: '#E0242F', bar: '#3550B8' },
  { id: 'ikn', name: 'עירוני קריית שמונה', short: 'קריית שמונה', bg: '#0284C7', ring: '#ffffff', bar: '#18A0E8' },
  { id: 'itb', name: 'עירוני טבריה', short: 'עירוני טבריה', bg: '#0F766E', ring: '#ffffff', bar: '#14A398' },
  { id: 'hrg', name: 'הפועל רמת גן', short: 'הפועל ר״ג', bg: '#EA580C', ring: '#ffffff', bar: '#F97A2E' },
  { id: 'mnt', name: 'מכבי נתניה', short: 'מכבי נתניה', bg: '#111111', ring: '#FACC15', bar: '#FACC15' },
  { id: 'snk', name: 'בני סכנין', short: 'בני סכנין', bg: '#B91C1C', ring: '#ffffff', bar: '#DC3A3A' },
] as const satisfies readonly Team[]

const BY_ID: ReadonlyMap<string, Team> = new Map(TEAMS.map((t) => [t.id, t]))

export function teamById(id: string): Team | undefined {
  return BY_ID.get(id)
}

export function isTeamId(id: string): id is TeamId {
  return BY_ID.has(id)
}
