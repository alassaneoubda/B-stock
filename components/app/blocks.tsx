import type { ReactNode } from 'react'
import Link from 'next/link'
import { ArrowRight, type LucideIcon } from 'lucide-react'
import { cn } from '@/lib/utils'

/**
 * Blocs de mise en page de l'application (charte B-Stock).
 * Composants serveur-compatibles : aucun état, aucune dépendance client.
 */

/** Conteneur standard d'une page du dashboard. */
export function PageShell({ children, className, wide }: { children: ReactNode; className?: string; wide?: boolean }) {
  return (
    <main className={cn('mx-auto w-full flex-1 space-y-6 px-4 py-6 lg:px-8 lg:py-8', wide ? 'max-w-[1600px]' : 'max-w-[1360px]', className)}>
      {children}
    </main>
  )
}

/** Titre de page dans le contenu (accueil, pages riches). */
export function PageIntro({
  eyebrow,
  title,
  description,
  actions,
}: {
  eyebrow?: ReactNode
  title: ReactNode
  description?: ReactNode
  actions?: ReactNode
}) {
  return (
    <div className="flex flex-wrap items-end justify-between gap-4">
      <div className="min-w-0 space-y-1">
        {eyebrow && <p className="text-sm font-medium text-muted-foreground">{eyebrow}</p>}
        <h2 className="text-2xl font-semibold tracking-tight text-foreground sm:text-[28px]">{title}</h2>
        {description && <p className="max-w-2xl text-sm text-muted-foreground">{description}</p>}
      </div>
      {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
    </div>
  )
}

type Tone = 'default' | 'brand' | 'success' | 'warning' | 'danger' | 'info'

const TONE_ICON: Record<Tone, string> = {
  default: 'bg-muted text-muted-foreground',
  brand: 'bg-brand-soft text-brand-strong',
  success: 'bg-success-soft text-success',
  warning: 'bg-warning-soft text-warning-foreground',
  danger: 'bg-destructive/10 text-destructive',
  info: 'bg-info-soft text-info',
}

/** Indicateur chiffré. `emphasis` = carte encre (l'indicateur principal d'une page). */
export function StatCard({
  label,
  value,
  hint,
  icon: Icon,
  tone = 'default',
  href,
  emphasis,
  children,
}: {
  label: string
  value: ReactNode
  hint?: ReactNode
  icon?: LucideIcon
  tone?: Tone
  href?: string
  emphasis?: boolean
  children?: ReactNode
}) {
  const content = (
    <>
      <div className="flex items-start justify-between gap-3">
        <span className={cn('text-[13px] font-medium', emphasis ? 'text-primary-foreground/70' : 'text-muted-foreground')}>{label}</span>
        {Icon && (
          <span
            className={cn(
              'flex h-8 w-8 shrink-0 items-center justify-center rounded-lg',
              emphasis ? 'bg-brand text-brand-foreground' : TONE_ICON[tone]
            )}
          >
            <Icon className="h-4 w-4" aria-hidden="true" />
          </span>
        )}
      </div>
      <div className="mt-3 space-y-1">
        <p className={cn('tabular truncate text-2xl font-semibold tracking-tight', emphasis ? 'text-primary-foreground' : 'text-foreground')}>
          {value}
        </p>
        {hint && <p className={cn('text-xs', emphasis ? 'text-primary-foreground/70' : 'text-muted-foreground')}>{hint}</p>}
      </div>
      {children}
    </>
  )
  const className = cn(
    'relative flex flex-col rounded-xl border p-5 transition-[box-shadow,border-color]',
    emphasis
      ? 'border-transparent bg-primary shadow-md'
      : 'border-border bg-card shadow-[0_1px_2px_0_rgb(15_23_42/0.04)]',
    href && 'hover:shadow-md'
  )
  return href ? (
    <Link href={href} className={className}>
      {content}
    </Link>
  ) : (
    <div className={className}>{content}</div>
  )
}

/** Panneau avec en-tête (liste, résumé…). */
export function Panel({
  title,
  description,
  action,
  children,
  className,
  bodyClassName,
}: {
  title: ReactNode
  description?: ReactNode
  action?: { label: string; href: string } | ReactNode
  children: ReactNode
  className?: string
  bodyClassName?: string
}) {
  const actionNode =
    action && typeof action === 'object' && 'href' in (action as object) ? (
      <Link
        href={(action as { href: string }).href}
        className="inline-flex items-center gap-1 text-[13px] font-medium text-muted-foreground transition-colors hover:text-foreground"
      >
        {(action as { label: string }).label}
        <ArrowRight className="h-3.5 w-3.5" aria-hidden="true" />
      </Link>
    ) : (
      (action as ReactNode)
    )
  return (
    <section className={cn('overflow-hidden rounded-xl border border-border bg-card shadow-[0_1px_2px_0_rgb(15_23_42/0.04)]', className)}>
      <div className="flex items-center justify-between gap-3 border-b border-border px-5 py-3.5">
        <div className="min-w-0">
          <h3 className="text-[15px] font-semibold tracking-tight text-foreground">{title}</h3>
          {description && <p className="text-xs text-muted-foreground">{description}</p>}
        </div>
        {actionNode}
      </div>
      <div className={bodyClassName}>{children}</div>
    </section>
  )
}

const SALE_STATUS: Record<string, { label: string; tone: Tone }> = {
  pending: { label: 'En attente', tone: 'warning' },
  confirmed: { label: 'Confirmée', tone: 'info' },
  preparing: { label: 'En préparation', tone: 'brand' },
  ready: { label: 'Prête', tone: 'brand' },
  delivered: { label: 'Livrée', tone: 'success' },
  completed: { label: 'Terminée', tone: 'success' },
  cancelled: { label: 'Annulée', tone: 'default' },
  paid: { label: 'Payée', tone: 'success' },
  partial: { label: 'Partielle', tone: 'warning' },
  overdue: { label: 'En retard', tone: 'danger' },
  open: { label: 'Ouverte', tone: 'success' },
  closed: { label: 'Clôturée', tone: 'default' },
}

const TONE_BADGE: Record<Tone, string> = {
  default: 'bg-muted text-muted-foreground',
  brand: 'bg-brand-soft text-brand-strong',
  success: 'bg-success-soft text-success',
  warning: 'bg-warning-soft text-warning-foreground',
  danger: 'bg-destructive/10 text-destructive',
  info: 'bg-info-soft text-info',
}

/** Badge de statut : toujours un libellé en toutes lettres + un point de couleur. */
export function StatusBadge({ status, label, tone }: { status?: string; label?: string; tone?: Tone }) {
  const known = status ? SALE_STATUS[status] : undefined
  const t = tone ?? known?.tone ?? 'default'
  return (
    <span className={cn('inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-xs font-medium', TONE_BADGE[t])}>
      <span className="h-1.5 w-1.5 rounded-full bg-current opacity-70" aria-hidden="true" />
      {label ?? known?.label ?? status}
    </span>
  )
}
