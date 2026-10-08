import { requirePageSession } from '@/lib/page-auth'
import { sql } from '@/lib/db'
import { DashboardHeader } from '@/components/dashboard/header'
import { Button } from '@/components/ui/button'
import { Bell, CheckCircle, Package, CreditCard, ArchiveRestore, ShieldAlert, History, Snowflake, Wallet, type LucideIcon } from 'lucide-react'
import Link from 'next/link'
import { GenerateAlertsButton, MarkAllReadButton, MarkAlertReadButton } from '@/components/dashboard/alerts-actions'
import { PageShell, Panel, StatCard, StatusBadge } from '@/components/app/blocks'
import { EmptyState } from '@/components/states'
import { formatDateTime, formatNumber, formatRelative } from '@/lib/format'
import { cn } from '@/lib/utils'

interface Alert {
    id: string
    alert_type: string
    severity: string
    title: string
    message: string | null
    reference_type: string | null
    reference_id: string | null
    is_read: boolean
    is_resolved: boolean
    created_at: string
}

// Pas de try/catch : une panne SQL remonte à error.tsx au lieu d'afficher
// « Système opérationnel » à tort.
async function getAlerts(companyId: string): Promise<Alert[]> {
    const alerts = await sql`
      SELECT *
      FROM alerts
      WHERE company_id = ${companyId}
      ORDER BY
        CASE severity WHEN 'critical' THEN 0 WHEN 'high' THEN 1 WHEN 'medium' THEN 2 ELSE 3 END,
        created_at DESC
      LIMIT 100
    `
    return alerts as Alert[]
}

/**
 * Lien vers l'entité liée, selon reference_type écrit par lib/domain/alerts.ts :
 * 'stock' (ligne de stock : low_stock, expiry), 'client' (credit_limit,
 * packaging_debt), 'sales_order' (payment_overdue), 'purchase_order'
 * (supplier_overdue), 'product_variant' (dormant_stock), 'user' (cash_variance).
 * Type inconnu : pas de lien.
 */
function alertEntityHref(alert: Alert): string | null {
    switch (alert.reference_type) {
        case 'stock':
            return '/dashboard/stock'
        case 'client':
            return alert.reference_id ? `/dashboard/clients/${alert.reference_id}` : null
        case 'sales_order':
            return alert.reference_id ? `/dashboard/sales/${alert.reference_id}` : null
        case 'credit_note':
            return '/dashboard/credits'
        case 'purchase_order':
            return alert.reference_id ? `/dashboard/procurement/${alert.reference_id}` : null
        case 'product_variant':
            return '/dashboard/stock'
        case 'user':
            return '/dashboard/cash'
        default:
            return null
    }
}

type Tone = 'default' | 'brand' | 'success' | 'warning' | 'danger' | 'info'

const alertTypeConfig: Record<string, { label: string; icon: LucideIcon }> = {
    low_stock: { label: 'Stock bas', icon: Package },
    expiry: { label: 'Péremption', icon: History },
    credit_limit: { label: 'Limite de crédit', icon: CreditCard },
    packaging_debt: { label: 'Dette d’emballages', icon: ArchiveRestore },
    payment_overdue: { label: 'Retard de paiement', icon: CreditCard },
    supplier_overdue: { label: 'Facture fournisseur en retard', icon: CreditCard },
    low_packaging: { label: 'Emballages', icon: Package },
    dormant_stock: { label: 'Produit dormant', icon: Snowflake },
    cash_variance: { label: 'Écarts de caisse', icon: Wallet },
}

const severityConfig: Record<string, { label: string; tone: Tone; icon: string }> = {
    low: { label: 'Mineure', tone: 'default', icon: 'bg-muted text-muted-foreground' },
    medium: { label: 'Modérée', tone: 'info', icon: 'bg-info-soft text-info' },
    high: { label: 'Élevée', tone: 'warning', icon: 'bg-warning-soft text-warning-foreground' },
    critical: { label: 'Urgente', tone: 'danger', icon: 'bg-destructive/10 text-destructive' },
}

