import type { Metadata, Viewport } from 'next'
import { Heebo, Inter } from 'next/font/google'
import { Analytics } from '@vercel/analytics/next'
import { SpeedInsights } from '@vercel/speed-insights/next'
import { EnvBanner, shouldShowEnvBanner } from '@/components/env-banner'
import { OverflowGuard } from '@/components/overflow-guard'
import { env } from '@/lib/env'
import { RegisterServiceWorker } from '@/features/pwa/register-sw'
import './globals.css'

const heebo = Heebo({ subsets: ['hebrew', 'latin'], weight: ['300', '400', '500', '600', '700'], variable: '--font-heebo', display: 'swap' })
// The onefan wordmark and numbers (brand guide: Inter). Hebrew text is Heebo.
const inter = Inter({ subsets: ['latin'], weight: ['500', '600', '700', '800'], variable: '--font-inter', display: 'swap' })

export const metadata: Metadata = {
  title: { default: 'onefan', template: '%s · onefan' },
  description: 'onefan: קהילת אוהדי ליגת העל',
  applicationName: 'onefan',
  appleWebApp: { capable: true, title: 'onefan', statusBarStyle: 'black-translucent' },
  icons: {
    icon: [
      { url: '/icons/logo.svg?v=onefan', type: 'image/svg+xml' },
      { url: '/icons/favicon-32.png?v=onefan', sizes: '32x32', type: 'image/png' },
    ],
    apple: '/icons/apple-touch-icon.png?v=onefan',
  },
}

export const viewport: Viewport = {
  themeColor: '#0A0E1A',
  colorScheme: 'dark',
  viewportFit: 'cover',
  width: 'device-width',
  initialScale: 1,
}

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="he" dir="rtl" className={`${heebo.variable} ${inter.variable}`}>
      <body className="min-h-dvh">
        <EnvBanner />
        {shouldShowEnvBanner(env.NEXT_PUBLIC_APP_ENV) && <OverflowGuard />}
        <RegisterServiceWorker />
        {children}
        <Analytics />
        <SpeedInsights />
      </body>
    </html>
  )
}
