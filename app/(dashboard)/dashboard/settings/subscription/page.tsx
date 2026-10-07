'use client'

import { useEffect, useState, useCallback } from 'react'
import Link from 'next/link'
import { DashboardHeader } from '@/components/dashboard/header'
import { PageShell, Panel, StatCard, StatusBadge } from '@/components/app/blocks'
import { Button } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'
import { ErrorState } from '@/components/states'
import { apiFetch, errorMessage } from '@/lib/api-client'
import { formatDateShort, formatNumber } from '@/lib/format'
import { CheckCircle2, AlertTriangle, Crown, ArrowLeft, ArrowRight, Clock, CalendarClock, type LucideIcon } from 'lucide-react'

/**
 * Récapitulatif de l'abonnement.
 *
 * Avant : la page lisait des champs que /api/subscription ne renvoie pas
 * (statut, quotas d'usage) et son bouton « Sélectionner » appelait un
 * POST /api/subscription inexistant. Le choix et le paiement d'une offre se
 * font sur /dashboard/plans ; cette page affiche l'état réel et y renvoie.
 */

interface SubscriptionInfo {
    isActive: boolean
    status: 'trialing' | 'active' | 'expired' | 'past_due' | 'canceled' | 'not_found'
    planName: string | null
    daysRemaining: number
    endsAt: string | null
    trialEndsAt: string | null
}

type Tone = 'default' | 'success' | 'warning' | 'danger'

const statusInfo: Record<SubscriptionInfo['status'], { label: string; tone: Tone; icon: LucideIcon }> = {
    trialing: { label: "Période d'essai", tone: 'warning', icon: Clock },
    active: { label: 'Actif', tone: 'success', icon: CheckCircle2 },
    expired: { label: 'Expiré', tone: 'danger', icon: AlertTriangle },
    past_due: { label: 'Paiement en retard', tone: 'danger', icon: AlertTriangle },
    canceled: { label: 'Annulé', tone: 'default', icon: AlertTriangle },
    not_found: { label: 'Introuvable', tone: 'default', icon: AlertTriangle },
}

function remainingText(sub: SubscriptionInfo): string | null {
    if (sub.status === 'trialing') {
        return `Essai gratuit : ${formatNumber(sub.daysRemaining)} jour${sub.daysRemaining > 1 ? 's' : ''} restant${sub.daysRemaining > 1 ? 's' : ''} (jusqu'au ${formatDateShort(sub.trialEndsAt)})`
    }
    if (sub.status === 'active') {
        if (!sub.endsAt) return 'Sans date de fin'
        return `Valable jusqu'au ${formatDateShort(sub.endsAt)} (${formatNumber(sub.daysRemaining)} jour${sub.daysRemaining > 1 ? 's' : ''} restant${sub.daysRemaining > 1 ? 's' : ''})`
    }
    if (sub.endsAt) return `Terminé le ${formatDateShort(sub.endsAt)}`
    return null
}

