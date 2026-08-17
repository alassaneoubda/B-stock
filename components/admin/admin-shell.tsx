'use client'

import { useState } from 'react'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { signOut } from 'next-auth/react'
import {
  LayoutDashboard,
  Building2,
  Users,
  LogOut,
  CreditCard,
  Package,
  ScrollText,
  Webhook,
  Megaphone,
  Settings,
  BarChart3,
  Menu,
  X,
  Newspaper,
} from 'lucide-react'
import { cn } from '@/lib/utils'
import { BrandLogo } from '@/components/brand-logo'

const nav = [
  { href: '/admin', label: 'Tableau de bord', icon: LayoutDashboard, exact: true },
  { href: '/admin/companies', label: 'Entreprises', icon: Building2 },
  { href: '/admin/users', label: 'Utilisateurs', icon: Users },
  { href: '/admin/plans', label: 'Plans', icon: Package },
  { href: '/admin/billing', label: 'Facturation', icon: CreditCard },
  { href: '/admin/cms', label: 'CMS Landing', icon: Newspaper },
  { href: '/admin/reports', label: 'Rapports', icon: BarChart3 },
  { href: '/admin/announcements', label: 'Annonces', icon: Megaphone },
  { href: '/admin/audit', label: 'Journal d\u2019audit', icon: ScrollText },
  { href: '/admin/webhooks', label: 'Webhooks', icon: Webhook },
  { href: '/admin/settings', label: 'Param\u00e8tres', icon: Settings },
]

export function AdminShell({
  adminName,
  children,
}: {
  adminName: string
  children: React.ReactNode
}) {
  const pathname = usePathname()
  const [open, setOpen] = useState(false)

  return (
    <div className="min-h-screen bg-zinc-100">
      {/* Mobile top bar */}
      <header className="lg:hidden sticky top-0 z-30 flex h-14 items-center justify-between bg-zinc-950 text-white px-4">
        <div className="flex items-center gap-2.5">
          <BrandLogo href={false} height={44} />
          <span className="text-[11px] text-zinc-500">Back office</span>
        </div>
        <button
          onClick={() => setOpen(true)}
          className="rounded-lg p-2 hover:bg-white/10 transition-colors"
          aria-label="Ouvrir le menu"
        >
          <Menu className="h-5 w-5" />
        </button>
      </header>

      {/* Overlay (mobile) */}
      {open && (
        <div
          onClick={() => setOpen(false)}
          className="lg:hidden fixed inset-0 z-40 bg-zinc-950/60 backdrop-blur-sm"
        />
      )}

      {/* Sidebar — drawer on mobile, fixed on desktop */}
      <aside
        className={cn(
          'fixed inset-y-0 left-0 z-50 w-64 bg-zinc-950 text-white flex flex-col transition-transform duration-300 lg:w-60 lg:translate-x-0',
          open ? 'translate-x-0' : '-translate-x-full'
        )}
      >
        <div className="h-16 flex items-center justify-between gap-2.5 px-5 border-b border-white/10">
          <div className="flex min-w-0 flex-col gap-0.5">
            <BrandLogo href={false} height={48} />
            <p className="text-[11px] text-zinc-500 pl-0.5">Back office</p>
          </div>
          <button
            onClick={() => setOpen(false)}
            className="lg:hidden rounded-lg p-1.5 text-zinc-400 hover:bg-white/10 hover:text-white transition-colors"
            aria-label="Fermer le menu"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        <nav className="flex-1 p-3 space-y-1 overflow-y-auto">
          {nav.map((item) => {
            const active = item.exact
              ? pathname === item.href
              : pathname === item.href || pathname.startsWith(item.href + '/')
            const Icon = item.icon
            return (
              <Link
                key={item.href}
                href={item.href}
                onClick={() => setOpen(false)}
                className={cn(
                  'flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition-colors',
                  active
                    ? 'bg-white text-zinc-950'
                    : 'text-zinc-400 hover:text-white hover:bg-white/10'
                )}
              >
                <Icon className="h-4 w-4" />
                {item.label}
              </Link>
            )
          })}
        </nav>

        <div className="p-3 border-t border-white/10">
          <div className="px-3 py-2 mb-1">
            <p className="text-sm font-medium truncate">{adminName}</p>
            <p className="text-[11px] text-zinc-500">Super-admin</p>
          </div>
          <button
            onClick={() => signOut({ callbackUrl: '/admin/login' })}
            className="flex w-full items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium text-zinc-400 hover:text-white hover:bg-white/10 transition-colors"
          >
            <LogOut className="h-4 w-4" />
            Déconnexion
          </button>
        </div>
      </aside>

      <main className="lg:ml-60 min-w-0">{children}</main>
    </div>
  )
}
