import type { MetadataRoute } from 'next'

// Installable app (Add to Home Screen). https://nextjs.org/docs/app/guides/progressive-web-apps
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: 'onefan',
    short_name: 'onefan',
    description: 'קהילת אוהדי ליגת העל',
    lang: 'he',
    dir: 'rtl',
    start_url: '/stand',
    scope: '/',
    display: 'standalone',
    orientation: 'portrait',
    background_color: '#0A0E1A',
    theme_color: '#0A0E1A',
    icons: [
      { src: '/icons/icon-192.png?v=onefan', sizes: '192x192', type: 'image/png' },
      { src: '/icons/icon-512.png?v=onefan', sizes: '512x512', type: 'image/png' },
      { src: '/icons/maskable-512.png?v=onefan', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
    ],
  }
}
