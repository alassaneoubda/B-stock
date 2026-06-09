'use client'

import { useState, useEffect } from 'react'
import { useParams } from 'next/navigation'
import { DashboardHeader } from '@/components/dashboard/header'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { ArrowLeft, Loader2, Phone, Mail, MapPin, Users, TrendingUp } from 'lucide-react'
import Link from 'next/link'

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

const formatCurrency = (n: number) =>
    new Intl.NumberFormat('fr-FR', { style: 'currency', currency: 'XOF', maximumFractionDigits: 0 }).format(n || 0)

export default function AgentDetailPage() {
    const params = useParams()
    const agentId = params.id as string
    const [data, setData] = useState<AgentDetail | null>(null)
    const [loading, setLoading] = useState(true)
    const [error, setError] = useState<string | null>(null)

    useEffect(() => {
        fetch(`/api/agents/${agentId}`)
            .then((r) => r.json())
            .then((result) => {
                if (!result.data) {
                    setError('Commercial introuvable')
                    return
                }
                setData(result.data)
            })
            .catch(() => setError('Erreur lors du chargement'))
            .finally(() => setLoading(false))
    }, [agentId])

    if (loading) {
        return (
            <div className="flex flex-col min-h-screen">
                <DashboardHeader title="Commercial" description="Chargement..." />
                <main className="flex-1 flex items-center justify-center">
                    <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
                </main>
            </div>
        )
    }

    if (error || !data) {
        return (
            <div className="flex flex-col min-h-screen">
                <DashboardHeader title="Commercial" description="Introuvable" />
                <main className="flex-1 p-4 lg:p-6">
                    <div className="rounded-lg bg-destructive/10 border border-destructive/20 p-4 text-sm text-destructive">
                        {error || 'Commercial introuvable'}
                    </div>
                    <div className="mt-4">
                        <Button variant="outline" asChild>
                            <Link href="/dashboard/agents">
                                <ArrowLeft className="h-4 w-4 mr-2" /> Retour
                            </Link>
                        </Button>
                    </div>
                </main>
            </div>
        )
    }

    const { agent, clients, performance } = data

    return (
        <div className="flex flex-col min-h-screen">
            <DashboardHeader title={agent.full_name} description="Détail du commercial" />
            <main className="flex-1 p-4 lg:p-6 space-y-6">
                <Button variant="ghost" size="sm" asChild>
                    <Link href="/dashboard/agents">
                        <ArrowLeft className="h-4 w-4 mr-2" /> Retour
                    </Link>
                </Button>

                <Card>
                    <CardHeader>
                        <CardTitle className="flex items-center gap-2">
                            {agent.full_name}
                            <Badge variant={agent.is_active ? 'secondary' : 'outline'}>
                                {agent.is_active ? 'Actif' : 'Inactif'}
                            </Badge>
                            {agent.commission_rate != null && (
                                <Badge variant="outline">Commission {agent.commission_rate}%</Badge>
                            )}
                        </CardTitle>
                    </CardHeader>
                    <CardContent className="grid gap-3 sm:grid-cols-2 text-sm">
                        {agent.phone && (
                            <div className="flex items-center gap-2 text-muted-foreground"><Phone className="h-4 w-4" /> {agent.phone}</div>
                        )}
                        {agent.email && (
                            <div className="flex items-center gap-2 text-muted-foreground"><Mail className="h-4 w-4" /> {agent.email}</div>
                        )}
                        {agent.zone && (
                            <div className="flex items-center gap-2 text-muted-foreground"><MapPin className="h-4 w-4" /> {agent.zone}</div>
                        )}
                    </CardContent>
                </Card>

                <div className="grid gap-6 lg:grid-cols-2">
                    <Card>
                        <CardHeader>
                            <CardTitle className="flex items-center gap-2 text-base">
                                <TrendingUp className="h-4 w-4 text-muted-foreground" /> Performance (6 mois)
                            </CardTitle>
                        </CardHeader>
                        <CardContent>
                            {performance.length > 0 ? (
                                <div className="overflow-x-auto">
                                    <table className="w-full text-sm">
                                        <thead className="text-left text-muted-foreground">
                                            <tr><th className="p-2">Mois</th><th className="p-2 text-center">Commandes</th><th className="p-2 text-right">Ventes</th></tr>
                                        </thead>
                                        <tbody className="divide-y">
                                            {performance.map((p, i) => (
                                                <tr key={i}>
                                                    <td className="p-2">{p.month}</td>
                                                    <td className="p-2 text-center">{p.orders_count}</td>
                                                    <td className="p-2 text-right font-medium">{formatCurrency(Number(p.total_sales))}</td>
                                                </tr>
                                            ))}
                                        </tbody>
                                    </table>
                                </div>
                            ) : (
                                <p className="text-sm text-muted-foreground">Aucune donnée de performance.</p>
                            )}
                        </CardContent>
                    </Card>

                    <Card>
                        <CardHeader>
                            <CardTitle className="flex items-center gap-2 text-base">
                                <Users className="h-4 w-4 text-muted-foreground" /> Clients assignés ({clients.length})
                            </CardTitle>
                        </CardHeader>
                        <CardContent>
                            {clients.length > 0 ? (
                                <div className="overflow-x-auto">
                                    <table className="w-full text-sm">
                                        <thead className="text-left text-muted-foreground">
                                            <tr><th className="p-2">Client</th><th className="p-2">Zone</th><th className="p-2 text-right">Ventes</th></tr>
                                        </thead>
                                        <tbody className="divide-y">
                                            {clients.map((c) => (
                                                <tr key={c.id}>
                                                    <td className="p-2">
                                                        <Link href={`/dashboard/clients/${c.id}`} className="font-medium hover:underline">{c.name}</Link>
                                                    </td>
                                                    <td className="p-2 text-muted-foreground">{c.zone || '—'}</td>
                                                    <td className="p-2 text-right font-medium">{formatCurrency(Number(c.total_sales))}</td>
                                                </tr>
                                            ))}
                                        </tbody>
                                    </table>
                                </div>
                            ) : (
                                <p className="text-sm text-muted-foreground">Aucun client assigné.</p>
                            )}
                        </CardContent>
                    </Card>
                </div>
            </main>
        </div>
    )
}
