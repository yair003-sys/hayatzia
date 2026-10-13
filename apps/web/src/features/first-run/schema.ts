// First-run intro (owner, 2026-10-13): logo for 2 seconds, a welcome, then five pages that turn like a cube.
// Pure helpers: the page copy and the geometry of the turn. Hebrew reads right to left, so the next page
// waits on the LEFT and you drag it in toward the right.

export const INTRO_SEEN_KEY = 'onefan:intro:v1'
export const SPLASH_MS = 2000

export type IntroPage = { id: 'home' | 'rival' | 'reels' | 'rating' | 'rides'; kicker: string; title: string; body: string }

export const INTRO_PAGES: readonly IntroPage[] = [
  { id: 'home', kicker: 'הקבוצה שלך', title: 'כאן אתה בבית', body: 'קהילה סגורה רק לאוהדי הקבוצה שלך. כל אוהד מאומת, אין אורחים.' },
  { id: 'rival', kicker: 'חדר המשחק', title: 'פנים מול פנים עם היריבה', body: 'צ׳אט ישיר בין אוהדי שתי הקבוצות, בזמן המשחק. מי שצועק חזק יותר מנצח.' },
  { id: 'reels', kicker: 'רילס', title: 'כל הליגה במסך אחד', body: 'הרגעים של כל האוהדים בארץ, מכל היציעים. או רק של הקבוצה שלך.' },
  { id: 'rating', kicker: 'הציון שלך', title: 'אתה נותן את הציון', body: 'דרג כל שחקן אחרי המשחק. ככה האוהדים באמת חושבים, בלי פרשנים.' },
  { id: 'rides', kicker: 'נוסעים ביחד', title: 'לאף משחק לא נוסעים לבד', body: 'מצא טרמפ למשחק החוץ, או מלא את האוטו באוהדים. ובאצטדיון סמן ״הייתי שם״.' },
]

const TURN_DEG = 75
const round = (n: number) => Math.round(n * 1000) / 1000

export type SlideFrame = { transform: string; origin: string; opacity: number; brightness: number; z: number; visible: boolean }

/** Where page `i` sits when the tour is at position `pos` (0 = first page, fractions mid-turn). */
export function slideFrame(i: number, pos: number, width: number): SlideFrame {
  const d = i - pos
  const a = Math.max(-1, Math.min(1, d))
  const far = Math.abs(d)
  return {
    transform: `translateX(${round(-a * width) || 0}px) rotateY(${round(a * TURN_DEG) || 0}deg)`,
    origin: d > 0 ? 'right center' : 'left center',
    opacity: far >= 1 ? 0 : round(1 - far * 0.35),
    brightness: round(1 - Math.min(1, far) * 0.45),
    z: 10 - Math.round(far * 5),
    visible: far <= 1.01,
  }
}

/** The green pill's distance from the right edge of the dots (8px dots, 10px apart). */
export function pillRight(pos: number): number {
  return round(pos * 18 - 8)
}

/** Position while dragging: dragging right moves forward; past either end it resists. */
export function dragPosition(start: number, dx: number, width: number, n: number): number {
  const p = start + dx / width
  if (p < 0) return p * 0.3
  if (p > n - 1) return n - 1 + (p - (n - 1)) * 0.3
  return p
}

/** Where the tour settles when the finger lets go; a quick flick (px/ms) turns one page. */
export function snapTarget(pos: number, start: number, velocity: number, n: number): number {
  let t = Math.round(pos)
  if (Math.abs(velocity) > 0.4) t = velocity > 0 ? Math.floor(start) + 1 : Math.ceil(start) - 1
  return Math.max(0, Math.min(n - 1, t))
}
