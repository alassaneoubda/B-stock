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
    <header className="sticky top-0 z-40 flex h-16 shrink-0 items-center gap-3 border-b border-border bg-background/85 px-4 backdrop-blur supports-[backdrop-filter]:bg-background/70 lg:px-8">
      <SidebarTrigger
        className="h-9 w-9 shrink-0 rounded-lg text-muted-foreground hover:bg-accent hover:text-foreground"
        aria-label="Afficher ou masquer le menu"
      />
      <div className="hidden h-5 w-px bg-border sm:block" aria-hidden="true" />
      <div className="flex min-w-0 flex-1 flex-col">
        <h1 className="truncate text-[15px] font-semibold tracking-tight text-foreground">{title}</h1>
        {description && <p className="truncate text-xs text-muted-foreground">{description}</p>}
      </div>

      <div className="flex shrink-0 items-center gap-1.5">
        {actions}

        {/* Alertes : pastille uniquement s'il existe des alertes non lues */}
        <Button variant="ghost" size="icon" className="relative rounded-lg text-muted-foreground hover:text-foreground" asChild>
          <Link href="/dashboard/alerts" aria-label={bellLabel} title={bellLabel}>
            <Bell className="h-[18px] w-[18px]" aria-hidden="true" />
            {hasUnread && (
              <span
                className="tabular absolute right-1 top-1 h-4 min-w-4 rounded-full bg-brand px-1 text-center text-[10px] font-bold leading-4 text-brand-foreground ring-2 ring-background"
                aria-hidden="true"
              >
                {countLabel}
              </span>
            )}
          </Link>
        </Button>

        {/* Actions rapides (selon les droits du rôle) */}
        {quickActions.length > 0 && (
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button size="sm" className="h-9 gap-1.5 rounded-lg px-3" aria-label="Nouveau">
                <Plus className="h-4 w-4" aria-hidden="true" />
                <span className="hidden sm:inline">Nouveau</span>
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-52">
              {quickActions.map((action) => (
                <DropdownMenuItem key={action.href} asChild>
                  <Link href={action.href}>
                    <action.icon aria-hidden="true" />
                    {action.label}
                  </Link>
                </DropdownMenuItem>
              ))}
            </DropdownMenuContent>
          </DropdownMenu>
        )}
      </div>
    </header>
  )
}
