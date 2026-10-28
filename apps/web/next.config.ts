import { withSentryConfig } from '@sentry/nextjs/config'
import createNextIntlPlugin from 'next-intl/plugin'
import type { NextConfig } from 'next'

// next-intl without i18n routing; the request config resolves the locale from the cookie.
const withNextIntl = createNextIntlPlugin('./src/i18n/request.ts')

const nextConfig: NextConfig = {
  // Next.js 16 rendering model: static shells from the CDN, dynamic parts streamed behind <Suspense>.
  cacheComponents: true,
  partialPrefetching: true,
  typedRoutes: true,
  reactStrictMode: true,
  poweredByHeader: false,
  // Security review 2026-10-15: no framing (clickjacking), no MIME sniffing, a strict referrer, and device features only
  // for this site. Scripts are not restricted here yet (Next's inline scripts need per-request nonces).
  async headers() {
    return [
      {
        source: '/:path*',
        headers: [
          { key: 'Content-Security-Policy', value: "frame-ancestors 'none'; base-uri 'self'; form-action 'self'; object-src 'none'" },
          { key: 'X-Frame-Options', value: 'DENY' },
          { key: 'X-Content-Type-Options', value: 'nosniff' },
          { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
          { key: 'Permissions-Policy', value: 'camera=(self), microphone=(self), geolocation=(self), interest-cohort=()' },
          { key: 'Strict-Transport-Security', value: 'max-age=63072000; includeSubDomains' },
        ],
      },
    ]
  },
}

// Sentry build wrapper. Source maps are uploaded only when the build-time secrets (SENTRY_AUTH_TOKEN + org/project) are
// present; without them this is a no-op, so dormant builds are unaffected. These are read here (the build entry), the
// one place outside env.ts that reads process.env, because next.config runs before the validated `env` is available.
export default withSentryConfig(withNextIntl(nextConfig), {
  org: process.env.SENTRY_ORG,
  project: process.env.SENTRY_PROJECT,
  authToken: process.env.SENTRY_AUTH_TOKEN,
  silent: !process.env.CI,
  widenClientFileUpload: true,
  telemetry: false,
})