export default async function AlertsPage() {
    const session = await requirePageSession()
    const companyId = session?.user?.companyId || ''
    const alerts = await getAlerts(companyId)

    const unreadCount = alerts.filter(a => !a.is_read).length
    const criticalCount = alerts.filter(a => a.severity === 'critical' || a.severity === 'high').length
    const resolvedCount = alerts.filter(a => a.is_resolved).length

    return (
        <div className="flex min-h-screen flex-col">
            <DashboardHeader
                title="Alertes"
                description="Points de vigilance : stock, péremption, produits dormants, crédits, emballages, paiements et caisse"
                actions={<GenerateAlertsButton />}
            />

            <PageShell>
                <div className="grid gap-4 sm:grid-cols-3">
                    <StatCard
                        label="Non lues"
                        value={formatNumber(unreadCount)}
                        hint="À examiner"
                        icon={Bell}
                        tone={unreadCount > 0 ? 'brand' : 'default'}
                    />
                    <StatCard
                        label="Priorité élevée"
                        value={formatNumber(criticalCount)}
                        hint="Urgentes ou élevées"
                        icon={ShieldAlert}
                        tone={criticalCount > 0 ? 'danger' : 'default'}
                    />
                    <StatCard
                        label="Résolues"
                        value={formatNumber(resolvedCount)}
                        hint="Traitées automatiquement ou manuellement"
                        icon={CheckCircle}
                        tone="success"
                    />
                </div>

                {alerts.length === 0 ? (
                    <EmptyState
                        icon={CheckCircle}
                        title="Aucune alerte"
                        description="Aucune anomalie détectée. Lancez une analyse pour vérifier à nouveau votre activité."
                    />
                ) : (
                    <Panel
                        title="Toutes les alertes"
                        description={`${formatNumber(alerts.length)} alerte${alerts.length > 1 ? 's' : ''}, les plus urgentes en premier`}
                        action={<MarkAllReadButton hasUnread={unreadCount > 0} />}
                    >
                        <ul className="divide-y divide-border">
                            {alerts.map((alert) => {
                                const typeInfo = alertTypeConfig[alert.alert_type] || { label: alert.alert_type, icon: Bell }
                                const severityInfo = severityConfig[alert.severity] || {
                                    label: alert.severity,
                                    tone: 'default' as Tone,
                                    icon: 'bg-muted text-muted-foreground',
                                }
                                const AlertIcon = typeInfo.icon
                                const entityHref = alertEntityHref(alert)
                                const muted = alert.is_read || alert.is_resolved

                                return (
                                    <li
                                        key={alert.id}
                                        className={cn(
                                            'flex items-start gap-3 px-4 py-4 transition-colors sm:gap-4 sm:px-5',
                                            !alert.is_read && 'bg-brand-soft/30',
                                        )}
                                    >
                                        <span
                                            className={cn(
                                                'mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-lg',
                                                muted ? 'bg-muted text-muted-foreground' : severityInfo.icon,
                                            )}
                                        >
                                            <AlertIcon className="h-4 w-4" aria-hidden="true" />
                                        </span>

                                        <div className="min-w-0 flex-1 space-y-1.5">
                                            <div className="flex flex-col gap-1 sm:flex-row sm:items-start sm:justify-between sm:gap-4">
                                                <div className="flex min-w-0 flex-wrap items-center gap-2">
                                                    {!alert.is_read && (
                                                        <span className="h-2 w-2 shrink-0 rounded-full bg-brand" aria-hidden="true" />
                                                    )}
                                                    <h4
                                                        className={cn(
                                                            'text-sm leading-snug',
                                                            muted ? 'font-medium text-muted-foreground' : 'font-semibold text-foreground',
                                                        )}
                                                    >
                                                        {!alert.is_read && <span className="sr-only">Non lue : </span>}
                                                        {alert.title}
                                                    </h4>
                                                    <StatusBadge label={severityInfo.label} tone={alert.is_resolved ? 'default' : severityInfo.tone} />
                                                    {alert.is_resolved && <StatusBadge label="Résolue" tone="success" />}
                                                </div>
                                                <time
                                                    dateTime={new Date(alert.created_at).toISOString()}
                                                    title={formatDateTime(alert.created_at)}
                                                    className="tabular shrink-0 text-xs text-muted-foreground"
                                                >
                                                    {formatRelative(alert.created_at)}
                                                </time>
                                            </div>

                                            {alert.message && (
                                                <p className="max-w-3xl text-sm text-muted-foreground">{alert.message}</p>
                                            )}

                                            <div className="flex flex-wrap items-center justify-between gap-2 pt-1">
                                                <span className="text-xs text-muted-foreground">{typeInfo.label}</span>
                                                <div className="flex flex-wrap items-center gap-1.5">
                                                    {!alert.is_read && <MarkAlertReadButton alertId={alert.id} />}
                                                    {entityHref && (alert.is_resolved ? (
                                                        <Button asChild variant="ghost" size="sm" className="h-8">
                                                            <Link href={entityHref}>Voir</Link>
                                                        </Button>
                                                    ) : (
                                                        <Button asChild variant="outline" size="sm" className="h-8">
                                                            <Link href={entityHref}>Traiter</Link>
                                                        </Button>
                                                    ))}
                                                </div>
                                            </div>
                                        </div>
                                    </li>
                                )
                            })}
                        </ul>
                    </Panel>
                )}
            </PageShell>
        </div>
    )
}
