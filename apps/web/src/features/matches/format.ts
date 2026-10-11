// Israel time, Hebrew. Pure formatters (no "now"), safe in cached server components.
const TZ = 'Asia/Jerusalem'
const dayFmt = new Intl.DateTimeFormat('he-IL', { timeZone: TZ, weekday: 'short', day: 'numeric', month: 'numeric' })
const timeFmt = new Intl.DateTimeFormat('he-IL', { timeZone: TZ, hour: '2-digit', minute: '2-digit', hour12: false })

export function kickoffDay(unixSeconds: number): string {
  return dayFmt.format(new Date(unixSeconds * 1000))
}

export function kickoffTime(unixSeconds: number): string {
  return timeFmt.format(new Date(unixSeconds * 1000))
}
