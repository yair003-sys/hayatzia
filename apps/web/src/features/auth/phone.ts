// Israeli mobile numbers: what fans type → E.164 ("+9725XXXXXXXX"), or null when it is not a mobile number.
export function toE164Israel(input: string): string | null {
  const digits = input.replace(/[^\d+]/g, '')
  let local: string
  if (digits.startsWith('+972')) local = digits.slice(4)
  else if (digits.startsWith('972')) local = digits.slice(3)
  else if (digits.startsWith('0')) local = digits.slice(1)
  else local = digits
  return /^5\d{8}$/.test(local) ? `+972${local}` : null
}

export const OTP_LENGTH = 6

/** Browsers inside Instagram, Facebook, TikTok… are blocked by Google sign-in (same list as the legacy app). */
export function isInAppBrowser(userAgent: string): boolean {
  return /FBAN|FBAV|FB_IAB|Instagram|TikTok|musical_ly|BytedanceWebview|LinkedInApp|Line\/|Snapchat/i.test(userAgent)
}
