'use client'

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

interface DashboardHeaderProps {
  title: string
  description?: string
  actions?: React.ReactNode
}

export function DashboardHeader({ title, description, actions }: DashboardHeaderProps) {
  return (
    <header className="flex h-14 shrink-0 items-center gap-3 bg-white border-b border-zinc-200/60 px-4 lg:px-6 sticky top-0 z-40">
      <div className="flex items-center gap-3 flex-1 min-w-0">
        <SidebarTrigger className="h-8 w-8 rounded-md hover:bg-zinc-100 transition-colors" />
        <div className="h-5 w-px bg-zinc-200 hidden sm:block" />
        <div className="flex flex-col min-w-0">
          <h1 className="text-sm font-semibold text-zinc-950 truncate">{title}</h1>
          {description && (
            <p className="text-xs text-zinc-500 truncate">{description}</p>
          )}
        </div>
      </div>

      <div className="flex items-center gap-2">
        {/* Quick Actions */}
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button size="sm" className="h-8 px-3 gap-1.5 text-xs font-medium">
              <Plus className="h-3.5 w-3.5" />
              <span className="hidden sm:inline">Nouveau</span>
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-48">
            <DropdownMenuItem asChild className="cursor-pointer">
              <Link href="/dashboard/sales/new" className="flex items-center gap-2">
                <ShoppingCart className="h-4 w-4 text-zinc-500" />
                <span className="text-sm">Nouvelle vente</span>
              </Link>
            </DropdownMenuItem>
            <DropdownMenuItem asChild className="cursor-pointer">
              <Link href="/dashboard/clients/new" className="flex items-center gap-2">
                <Users className="h-4 w-4 text-zinc-500" />
                <span className="text-sm">Nouveau client</span>
              </Link>
            </DropdownMenuItem>
            <DropdownMenuItem asChild className="cursor-pointer">
              <Link href="/dashboard/deliveries/new" className="flex items-center gap-2">
                <Truck className="h-4 w-4 text-zinc-500" />
                <span className="text-sm">Nouvelle tournée</span>
              </Link>
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>

        {/* Notifications */}
        <Button variant="ghost" size="icon" className="relative h-8 w-8 rounded-md hover:bg-zinc-100" asChild>
          <Link href="/dashboard/alerts">
            <Bell className="h-4 w-4 text-zinc-500" />
            <span className="absolute top-1 right-1 h-2 w-2 rounded-full bg-blue-500" />
          </Link>
        </Button>

        {actions}
      </div>
    </header>
  )
}
