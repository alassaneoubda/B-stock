'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { LayoutDashboard, ShoppingCart, Package, Menu, Plus } from 'lucide-react'
import { useSidebar } from '@/components/ui/sidebar'
import { canAccessPath } from '@/lib/route-permissions'

const navItems = [
  { title: 'Accueil', href: '/dashboard', icon: LayoutDashboard, exact: true },
  { title: 'Ventes', href: '/dashboard/sales', icon: ShoppingCart },
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
  // Bouton « Nouvelle vente » exactement au centre : autant d'emplacements à gauche qu'à droite
  // (« Plus » compte comme un emplacement ; des cases vides compensent les droits manquants).
  const slots: Array<(typeof navItems)[number] | 'more' | null> = [...items, 'more']
  const half = Math.ceil(slots.length / 2)
  const left = slots.slice(0, half)
  const right = slots.slice(half)
  while (right.length < left.length) right.push(null)

  const renderSlot = (slot: (typeof navItems)[number] | 'more' | null, index: number) => {
    if (slot === null) return <span key={`empty-${index}`} aria-hidden="true" />
    if (slot === 'more') {
      return (
        <button
          key="more"
          type="button"
          onClick={toggleSidebar}
          aria-label="Ouvrir le menu complet"
          className="flex min-h-12 flex-col items-center justify-center gap-0.5 rounded-lg py-2 text-muted-foreground transition-colors active:text-foreground"
        >
          <Menu className="h-5 w-5" aria-hidden="true" />
          <span className="text-[11px] font-medium">Plus</span>
        </button>
      )
    }
    const item = slot
    const active = isActive(pathname, item.href, item.exact)
    return (
      <Link
        key={item.href}
        href={item.href}
        aria-current={active ? 'page' : undefined}
        className={`flex min-h-12 flex-col items-center justify-center gap-0.5 rounded-lg py-2 transition-colors ${
          active ? 'text-brand-strong' : 'text-muted-foreground active:text-foreground'
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
      className="fixed bottom-0 left-0 right-0 z-50 border-t border-border bg-card pb-[env(safe-area-inset-bottom)] md:hidden"
    >
      <div
        className="grid h-16 items-center px-2"
        style={{ gridTemplateColumns: `repeat(${left.length + right.length + (canSell ? 1 : 0)}, minmax(0, 1fr))` }}
      >
        {left.map(renderSlot)}
        {canSell && (
          <div className="flex justify-center">
            <Link
              href="/dashboard/sales/new"
              aria-label="Nouvelle vente"
              className="flex h-12 w-12 items-center justify-center rounded-full bg-primary text-white shadow-md transition-transform active:scale-95"
            >
              <Plus className="h-6 w-6" aria-hidden="true" />
            </Link>
          </div>
        )}
        {right.map((slot, i) => renderSlot(slot, i + left.length))}
      </div>
    </nav>
  )
}
