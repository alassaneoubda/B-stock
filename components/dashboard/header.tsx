'use client'

import useSWR from 'swr'
import { SidebarTrigger } from '@/components/ui/sidebar'
import { Button } from '@/components/ui/button'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { Bell, Plus, ShoppingCart, Users, Truck } from 'lucide-react'
import Link from 'next/link'
import { apiFetch } from '@/lib/api-client'
import { usePermissions } from '@/components/providers/permissions-provider'

interface DashboardHeaderProps {
  title: string
  description?: string
  actions?: React.ReactNode
}

const QUICK_ACTIONS = [
  { href: '/dashboard/sales/new', label: 'Nouvelle vente', icon: ShoppingCart, permission: 'sales.write' },
  { href: '/dashboard/clients/new', label: 'Nouveau client', icon: Users, permission: 'clients.write' },
  { href: '/dashboard/deliveries/new', label: 'Nouvelle tournée', icon: Truck, permission: 'deliveries.write' },
]

const UNREAD_LIMIT = 100
/** Clé SWR à invalider (mutate) après avoir marqué des alertes comme lues. */
export const UNREAD_ALERTS_KEY = `/api/alerts?unreadOnly=true&limit=${UNREAD_LIMIT}`

/**
 * Nombre d'alertes non lues (null si inconnu : pas le droit alerts.read, réseau…).
 * Partagé entre toutes les pages via SWR (une requête par minute au plus).
 */
async function fetchUnreadCount(url: string): Promise<number | null> {
  try {
    const json = await apiFetch<{ data: unknown[] }>(url)
    return Array.isArray(json.data) ? json.data.length : 0
  } catch {
    // Indicateur secondaire : en cas d'échec on n'affiche simplement pas de pastille
    return null
  }
}

export function DashboardHeader({ title, description, actions }: DashboardHeaderProps) {
  const { can } = usePermissions()
  const quickActions = QUICK_ACTIONS.filter((a) => can(a.permission))
  // Pas de requête (ni de pastille) sans le droit de lire les alertes
  const { data: unreadCount } = useSWR(can('alerts.read') ? UNREAD_ALERTS_KEY : null, fetchUnreadCount, {
    refreshInterval: 60_000,
    dedupingInterval: 30_000,
    revalidateOnFocus: true,
  })
  const hasUnread = typeof unreadCount === 'number' && unreadCount > 0
  const countLabel = hasUnread ? (unreadCount >= UNREAD_LIMIT ? `${UNREAD_LIMIT - 1}+` : String(unreadCount)) : ''
  const bellLabel = hasUnread
    ? `Alertes : ${countLabel} non lue${unreadCount > 1 ? 's' : ''}`
    : 'Alertes'

  return (
    <header className="flex h-14 shrink-0 items-center gap-3 bg-white border-b border-zinc-200/60 px-4 lg:px-6 sticky top-0 z-40">
      <div className="flex items-center gap-3 flex-1 min-w-0">
        <SidebarTrigger className="h-9 w-auto shrink-0 gap-2 rounded-lg border border-zinc-200 bg-zinc-50 px-2.5 text-zinc-800 hover:bg-zinc-100 md:border-0 md:bg-transparent md:px-2">
          <span className="text-sm font-medium md:hidden">Menu</span>
        </SidebarTrigger>
        <div className="h-5 w-px bg-zinc-200 hidden sm:block" />
        <div className="flex flex-col min-w-0">
          <h1 className="text-sm font-semibold text-zinc-950 truncate">{title}</h1>
          {description && (
            <p className="text-xs text-zinc-500 truncate">{description}</p>
          )}
        </div>
      </div>

      <div className="flex items-center gap-2">
        {/* Actions rapides (selon les droits du rôle) */}
        {quickActions.length > 0 && (
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button size="sm" className="h-8 px-3 gap-1.5 text-xs font-medium" aria-label="Nouveau">
              <Plus className="h-3.5 w-3.5" aria-hidden="true" />
              <span className="hidden sm:inline">Nouveau</span>
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-48">
            {quickActions.map((action) => (
              <DropdownMenuItem key={action.href} asChild className="cursor-pointer">
                <Link href={action.href} className="flex items-center gap-2">
                  <action.icon className="h-4 w-4 text-zinc-500" aria-hidden="true" />
                  <span className="text-sm">{action.label}</span>
                </Link>
              </DropdownMenuItem>
            ))}
          </DropdownMenuContent>
        </DropdownMenu>
        )}

        {/* Alertes : pastille uniquement s'il existe des alertes non lues */}
        <Button variant="ghost" size="icon" className="relative h-8 w-8 rounded-md hover:bg-zinc-100" asChild>
          <Link href="/dashboard/alerts" aria-label={bellLabel} title={bellLabel}>
            <Bell className="h-4 w-4 text-zinc-500" aria-hidden="true" />
            {hasUnread && (
              <span
                className="absolute -top-0.5 -right-0.5 min-w-4 h-4 px-1 rounded-full bg-red-600 text-white text-[10px] font-semibold leading-4 text-center"
                aria-hidden="true"
              >
                {countLabel}
              </span>
            )}
          </Link>
        </Button>

        {actions}
      </div>
    </header>
  )
}
