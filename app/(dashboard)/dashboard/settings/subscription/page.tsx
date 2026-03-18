'use client'

import { useEffect, useState, useCallback } from 'react'
import { DashboardHeader } from '@/components/dashboard/header'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Card, CardContent } from '@/components/ui/card'
import { Separator } from '@/components/ui/separator'
import {
    CheckCircle2, AlertTriangle, Zap, Crown, Rocket, Loader2,
    Users, Building2, Package, UserCheck,
} from 'lucide-react'

interface Plan {
    id: string
    name: string
    description: string | null
    price_monthly: number
    price_yearly: number | null
    max_users: number
    max_depots: number
    max_products: number
    max_clients: number
    features: Record<string, boolean> | null
}

interface SubscriptionData {
    subscription: {
        subscription_status: string
        subscription_plan_id: string | null
        trial_ends_at: string | null
        plan_name: string | null
        price_monthly: number | null
        max_users: number | null
        max_depots: number | null
        max_products: number | null
        max_clients: number | null
    }
    plans: Plan[]
    usage: {
        user_count: number
        depot_count: number
        product_count: number
        client_count: number
    }
}

const statusInfo: Record<string, { label: string; color: string; icon: React.ElementType }> = {
    trialing: { label: 'Période d\'essai', color: 'bg-amber-50 text-amber-600', icon: AlertTriangle },
    active: { label: 'Actif', color: 'bg-emerald-50 text-emerald-600', icon: CheckCircle2 },
    past_due: { label: 'Paiement en retard', color: 'bg-rose-50 text-rose-600', icon: AlertTriangle },
    canceled: { label: 'Annulé', color: 'bg-slate-100 text-slate-500', icon: AlertTriangle },
}

const planIcons: Record<string, React.ElementType> = {
    starter: Zap,
    essentiel: Zap,
    professional: Crown,
    business: Crown,
    enterprise: Rocket,
    entreprise: Rocket,
}

const planColors: Record<string, { border: string; btn: string }> = {
    starter: { border: 'border-blue-200 bg-blue-50/30', btn: 'bg-blue-600 hover:bg-blue-700' },
    essentiel: { border: 'border-blue-200 bg-blue-50/30', btn: 'bg-blue-600 hover:bg-blue-700' },
    professional: { border: 'border-indigo-300 bg-indigo-50/30', btn: 'bg-indigo-600 hover:bg-indigo-700' },
    business: { border: 'border-indigo-300 bg-indigo-50/30', btn: 'bg-indigo-600 hover:bg-indigo-700' },
    enterprise: { border: 'border-slate-300 bg-slate-50/30', btn: 'bg-slate-900 hover:bg-slate-800' },
    entreprise: { border: 'border-slate-300 bg-slate-50/30', btn: 'bg-slate-900 hover:bg-slate-800' },
}

function formatLimit(n: number) {
    return n < 0 ? 'Illimité' : String(n)
}

