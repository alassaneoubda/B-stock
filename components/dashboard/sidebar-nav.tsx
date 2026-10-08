'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { signOut, useSession } from 'next-auth/react'
import {
  ArrowLeftRight,
  BarChart3,
  Bell,
  BoxesIcon,
  Building2,
  Calculator,
  Car,
  ChevronDown,
  ChevronsUpDown,
  ClipboardCheck,
  ClipboardList,
  CreditCard,
  FileSearch,
  FileText,
  KeyRound,
  LayoutDashboard,
  LogOut,
  MonitorSmartphone,
  Smartphone,
  Package,
  PackageSearch,
  RotateCcw,
  Settings,
  ShieldCheck,
  ShoppingCart,
  Sparkles,
  Tag,
  TrendingUp,
  Truck,
  UserCircle,
  UserCog,
  Users,
  Wallet,
  Warehouse,
  AlertTriangle,
  type LucideIcon,
} from 'lucide-react'
import { BrandMark, BrandMonogram } from '@/components/brand-mark'
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupContent,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  useSidebar,
} from '@/components/ui/sidebar'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { ROLE_LABELS } from '@/lib/permissions'
import { canAccessPath } from '@/lib/route-permissions'
import { cn } from '@/lib/utils'
import type { UserRole } from '@/lib/types'

type NavItem = { title: string; href: string; icon: LucideIcon; exact?: boolean }
type NavSection = { id: string; title: string; items: NavItem[] }

/** Architecture de l'information : 6 sections métier, dans l'ordre d'usage. */
const SECTIONS: NavSection[] = [
  {
    id: 'vente',
    title: 'Vente',
    items: [
      { title: 'Ventes', href: '/dashboard/sales', icon: ShoppingCart },
      { title: 'Clients', href: '/dashboard/clients', icon: Users },
      { title: 'Crédits clients', href: '/dashboard/credits', icon: CreditCard },
      { title: 'Mobile Money', href: '/dashboard/mobile-money', icon: Smartphone },
      { title: 'Factures', href: '/dashboard/invoices', icon: FileText },
      { title: 'Retours', href: '/dashboard/returns', icon: RotateCcw },
    ],
  },
  {
    id: 'caisse',
    title: 'Caisse',
    items: [
      { title: 'Caisse du jour', href: '/dashboard/cash', icon: Wallet, exact: true },
      { title: 'Validation caisse', href: '/dashboard/cash/validation', icon: ShieldCheck },
      { title: 'Tarifs & promotions', href: '/dashboard/pricing', icon: Tag },
    ],
  },
  {
    id: 'stock',
    title: 'Stock',
    items: [
      { title: 'Produits', href: '/dashboard/products', icon: Package },
      { title: 'Stock', href: '/dashboard/stock', icon: Warehouse },
      { title: 'Emballages', href: '/dashboard/packaging', icon: BoxesIcon },
      { title: 'Inventaires', href: '/dashboard/inventory', icon: ClipboardCheck },
      { title: 'Transferts', href: '/dashboard/transfers', icon: ArrowLeftRight },
      { title: 'Casse & pertes', href: '/dashboard/breakage', icon: AlertTriangle },
    ],
  },
  {
    id: 'achats',
    title: 'Achats & logistique',
    items: [
      { title: 'Approvisionnement', href: '/dashboard/procurement', icon: ClipboardList },
      { title: 'À commander', href: '/dashboard/procurement/suggestions', icon: ShoppingCart },
      { title: 'Fournisseurs', href: '/dashboard/suppliers', icon: PackageSearch },
      { title: 'Dettes fournisseurs', href: '/dashboard/suppliers/payables', icon: Wallet },
      { title: 'Livraisons', href: '/dashboard/deliveries', icon: Truck },
      { title: 'Véhicules', href: '/dashboard/vehicles', icon: Car },
      { title: 'Dépôts', href: '/dashboard/depots', icon: Building2 },
    ],
  },
  {
    id: 'pilotage',
    title: 'Pilotage',
    items: [
      { title: 'Rapports', href: '/dashboard/reports', icon: BarChart3 },
      { title: 'Comptabilité', href: '/dashboard/accounting', icon: Calculator },
      { title: 'Alertes', href: '/dashboard/alerts', icon: Bell },
      { title: 'Commerciaux', href: '/dashboard/agents', icon: TrendingUp },
      { title: 'Journal d’audit', href: '/dashboard/audit-logs', icon: FileSearch },
    ],
  },
  {
    id: 'compte',
    title: 'Compte',
    items: [
      { title: 'Utilisateurs', href: '/dashboard/settings/users', icon: UserCog },
      { title: 'Paramètres', href: '/dashboard/settings', icon: Settings, exact: true },
      { title: 'Abonnement', href: '/dashboard/plans', icon: Sparkles },
    ],
  },
]

