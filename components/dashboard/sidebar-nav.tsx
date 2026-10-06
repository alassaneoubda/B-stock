'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { signOut, useSession } from 'next-auth/react'
import { BrandLogo } from '@/components/brand-logo'
import { canAccessPath } from '@/lib/route-permissions'
import { ROLE_LABELS } from '@/lib/permissions'
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarSeparator,
} from '@/components/ui/sidebar'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { Avatar, AvatarFallback } from '@/components/ui/avatar'
import { Badge } from '@/components/ui/badge'
import {
  Package,
  LayoutDashboard,
  ShoppingCart,
  Users,
  Truck,
  Warehouse,
  BarChart3,
  Bell,
  Settings,
  ChevronsUpDown,
  LogOut,
  KeyRound,
  CreditCard,
  PackageSearch,
  FileText,
  UserCircle,
  ClipboardList,
  Car,
  ArchiveRestore,
  BoxesIcon,
  Building2,
  UserCog,
  Wallet,
  CreditCard as CreditIcon,
  RotateCcw,
  ArrowLeftRight,
  Users as UsersIcon,
  AlertTriangle,
  Tag,
  FileSearch,
  TrendingUp,
  Shield,
} from 'lucide-react'

const mainNavItems = [
  {
    title: 'Tableau de bord',
    href: '/dashboard',
    icon: LayoutDashboard,
    exact: true,
  },
  {
    title: 'Caisse',
    href: '/dashboard/cash',
    icon: Wallet,
  },
  {
    title: 'Validation Caisse',
    href: '/dashboard/cash/validation',
    icon: Shield,
  },
  {
    title: 'Ventes',
    href: '/dashboard/sales',
    icon: ShoppingCart,
  },
  {
    title: 'Clients',
    href: '/dashboard/clients',
    icon: Users,
  },
  {
    title: 'Crédits',
    href: '/dashboard/credits',
    icon: CreditIcon,
  },
  {
    title: 'Factures',
    href: '/dashboard/invoices',
    icon: FileText,
  },
  {
    title: 'Livraisons',
    href: '/dashboard/deliveries',
    icon: Truck,
  },
]

const stockNavItems = [
  {
    title: 'Produits',
    href: '/dashboard/products',
    icon: Package,
  },
  {
    title: 'Emballages',
    href: '/dashboard/packaging',
    icon: BoxesIcon,
  },
  {
    title: 'Stock',
    href: '/dashboard/stock',
    icon: Warehouse,
  },
  {
    title: 'Inventaire',
    href: '/dashboard/inventory',
    icon: ClipboardList,
  },
  {
    title: 'Transferts',
    href: '/dashboard/transfers',
    icon: ArrowLeftRight,
  },
  {
    title: 'Retours',
    href: '/dashboard/returns',
    icon: RotateCcw,
  },
  {
    title: 'Casse & Pertes',
    href: '/dashboard/breakage',
    icon: AlertTriangle,
  },
  {
    title: 'Approvisionnement',
    href: '/dashboard/procurement',
    icon: ArchiveRestore,
  },
  {
    title: 'Fournisseurs',
    href: '/dashboard/suppliers',
    icon: PackageSearch,
  },
]

const reportNavItems = [
  {
    title: 'Rapports',
    href: '/dashboard/reports',
    icon: BarChart3,
  },
  {
    title: 'Alertes',
    href: '/dashboard/alerts',
    icon: Bell,
  },
  {
    title: 'Journal d\'audit',
    href: '/dashboard/audit-logs',
    icon: FileSearch,
  },
  {
    title: 'Véhicules',
    href: '/dashboard/vehicles',
    icon: Car,
  },
]

const settingsNavItems = [
  {
    title: 'Commerciaux',
    href: '/dashboard/agents',
    icon: UsersIcon,
  },
  {
    title: 'Tarification',
    href: '/dashboard/pricing',
    icon: Tag,
  },
  {
    title: 'Dépôts',
    href: '/dashboard/depots',
    icon: Building2,
  },
  {
    title: 'Utilisateurs',
    href: '/dashboard/settings/users',
    icon: UserCog,
  },
  {
    title: 'Paramètres',
    href: '/dashboard/settings',
    icon: Settings,
    exact: true,
  },
  {
    title: 'Abonnement',
    href: '/dashboard/plans',
    icon: CreditCard,
  },
]

function isActive(pathname: string, href: string, exact?: boolean) {
  if (exact) return pathname === href
  return pathname === href || pathname.startsWith(href + '/')
}

