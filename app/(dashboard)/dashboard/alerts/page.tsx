import { requirePageSession } from '@/lib/page-auth'
import { sql } from '@/lib/db'
import { DashboardHeader } from '@/components/dashboard/header'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Bell, AlertTriangle, CheckCircle, Package, CreditCard, ArchiveRestore, X, Info, ShieldAlert, History } from 'lucide-react'
import Link from 'next/link'
import { GenerateAlertsButton, MarkAllReadButton, MarkAlertReadButton } from '@/components/dashboard/alerts-actions'
import { formatDateTime, formatNumber, formatRelative } from '@/lib/format'

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
 * packaging_debt), 'sales_order' (payment_overdue). Type inconnu : pas de lien.
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
        default:
            return null
    }
}

const alertTypeConfig: Record<string, { label: string; icon: any; bg: string; text: string }> = {
    low_stock: { label: 'Stock critique', icon: Package, bg: 'bg-rose-50', text: 'text-rose-600' },
    expiry: { label: 'Péremption', icon: History, bg: 'bg-amber-50', text: 'text-amber-600' },
    credit_limit: { label: 'Limite Crédit', icon: CreditCard, bg: 'bg-indigo-50', text: 'text-indigo-600' },
    packaging_debt: { label: 'Dette Emballage', icon: ArchiveRestore, bg: 'bg-orange-50', text: 'text-orange-600' },
    payment_overdue: { label: 'Retard Paiement', icon: CreditCard, bg: 'bg-rose-50', text: 'text-rose-600' },
    low_packaging: { label: 'Emballages', icon: Package, bg: 'bg-slate-50', text: 'text-slate-600' },
}

const severityConfig: Record<string, { label: string; bg: string; text: string; ring: string }> = {
    low: { label: 'Mineur', bg: 'bg-slate-100', text: 'text-slate-500', ring: 'ring-slate-200' },
    medium: { label: 'Modéré', bg: 'bg-blue-100', text: 'text-blue-600', ring: 'ring-blue-200' },
    high: { label: 'Élevé', bg: 'bg-orange-100', text: 'text-orange-600', ring: 'ring-orange-200' },
    critical: { label: 'Urgent', bg: 'bg-rose-100', text: 'text-rose-600', ring: 'ring-rose-200' },
}