export default function SubscriptionPage() {
    const [sub, setSub] = useState<SubscriptionInfo | null>(null)
    const [loading, setLoading] = useState(true)
    const [loadError, setLoadError] = useState<string | null>(null)

    const fetchData = useCallback(async () => {
        setLoading(true)
        setLoadError(null)
        try {
            const json = await apiFetch<{ data: { subscription: SubscriptionInfo } }>('/api/subscription')
            setSub(json.data.subscription)
        } catch (e) {
            setLoadError(errorMessage(e))
        } finally {
            setLoading(false)
        }
    }, [])

    useEffect(() => { fetchData() }, [fetchData])

    const status = sub ? statusInfo[sub.status] ?? statusInfo.not_found : null
    const needsAction = sub ? !sub.isActive || (sub.status === 'trialing' || sub.daysRemaining <= 7) : false
    const endDate = sub ? (sub.status === 'trialing' ? sub.trialEndsAt : sub.endsAt) : null

    return (
        <div className="flex min-h-screen flex-col">
            <DashboardHeader
                title="Abonnement"
                description="Suivez votre offre et son échéance"
            />
            <PageShell>
                <div>
                    <Button variant="ghost" size="sm" asChild className="-ml-2 text-muted-foreground hover:text-foreground">
                        <Link href="/dashboard/settings">
                            <ArrowLeft className="mr-1.5 h-4 w-4" aria-hidden="true" />
                            Paramètres
                        </Link>
                    </Button>
                </div>

                {loading ? (
                    <div className="space-y-6" aria-busy="true" aria-label="Chargement">
                        <div className="grid gap-4 sm:grid-cols-3">
                            {Array.from({ length: 3 }, (_, i) => (
                                <Skeleton key={i} className="h-28 rounded-xl" />
                            ))}
                        </div>
                        <Skeleton className="h-40 rounded-xl" />
                    </div>
                ) : loadError || !sub || !status ? (
                    <ErrorState description={loadError ?? undefined} onRetry={fetchData} />
                ) : (
                    <>
                        <div className="grid gap-4 sm:grid-cols-3">
                            <StatCard
                                label="Offre actuelle"
                                value={sub.status === 'trialing' ? 'Essai gratuit' : sub.planName || 'Aucune offre'}
                                icon={Crown}
                                tone="brand"
                            />
                            <StatCard
                                label="Statut"
                                value={status.label}
                                icon={status.icon}
                                tone={status.tone}
                            />
                            <StatCard
                                label="Jours restants"
                                value={sub.isActive ? formatNumber(sub.daysRemaining) : '—'}
                                hint={endDate ? `Échéance : ${formatDateShort(endDate)}` : undefined}
                                icon={CalendarClock}
                                tone={sub.isActive && sub.daysRemaining <= 7 ? 'warning' : 'default'}
                            />
                        </div>

                        <Panel
                            title="Votre abonnement"
                            description="Le choix et le paiement d'une offre se font sur la page des offres."
                            bodyClassName="divide-y divide-border"
                        >
                            <dl className="divide-y divide-border">
                                <div className="flex items-center justify-between gap-4 px-5 py-3.5">
                                    <dt className="text-sm text-muted-foreground">Offre</dt>
                                    <dd className="text-sm font-medium text-foreground">
                                        {sub.status === 'trialing' ? 'Essai gratuit' : sub.planName || 'Aucune offre'}
                                    </dd>
                                </div>
                                <div className="flex items-center justify-between gap-4 px-5 py-3.5">
                                    <dt className="text-sm text-muted-foreground">Statut</dt>
                                    <dd><StatusBadge label={status.label} tone={status.tone} /></dd>
                                </div>
                                {remainingText(sub) && (
                                    <div className="flex items-center justify-between gap-4 px-5 py-3.5">
                                        <dt className="text-sm text-muted-foreground">Échéance</dt>
                                        <dd className="tabular text-right text-sm text-foreground">{remainingText(sub)}</dd>
                                    </div>
                                )}
                            </dl>
                            <div
                                className={`flex flex-col justify-between gap-4 px-5 py-4 sm:flex-row sm:items-center ${needsAction ? 'bg-warning-soft' : 'bg-muted/40'}`}
                            >
                                <div className="flex items-start gap-3">
                                    {needsAction && (
                                        <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-warning-foreground" aria-hidden="true" />
                                    )}
                                    <div>
                                        <p className={`text-sm font-medium ${needsAction ? 'text-warning-foreground' : 'text-foreground'}`}>
                                            {!sub.isActive
                                                ? 'Votre accès est suspendu jusqu’au renouvellement.'
                                                : sub.status === 'trialing'
                                                    ? "Choisissez une offre avant la fin de l'essai pour ne pas être interrompu."
                                                    : 'Changer d’offre ou prolonger votre abonnement'}
                                        </p>
                                        <p className="mt-0.5 text-xs text-muted-foreground">
                                            Comparez les offres et payez en ligne (Mobile Money, carte).
                                        </p>
                                    </div>
                                </div>
                                <Button asChild variant="brand" className="shrink-0">
                                    <Link href="/dashboard/plans">
                                        Voir les offres <ArrowRight className="ml-2 h-4 w-4" aria-hidden="true" />
                                    </Link>
                                </Button>
                            </div>
                        </Panel>
                    </>
                )}
            </PageShell>
        </div>
    )
}