export function DashboardSidebar({
  user: serverUser,
  permissions = [],
}: {
  /** Permissions effectives calculées côté serveur ('*' = propriétaire). */
  permissions?: string[]
  user?: {
    name?: string | null
    email?: string | null
    role?: string
    permissions?: string[]
    companyName?: string | null
    isPlatformAdmin?: boolean
  }
}) {
  const pathname = usePathname()
  const { data: session } = useSession()
  const user = serverUser ?? session?.user

  const getInitials = (name: string) => {
    return name
      .split(' ')
      .map((n) => n[0])
      .join('')
      .toUpperCase()
      .slice(0, 2)
  }

  const getRoleBadge = (role?: string) => {
    const labels: Record<string, string> = ROLE_LABELS
    return labels[role ?? ''] ?? role ?? 'Utilisateur'
  }

  // Même règle que l'API et le garde des pages : on ne montre jamais une
  // section dont l'API répondrait 403.
  const canSee = (item: { href: string }) => canAccessPath(item.href, permissions)

  const displayName = user?.name || user?.companyName || user?.email || 'Mon compte'

  return (
    <Sidebar collapsible="icon" className="border-r border-zinc-200/60 bg-white">
      <SidebarHeader className="flex h-auto shrink-0 items-center justify-center border-b border-zinc-200/60 px-4 py-5 group-data-[collapsible=icon]:h-14 group-data-[collapsible=icon]:p-2">
        <Link
          href="/dashboard"
          className="flex w-full items-center justify-center group-data-[collapsible=icon]:hidden"
          aria-label="B-STOCK — Tableau de bord"
        >
          <BrandLogo href={false} height={128} className="mx-auto" />
        </Link>
        <Link
          href="/dashboard"
          className="hidden h-9 w-9 items-center justify-center rounded-lg bg-zinc-950 text-sm font-bold text-white group-data-[collapsible=icon]:flex"
          aria-label="B-STOCK"
        >
          B
        </Link>
      </SidebarHeader>

      <SidebarContent className="px-3 pt-4 gap-4">
        {/* Activity Group */}
        {mainNavItems.some(canSee) && (
          <SidebarGroup>
            <SidebarGroupLabel className="px-3 text-[11px] font-medium uppercase tracking-wider text-zinc-400 mb-1">Activité</SidebarGroupLabel>
            <SidebarGroupContent>
              <SidebarMenu className="gap-0.5">
                {mainNavItems.filter(canSee).map((item) => {
                  const active = isActive(pathname, item.href, item.hasOwnProperty('exact') ? (item as any).exact : false)
                  return (
                    <SidebarMenuItem key={item.href}>
                      <SidebarMenuButton
                        asChild
                        isActive={active}
                        tooltip={item.title}
                        className={`h-9 rounded-md px-3 transition-colors ${active ? 'bg-zinc-100 text-zinc-950 font-medium' : 'text-zinc-500 hover:bg-zinc-50 hover:text-zinc-900'}`}
                      >
                        <Link href={item.href} className="flex items-center gap-3">
                          <item.icon className={`h-4 w-4 ${active ? 'text-zinc-950' : ''}`} />
                          <span className="text-sm">{item.title}</span>
                        </Link>
                      </SidebarMenuButton>
                    </SidebarMenuItem>
                  )
                })}
              </SidebarMenu>
            </SidebarGroupContent>
          </SidebarGroup>
        )}

        {/* Stock Group */}
        {stockNavItems.some(canSee) && (
          <SidebarGroup>
            <SidebarGroupLabel className="px-3 text-[11px] font-medium uppercase tracking-wider text-zinc-400 mb-1">Stock & Appro</SidebarGroupLabel>
            <SidebarGroupContent>
              <SidebarMenu className="gap-0.5">
                {stockNavItems.filter(canSee).map((item) => {
                  const active = isActive(pathname, item.href)
                  return (
                    <SidebarMenuItem key={item.href}>
                      <SidebarMenuButton
                        asChild
                        isActive={active}
                        tooltip={item.title}
                        className={`h-9 rounded-md px-3 transition-colors ${active ? 'bg-zinc-100 text-zinc-950 font-medium' : 'text-zinc-500 hover:bg-zinc-50 hover:text-zinc-900'}`}
                      >
                        <Link href={item.href} className="flex items-center gap-3">
                          <item.icon className={`h-4 w-4 ${active ? 'text-zinc-950' : ''}`} />
                          <span className="text-sm">{item.title}</span>
                        </Link>
                      </SidebarMenuButton>
                    </SidebarMenuItem>
                  )
                })}
              </SidebarMenu>
            </SidebarGroupContent>
          </SidebarGroup>
        )}

        {/* Reporting Group */}
        {reportNavItems.some(canSee) && (
          <SidebarGroup>
            <SidebarGroupLabel className="px-3 text-[11px] font-medium uppercase tracking-wider text-zinc-400 mb-1">Rapports & Suivi</SidebarGroupLabel>
            <SidebarGroupContent>
              <SidebarMenu className="gap-0.5">
                {reportNavItems.filter(canSee).map((item) => {
                  const active = isActive(pathname, item.href)
                  return (
                    <SidebarMenuItem key={item.href}>
                      <SidebarMenuButton
                        asChild
                        isActive={active}
                        tooltip={item.title}
                        className={`h-9 rounded-md px-3 transition-colors ${active ? 'bg-zinc-100 text-zinc-950 font-medium' : 'text-zinc-500 hover:bg-zinc-50 hover:text-zinc-900'}`}
                      >
                        <Link href={item.href} className="flex items-center gap-3">
                          <item.icon className={`h-4 w-4 ${active ? 'text-zinc-950' : ''}`} />
                          <span className="text-sm">{item.title}</span>
                        </Link>
                      </SidebarMenuButton>
                    </SidebarMenuItem>
                  )
                })}
              </SidebarMenu>
            </SidebarGroupContent>
          </SidebarGroup>
        )}

        {/* Configuration Group */}
        {settingsNavItems.some(canSee) && (
          <SidebarGroup>
            <SidebarGroupLabel className="px-3 text-[11px] font-medium uppercase tracking-wider text-zinc-400 mb-1">Configuration</SidebarGroupLabel>
            <SidebarGroupContent>
              <SidebarMenu className="gap-0.5">
                {settingsNavItems.filter(canSee).map((item) => {
                  const active = isActive(pathname, item.href, item.hasOwnProperty('exact') ? (item as any).exact : false)
                  return (
                    <SidebarMenuItem key={item.href}>
                      <SidebarMenuButton
                        asChild
                        isActive={active}
                        tooltip={item.title}
                        className={`h-9 rounded-md px-3 transition-colors ${active ? 'bg-zinc-100 text-zinc-950 font-medium' : 'text-zinc-500 hover:bg-zinc-50 hover:text-zinc-900'}`}
                      >
                        <Link href={item.href} className="flex items-center gap-3">
                          <item.icon className={`h-4 w-4 ${active ? 'text-zinc-950' : ''}`} />
                          <span className="text-sm">{item.title}</span>
                        </Link>
                      </SidebarMenuButton>
                    </SidebarMenuItem>
                  )
                })}
              </SidebarMenu>
            </SidebarGroupContent>
          </SidebarGroup>
        )}
      </SidebarContent>

      <SidebarFooter className="p-3 border-t border-zinc-200/60">
        <SidebarMenu>
          <SidebarMenuItem>
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <SidebarMenuButton
                  size="lg"
                  className="h-10 rounded-md hover:bg-zinc-50 transition-colors data-[state=open]:bg-zinc-50"
                >
                  <Avatar className="h-7 w-7 rounded-md shrink-0">
                    <AvatarFallback className="bg-zinc-900 text-white text-xs font-medium rounded-md">
                      {user?.name ? getInitials(user.name) : 'U'}
                    </AvatarFallback>
                  </Avatar>
                  <div className="flex flex-col gap-0 leading-none text-left min-w-0 ml-1">
                    <span className="font-medium truncate text-sm text-zinc-950">
                      {displayName}
                    </span>
                    <span className="text-[10px] text-zinc-500">
                      {getRoleBadge(user?.role)}
                    </span>
                  </div>
                  <ChevronsUpDown className="ml-auto h-3.5 w-3.5 shrink-0 text-zinc-400" aria-hidden="true" />
                </SidebarMenuButton>
              </DropdownMenuTrigger>
              <DropdownMenuContent
                className="w-56"
                side="top"
                align="start"
                sideOffset={8}
              >
                <div className="px-3 py-2 border-b border-zinc-100 mb-1">
                  <p className="text-sm font-medium text-zinc-950">{displayName}</p>
                  <p className="text-xs text-zinc-500">{user?.email}</p>
                </div>
                <DropdownMenuItem asChild className="cursor-pointer">
                  <Link href="/dashboard/profile" className="flex items-center gap-2">
                    <UserCircle className="h-4 w-4 text-zinc-500" aria-hidden="true" />
                    <span className="text-sm">Mon profil</span>
                  </Link>
                </DropdownMenuItem>
                <DropdownMenuItem asChild className="cursor-pointer">
                  <Link href="/dashboard/settings/security" className="flex items-center gap-2">
                    <KeyRound className="h-4 w-4 text-zinc-500" aria-hidden="true" />
                    <span className="text-sm">Mot de passe</span>
                  </Link>
                </DropdownMenuItem>
                {/* Paramètres de l'entreprise : seulement si le rôle y a accès (sinon redirection « accès refusé ») */}
                {canSee({ href: '/dashboard/settings' }) && (
                  <DropdownMenuItem asChild className="cursor-pointer">
                    <Link href="/dashboard/settings" className="flex items-center gap-2">
                      <Settings className="h-4 w-4 text-zinc-500" aria-hidden="true" />
                      <span className="text-sm">Paramètres</span>
                    </Link>
                  </DropdownMenuItem>
                )}
                <DropdownMenuSeparator />
                <DropdownMenuItem
                  className="cursor-pointer text-red-600 focus:text-red-600 focus:bg-red-50"
                  onClick={() => signOut({ callbackUrl: '/' })}
                >
                  <LogOut className="h-4 w-4 mr-2" aria-hidden="true" />
                  <span className="text-sm">Déconnexion</span>
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </SidebarMenuItem>
        </SidebarMenu>
      </SidebarFooter>
    </Sidebar>
  )
}
