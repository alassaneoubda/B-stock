'use client'

import { useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useSession, signOut } from 'next-auth/react'
import { Button } from '@/components/ui/button'
import { LayoutDashboard, LogOut, ChevronDown, Menu, X } from 'lucide-react'

export function Header() {
  const { data: session, status } = useSession()
  const router = useRouter()
  const [userMenuOpen, setUserMenuOpen] = useState(false)
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false)

  const isLoggedIn = status === 'authenticated' && !!session

  async function handleLogout() {
    await signOut({ redirect: false })
    setUserMenuOpen(false)
    router.push('/')
    router.refresh()
  }

  return (
    <header className="fixed top-0 left-0 right-0 z-50 bg-white/80 backdrop-blur-xl border-b border-zinc-200/60">
      <nav className="mx-auto flex h-16 max-w-[1200px] items-center justify-between px-6">
        <Link href="/" className="flex items-center gap-2.5 group">
          <div className="h-8 w-8 rounded-lg bg-zinc-950 flex items-center justify-center">
            <span className="text-white text-sm font-black">B</span>
          </div>
          <span className="text-lg font-bold tracking-tight text-zinc-950">B-Stock</span>
        </Link>

        <div className="hidden md:flex md:items-center md:gap-8">
          <Link href="#features" className="text-sm font-medium text-zinc-500 hover:text-zinc-950 transition-colors">
            Fonctionnalités
          </Link>
          <Link href="#pricing" className="text-sm font-medium text-zinc-500 hover:text-zinc-950 transition-colors">
            Tarifs
          </Link>
          <Link href="#about" className="text-sm font-medium text-zinc-500 hover:text-zinc-950 transition-colors">
            À propos
          </Link>
        </div>

        <div className="flex items-center gap-3">
          {isLoggedIn ? (
            <div className="relative">
              <button
                onClick={() => setUserMenuOpen(!userMenuOpen)}
                className="flex items-center gap-2 px-3 py-2 rounded-lg hover:bg-zinc-100 transition-colors"
              >
                <div className="h-7 w-7 rounded-full bg-zinc-900 flex items-center justify-center">
                  <span className="text-white text-xs font-bold">
                    {(session.user?.name || session.user?.email || 'U').charAt(0).toUpperCase()}
                  </span>
                </div>
                <span className="hidden sm:block text-sm font-medium text-zinc-700 max-w-[120px] truncate">
                  {session.user?.name || session.user?.email}
                </span>
                <ChevronDown className="h-3.5 w-3.5 text-zinc-400" />
              </button>

              {userMenuOpen && (
                <>
                  <div className="fixed inset-0 z-40" onClick={() => setUserMenuOpen(false)} />
                  <div className="absolute right-0 mt-1 w-52 rounded-xl bg-white border border-zinc-200 shadow-lg shadow-zinc-200/50 py-1.5 z-50 animate-in fade-in slide-in-from-top-2 duration-150">
                    <Link
                      href="/dashboard"
                      onClick={() => setUserMenuOpen(false)}
                      className="flex items-center gap-2.5 px-4 py-2.5 text-sm font-medium text-zinc-700 hover:bg-zinc-50 transition-colors"
                    >
                      <LayoutDashboard className="h-4 w-4 text-zinc-400" />
                      Tableau de bord
                    </Link>
                    <div className="my-1 border-t border-zinc-100" />
                    <button
                      onClick={handleLogout}
                      className="flex items-center gap-2.5 px-4 py-2.5 text-sm font-medium text-red-600 hover:bg-red-50 transition-colors w-full text-left"
                    >
                      <LogOut className="h-4 w-4" />
                      Se déconnecter
                    </button>
                  </div>
                </>
              )}
            </div>
          ) : (
            <>
              <Link href="/login">
                <Button variant="ghost" className="text-sm font-medium text-zinc-600 hover:text-zinc-950 h-9 px-4">
                  Se connecter
                </Button>
              </Link>
              <Link href="/register">
                <Button className="h-9 px-5 rounded-lg bg-zinc-950 text-white hover:bg-zinc-800 text-sm font-semibold">
                  Créer un compte
                </Button>
              </Link>
            </>
          )}

          {/* Mobile menu toggle */}
          <button
            onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
            className="md:hidden p-2 rounded-lg hover:bg-zinc-100 transition-colors"
          >
            {mobileMenuOpen ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
          </button>
        </div>
      </nav>

      {/* Mobile menu */}
      {mobileMenuOpen && (
        <div className="md:hidden border-t border-zinc-100 bg-white/95 backdrop-blur-xl animate-in slide-in-from-top-2 duration-200">
          <div className="px-6 py-4 space-y-1">
            <Link href="#features" onClick={() => setMobileMenuOpen(false)} className="block py-2.5 text-sm font-medium text-zinc-600 hover:text-zinc-950">
              Fonctionnalités
            </Link>
            <Link href="#pricing" onClick={() => setMobileMenuOpen(false)} className="block py-2.5 text-sm font-medium text-zinc-600 hover:text-zinc-950">
              Tarifs
            </Link>
            <Link href="#about" onClick={() => setMobileMenuOpen(false)} className="block py-2.5 text-sm font-medium text-zinc-600 hover:text-zinc-950">
              À propos
            </Link>
          </div>
        </div>
      )}
    </header>
  )
}
