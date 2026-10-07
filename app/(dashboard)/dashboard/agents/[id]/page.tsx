'use client'

import { useState, useEffect, useCallback } from 'react'
import { useParams, useRouter } from 'next/navigation'
import { DashboardHeader } from '@/components/dashboard/header'
import { Button } from '@/components/ui/button'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { PageShell, Panel, StatusBadge } from '@/components/app/blocks'
import { ArrowLeft, Phone, Mail, MapPin, Users, TrendingUp, UserX } from 'lucide-react'
import Link from 'next/link'
import { apiFetch, ApiError } from '@/lib/api-client'
import { formatMoney, formatNumber } from '@/lib/format'
import { EmptyState, ErrorState, PageSkeleton } from '@/components/states'

interface Agent {
    id: string
    full_name: string
    phone: string | null
    email: string | null
    zone: string | null
    commission_rate: number | null
    is_active: boolean
}
interface AssignedClient {
    id: string
    name: string
    phone: string | null
    zone: string | null
    total_sales: number
}
interface PerfRow {
    month: string
    total_sales: number
    orders_count: number
}
interface AgentDetail {
    agent: Agent
    clients: AssignedClient[]
    performance: PerfRow[]
}

const formatCurrency = formatMoney

export default function AgentDetailPage() {
    const params = useParams()
    const router = useRouter()
    const agentId = params.id as string
    const [data, setData] = useState<AgentDetail | null>(null)
    const [loading, setLoading] = useState(true)
    const [error, setError] = useState<string | null>(null)
    const [notFound, setNotFound] = useState(false)

    const load = useCallback(async () => {
        setLoading(true)
        setError(null)
        setNotFound(false)
        try {
            const result = await apiFetch(`/api/agents/${agentId}`)
            if (!result?.data) setNotFound(true)
            else setData(result.data)
        } catch (e) {
            if (e instanceof ApiError && e.status === 404) setNotFound(true)
            else setError(e instanceof Error ? e.message : 'Erreur lors du chargement')
        } finally {
            setLoading(false)
        }
    }, [agentId])

    useEffect(() => { load() }, [load])

    const backLink = (
        <Button variant="ghost" size="sm" className="-ml-2 text-muted-foreground hover:text-foreground" asChild>
            <Link href="/dashboard/agents">
                <ArrowLeft className="h-4 w-4" aria-hidden="true" /> Agents
            </Link>
        </Button>
    )

    if (loading) {
        return <PageSkeleton />
    }

    if (error) {
        return (
            <div className="flex min-h-screen flex-col">
                <DashboardHeader title="Commercial" />
                <PageShell>
                    {backLink}
                    <ErrorState title="Impossible de charger le commercial" description={error} onRetry={load} />
                </PageShell>
            </div>
        )
    }

    if (notFound || !data) {
        return (
            <div className="flex min-h-screen flex-col">
                <DashboardHeader title="Commercial" description="Introuvable" />
                <PageShell>
                    {backLink}
                    <EmptyState
                        icon={UserX}
                        title="Commercial introuvable"
                        description="Ce commercial n'existe pas ou a été supprimé."
                        action={{ label: 'Retour aux commerciaux', href: '/dashboard/agents' }}
                    />
                </PageShell>
            </div>
        )
    }

    const { agent, clients, performance } = data
    const totalSales = performance.reduce((s, p) => s + Number(p.total_sales), 0)
    const totalOrders = performance.reduce((s, p) => s + Number(p.orders_count), 0)

    return (
        <div className="flex min-h-screen flex-col">
            <DashboardHeader title={agent.full_name} description="Détail du commercial" />
            <PageShell>
                <div className="space-y-3">
                    {backLink}
                    <div className="flex flex-wrap items-center gap-3">
                        <h2 className="text-2xl font-semibold tracking-tight text-foreground">{agent.full_name}</h2>
                        <StatusBadge label={agent.is_active ? 'Actif' : 'Inactif'} tone={agent.is_active ? 'success' : 'default'} />
                    </div>
                    {agent.zone && <p className="text-sm text-muted-foreground">Zone : {agent.zone}</p>}
                </div>

                <div className="grid gap-4 lg:grid-cols-3">
                    <div className="space-y-4 lg:col-span-2">
                        <Panel title="Performance" description="Six derniers mois">
                            {performance.length > 0 ? (
                                <Table>
                                    <TableHeader>
                                        <TableRow>
                                            <TableHead className="pl-5">Mois</TableHead>
                                            <TableHead className="text-right">Commandes</TableHead>
                                            <TableHead className="pr-5 text-right">Ventes</TableHead>
                                        </TableRow>
                                    </TableHeader>
                                    <TableBody>
                                        {performance.map((p, i) => (
                                            <TableRow key={i}>
                                                <TableCell className="pl-5 text-sm">{p.month}</TableCell>
                                                <TableCell className="tabular text-right text-sm">{formatNumber(p.orders_count)}</TableCell>
                                                <TableCell className="tabular pr-5 text-right text-sm font-semibold">{formatCurrency(Number(p.total_sales))}</TableCell>
                                            </TableRow>
                                        ))}
                                    </TableBody>
                                </Table>
                            ) : (
                                <EmptyState
                                    icon={TrendingUp}
                                    className="m-4"
                                    title="Aucune donnée de performance"
                                    description="Les ventes de ce commercial apparaîtront ici mois par mois."
                                />
                            )}
                        </Panel>

                        <Panel title="Clients assignés" description={`${formatNumber(clients.length)} client(s)`}>
                            {clients.length > 0 ? (
                                <>
                                    <div className="hidden md:block">
                                        <Table>
                                            <TableHeader>
                                                <TableRow>
                                                    <TableHead className="pl-5">Client</TableHead>
                                                    <TableHead>Zone</TableHead>
                                                    <TableHead className="pr-5 text-right">Ventes</TableHead>
                                                </TableRow>
                                            </TableHeader>
                                            <TableBody>
                                                {clients.map((c) => (
                                                    <TableRow
                                                        key={c.id}
                                                        className="cursor-pointer"
                                                        onClick={() => router.push(`/dashboard/clients/${c.id}`)}
                                                    >
                                                        <TableCell className="pl-5">
                                                            <Link
                                                                href={`/dashboard/clients/${c.id}`}
                                                                onClick={(e) => e.stopPropagation()}
                                                                className="rounded-sm text-sm font-medium text-foreground hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                                                            >
                                                                {c.name}
                                                            </Link>
                                                            {c.phone && <p className="tabular text-xs text-muted-foreground">{c.phone}</p>}
                                                        </TableCell>
                                                        <TableCell className="text-sm text-muted-foreground">{c.zone || '—'}</TableCell>
                                                        <TableCell className="tabular pr-5 text-right text-sm font-semibold">{formatCurrency(Number(c.total_sales))}</TableCell>
                                                    </TableRow>
                                                ))}
                                            </TableBody>
                                        </Table>
                                    </div>
                                    <ul className="divide-y divide-border md:hidden">
                                        {clients.map((c) => (
                                            <li key={c.id}>
                                                <Link
                                                    href={`/dashboard/clients/${c.id}`}
                                                    className="flex items-center justify-between gap-3 px-4 py-3 transition-colors hover:bg-muted/50 focus-visible:bg-muted/50 focus-visible:outline-none"
                                                >
                                                    <div className="min-w-0">
                                                        <p className="truncate text-sm font-medium text-foreground">{c.name}</p>
                                                        <p className="truncate text-xs text-muted-foreground">
                                                            {[c.zone, c.phone].filter(Boolean).join(' · ') || '—'}
                                                        </p>
                                                    </div>
                                                    <span className="tabular shrink-0 text-sm font-semibold text-foreground">{formatCurrency(Number(c.total_sales))}</span>
                                                </Link>
                                            </li>
                                        ))}
                                    </ul>
                                </>
                            ) : (
                                <EmptyState
                                    icon={Users}
                                    className="m-4"
                                    title="Aucun client assigné"
                                    description="Assignez des clients à ce commercial depuis leur fiche."
                                    action={{ label: 'Voir les clients', href: '/dashboard/clients' }}
                                />
                            )}
                        </Panel>
                    </div>

                    <Panel title="Résumé" className="h-fit" bodyClassName="divide-y divide-border">
                        <dl className="space-y-3 px-5 py-4 text-sm">
                            <div className="flex items-center justify-between gap-4">
                                <dt className="text-muted-foreground">Ventes (6 mois)</dt>
                                <dd className="tabular font-semibold text-foreground">{formatCurrency(totalSales)}</dd>
                            </div>
                            <div className="flex items-center justify-between gap-4">
                                <dt className="text-muted-foreground">Commandes (6 mois)</dt>
                                <dd className="tabular font-medium text-foreground">{formatNumber(totalOrders)}</dd>
                            </div>
                            <div className="flex items-center justify-between gap-4">
                                <dt className="text-muted-foreground">Clients assignés</dt>
                                <dd className="tabular font-medium text-foreground">{formatNumber(clients.length)}</dd>
                            </div>
                            <div className="flex items-center justify-between gap-4">
                                <dt className="text-muted-foreground">Taux de commission</dt>
                                <dd className="tabular font-medium text-foreground">
                                    {agent.commission_rate != null ? `${formatNumber(agent.commission_rate)} %` : '—'}
                                </dd>
                            </div>
                        </dl>
                        <div className="space-y-2.5 px-5 py-4 text-sm">
                            <p className="text-xs font-medium text-muted-foreground">Contact</p>
                            {agent.phone || agent.email || agent.zone ? (
                                <>
                                    {agent.phone && (
                                        <a href={`tel:${agent.phone}`} className="flex items-center gap-2 text-foreground transition-colors hover:text-brand-strong">
                                            <Phone className="h-4 w-4 text-muted-foreground" aria-hidden="true" />
                                            <span className="tabular">{agent.phone}</span>
                                        </a>
                                    )}
                                    {agent.email && (
                                        <a href={`mailto:${agent.email}`} className="flex items-center gap-2 break-all text-foreground transition-colors hover:text-brand-strong">
                                            <Mail className="h-4 w-4 shrink-0 text-muted-foreground" aria-hidden="true" />
                                            {agent.email}
                                        </a>
                                    )}
                                    {agent.zone && (
                                        <p className="flex items-center gap-2 text-foreground">
                                            <MapPin className="h-4 w-4 text-muted-foreground" aria-hidden="true" />
                                            {agent.zone}
                                        </p>
                                    )}
                                </>
                            ) : (
                                <p className="text-muted-foreground">Aucune coordonnée renseignée.</p>
                            )}
                        </div>
                    </Panel>
                </div>
            </PageShell>
        </div>
    )
}
