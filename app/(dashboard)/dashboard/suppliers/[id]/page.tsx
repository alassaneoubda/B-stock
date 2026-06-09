'use client'

import { useState, useEffect } from 'react'
import { useParams } from 'next/navigation'
import { DashboardHeader } from '@/components/dashboard/header'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { ArrowLeft, Loader2, Pencil, Plus, Phone, Mail, MapPin, Building2 } from 'lucide-react'
import Link from 'next/link'

interface PurchaseOrder {
    id: string
    order_number: string
    total_amount: number
    status: string
    created_at: string
}

interface Supplier {
    id: string
    name: string
    type: string | null
    contact_name: string | null
    phone: string | null
    email: string | null
    address: string | null
    notes: string | null
    recentOrders?: PurchaseOrder[]
}

const typeLabels: Record<string, string> = {
    manufacturer: 'Fabricant',
    distributor: 'Distributeur',
    wholesaler: 'Grossiste',
}

const formatCurrency = (n: number) =>
    new Intl.NumberFormat('fr-FR', { style: 'currency', currency: 'XOF', maximumFractionDigits: 0 }).format(n || 0)

export default function SupplierDetailPage() {
    const params = useParams()
    const supplierId = params.id as string
    const [supplier, setSupplier] = useState<Supplier | null>(null)
    const [loading, setLoading] = useState(true)
    const [error, setError] = useState<string | null>(null)

    useEffect(() => {
        fetch(`/api/suppliers/${supplierId}`)
            .then((r) => r.json())
            .then((result) => {
                if (!result.data) {
                    setError('Fournisseur introuvable')
                    return
                }
                setSupplier(result.data)
            })
            .catch(() => setError('Erreur lors du chargement'))
            .finally(() => setLoading(false))
    }, [supplierId])

    if (loading) {
        return (
            <div className="flex flex-col min-h-screen">
                <DashboardHeader title="Fournisseur" description="Chargement..." />
                <main className="flex-1 flex items-center justify-center">
                    <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
                </main>
            </div>
        )
    }

    if (error || !supplier) {
        return (
            <div className="flex flex-col min-h-screen">
                <DashboardHeader title="Fournisseur" description="Introuvable" />
                <main className="flex-1 p-4 lg:p-6">
                    <div className="rounded-lg bg-destructive/10 border border-destructive/20 p-4 text-sm text-destructive">
                        {error || 'Fournisseur introuvable'}
                    </div>
                    <div className="mt-4">
                        <Button variant="outline" asChild>
                            <Link href="/dashboard/suppliers">
                                <ArrowLeft className="h-4 w-4 mr-2" /> Retour
                            </Link>
                        </Button>
                    </div>
                </main>
            </div>
        )
    }

    return (
        <div className="flex flex-col min-h-screen">
            <DashboardHeader title={supplier.name} description="Détail du fournisseur" />
            <main className="flex-1 p-4 lg:p-6 space-y-6">
                <div className="flex flex-wrap items-center justify-between gap-3">
                    <Button variant="ghost" size="sm" asChild>
                        <Link href="/dashboard/suppliers">
                            <ArrowLeft className="h-4 w-4 mr-2" /> Retour
                        </Link>
                    </Button>
                    <div className="flex gap-2">
                        <Button variant="outline" asChild>
                            <Link href={`/dashboard/suppliers/${supplier.id}/edit`}>
                                <Pencil className="h-4 w-4 mr-2" /> Modifier
                            </Link>
                        </Button>
                        <Button asChild>
                            <Link href={`/dashboard/procurement/new?supplier=${supplier.id}`}>
                                <Plus className="h-4 w-4 mr-2" /> Nouvelle commande
                            </Link>
                        </Button>
                    </div>
                </div>

                <Card>
                    <CardHeader>
                        <CardTitle className="flex items-center gap-2">
                            <Building2 className="h-5 w-5 text-muted-foreground" />
                            {supplier.name}
                            {supplier.type && <Badge variant="secondary">{typeLabels[supplier.type] || supplier.type}</Badge>}
                        </CardTitle>
                    </CardHeader>
                    <CardContent className="grid gap-3 sm:grid-cols-2 text-sm">
                        {supplier.contact_name && (
                            <div className="flex items-center gap-2 text-muted-foreground">
                                <Building2 className="h-4 w-4" /> {supplier.contact_name}
                            </div>
                        )}
                        {supplier.phone && (
                            <div className="flex items-center gap-2 text-muted-foreground">
                                <Phone className="h-4 w-4" /> {supplier.phone}
                            </div>
                        )}
                        {supplier.email && (
                            <div className="flex items-center gap-2 text-muted-foreground">
                                <Mail className="h-4 w-4" /> {supplier.email}
                            </div>
                        )}
                        {supplier.address && (
                            <div className="flex items-center gap-2 text-muted-foreground">
                                <MapPin className="h-4 w-4" /> {supplier.address}
                            </div>
                        )}
                        {supplier.notes && (
                            <div className="sm:col-span-2 text-muted-foreground">{supplier.notes}</div>
                        )}
                    </CardContent>
                </Card>

                <Card>
                    <CardHeader>
                        <CardTitle>Commandes récentes</CardTitle>
                    </CardHeader>
                    <CardContent>
                        {supplier.recentOrders && supplier.recentOrders.length > 0 ? (
                            <div className="overflow-x-auto">
                                <table className="w-full text-sm">
                                    <thead className="text-left text-muted-foreground">
                                        <tr>
                                            <th className="p-2">N° commande</th>
                                            <th className="p-2">Date</th>
                                            <th className="p-2">Statut</th>
                                            <th className="p-2 text-right">Montant</th>
                                        </tr>
                                    </thead>
                                    <tbody className="divide-y">
                                        {supplier.recentOrders.map((o) => (
                                            <tr key={o.id} className="hover:bg-muted/40">
                                                <td className="p-2">
                                                    <Link href={`/dashboard/procurement/${o.id}`} className="font-medium hover:underline">
                                                        {o.order_number}
                                                    </Link>
                                                </td>
                                                <td className="p-2 text-muted-foreground">
                                                    {new Date(o.created_at).toLocaleDateString('fr-FR')}
                                                </td>
                                                <td className="p-2"><Badge variant="outline">{o.status}</Badge></td>
                                                <td className="p-2 text-right font-medium">{formatCurrency(Number(o.total_amount))}</td>
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                            </div>
                        ) : (
                            <p className="text-sm text-muted-foreground">Aucune commande pour ce fournisseur.</p>
                        )}
                    </CardContent>
                </Card>
            </main>
        </div>
    )
}
