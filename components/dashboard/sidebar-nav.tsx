'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { signOut, useSession } from 'next-auth/react'
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
    requiredPermission: 'sales',
  },
  {
    title: 'Validation Caisse',
    href: '/dashboard/cash/validation',
    icon: Shield,
    requiredPermission: 'manager',
  },
  {
    title: 'Ventes',
    href: '/dashboard/sales',
    icon: ShoppingCart,
    requiredPermission: 'sales',
  },
  {
    title: 'Clients',
    href: '/dashboard/clients',
    icon: Users,
    requiredPermission: 'sales',
  },
  {
    title: 'Crédits',
    href: '/dashboard/credits',
    icon: CreditIcon,
    requiredPermission: 'sales',
  },
  {
    title: 'Factures',
    href: '/dashboard/invoices',
    icon: FileText,
    requiredPermission: 'sales',
  },
  {
    title: 'Livraisons',
    href: '/dashboard/deliveries',
    icon: Truck,
    requiredPermission: 'deliveries',
  },
]

const stockNavItems = [
  {
    title: 'Produits',
    href: '/dashboard/products',
    icon: Package,
    requiredPermission: 'products',
  },
  {
    title: 'Emballages',
    href: '/dashboard/packaging',
    icon: BoxesIcon,
    requiredPermission: 'products',
  },
  {
    title: 'Stock',
    href: '/dashboard/stock',
    icon: Warehouse,
    requiredPermission: 'products',
  },
  {
    title: 'Inventaire',
    href: '/dashboard/inventory',
    icon: ClipboardList,
    requiredPermission: 'products',
  },
  {
    title: 'Transferts',
    href: '/dashboard/transfers',
    icon: ArrowLeftRight,
    requiredPermission: 'products',
  },
  {
    title: 'Retours',
    href: '/dashboard/returns',
    icon: RotateCcw,
    requiredPermission: 'products',
  },
  {
    title: 'Casse & Pertes',
    href: '/dashboard/breakage',
    icon: AlertTriangle,
    requiredPermission: 'products',
  },
  {
    title: 'Approvisionnement',
    href: '/dashboard/procurement',
    icon: ArchiveRestore,
    requiredPermission: 'procurement',
  },
  {
    title: 'Fournisseurs',
    href: '/dashboard/suppliers',
    icon: PackageSearch,
    requiredPermission: 'procurement',
  },
]

const reportNavItems = [
  {
    title: 'Rapports',
    href: '/dashboard/reports',
    icon: BarChart3,
    requiredPermission: 'reports',
  },
  {
    title: 'Alertes',
    href: '/dashboard/alerts',
    icon: Bell,
    requiredPermission: 'reports',
  },
  {
    title: 'Journal d\'audit',
    href: '/dashboard/audit-logs',
    icon: FileSearch,
    requiredPermission: 'reports',
  },
  {
    title: 'Véhicules',
    href: '/dashboard/vehicles',
    icon: Car,
    requiredPermission: 'vehicles',
  },
]

const settingsNavItems = [
  {
    title: 'Commerciaux',
    href: '/dashboard/agents',
    icon: UsersIcon,
    requiredPermission: 'settings',
  },
  {
    title: 'Tarification',
    href: '/dashboard/pricing',
    icon: Tag,
    requiredPermission: 'settings',
  },
  {
    title: 'Dépôts',
    href: '/dashboard/depots',
    icon: Building2,
    requiredPermission: 'settings',
  },
  {
    title: 'Utilisateurs',
    href: '/dashboard/settings/users',
    icon: UserCog,
    requiredPermission: 'settings',
  },
  {
    title: 'Paramètres',
    href: '/dashboard/settings',
    icon: Settings,
    exact: true,
    requiredPermission: 'settings',
  },
  {
    title: 'Abonnement',
    href: '/dashboard/plans',
    icon: CreditCard,
    requiredPermission: 'settings',
  },
]

