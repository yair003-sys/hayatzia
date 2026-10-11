import { env, type AppEnv } from '@/lib/env'

/** True everywhere except production: fans must never mistake a test build for the real app. */
export function shouldShowEnvBanner(appEnv: AppEnv): boolean {
  return appEnv !== 'production'
}

const LABEL: Record<AppEnv, string> = {
  local: 'סביבת בדיקות מקומית · לא פרודקשן',
  preview: 'סביבת בדיקות · לא האתר האמיתי',
  production: '',
}

export function EnvBanner() {
  const appEnv = env.NEXT_PUBLIC_APP_ENV
  if (!shouldShowEnvBanner(appEnv)) return null
  return (
    <div
      role="status"
      className="pointer-events-none fixed inset-x-0 top-0 z-50 bg-warn py-0.5 text-center text-xs font-bold text-black"
    >
      {LABEL[appEnv]}
    </div>
  )
}
