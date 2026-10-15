import type { NextConfig } from 'next'

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

export default nextConfig