function isActive(pathname: string, href: string, exact?: boolean) {
  if (exact) return pathname === href
  return pathname === href || pathname.startsWith(href + '/')
}

export function DashboardSidebar() {
  const pathname = usePathname()
  const { data: session, status } = useSession()

  const getInitials = (name: string) => {
    return name
      .split(' ')
      .map((n) => n[0])
      .join('')
      .toUpperCase()
      .slice(0, 2)
  }

  const getRoleBadge = (role?: string) => {
    const labels: Record<string, string> = {
      owner: 'Propriétaire',
      manager: 'Gérant',
      cashier: 'Caissier',
      warehouse_keeper: 'Magasinier',
    }
    return labels[role ?? ''] ?? role ?? 'Utilisateur'
  }

  const canSee = (item: { requiredPermission?: string }) => {
    // While session is loading, show all items (auth is already verified server-side in layout)
    if (status === 'loading') return true
    if (!session?.user) return false
    if (session.user.role === 'owner') return true
    if (!item.requiredPermission) return true
    return session.user.permissions?.includes(item.requiredPermission)
  }

  return (
    <Sidebar collapsible="icon" className="border-r border-zinc-200/60 bg-white">
      <SidebarHeader className="h-14 flex items-center justify-center border-b border-zinc-200/60 px-4">
        <SidebarMenu>
          <SidebarMenuItem>
            <SidebarMenuButton size="lg" asChild className="hover:bg-transparent">
              <Link href="/dashboard" className="flex items-center gap-2.5">
                <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-zinc-950">
                  <span className="text-white text-sm font-bold">B</span>
                </div>
                <div className="flex flex-col gap-0 leading-none">
                  <span className="font-bold text-sm text-zinc-950">B-Stock</span>
                  <span className="text-[10px] text-zinc-400 truncate max-w-[120px]">
                    {session?.user?.companyName || 'Distribution'}
                  </span>
                </div>
              </Link>
            </SidebarMenuButton>
          </SidebarMenuItem>
        </SidebarMenu>
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
                      {session?.user?.name ? getInitials(session.user.name) : 'U'}
                    </AvatarFallback>
                  </Avatar>
                  <div className="flex flex-col gap-0 leading-none text-left min-w-0 ml-1">
                    <span className="font-medium truncate text-sm text-zinc-950">
                      {session?.user?.name || 'Administrateur'}
                    </span>
                    <span className="text-[10px] text-zinc-400">
                      {getRoleBadge(session?.user?.role)}
                    </span>
                  </div>
                  <ChevronsUpDown className="ml-auto h-3.5 w-3.5 shrink-0 text-zinc-400" />
                </SidebarMenuButton>
              </DropdownMenuTrigger>
              <DropdownMenuContent
                className="w-56"
                side="top"
                align="start"
                sideOffset={8}
              >
                <div className="px-3 py-2 border-b border-zinc-100 mb-1">
                  <p className="text-sm font-medium text-zinc-950">{session?.user?.name}</p>
                  <p className="text-xs text-zinc-500">{session?.user?.email}</p>
                </div>
                <DropdownMenuItem asChild className="cursor-pointer">
                  <Link href="/dashboard/profile" className="flex items-center gap-2">
                    <UserCircle className="h-4 w-4 text-zinc-500" />
                    <span className="text-sm">Mon profil</span>
                  </Link>
                </DropdownMenuItem>
                <DropdownMenuItem asChild className="cursor-pointer">
                  <Link href="/dashboard/settings" className="flex items-center gap-2">
                    <Settings className="h-4 w-4 text-zinc-500" />
                    <span className="text-sm">Paramètres</span>
                  </Link>
                </DropdownMenuItem>
                <DropdownMenuSeparator />
                <DropdownMenuItem
                  className="cursor-pointer text-red-600 focus:text-red-600 focus:bg-red-50"
                  onClick={() => signOut({ callbackUrl: '/' })}
                >
                  <LogOut className="h-4 w-4 mr-2" />
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
