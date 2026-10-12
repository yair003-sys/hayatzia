import type { Metadata, Viewport } from 'next'
import { Heebo, Inter, Rubik } from 'next/font/google'
import { Analytics } from '@vercel/analytics/next'
import { SpeedInsights } from '@vercel/speed-insights/next'
import { EnvBanner } from '@/components/env-banner'
import { RegisterServiceWorker } from '@/features/pwa/register-sw'
import './globals.css'

const heebo = Heebo({ subsets: ['hebrew', 'latin'], variable: '--font-heebo', display: 'swap' })
const rubik = Rubik({ subsets: ['hebrew', 'latin'], variable: '--font-rubik', display: 'swap' })
// The onefan wordmark (brand guide: Inter, bold). Hebrew text stays in Heebo/Rubik.
const inter = Inter({ subsets: ['latin'], weight: ['700', '800'], variable: '--font-inter', display: 'swap' })

export const metadata: Metadata = {
  title: { default: 'onefan', template: '%s · onefan' },
  description: 'onefan: קהילת אוהדי ליגת העל',
  applicationName: 'onefan',
  appleWebApp: { capable: true, title: 'onefan', statusBarStyle: 'black-translucent' },
  icons: {
    icon: [
      { url: '/icons/logo.svg', type: 'image/svg+xml' },
      { url: '/icons/favicon-32.png', sizes: '32x32', type: 'image/png' },
    ],
    apple: '/icons/apple-touch-icon.png',
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
    <html lang="he" dir="rtl" className={`${heebo.variable} ${rubik.variable} ${inter.variable}`}>
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
