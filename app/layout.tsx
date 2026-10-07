import type { Metadata, Viewport } from 'next'
import { Geist, Geist_Mono } from 'next/font/google'
import { Analytics } from '@vercel/analytics/next'
import { AuthProvider } from '@/components/providers/session-provider'
import { RegisterSW } from '@/components/pwa/register-sw'
import { InstallPrompt } from '@/components/pwa/install-prompt'
import { Toaster } from '@/components/ui/sonner'
import { auth } from '@/lib/auth'
import './globals.css'

// Police auto-hébergée par Next.js (aucune requête vers Google côté visiteur)
const geist = Geist({ subsets: ['latin'], variable: '--font-geist', display: 'swap' })
const geistMono = Geist_Mono({ subsets: ['latin'], variable: '--font-geist-mono', display: 'swap' })

const APP_NAME = 'B-Stock'
const APP_URL =
  process.env.NEXTAUTH_URL ||
  (process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : 'http://localhost:3000')

export const metadata: Metadata = {
  metadataBase: new URL(APP_URL),
  applicationName: APP_NAME,
  title: 'B-Stock - Gestion de Distribution de Boissons',
  description: 'La solution complète pour la gestion de distribution et de stock de boissons en Afrique. Gérez votre stock, vos clients, vos ventes et vos livraisons.',
  manifest: '/manifest.webmanifest',
  openGraph: {
    type: 'website',
    locale: 'fr_CI',
    siteName: APP_NAME,
    title: 'B-Stock — La gestion de distribution de boissons, enfin simple',
    description:
      'Stock, ventes, crédits clients, emballages consignés, caisse et livraisons : tout votre dépôt dans une seule application.',
    images: [{ url: '/images/landing/landing-hero-depot.jpg', width: 1536, height: 1024, alt: 'Dépôt de boissons géré avec B-Stock' }],
  },
  twitter: {
    card: 'summary_large_image',
    title: 'B-Stock — Gestion de distribution de boissons',
    description: 'Stock, ventes, crédits, consignes, caisse et livraisons dans une seule application.',
    images: ['/images/landing/landing-hero-depot.jpg'],
  },
  appleWebApp: {
    capable: true,
    statusBarStyle: 'default',
    title: APP_NAME,
  },
  formatDetection: {
    telephone: false,
  },
  icons: {
    icon: [
      { url: '/icons/favicon-32.png?v=4', sizes: '32x32', type: 'image/png' },
      { url: '/icons/icon.png?v=4', sizes: '48x48', type: 'image/png' },
      { url: '/icons/192.png?v=4', sizes: '192x192', type: 'image/png' },
      { url: '/icons/512.png?v=4', sizes: '512x512', type: 'image/png' },
    ],
    apple: [{ url: '/icons/apple-180.png?v=4', sizes: '180x180', type: 'image/png' }],
    shortcut: '/icons/favicon-32.png?v=4',
  },
}

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  viewportFit: 'cover',
  themeColor: '#F58233',
}

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode
}>) {
  return (
    <html lang="fr" className={`${geist.variable} ${geistMono.variable}`}>
      <body className="font-sans antialiased">
        {/* Pas de session sérialisée ici : les pages publiques restent cachables sans
            fuite de données ; les espaces connectés fournissent la leur (layout dashboard). */}
        <AuthProvider>
          {children}
          {/* Notifications globales (aucun Toaster n'était monté : les toasts ne s'affichaient jamais) */}
          <Toaster position="top-center" theme="light" richColors closeButton />
          <RegisterSW />
          <InstallPrompt />
          <Analytics />
        </AuthProvider>
      </body>
    </html>
  )
}
