// Ride verification (spec docs/superpowers/specs/2026-10-16-ride-verification-emergency-design.md): input schemas,
// statuses and the database's codes in the fan's words. The rules live in migration 20261016200000_ride_verification.
import { z } from 'zod'

export const VERIFY_KINDS = ['identity', 'licence'] as const
export type VerifyKind = (typeof VERIFY_KINDS)[number]
export type VerifyStatus = 'none' | 'pending' | 'approved' | 'rejected' | 'expired'

export const kindSchema = z.strictObject({ kind: z.enum(VERIFY_KINDS) })
export const sessionSchema = z.strictObject({ sessionId: z.uuid() })
export const plateSchema = z.strictObject({ plate: z.string().trim().min(1).max(20) })
export const emptySchema = z.strictObject({})

export const VERIFY_KIND_LABEL: Record<VerifyKind, string> = {
  identity: 'אימות זהות: תעודה מזהה וסריקת פנים',
  licence: 'רישיון נהיגה (לנהגים)',
}

/** Every refusal of the gates, the result RPC, the emergency RPC and the car lookup. */
const ERRORS = {
  verify_identity: 'כדי לנסוע צריך לאמת זהות: תעודה מזהה וסריקת פנים',
  verify_licence: 'כדי לנהוג בנסיעה צריך לאמת רישיון נהיגה',
  no_car: 'כדי לנהוג בנסיעה צריך לרשום רכב',
  peer_not_verified: 'האוהד עוד לא סיים אימות, ואי אפשר לאשר אותו עד שיאמת',
  verify_limit: 'ניצלת את שלושת ניסיונות האימות. כתבו לנו ב„צור קשר” ונבדוק',
  already_verified: 'כבר אימתת את זה',
  duplicate_identity: 'התעודה הזאת כבר משויכת לחשבון אחר. אם זו טעות, כתבו לנו ב„צור קשר”',
  dob_mismatch: 'תאריך הלידה בתעודה לא תואם לתאריך הלידה בחשבון. כתבו לנו ב„צור קשר” ונתקן',
  licence_too_new: 'כדי לנהוג בנסיעה צריך רישיון נהיגה של שנתיים לפחות',
  doc_expired: 'תוקף המסמך פג. אפשר לנסות שוב עם מסמך בתוקף',
  bad_fingerprint: 'לא הצלחנו לקרוא את התעודה. נסה שוב',
  not_in_ride: 'רק הנהג והנוסעים שאושרו יכולים לדווח על חירום בנסיעה',
  emergency_window: 'הכפתור פעיל מזמן היציאה ועד שעתיים אחרי המשחק. בחירום חייגו 100',
  plate_not_found: 'לא מצאנו את מספר הרכב במאגר משרד התחבורה. בדוק את המספר',
  registry_unavailable: 'מאגר משרד התחבורה לא זמין כרגע. נסה שוב בעוד כמה דקות',
  bad_plate: 'מספר רכב הוא 7 או 8 ספרות',
} as const
export type VerifyCode = keyof typeof ERRORS
export const VERIFY_ERRORS: Readonly<Record<VerifyCode, string>> = ERRORS

/** Hebrew for one code (a rejection reason), or undefined for a code we do not know (e.g. the provider's own). */
export function verifyCodeHe(code: string | null | undefined): string | undefined {
  return code && Object.hasOwn(ERRORS, code) ? ERRORS[code as VerifyCode] : undefined
}

/** The fan's words for a database or lookup code inside an error message, or null. */
export function verificationErrorHe(message: string | null | undefined): string | null {
  const m = message ?? ''
  for (const [code, he] of Object.entries(VERIFY_ERRORS)) if (m.includes(code)) return he
  return null
}

export function statusLabel(status: VerifyStatus, reason: string | null): string {
  switch (status) {
    case 'none':
      return 'עוד לא אומת'
    case 'pending':
      return 'בבדיקה'
    case 'approved':
      return 'מאומת'
    case 'expired':
      return 'פג תוקף, צריך לאמת שוב'
    case 'rejected': {
      const why = verifyCodeHe(reason)
      return why ? `נדחה: ${why}` : 'נדחה'
    }
  }
}

/** "12-345-67" → "1234567"; null unless 7 or 8 digits (spaces and dashes allowed). */
export function normalisePlate(input: string): string | null {
  const s = input.replace(/[\s-]/g, '')
  return /^[0-9]{7,8}$/.test(s) ? s : null
}

/** As on the car: 7 digits "12-345-67", 8 digits "123-45-678". */
export function formatPlate(plate: string): string {
  if (plate.length === 7) return `${plate.slice(0, 2)}-${plate.slice(2, 5)}-${plate.slice(5)}`
  if (plate.length === 8) return `${plate.slice(0, 3)}-${plate.slice(3, 5)}-${plate.slice(5)}`
  return plate
}

export const VERIFIED_BADGE = 'מאומת'
export const VERIFY_PRIVACY_NOTE =
  'האימות נעשה אצל ספק חיצוני לאימות זהות. אנחנו שומרים רק את התוצאה וטביעה מוצפנת של מספר התעודה (כדי שלא יפתחו כמה חשבונות על אותה תעודה), בלי תמונות ובלי מספר התעודה עצמו.'
export const DEMO_LABEL = 'סביבת בדיקה: האימות כאן לדוגמה בלבד (דמו), לא אימות אמיתי'
export const DEMO_BUTTON = 'אמת אותי (דמו)'
export const ROLLOUT_BANNER =
  'נסיעות פתוחות עכשיו רק לאוהדים מאומתים. עד שתאמת, ההצעות והבקשות שלך מוסתרות מאחרים ואי אפשר לאשר אותן. שום דבר לא נמחק.'
