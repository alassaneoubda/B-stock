'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { LayoutDashboard, ShoppingCart, Package, Wallet, Menu, Plus } from 'lucide-react'
import { useSidebar } from '@/components/ui/sidebar'
import { canAccessPath } from '@/lib/route-permissions'

const navItems = [
  { title: 'Accueil', href: '/dashboard', icon: LayoutDashboard, exact: true },
  { title: 'Ventes', href: '/dashboard/sales', icon: ShoppingCart },
  { title: 'Caisse', href: '/dashboard/cash', icon: Wallet },
  { title: 'Stock', href: '/dashboard/stock', icon: Package },
]

function isActive(pathname: string, href: string, exact?: boolean) {
  if (exact) return pathname === href
  return pathname === href || pathname.startsWith(href + '/')
}

export function MobileBottomNav({ permissions = [] }: { permissions?: string[] }) {
  const pathname = usePathname()
  const { toggleSidebar } = useSidebar()

  const items = navItems.filter((item) => canAccessPath(item.href, permissions))
  const canSell = permissions.includes('*') || permissions.includes('sales.write')
  // Bouton « Nouvelle vente » au centre : l'action la plus fréquente d'un caissier
  const left = items.slice(0, Math.ceil(items.length / 2))
  const right = items.slice(Math.ceil(items.length / 2))

  const renderItem = (item: (typeof navItems)[number]) => {
    const active = isActive(pathname, item.href, item.exact)
    return (
      <Link
        key={item.href}
        href={item.href}
        aria-current={active ? 'page' : undefined}
        className={`flex min-h-12 flex-1 flex-col items-center justify-center gap-0.5 rounded-lg py-2 transition-colors ${
          active ? 'text-blue-600' : 'text-zinc-500 active:text-zinc-800'
        }`}
      >
        <item.icon className="h-5 w-5" aria-hidden="true" />
        <span className="text-[11px] font-medium">{item.title}</span>
      </Link>
    )
  }

  return (
    <nav
      data-mobile-bottom-nav
      aria-label="Navigation principale"
      className="fixed bottom-0 left-0 right-0 z-50 border-t border-zinc-200 bg-white pb-[env(safe-area-inset-bottom)] md:hidden"
    >
      <div className="flex h-16 items-center justify-around px-2">
        {left.map(renderItem)}
        {canSell && (
          <Link
            href="/dashboard/sales/new"
            aria-label="Nouvelle vente"
            className="mx-1 flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-blue-600 text-white shadow-md active:scale-95 transition-transform"
          >
            <Plus className="h-6 w-6" aria-hidden="true" />
          </Link>
        )}
        {right.map(renderItem)}
        <button
          type="button"
          onClick={toggleSidebar}
          aria-label="Ouvrir le menu complet"
          className="flex min-h-12 flex-1 flex-col items-center justify-center gap-0.5 rounded-lg py-2 text-zinc-500 transition-colors active:text-zinc-800"
        >
          <Menu className="h-5 w-5" aria-hidden="true" />
          <span className="text-[11px] font-medium">Plus</span>
        </button>
      </div>
    </nav>
  )
}
