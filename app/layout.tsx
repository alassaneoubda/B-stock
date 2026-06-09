import type { Metadata, Viewport } from 'next'
import { Geist, Geist_Mono } from 'next/font/google'
import { Analytics } from '@vercel/analytics/next'
import { AuthProvider } from '@/components/providers/session-provider'
import { RegisterSW } from '@/components/pwa/register-sw'
import { InstallPrompt } from '@/components/pwa/install-prompt'
import './globals.css'

const _geist = Geist({ subsets: ["latin"] });
const _geistMono = Geist_Mono({ subsets: ["latin"] });

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
      { url: '/icons/192.png', sizes: '192x192', type: 'image/png' },
      { url: '/icons/512.png', sizes: '512x512', type: 'image/png' },
    ],
    apple: [{ url: '/icons/apple-180.png', sizes: '180x180', type: 'image/png' }],
  },
}

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  viewportFit: 'cover',
  themeColor: '#ffffff',
}

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode
}>) {
  return (
    <html lang="fr">
      <body className="font-sans antialiased">
        <AuthProvider>
          {children}
        </AuthProvider>
        <RegisterSW />
        <InstallPrompt />
        <Analytics />
      </body>
    </html>
  )
}
