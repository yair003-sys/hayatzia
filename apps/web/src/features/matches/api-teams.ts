import { teamById, type Team } from '@/features/teams/data'

// API-Football English names → our club ids (identical to the legacy app's APINAME).
const API_NAME_TO_ID: Record<string, string> = {
  'Maccabi Tel Aviv': 'mta',
  'Hapoel Tel Aviv': 'hta',
  'Maccabi Haifa': 'mhf',
  'Beitar Jerusalem': 'bei',
  'Hapoel Beer Sheva': 'hbs',
  'Hapoel Haifa': 'hhf',
  'Hapoel Jerusalem': 'hjr',
  'Hapoel Katamon': 'hjr',
  'Maccabi Petah Tikva': 'mpt',
  'Hapoel Petah Tikva': 'hpt',
  'Ironi Kiryat Shmona': 'ikn',
  'Hapoel Ironi Kiryat Shmona': 'ikn',
  'Ironi Tiberias': 'itb',
  'Hapoel Ramat Gan': 'hrg',
  'Maccabi Netanya': 'mnt',
  'Bnei Sakhnin': 'snk',
}

// Clubs that played in past seasons but are not in our 14 (Hebrew display names).
const API_NAME_TO_HE: Record<string, string> = {
  'Hapoel Hadera': 'הפועל חדרה',
  Ashdod: 'מ.ס. אשדוד',
  'MS Ashdod': 'מ.ס. אשדוד',
  'Maccabi Bnei Raina': 'מכבי בני ריינה',
  'Maccabi Bnei Reineh': 'מכבי בני ריינה',
  'Maccabi Bnei Raina FC': 'מכבי בני ריינה',
  'Bnei Yehuda': 'בני יהודה',
  'Hapoel Kfar Saba': 'הפועל כפר סבא',
  'Sektzia Nes Tziona': 'סקציה נס ציונה',
  'Hapoel Nof HaGalil': 'הפועל נוף הגליל',
}

const NEUTRAL = { bg: '#5F6A7C', ring: '#C5CCD8', bar: '#8C96A8' } as const

export type DisplayTeam = Pick<Team, 'name' | 'short' | 'bg' | 'ring' | 'bar'> & { id: string; local: boolean }

/** Resolves an API-Football team name to a club we know, or a neutral Hebrew-named stand-in. */
export function displayTeam(apiId: number, apiName: string | undefined): DisplayTeam {
  const local = apiName ? teamById(API_NAME_TO_ID[apiName] ?? '') : undefined
  if (local) return { ...local, local: true }
  const he = (apiName && API_NAME_TO_HE[apiName]) || apiName || 'קבוצה'
  return { id: `api-${apiId}`, name: he, short: he, ...NEUTRAL, local: false }
}

/** "Regular Season - 7" → "מחזור 7"; playoff rounds get their Hebrew names. */
export function roundLabelHe(round: string): string {
  const n = /(\d+)\s*$/.exec(round)?.[1] ?? ''
  if (/Championship/i.test(round)) return `פלייאוף עליון · מחזור ${n}`
  if (/Relegation/i.test(round)) return `פלייאוף תחתון · מחזור ${n}`
  return `מחזור ${n}`
}

/** Standings group names from the API → Hebrew. */
export function groupLabelHe(group: string): string {
  if (/Championship/i.test(group)) return 'פלייאוף עליון'
  if (/Relegation/i.test(group)) return 'פלייאוף תחתון'
  return 'עונה סדירה'
}
