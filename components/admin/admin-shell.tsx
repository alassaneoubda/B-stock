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
import { BrandMonogram } from '@/components/brand-mark'

const nav = [
  { href: '/admin', label: 'Tableau de bord', icon: LayoutDashboard, exact: true },
  { href: '/admin/companies', label: 'Entreprises', icon: Building2 },
  { href: '/admin/users', label: 'Utilisateurs', icon: Users },
  { href: '/admin/plans', label: 'Plans', icon: Package },
  { href: '/admin/billing', label: 'Facturation', icon: CreditCard },
  { href: '/admin/cms', label: 'CMS landing', icon: Newspaper },
  { href: '/admin/reports', label: 'Rapports', icon: BarChart3 },
  { href: '/admin/announcements', label: 'Annonces', icon: Megaphone },
  { href: '/admin/audit', label: 'Journal d’audit', icon: ScrollText },
  { href: '/admin/webhooks', label: 'Webhooks', icon: Webhook },
  { href: '/admin/settings', label: 'Paramètres', icon: Settings },
]

function isActive(pathname: string, item: (typeof nav)[number]) {
  return item.exact ? pathname === item.href : pathname === item.href || pathname.startsWith(item.href + '/')
}

function initials(name: string) {
  return name
    .split(/[\s@.]+/)
    .filter(Boolean)
    .map((n) => n[0])
    .join('')
    .toUpperCase()
    .slice(0, 2)
}

export function AdminShell({
  adminName,
  children,
}: {
  adminName: string
  children: React.ReactNode
}) {
  const pathname = usePathname()
  const [open, setOpen] = useState(false)
  const current = nav.find((item) => isActive(pathname, item))

  return (
    <div className="min-h-screen bg-background">
      {/* Overlay (mobile) */}
      {open && (
        <div
          onClick={() => setOpen(false)}
          className="fixed inset-0 z-40 bg-foreground/30 lg:hidden"
          aria-hidden="true"
        />
      )}

      {/* Menu latéral — tiroir sur mobile, fixe sur desktop */}
      <aside
        className={cn(
          'fixed inset-y-0 left-0 z-50 flex w-64 flex-col border-r border-sidebar-border bg-sidebar transition-transform duration-200 lg:w-60 lg:translate-x-0',
          open ? 'translate-x-0' : '-translate-x-full'
        )}
        aria-label="Navigation administration"
      >
        <div className="flex h-16 items-center justify-between gap-2 px-4">
          <Link
            href="/admin"
            onClick={() => setOpen(false)}
            className="flex min-w-0 items-center gap-2.5 rounded-md outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            <BrandMonogram size={30} />
            <span className="flex min-w-0 flex-col leading-tight">
              <span className="text-[15px] font-semibold tracking-tight text-foreground">Administration</span>
              <span className="truncate text-xs text-muted-foreground">Back office B-Stock</span>
            </span>
          </Link>
          <button
            type="button"
            onClick={() => setOpen(false)}
            className="rounded-lg p-1.5 text-muted-foreground transition-colors hover:bg-accent hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring lg:hidden"
            aria-label="Fermer le menu"
          >
            <X className="h-5 w-5" aria-hidden="true" />
          </button>
        </div>

        <nav className="flex-1 space-y-0.5 overflow-y-auto px-3 pb-4 pt-2">
          {nav.map((item) => {
            const active = isActive(pathname, item)
            const Icon = item.icon
            return (
              <Link
                key={item.href}
                href={item.href}
                onClick={() => setOpen(false)}
                aria-current={active ? 'page' : undefined}
                className={cn(
                  'flex h-9 items-center gap-2.5 rounded-lg px-2.5 text-[13px] transition-colors outline-none focus-visible:ring-2 focus-visible:ring-ring',
                  active
                    ? 'bg-accent font-medium text-foreground'
                    : 'text-muted-foreground hover:bg-accent hover:text-foreground'
                )}
              >
                <Icon className={cn('h-4 w-4', active ? 'text-foreground' : 'text-muted-foreground')} aria-hidden="true" />
                {item.label}
              </Link>
            )
          })}
        </nav>

        <div className="border-t border-sidebar-border p-3">
          <div className="flex items-center gap-2.5 px-1.5 py-1.5">
            <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-primary text-xs font-semibold text-primary-foreground">
              {initials(adminName)}
            </span>
            <span className="flex min-w-0 flex-col leading-tight">
              <span className="truncate text-sm font-medium text-foreground">{adminName}</span>
              <span className="text-xs text-muted-foreground">Super-admin</span>
            </span>
          </div>
          <button
            type="button"
            onClick={() => signOut({ callbackUrl: '/admin/login' })}
            className="mt-1 flex h-9 w-full items-center gap-2.5 rounded-lg px-2.5 text-[13px] text-muted-foreground transition-colors hover:bg-destructive/10 hover:text-destructive focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            <LogOut className="h-4 w-4" aria-hidden="true" />
            Déconnexion
          </button>
        </div>
      </aside>

      <div className="flex min-h-screen min-w-0 flex-col lg:ml-60">
        {/* Barre supérieure */}
        <header className="sticky top-0 z-30 flex h-16 shrink-0 items-center gap-3 border-b border-border bg-background/85 px-4 backdrop-blur supports-[backdrop-filter]:bg-background/70 lg:px-8">
          <button
            type="button"
            onClick={() => setOpen(true)}
            className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg text-muted-foreground transition-colors hover:bg-accent hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring lg:hidden"
            aria-label="Ouvrir le menu"
            aria-expanded={open}
          >
            <Menu className="h-5 w-5" aria-hidden="true" />
          </button>
          <div className="hidden h-5 w-px bg-border sm:block lg:hidden" aria-hidden="true" />
          <div className="flex min-w-0 flex-1 flex-col">
            <p className="truncate text-xs text-muted-foreground">Administration</p>
            <p className="truncate text-[15px] font-semibold tracking-tight text-foreground">
              {current?.label ?? 'Administration'}
            </p>
          </div>
        </header>

        <div className="flex min-w-0 flex-1 flex-col">{children}</div>
      </div>
    </div>
  )
}
