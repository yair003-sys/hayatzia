import type { Metadata, Viewport } from 'next'
import { Heebo, Rubik } from 'next/font/google'
import { Analytics } from '@vercel/analytics/next'
import { SpeedInsights } from '@vercel/speed-insights/next'
import { EnvBanner } from '@/components/env-banner'
import { RegisterServiceWorker } from '@/features/pwa/register-sw'
import './globals.css'

const heebo = Heebo({ subsets: ['hebrew', 'latin'], variable: '--font-heebo', display: 'swap' })
const rubik = Rubik({ subsets: ['hebrew', 'latin'], variable: '--font-rubik', display: 'swap' })

export const metadata: Metadata = {
  title: { default: 'היציע', template: '%s · היציע' },
  description: 'היציע: קהילת אוהדי ליגת העל',
  applicationName: 'היציע',
  appleWebApp: { capable: true, title: 'היציע', statusBarStyle: 'black-translucent' },
  icons: { icon: '/icons/favicon-32.png', apple: '/icons/apple-touch-icon.png' },
}

export const viewport: Viewport = {
  themeColor: '#07090D',
  colorScheme: 'dark',
  viewportFit: 'cover',
  width: 'device-width',
  initialScale: 1,
}

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="he" dir="rtl" className={`${heebo.variable} ${rubik.variable}`}>
      <body className="min-h-dvh">
        <EnvBanner />
        <RegisterServiceWorker />
        {children}
        <Analytics />
        <SpeedInsights />
      </body>
    </html>
  )
}
