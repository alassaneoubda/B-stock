'use client'

import { useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useSession, signOut } from 'next-auth/react'
import { Button } from '@/components/ui/button'
import { LayoutDashboard, LogOut, ChevronDown, Menu, X } from 'lucide-react'
import { useAuthModal } from '@/components/auth/auth-modal'
import { BrandLogo } from '@/components/brand-logo'
import type { CmsNavLink } from '@/lib/cms'

export function LandingHeader({
  links,
  platformName,
}: {
  links: CmsNavLink[]
  platformName: string
}) {
  const { data: session, status } = useSession()
  const router = useRouter()
  const { open } = useAuthModal()
  const [userMenuOpen, setUserMenuOpen] = useState(false)
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false)
  const isLoggedIn = status === 'authenticated' && !!session

  async function handleLogout() {
    await signOut({ redirect: false })
    setUserMenuOpen(false)
    router.push('/')
    router.refresh()
  }

  const nav = links.length
    ? links
    : [
        { id: '1', label: 'Fonctionnalités', href: '#features', location: 'header', sort_order: 1 },
        { id: '2', label: 'Solutions', href: '#solutions', location: 'header', sort_order: 2 },
        { id: '3', label: 'Tarifs', href: '#pricing', location: 'header', sort_order: 3 },
        { id: '4', label: 'À propos', href: '/a-propos', location: 'header', sort_order: 4 },
      ]

  return (
    <header className="absolute top-0 left-0 right-0 z-50">
      <nav className="mx-auto flex h-24 max-w-[1180px] items-center justify-between px-6 lg:h-28">
        <BrandLogo href="/" height={88} priority />

        <div className="hidden items-center gap-8 md:flex">
          {nav.map((l) => (
            <Link
              key={l.id}
              href={l.href}
              className="text-sm font-medium text-white/85 transition-colors hover:text-white"
            >
              {l.label}
            </Link>
          ))}
        </div>

        <div className="flex items-center gap-2 sm:gap-3">
          {isLoggedIn ? (
            <div className="relative">
              <button
                onClick={() => setUserMenuOpen(!userMenuOpen)}
                className="flex items-center gap-2 rounded-full bg-white/15 px-3 py-1.5 text-white backdrop-blur"
              >
                <span className="text-sm font-medium max-w-[100px] truncate">
                  {session.user?.name || 'Compte'}
                </span>
                <ChevronDown className="h-3.5 w-3.5" />
              </button>
              {userMenuOpen && (
                <>
                  <div className="fixed inset-0 z-40" onClick={() => setUserMenuOpen(false)} />
                  <div className="absolute right-0 z-50 mt-2 w-48 rounded-2xl bg-white py-2 shadow-xl">
                    <Link
                      href="/dashboard"
                      className="flex items-center gap-2 px-4 py-2.5 text-sm text-zinc-700 hover:bg-zinc-50"
                      onClick={() => setUserMenuOpen(false)}
                    >
                      <LayoutDashboard className="h-4 w-4" /> Tableau de bord
                    </Link>
                    <button
                      onClick={handleLogout}
                      className="flex w-full items-center gap-2 px-4 py-2.5 text-sm text-red-600 hover:bg-red-50"
                    >
                      <LogOut className="h-4 w-4" /> Se déconnecter
                    </button>
                  </div>
                </>
              )}
            </div>
          ) : (
            <>
              <Button
                variant="ghost"
                onClick={() => open('login')}
                className="hidden h-10 text-white hover:bg-white/10 hover:text-white sm:inline-flex"
              >
                Se connecter
              </Button>
              <Button
                onClick={() => open('register')}
                className="h-10 rounded-full bg-[#2563EB] px-5 text-sm font-semibold text-white hover:bg-[#1D4ED8]"
              >
                Commencer gratuitement
              </Button>
            </>
          )}
          <button
            className="rounded-lg p-2 text-white md:hidden"
            onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
            aria-label="Menu"
          >
            {mobileMenuOpen ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
          </button>
        </div>
      </nav>

      {mobileMenuOpen && (
        <div className="border-t border-white/10 bg-[#0F172A]/95 px-6 py-4 backdrop-blur md:hidden">
          {nav.map((l) => (
            <Link
              key={l.id}
              href={l.href}
              onClick={() => setMobileMenuOpen(false)}
              className="block py-2.5 text-sm text-white/90"
            >
              {l.label}
            </Link>
          ))}
        </div>
      )}
    </header>
  )
}