export default async function AlertsPage() {
    const session = await requirePageSession()
    const companyId = session?.user?.companyId || ''
    const alerts = await getAlerts(companyId)

    const unreadCount = alerts.filter(a => !a.is_read).length
    const criticalCount = alerts.filter(a => a.severity === 'critical' || a.severity === 'high').length
    const resolvedCount = alerts.filter(a => a.is_resolved).length

    const statsCards = [
        {
            title: "Actions Requises",
            value: unreadCount,
            description: "Notifications non lues",
            icon: Bell,
            color: "text-rose-600",
            bg: "bg-rose-600/10"
        },
        {
            title: "Niveau Critique",
            value: criticalCount,
            description: "Priorité absolue",
            icon: ShieldAlert,
            color: "text-orange-600",
            bg: "bg-orange-600/10"
        },
        {
            title: "Résolutions",
            value: resolvedCount,
            description: "Alertes traitées",
            icon: CheckCircle,
            color: "text-emerald-600",
            bg: "bg-emerald-600/10"
        }
    ]

    return (
        <div className="flex flex-col min-h-screen bg-zinc-50/50">
            <DashboardHeader
                title="Centre de Surveillance"
                description="Suivi intelligent des points de vigilance opérationnels"
                actions={<GenerateAlertsButton />}
            />

            <main className="flex-1 p-4 lg:p-6 space-y-6 ">
                {/* Stats Grid */}
                <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
                    {statsCards.map((stat) => (
                        <div
                            key={stat.title}
                            className="group relative overflow-hidden rounded-lg bg-white p-8 shadow-sm border border-slate-200/60 hover:shadow-md hover:shadow-blue-500/5 hover:-translate-y-1 transition-all duration-500"
                        >
                            <div className="relative z-10 flex flex-col gap-6">
                                <div className={`flex h-14 w-14 items-center justify-center rounded-md ${stat.bg} ${stat.color} transition-transform group-hover:scale-110 duration-500`}>
                                    <stat.icon className="h-7 w-7" />
                                </div>
                                <div>
                                    <p className="text-[11px] font-semibold uppercase tracking-wider text-slate-400 mb-2">{stat.title}</p>
                                    <div className="text-3xl font-semibold text-slate-950 tracking-tight">{formatNumber(stat.value)}</div>
                                    <p className="text-sm font-bold text-slate-400 mt-2">{stat.description}</p>
                                </div>
                            </div>
                            <div className="absolute -right-4 -bottom-4 h-32 w-32 bg-slate-50 rounded-full opacity-50 group-hover:scale-150 transition-transform duration-700" />
                        </div>
                    ))}
                </div>

                {/* Alerts List */}
                <div className="rounded-lg bg-white border border-slate-200/60 shadow-sm overflow-hidden">
                    <div className="px-8 py-8 border-b border-slate-100 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                        <div>
                            <h3 className="text-2xl font-semibold text-slate-950 tracking-tight">Flux d&apos;Alertes</h3>
                            <p className="text-sm font-medium text-slate-400 mt-1">Intelligence opérationnelle et diagnostics</p>
                        </div>
                        <MarkAllReadButton hasUnread={unreadCount > 0} />
                    </div>

                    <div className="p-8 space-y-4">
                        {alerts.length === 0 ? (
                            <div className="text-center py-24 flex flex-col items-center">
                                <div className="h-24 w-24 rounded-full bg-emerald-50 flex items-center justify-center mb-6">
                                    <CheckCircle className="h-10 w-10 text-emerald-500" />
                                </div>
                                <h3 className="text-xl font-semibold text-slate-950">Système opérationnel</h3>
                                <p className="mt-2 text-slate-400 font-medium max-w-xs mx-auto">
                                    Bravo ! Aucune anomalie n&apos;a été détectée dans votre flux de gestion actuel.
                                </p>
                            </div>
                        ) : (
                            <div className="flex flex-col gap-4">
                                {alerts.map((alert) => {
                                    const typeInfo = alertTypeConfig[alert.alert_type] || {
                                        label: alert.alert_type,
                                        icon: Bell,
                                        bg: 'bg-slate-50',
                                        text: 'text-slate-400'
                                    }
                                    const severityInfo = severityConfig[alert.severity] || {
                                        label: alert.severity,
                                        bg: 'bg-slate-100',
                                        text: 'text-slate-500',
                                        ring: 'ring-slate-200'
                                    }
                                    const AlertIcon = typeInfo.icon
                                    const entityHref = alertEntityHref(alert)

                                    return (
                                        <div
                                            key={alert.id}
                                            className={`group relative flex items-start gap-6 p-6 rounded-lg border transition-all duration-300 ${!alert.is_read
                                                    ? 'bg-white border-slate-200/80 shadow-md hover:shadow-md hover:border-blue-200'
                                                    : 'bg-slate-50/50 border-transparent opacity-75 grayscale-[0.5]'
                                                } ${alert.is_resolved ? 'opacity-40 grayscale' : ''}`}
                                        >
                                            <div className={`mt-0.5 shrink-0 h-14 w-14 rounded-md flex items-center justify-center transition-transform group-hover:scale-105 ${typeInfo.bg} ${typeInfo.text} shadow-sm border border-white/50`}>
                                                <AlertIcon className="h-7 w-7" />
                                            </div>
                                            <div className="flex-1 min-w-0">
                                                <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-4">
                                                    <div>
                                                        <div className="flex items-center gap-3 mb-1.5">
                                                            <h4 className="text-lg font-semibold text-slate-950 tracking-tight leading-tight">
                                                                {alert.title}
                                                            </h4>
                                                            <Badge className={`rounded-full px-3 py-0.5 font-semibold uppercase text-[9px] tracking-wider border-none ring-1 ${severityInfo.ring} ${severityInfo.bg} ${severityInfo.text}`}>
                                                                {severityInfo.label}
                                                            </Badge>
                                                        </div>
                                                        {alert.message && (
                                                            <p className="text-sm font-medium text-slate-500 leading-relaxed max-w-2xl">{alert.message}</p>
                                                        )}
                                                    </div>
                                                    <div className="flex flex-row sm:flex-col items-center sm:items-end justify-between gap-3 shrink-0">
                                                        <div className="flex items-center gap-2">
                                                            {!alert.is_read && (
                                                                <span className="h-2 w-2 rounded-full bg-blue-500 animate-pulse" />
                                                            )}
                                                            <span className="text-[11px] font-semibold text-slate-300 uppercase tracking-wider">
                                                                <time dateTime={new Date(alert.created_at).toISOString()} title={formatDateTime(alert.created_at)}>
                                                                    {formatRelative(alert.created_at)}
                                                                </time>
                                                            </span>
                                                        </div>
                                                        {alert.is_resolved && (
                                                            <div className="flex items-center gap-1.5 px-3 py-1 rounded-full bg-emerald-50 border border-emerald-100 text-emerald-600">
                                                                <CheckCircle className="h-3 w-3" />
                                                                <span className="text-[10px] font-semibold uppercase tracking-wider">Résolu</span>
                                                            </div>
                                                        )}
                                                    </div>
                                                </div>

                                                <div className="mt-6 flex items-center justify-between">
                                                    <div className="flex items-center gap-3">
                                                        <Badge variant="outline" className="rounded-lg bg-white border-slate-100 text-[10px] font-semibold uppercase text-slate-400 tracking-wider h-7 px-3 flex items-center gap-2 shadow-sm">
                                                            <Info className="h-3 w-3" />
                                                            {typeInfo.label}
                                                        </Badge>
                                                        {entityHref && (
                                                            <Link
                                                                href={entityHref}
                                                                className="text-[10px] font-semibold text-blue-600 uppercase tracking-wider hover:underline hover:text-blue-700 transition-colors"
                                                            >
                                                                Voir l&apos;entité associée
                                                            </Link>
                                                        )}
                                                    </div>
                                                    <div className="flex items-center gap-2 opacity-0 group-hover:opacity-100 focus-within:opacity-100 transition-opacity">
                                                        {!alert.is_read && <MarkAlertReadButton alertId={alert.id} />}
                                                        {!alert.is_resolved && entityHref && (
                                                            <Button asChild size="sm" className="h-8 rounded-xl bg-slate-900 text-white font-semibold text-[10px] uppercase tracking-wider px-4 shadow-lg active:scale-95 transition-all">
                                                                <Link href={entityHref}>Traiter</Link>
                                                            </Button>
                                                        )}
                                                    </div>
                                                </div>
                                            </div>
                                        </div>
                                    )
                                })}
                            </div>
                        )}
                    </div>
                </div>
            </main>
        </div>
    )
}
