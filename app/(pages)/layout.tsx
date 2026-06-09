import { Header } from '@/components/landing/header'
import { Footer } from '@/components/landing/footer'
import { AuthModalProvider } from '@/components/auth/auth-modal'

export default function PagesLayout({ children }: { children: React.ReactNode }) {
  return (
    <AuthModalProvider>
      <div className="min-h-screen bg-white flex flex-col">
        <Header />
        <main className="flex-1 pt-16">{children}</main>
        <Footer />
      </div>
    </AuthModalProvider>
  )
}