export default function SubscriptionPage() {
    const [data, setData] = useState<SubscriptionData | null>(null)
    const [loading, setLoading] = useState(true)
    const [selecting, setSelecting] = useState<string | null>(null)
    const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null)

    const fetchData = useCallback(async () => {
        try {
            const res = await fetch('/api/subscription')
            const json = await res.json()
            if (json.success) setData(json.data)
        } catch { /* ignore */ }
        finally { setLoading(false) }
    }, [])

    useEffect(() => { fetchData() }, [fetchData])

    async function handleSelectPlan(planId: string) {
        setSelecting(planId)
        setMessage(null)
        try {
            const res = await fetch('/api/subscription', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ planId }),
            })
            const json = await res.json()
            if (res.ok) {
                setMessage({ type: 'success', text: json.message })
                fetchData()
            } else {
                setMessage({ type: 'error', text: json.error || 'Erreur' })
            }
        } catch {
            setMessage({ type: 'error', text: 'Erreur réseau' })
        } finally {
            setSelecting(null)
        }
    }

    if (loading) {
        return (
            <div className="flex flex-col min-h-screen bg-zinc-50/50">
                <DashboardHeader title="Abonnement" description="Chargement..." />
                <main className="flex-1 flex items-center justify-center">
                    <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
                </main>
            </div>
        )
    }

    const sub = data?.subscription
    const plans = data?.plans || []
    const usage = data?.usage
    const status = statusInfo[sub?.subscription_status || 'trialing'] || statusInfo.trialing
    const StatusIcon = status.icon

    const usageCards = usage ? [
        { label: 'Utilisateurs', value: Number(usage.user_count), limit: sub?.max_users, icon: Users, color: 'text-blue-600 bg-blue-50' },
        { label: 'Dépôts', value: Number(usage.depot_count), limit: sub?.max_depots, icon: Building2, color: 'text-indigo-600 bg-indigo-50' },
        { label: 'Produits', value: Number(usage.product_count), limit: sub?.max_products, icon: Package, color: 'text-emerald-600 bg-emerald-50' },
        { label: 'Clients', value: Number(usage.client_count), limit: sub?.max_clients, icon: UserCheck, color: 'text-amber-600 bg-amber-50' },
    ] : []

    return (
        <div className="flex flex-col min-h-screen bg-zinc-50/50">
            <DashboardHeader
                title="Abonnement"
                description="Gérez votre plan et votre facturation"
            />
            <main className="flex-1 p-4 lg:p-6 space-y-6 ">
                {message && (
                    <div className={`rounded-md p-4 text-sm font-bold ${message.type === 'success' ? 'bg-emerald-50 text-emerald-700 border border-emerald-200' : 'bg-rose-50 text-rose-700 border border-rose-200'}`}>
                        {message.text}
                    </div>
                )}

                {/* Status + Current Plan */}
                <div className="grid gap-6 sm:grid-cols-2">
                    <Card className="rounded-lg border-slate-200/60 shadow-sm">
                        <CardContent className="p-8 flex items-center gap-6">
                            <div className={`h-14 w-14 rounded-md flex items-center justify-center ${status.color}`}>
                                <StatusIcon className="h-7 w-7" />
                            </div>
                            <div>
                                <p className="text-[11px] font-semibold uppercase tracking-wider text-slate-400">Statut</p>
                                <p className="text-xl font-semibold text-slate-950">{status.label}</p>
                                {sub?.subscription_status === 'trialing' && sub?.trial_ends_at && (
                                    <p className="text-sm text-slate-500 font-medium mt-1">
                                        Expire le {new Date(sub.trial_ends_at).toLocaleDateString('fr-FR', { day: '2-digit', month: 'long', year: 'numeric' })}
                                    </p>
                                )}
                            </div>
                        </CardContent>
                    </Card>
                    <Card className="rounded-lg border-slate-200/60 shadow-sm">
                        <CardContent className="p-8 flex items-center gap-6">
                            <div className="h-14 w-14 rounded-md bg-slate-100 flex items-center justify-center text-slate-600">
                                <Crown className="h-7 w-7" />
                            </div>
                            <div>
                                <p className="text-[11px] font-semibold uppercase tracking-wider text-slate-400">Plan actuel</p>
                                <p className="text-xl font-semibold text-slate-950">{sub?.plan_name || 'Aucun plan sélectionné'}</p>
                                {sub?.price_monthly != null && (
                                    <p className="text-sm text-slate-500 font-medium mt-1">
                                        {new Intl.NumberFormat('fr-FR').format(Number(sub.price_monthly))} FCFA/mois
                                    </p>
                                )}
                            </div>
                        </CardContent>
                    </Card>
                </div>

                {/* Usage stats */}
                {usageCards.length > 0 && (
                    <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-4">
                        {usageCards.map((card) => {
                            const limit = card.limit != null ? Number(card.limit) : -1
                            const pct = limit > 0 ? Math.round((card.value / limit) * 100) : 0
                            const isOver = limit > 0 && card.value > limit
                            return (
                                <Card key={card.label} className="rounded-[2rem] border-slate-200/60 shadow-sm">
                                    <CardContent className="p-6">
                                        <div className="flex items-center gap-3 mb-4">
                                            <div className={`h-10 w-10 rounded-xl flex items-center justify-center ${card.color}`}>
                                                <card.icon className="h-5 w-5" />
                                            </div>
                                            <span className="text-[10px] font-semibold uppercase tracking-wider text-slate-400">{card.label}</span>
                                        </div>
                                        <div className="flex items-baseline gap-2 mb-2">
                                            <span className={`text-2xl font-semibold ${isOver ? 'text-rose-600' : 'text-slate-950'}`}>{card.value}</span>
                                            <span className="text-sm font-bold text-slate-400">/ {formatLimit(limit)}</span>
                                        </div>
                                        {limit > 0 && (
                                            <div className="h-1.5 rounded-full bg-slate-100 overflow-hidden">
                                                <div
                                                    className={`h-full rounded-full transition-all ${isOver ? 'bg-rose-500' : pct >= 80 ? 'bg-amber-500' : 'bg-emerald-500'}`}
                                                    style={{ width: `${Math.min(pct, 100)}%` }}
                                                />
                                            </div>
                                        )}
                                    </CardContent>
                                </Card>
                            )
                        })}
                    </div>
                )}

                <Separator />

                {/* Plans */}
                <div>
                    <h2 className="text-2xl font-semibold text-slate-950 mb-2">Choisissez votre plan</h2>
                    <p className="text-sm text-slate-400 font-medium mb-8">Tous les plans incluent les mises à jour gratuites.</p>

                    {plans.length === 0 ? (
                        <div className="text-center py-16">
                            <p className="text-slate-400 font-bold">Aucun plan disponible. Contactez le support.</p>
                        </div>
                    ) : (
                        <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
                            {plans.map((plan, idx) => {
                                const key = plan.name.toLowerCase()
                                const PlanIcon = planIcons[key] || (idx === 0 ? Zap : idx === 1 ? Crown : Rocket)
                                const colors = planColors[key] || (idx === 1 ? planColors.professional : idx === 2 ? planColors.enterprise : planColors.starter)
                                const isCurrent = sub?.subscription_plan_id === plan.id
                                const isPopular = idx === 1

                                return (
                                    <Card
                                        key={plan.id}
                                        className={`rounded-lg shadow-sm overflow-hidden relative ${colors.border} ${isPopular ? 'ring-2 ring-indigo-400' : ''} ${isCurrent ? 'ring-2 ring-emerald-400' : ''}`}
                                    >
                                        {isPopular && !isCurrent && (
                                            <div className="absolute top-6 right-6">
                                                <Badge className="rounded-xl bg-indigo-600 text-white border-none font-semibold text-[10px] uppercase tracking-wider px-4 py-1">
                                                    Populaire
                                                </Badge>
                                            </div>
                                        )}
                                        {isCurrent && (
                                            <div className="absolute top-6 right-6">
                                                <Badge className="rounded-xl bg-emerald-600 text-white border-none font-semibold text-[10px] uppercase tracking-wider px-4 py-1">
                                                    Plan actuel
                                                </Badge>
                                            </div>
                                        )}
                                        <CardContent className="p-8 space-y-6">
                                            <div className="flex items-center gap-4">
                                                <div className="h-12 w-12 rounded-md bg-white/80 flex items-center justify-center shadow-sm">
                                                    <PlanIcon className="h-6 w-6" />
                                                </div>
                                                <div>
                                                    <h3 className="text-xl font-semibold text-slate-950">{plan.name}</h3>
                                                    {plan.description && (
                                                        <p className="text-xs text-slate-400 font-medium">{plan.description}</p>
                                                    )}
                                                </div>
                                            </div>
                                            <div>
                                                <span className="text-4xl font-semibold text-slate-950">
                                                    {new Intl.NumberFormat('fr-FR').format(Number(plan.price_monthly))}
                                                </span>
                                                <span className="text-slate-500 font-bold ml-1">FCFA/mois</span>
                                            </div>
                                            <ul className="space-y-3">
                                                <li className="flex items-center gap-3 text-sm font-medium text-slate-600">
                                                    <CheckCircle2 className="h-4 w-4 text-emerald-500 shrink-0" />
                                                    {formatLimit(plan.max_users)} utilisateur{plan.max_users !== 1 ? 's' : ''}
                                                </li>
                                                <li className="flex items-center gap-3 text-sm font-medium text-slate-600">
                                                    <CheckCircle2 className="h-4 w-4 text-emerald-500 shrink-0" />
                                                    {formatLimit(plan.max_depots)} dépôt{plan.max_depots !== 1 ? 's' : ''}
                                                </li>
                                                <li className="flex items-center gap-3 text-sm font-medium text-slate-600">
                                                    <CheckCircle2 className="h-4 w-4 text-emerald-500 shrink-0" />
                                                    {formatLimit(plan.max_products)} produit{plan.max_products !== 1 ? 's' : ''}
                                                </li>
                                                {plan.max_clients !== 0 && (
                                                    <li className="flex items-center gap-3 text-sm font-medium text-slate-600">
                                                        <CheckCircle2 className="h-4 w-4 text-emerald-500 shrink-0" />
                                                        {formatLimit(plan.max_clients)} client{plan.max_clients !== 1 ? 's' : ''}
                                                    </li>
                                                )}
                                            </ul>
                                            <Button
                                                onClick={() => handleSelectPlan(plan.id)}
                                                disabled={isCurrent || selecting === plan.id}
                                                className={`w-full rounded-md h-12 font-bold text-white ${isCurrent ? 'bg-emerald-600 cursor-default' : colors.btn}`}
                                            >
                                                {selecting === plan.id ? (
                                                    <Loader2 className="h-4 w-4 animate-spin mr-2" />
                                                ) : null}
                                                {isCurrent ? 'Plan actuel' : 'Sélectionner'}
                                            </Button>
                                        </CardContent>
                                    </Card>
                                )
                            })}
                        </div>
                    )}
                </div>
            </main>
        </div>
    )
}
