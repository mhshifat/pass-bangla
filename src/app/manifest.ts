import type { MetadataRoute } from 'next'

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: 'PassBangla - Secure Password Manager',
    short_name: 'PassBangla',
    description: 'Enterprise password management solution with secure encryption',
    start_url: '/',
    display: 'standalone',
    background_color: '#ffffff',
    theme_color: '#1a1a1a',
    orientation: 'portrait-primary',
    icons: [
      {
        src: '/icon-192.png',
        sizes: '192x192',
        type: 'image/png',
        purpose: 'any',
      },
      {
        src: '/icon-192.png',
        sizes: '192x192',
        type: 'image/png',
        purpose: 'maskable',
      },
      {
        src: '/icon-512.png',
        sizes: '512x512',
        type: 'image/png',
        purpose: 'any',
      },
      {
        src: '/icon-512.png',
        sizes: '512x512',
        type: 'image/png',
        purpose: 'maskable',
      },
    ],
    categories: ['security', 'productivity', 'utilities'],
    screenshots: [],
    shortcuts: [
      {
        name: 'Passwords',
        short_name: 'Passwords',
        description: 'View all passwords',
        url: '/admin/passwords',
        icons: [{ src: '/icon-192.png', sizes: '192x192' }],
      },
      {
        name: 'Dashboard',
        short_name: 'Dashboard',
        description: 'View dashboard',
        url: '/admin',
        icons: [{ src: '/icon-192.png', sizes: '192x192' }],
      },
    ],
  }
}

