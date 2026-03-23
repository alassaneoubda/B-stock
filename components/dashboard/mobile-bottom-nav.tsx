'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import {
  LayoutDashboard,
  ShoppingCart,
  Package,
  FileText,
  Menu,
} from 'lucide-react'
import { useSidebar } from '@/components/ui/sidebar'

const navItems = [
  { title: 'Accueil', href: '/dashboard', icon: LayoutDashboard, exact: true },
  { title: 'Ventes', href: '/dashboard/sales', icon: ShoppingCart },
  { title: 'Stock', href: '/dashboard/stock', icon: Package },
  { title: 'Factures', href: '/dashboard/invoices', icon: FileText },
]

function isActive(pathname: string, href: string, exact?: boolean) {
  if (exact) return pathname === href
  return pathname === href || pathname.startsWith(href + '/')
}

export function MobileBottomNav() {
  const pathname = usePathname()
  const { toggleSidebar } = useSidebar()

  return (
    <nav className="fixed bottom-0 left-0 right-0 z-50 bg-white border-t border-zinc-200 md:hidden">
      <div className="flex items-center justify-around h-16 px-2 safe-area-bottom">
        {navItems.map((item) => {
          const active = isActive(pathname, item.href, item.exact)
          return (
            <Link
              key={item.href}
              href={item.href}
              className={`flex flex-col items-center justify-center gap-0.5 flex-1 py-2 rounded-lg transition-colors ${
                active
                  ? 'text-blue-600'
                  : 'text-zinc-400 active:text-zinc-600'
              }`}
            >
              <item.icon className={`h-5 w-5 ${active ? 'text-blue-600' : ''}`} />
              <span className={`text-[10px] font-medium ${active ? 'text-blue-600' : ''}`}>
                {item.title}
              </span>
            </Link>
          )
        })}
        <button
          onClick={toggleSidebar}
          className="flex flex-col items-center justify-center gap-0.5 flex-1 py-2 rounded-lg text-zinc-400 active:text-zinc-600 transition-colors"
        >
          <Menu className="h-5 w-5" />
          <span className="text-[10px] font-medium">Plus</span>
        </button>
      </div>
    </nav>
  )
}
