// Pas de "use client" : ces composants sont utilisables depuis une page serveur
// (icône Lucide en prop) comme depuis un composant client (onClick / onRetry).

import type { ReactNode } from 'react'
import Link from 'next/link'
import { AlertTriangle, Inbox, RotateCw, type LucideIcon } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'
import { cn } from '@/lib/utils'

/**
 * États d'écran partagés : chargement, vide, erreur.
 * Un même vocabulaire visuel partout (au lieu de 103 spinners et de listes
 * qui affichaient 0 en cas de panne).
 */

export function EmptyState({
  icon: Icon = Inbox,
  title,
  description,
  action,
  className,
}: {
  icon?: LucideIcon
  title: string
  description?: string
  action?: { label: string; href?: string; onClick?: () => void }
  className?: string
}) {
  return (
    <div
      className={cn(
        'flex flex-col items-center justify-center gap-3 rounded-xl border border-dashed border-border px-6 py-12 text-center',
        className
      )}
    >
      <div className="flex h-11 w-11 items-center justify-center rounded-full bg-muted text-muted-foreground">
        <Icon className="h-5 w-5" aria-hidden="true" />
      </div>
      <div className="max-w-sm space-y-1">
        <p className="text-sm font-semibold text-foreground">{title}</p>
        {description && <p className="text-sm text-muted-foreground">{description}</p>}
      </div>
      {action &&
        (action.href ? (
          <Button asChild size="sm" className="mt-1">
            <Link href={action.href}>{action.label}</Link>
          </Button>
        ) : (
          <Button size="sm" className="mt-1" onClick={action.onClick}>
            {action.label}
          </Button>
        ))}
    </div>
  )
}

export function ErrorState({
  title = 'Impossible de charger les données',
  description = 'Vérifiez votre connexion puis réessayez.',
  onRetry,
  className,
}: {
  title?: string
  description?: string
  onRetry?: () => void
  className?: string
}) {
  return (
    <div
      role="alert"
      className={cn(
        'flex flex-col items-center justify-center gap-3 rounded-xl border border-destructive/20 bg-destructive/5 px-6 py-12 text-center',
        className
      )}
    >
      <div className="flex h-11 w-11 items-center justify-center rounded-full bg-destructive/10 text-destructive">
        <AlertTriangle className="h-5 w-5" aria-hidden="true" />
      </div>
      <div className="max-w-sm space-y-1">
        <p className="text-sm font-semibold text-foreground">{title}</p>
        <p className="text-sm text-muted-foreground">{description}</p>
      </div>
      {onRetry && (
        <Button size="sm" variant="outline" onClick={onRetry} className="mt-1">
          <RotateCw className="mr-1.5 h-3.5 w-3.5" aria-hidden="true" />
          Réessayer
        </Button>
      )}
    </div>
  )
}

/** Squelette de tableau / liste pendant le chargement. */
export function TableSkeleton({ rows = 6, columns = 4 }: { rows?: number; columns?: number }) {
  return (
    <div className="space-y-3" aria-busy="true" aria-label="Chargement">
      <Skeleton className="h-9 w-full" />
      {Array.from({ length: rows }, (_, r) => (
        <div key={r} className="flex gap-3">
          {Array.from({ length: columns }, (_, c) => (
            <Skeleton key={c} className={cn('h-8', c === 0 ? 'w-2/5' : 'flex-1')} />
          ))}
        </div>
      ))}
    </div>
  )
}

/** Squelette d'une page du dashboard (en-tête + cartes + contenu). */
export function PageSkeleton({ children }: { children?: ReactNode }) {
  return (
    <div className="flex min-h-screen flex-col" aria-busy="true" aria-label="Chargement de la page">
      <div className="flex h-14 items-center gap-3 border-b border-border/60 px-4 lg:px-6">
        <Skeleton className="h-5 w-40" />
      </div>
      <div className="flex-1 space-y-6 p-4 lg:p-6">
        <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
          {Array.from({ length: 4 }, (_, i) => (
            <Skeleton key={i} className="h-24 rounded-xl" />
          ))}
        </div>
        {children ?? <TableSkeleton />}
      </div>
    </div>
  )
}
