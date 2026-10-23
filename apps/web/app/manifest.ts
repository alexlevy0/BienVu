import type { MetadataRoute } from 'next';
export default function manifest(): MetadataRoute.Manifest {
  return {
    id: '/',
    name: 'BienVu — Studio immobilier',
    short_name: 'BienVu',
    lang: 'fr',
    start_url: '/',
    scope: '/',
    display: 'standalone',
    background_color: '#faf9f6',
    theme_color: '#e1e9da',
    icons: [
      { src: '/notifications/icon-192.png', sizes: '192x192', type: 'image/png' },
      { src: '/notifications/icon-512.png', sizes: '512x512', type: 'image/png' },
    ],
  };
}
