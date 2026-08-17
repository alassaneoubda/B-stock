import type { Metadata, Viewport } from 'next'
import { Analytics } from '@vercel/analytics/next'
import { AuthProvider } from '@/components/providers/session-provider'
import { RegisterSW } from '@/components/pwa/register-sw'
import { InstallPrompt } from '@/components/pwa/install-prompt'
import { auth } from '@/lib/auth'
import './globals.css'

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

export default async function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode
}>) {
  let session = null
  try {
    session = await auth()
  } catch {
    session = null
  }

  return (
    <html lang="fr">
      <body className="font-sans antialiased">
        <AuthProvider session={session}>
          {children}
          <RegisterSW />
          <InstallPrompt />
          <Analytics />
        </AuthProvider>
      </body>
    </html>
  )
}
