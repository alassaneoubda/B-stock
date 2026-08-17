import type { MetadataRoute } from 'next'

export const dynamic = 'force-static'

export default function manifest(): MetadataRoute.Manifest {
  return {
    id: '/',
    name: 'B-Stock — Gestion de Distribution de Boissons',
    short_name: 'B-Stock',
    description:
      'La solution complète pour la gestion de distribution et de stock de boissons en Afrique. Stock, clients, ventes et livraisons.',
    start_url: '/dashboard',
    scope: '/',
    display: 'standalone',
    orientation: 'portrait-primary',
    background_color: '#ffffff',
    theme_color: '#F58233',
    lang: 'fr',
    dir: 'ltr',
    categories: ['business', 'productivity', 'finance'],
    icons: [
      { src: '/icons/192.png', sizes: '192x192', type: 'image/png', purpose: 'any' },
      { src: '/icons/512.png', sizes: '512x512', type: 'image/png', purpose: 'any' },
      { src: '/icons/maskable-192.png', sizes: '192x192', type: 'image/png', purpose: 'maskable' },
      { src: '/icons/maskable-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
    ],
    shortcuts: [
      {
        name: 'Tableau de bord',
        short_name: 'Dashboard',
        url: '/dashboard',
        icons: [{ src: '/icons/192.png', sizes: '192x192', type: 'image/png' }],
      },
      {
        name: 'Stock',
        short_name: 'Stock',
        url: '/dashboard/stock',
        icons: [{ src: '/icons/192.png', sizes: '192x192', type: 'image/png' }],
      },
    ],
  }
}
