import type { NextConfig } from 'next'

const nextConfig: NextConfig = {
  // Next.js 16 rendering model: static shells from the CDN, dynamic parts streamed behind <Suspense>.
  cacheComponents: true,
  partialPrefetching: true,
  typedRoutes: true,
  reactStrictMode: true,
  poweredByHeader: false,
}

export default nextConfig