const COLLAPSE_KEY = 'bstock.nav.collapsed'

const ALL_HREFS = SECTIONS.flatMap((s) => s.items.map((i) => i.href))

function isActive(pathname: string, item: NavItem) {
  if (item.exact) return pathname === item.href
  const matches = (href: string) => pathname === href || pathname.startsWith(href + '/')
  if (!matches(item.href)) return false
  // Un lien plus précis correspond (ex. /dashboard/procurement/suggestions) : c'est lui qui est actif
  return !ALL_HREFS.some((h) => h.startsWith(item.href + '/') && matches(h))
}

function initials(name: string) {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .map((n) => n[0])
    .join('')
    .toUpperCase()
    .slice(0, 2)
}

function NavLink({ item, active }: { item: NavItem; active: boolean }) {
  return (
    <SidebarMenuItem>
      <SidebarMenuButton
        asChild
        isActive={active}
        tooltip={item.title}
        className={cn(
          'relative h-8 rounded-md px-2.5 text-[13px] transition-colors',
          active
            ? 'bg-sidebar-accent font-medium text-foreground before:absolute before:inset-y-1.5 before:-left-3 before:w-[3px] before:rounded-r-full before:bg-brand'
            : 'text-muted-foreground hover:bg-sidebar-accent/70 hover:text-foreground'
        )}
      >
        <Link href={item.href} aria-current={active ? 'page' : undefined}>
          <item.icon className={cn('h-4 w-4', active ? 'text-foreground' : 'text-muted-foreground')} aria-hidden="true" />
          <span>{item.title}</span>
        </Link>
      </SidebarMenuButton>
    </SidebarMenuItem>
  )
}

