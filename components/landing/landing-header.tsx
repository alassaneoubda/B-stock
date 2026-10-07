'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useSession, signOut } from 'next-auth/react'
import { ChevronDown, LayoutDashboard, LogOut, Menu, X } from 'lucide-react'
import { Button } from '@/components/ui/button'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { useAuthModal } from '@/components/auth/auth-modal'
import { BrandLogo } from '@/components/brand-logo'
import { cn } from '@/lib/utils'
import type { CmsNavLink } from '@/lib/cms'

const DEFAULT_NAV: CmsNavLink[] = [
  { id: '1', label: 'Fonctionnalités', href: '#features', location: 'header', sort_order: 1 },
  { id: '2', label: 'Point de vente', href: '#pos', location: 'header', sort_order: 2 },
  { id: '3', label: 'Tarifs', href: '#pricing', location: 'header', sort_order: 3 },
  { id: '4', label: 'Questions', href: '#faq', location: 'header', sort_order: 4 },
]

export function LandingHeader({ links }: { links: CmsNavLink[]; platformName?: string }) {
  const { data: session, status } = useSession()
  const router = useRouter()
  const { open } = useAuthModal()
  const [scrolled, setScrolled] = useState(false)
  const [mobileOpen, setMobileOpen] = useState(false)
  const isLoggedIn = status === 'authenticated' && !!session
  const nav = links.length ? links : DEFAULT_NAV

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 8)
    onScroll()
    window.addEventListener('scroll', onScroll, { passive: true })
    return () => window.removeEventListener('scroll', onScroll)
  }, [])

  async function logout() {
    await signOut({ redirect: false })
    router.refresh()
  }

  return (
    <header
      className={cn(
        'sticky top-0 z-50 transition-[background-color,border-color,box-shadow] duration-200',
        scrolled || mobileOpen
          ? 'border-b border-border bg-background/85 backdrop-blur supports-[backdrop-filter]:bg-background/70'
          : 'border-b border-transparent bg-transparent'
      )}
    >
      <nav className="mx-auto flex h-16 max-w-[1200px] items-center justify-between gap-6 px-5 sm:px-8" aria-label="Navigation principale">
        <BrandLogo href="/" height={44} priority />

        <div className="hidden items-center gap-1 md:flex">
          {nav.map((l) => (
            <Link
              key={l.id}
              href={l.href}
              className="rounded-lg px-3 py-2 text-sm font-medium text-muted-foreground transition-colors hover:text-foreground"
            >
              {l.label}
            </Link>
          ))}
        </div>

        <div className="flex items-center gap-2">
          {isLoggedIn ? (
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="outline" className="gap-2">
                  <span className="max-w-[120px] truncate">{session.user?.name || 'Mon compte'}</span>
                  <ChevronDown aria-hidden="true" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-52">
                <DropdownMenuItem asChild>
                  <Link href="/dashboard">
                    <LayoutDashboard aria-hidden="true" /> Tableau de bord
                  </Link>
                </DropdownMenuItem>
                <DropdownMenuSeparator />
                <DropdownMenuItem variant="destructive" onClick={logout}>
                  <LogOut aria-hidden="true" /> Se déconnecter
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          ) : (
            <>
              <Button variant="ghost" onClick={() => open('login')} className="hidden sm:inline-flex">
                Se connecter
              </Button>
              <Button variant="brand" onClick={() => open('register')}>
                Essai gratuit
              </Button>
            </>
          )}
          <Button
            variant="ghost"
            size="icon"
            className="md:hidden"
            onClick={() => setMobileOpen((v) => !v)}
            aria-label={mobileOpen ? 'Fermer le menu' : 'Ouvrir le menu'}
            aria-expanded={mobileOpen}
          >
            {mobileOpen ? <X /> : <Menu />}
          </Button>
        </div>
      </nav>

      {mobileOpen && (
        <div className="border-t border-border px-5 pb-5 pt-2 md:hidden">
          {nav.map((l) => (
            <Link
              key={l.id}
              href={l.href}
              onClick={() => setMobileOpen(false)}
              className="block rounded-lg px-3 py-3 text-base font-medium text-foreground hover:bg-accent"
            >
              {l.label}
            </Link>
          ))}
          {!isLoggedIn && (
            <Button
              variant="outline"
              className="mt-3 w-full"
              onClick={() => {
                setMobileOpen(false)
                open('login')
              }}
            >
              Se connecter
            </Button>
          )}
        </div>
      )}
    </header>
  )
}
