'use client'

import { useEffect, useState, useCallback } from 'react'
import Link from 'next/link'
import { DashboardHeader } from '@/components/dashboard/header'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { Skeleton } from '@/components/ui/skeleton'
import { ErrorState } from '@/components/states'
import { apiFetch, errorMessage } from '@/lib/api-client'
import { formatDateShort, formatNumber } from '@/lib/format'
import { CheckCircle2, AlertTriangle, Crown, ArrowRight, Clock } from 'lucide-react'

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

const statusInfo: Record<SubscriptionInfo['status'], { label: string; color: string; icon: React.ElementType }> = {
    trialing: { label: "Période d'essai", color: 'bg-warning-soft text-warning-foreground', icon: Clock },
    active: { label: 'Actif', color: 'bg-success-soft text-success', icon: CheckCircle2 },
    expired: { label: 'Expiré', color: 'bg-destructive/10 text-destructive', icon: AlertTriangle },
    past_due: { label: 'Paiement en retard', color: 'bg-destructive/10 text-destructive', icon: AlertTriangle },
    canceled: { label: 'Annulé', color: 'bg-muted text-muted-foreground', icon: AlertTriangle },
    not_found: { label: 'Introuvable', color: 'bg-muted text-muted-foreground', icon: AlertTriangle },
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
    const StatusIcon = status?.icon ?? Clock
    const needsAction = sub ? !sub.isActive || (sub.status === 'trialing' || sub.daysRemaining <= 7) : false

    return (
        <div className="flex flex-col min-h-screen bg-muted/30">
            <DashboardHeader
                title="Abonnement"
                description="Suivez votre offre et son échéance"
            />
            <main className="flex-1 p-4 lg:p-6 space-y-6 max-w-4xl">
                {loading ? (
                    <div className="grid gap-6 sm:grid-cols-2" aria-busy="true" aria-label="Chargement">
                        <Skeleton className="h-32 rounded-lg" />
                        <Skeleton className="h-32 rounded-lg" />
                    </div>
                ) : loadError || !sub || !status ? (
                    <ErrorState description={loadError ?? undefined} onRetry={fetchData} />
                ) : (
                    <>
                        <div className="grid gap-6 sm:grid-cols-2">
                            <Card className="rounded-lg border-border shadow-sm">
                                <CardContent className="p-8 flex items-center gap-6">
                                    <div className={`h-14 w-14 shrink-0 rounded-md flex items-center justify-center ${status.color}`}>
                                        <StatusIcon className="h-7 w-7" aria-hidden="true" />
                                    </div>
                                    <div>
                                        <p className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">Statut</p>
                                        <p className="text-xl font-semibold text-foreground">{status.label}</p>
                                        {remainingText(sub) && (
                                            <p className="text-sm text-muted-foreground font-medium mt-1">{remainingText(sub)}</p>
                                        )}
                                    </div>
                                </CardContent>
                            </Card>
                            <Card className="rounded-lg border-border shadow-sm">
                                <CardContent className="p-8 flex items-center gap-6">
                                    <div className="h-14 w-14 shrink-0 rounded-md bg-muted flex items-center justify-center text-muted-foreground">
                                        <Crown className="h-7 w-7" aria-hidden="true" />
                                    </div>
                                    <div>
                                        <p className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">Offre actuelle</p>
                                        <p className="text-xl font-semibold text-foreground">
                                            {sub.status === 'trialing' ? 'Essai gratuit' : sub.planName || 'Aucune offre'}
                                        </p>
                                    </div>
                                </CardContent>
                            </Card>
                        </div>

                        <Card className={`rounded-lg shadow-sm ${needsAction ? 'border-warning/30 bg-warning-soft' : 'border-border'}`}>
                            <CardContent className="p-6 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                                <div>
                                    <p className="font-semibold text-foreground">
                                        {!sub.isActive
                                            ? 'Votre accès est suspendu jusqu’au renouvellement.'
                                            : sub.status === 'trialing'
                                                ? "Choisissez une offre avant la fin de l'essai pour ne pas être interrompu."
                                                : 'Changer d’offre ou prolonger votre abonnement'}
                                    </p>
                                    <p className="text-sm text-muted-foreground mt-1">
                                        Comparez les offres et payez en ligne (Mobile Money, carte) sur la page des offres.
                                    </p>
                                </div>
                                <Button asChild className="shrink-0">
                                    <Link href="/dashboard/plans">
                                        Voir les offres <ArrowRight className="h-4 w-4 ml-2" aria-hidden="true" />
                                    </Link>
                                </Button>
                            </CardContent>
                        </Card>
                    </>
                )}
            </main>
        </div>
    )
}