export function DashboardSidebar({
  user: serverUser,
  permissions = [],
  posEnabled = true,
}: {
  /** Permissions effectives calculées côté serveur ('*' = propriétaire). */
  permissions?: string[]
  /** Fonctionnalité « Point de vente » active pour l'entreprise (back-office). */
  posEnabled?: boolean
  user?: {
    name?: string | null
    email?: string | null
    role?: string
    companyName?: string | null
    impersonatedBy?: string | null
  }
}) {
  const pathname = usePathname()
  const { data: session } = useSession()
  const { state: sidebarState } = useSidebar()
  const user = serverUser ?? session?.user
  const [collapsed, setCollapsed] = useState<Record<string, boolean>>({})

  useEffect(() => {
    try {
      setCollapsed(JSON.parse(localStorage.getItem(COLLAPSE_KEY) || '{}'))
    } catch {
      /* préférence illisible : on garde tout ouvert */
    }
  }, [])

  function toggle(id: string) {
    setCollapsed((prev) => {
      const next = { ...prev, [id]: !prev[id] }
      localStorage.setItem(COLLAPSE_KEY, JSON.stringify(next))
      return next
    })
  }

  // Même règle que l'API et le garde des pages : jamais une section qui répondrait 403
  const canSee = (href: string) => canAccessPath(href, permissions)
  const sections = SECTIONS.map((s) => ({ ...s, items: s.items.filter((i) => canSee(i.href)) })).filter(
    (s) => s.items.length > 0
  )
  const displayName = user?.name || user?.email || 'Mon compte'
  const roleLabel = ROLE_LABELS[(user?.role as UserRole) ?? 'cashier'] ?? 'Utilisateur'
  const iconOnly = sidebarState === 'collapsed'

  return (
    <Sidebar collapsible="icon" className="border-r border-sidebar-border">
      <SidebarHeader className="px-4 pb-3 pt-4 group-data-[collapsible=icon]:px-2">
        <div className="group-data-[collapsible=icon]:hidden">
          <BrandMark subtitle={user?.companyName} />
        </div>
        <Link href="/dashboard" className="hidden justify-center group-data-[collapsible=icon]:flex" aria-label="B-Stock">
          <BrandMonogram size={30} />
        </Link>
      </SidebarHeader>

      <SidebarContent className="gap-1 px-3 pb-4">
        {/* Accès principaux */}
        <SidebarGroup className="p-0">
          <SidebarGroupContent>
            <SidebarMenu className="gap-0.5">
              <NavLink item={{ title: 'Tableau de bord', href: '/dashboard', icon: LayoutDashboard, exact: true }} active={pathname === '/dashboard'} />
              {posEnabled && canSee('/pos') && (
                <SidebarMenuItem>
                  <SidebarMenuButton
                    asChild
                    tooltip="Point de vente"
                    className="mt-1 h-9 rounded-md border border-border bg-card px-2.5 text-[13px] font-medium text-foreground shadow-xs hover:bg-card hover:shadow-sm"
                  >
                    <Link href="/pos">
                      <MonitorSmartphone className="h-4 w-4 text-brand-strong" aria-hidden="true" />
                      <span>Point de vente</span>
                      <span className="ml-auto rounded bg-brand-soft px-1.5 py-0.5 text-[10px] font-semibold text-brand-strong group-data-[collapsible=icon]:hidden">
                        POS
                      </span>
                    </Link>
                  </SidebarMenuButton>
                </SidebarMenuItem>
              )}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>

        {sections.map((section) => {
          const containsActive = section.items.some((i) => isActive(pathname, i))
          const open = iconOnly || containsActive || !collapsed[section.id]
          return (
            <SidebarGroup key={section.id} className="p-0 pt-3">
              <button
                type="button"
                onClick={() => toggle(section.id)}
                aria-expanded={open}
                className="flex h-7 w-full items-center justify-between rounded-md px-2.5 text-[11px] font-semibold uppercase tracking-[0.08em] text-muted-foreground/80 hover:text-foreground group-data-[collapsible=icon]:hidden"
              >
                {section.title}
                <ChevronDown className={cn('h-3.5 w-3.5 transition-transform duration-200', !open && '-rotate-90')} aria-hidden="true" />
              </button>
              {open && (
                <SidebarGroupContent>
                  <SidebarMenu className="gap-0.5">
                    {section.items.map((item) => (
                      <NavLink key={item.href} item={item} active={isActive(pathname, item)} />
                    ))}
                  </SidebarMenu>
                </SidebarGroupContent>
              )}
            </SidebarGroup>
          )
        })}
      </SidebarContent>

      <SidebarFooter className="border-t border-sidebar-border p-3">
        <SidebarMenu>
          <SidebarMenuItem>
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <SidebarMenuButton size="lg" className="h-11 rounded-lg hover:bg-sidebar-accent data-[state=open]:bg-sidebar-accent">
                  <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-primary text-xs font-semibold text-primary-foreground">
                    {initials(displayName)}
                  </span>
                  <span className="flex min-w-0 flex-col text-left leading-tight">
                    <span className="truncate text-sm font-medium text-foreground">{displayName}</span>
                    <span className="truncate text-xs text-muted-foreground">{roleLabel}</span>
                  </span>
                  <ChevronsUpDown className="ml-auto h-4 w-4 shrink-0 text-muted-foreground" aria-hidden="true" />
                </SidebarMenuButton>
              </DropdownMenuTrigger>
              <DropdownMenuContent className="w-60" side="top" align="start" sideOffset={8}>
                <div className="px-2 py-1.5">
                  <p className="truncate text-sm font-medium text-foreground">{displayName}</p>
                  <p className="truncate text-xs text-muted-foreground">{user?.email}</p>
                </div>
                <DropdownMenuSeparator />
                <DropdownMenuItem asChild>
                  <Link href="/dashboard/profile">
                    <UserCircle aria-hidden="true" /> Mon profil
                  </Link>
                </DropdownMenuItem>
                <DropdownMenuItem asChild>
                  <Link href="/dashboard/settings/security">
                    <KeyRound aria-hidden="true" /> Mot de passe
                  </Link>
                </DropdownMenuItem>
                {canSee('/dashboard/settings') && (
                  <DropdownMenuItem asChild>
                    <Link href="/dashboard/settings">
                      <Settings aria-hidden="true" /> Paramètres
                    </Link>
                  </DropdownMenuItem>
                )}
                <DropdownMenuSeparator />
                <DropdownMenuItem
                  variant="destructive"
                  onClick={() => signOut({ callbackUrl: user?.impersonatedBy ? '/admin/login' : '/' })}
                >
                  <LogOut aria-hidden="true" /> Déconnexion
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </SidebarMenuItem>
        </SidebarMenu>
      </SidebarFooter>
    </Sidebar>
  )
}
