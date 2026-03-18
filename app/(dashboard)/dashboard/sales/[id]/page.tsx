'use client'

import { useEffect, useState } from 'react'
import { useParams, useRouter } from 'next/navigation'
import Link from 'next/link'
import { DashboardHeader } from '@/components/dashboard/header'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import {
    Table,
    TableBody,
    TableCell,
    TableHead,
    TableHeader,
    TableRow,
} from '@/components/ui/table'
import {
    ArrowLeft,
    User,
    Package,
    CreditCard,
    Truck,
    Clock,
    CheckCircle2,
    XCircle,
    BoxesIcon,
} from 'lucide-react'

interface SaleDetail {
    id: string
    order_number: string
    client_name: string
    client_phone: string | null
    client_address: string | null
    client_type: string | null
    depot_name: string | null
    created_by_name: string | null
    status: string
    order_source: string | null
    subtotal: number
    packaging_total: number
    total_amount: number
    paid_amount: number
    paid_amount_products: number
    paid_amount_packaging: number
    payment_method: string | null
    notes: string | null
    created_at: string
    items: Array<{
        id: string
        product_name: string
        brand: string | null
        packaging_name: string | null
        quantity: number
        unit_price: number
        total_price: number
        lot_number: string | null
    }>
    packagingItems: Array<{
        id: string
        packaging_name: string
        quantity_out: number
        quantity_in: number
        unit_price: number
    }>
    payments: Array<{
        id: string
        amount: number
        payment_method: string
        status: string
        reference: string | null
        received_by_name: string | null
        created_at: string
    }>
}

const statusConfig: Record<string, { label: string; color: string; icon: React.ElementType }> = {
    pending: { label: 'En attente', color: 'bg-slate-100 text-slate-600', icon: Clock },
    confirmed: { label: 'Confirmée', color: 'bg-blue-50 text-blue-600', icon: CheckCircle2 },
    preparing: { label: 'En préparation', color: 'bg-amber-50 text-amber-600', icon: Package },
    ready: { label: 'Prête', color: 'bg-indigo-50 text-indigo-600', icon: Package },
    delivered: { label: 'Livrée', color: 'bg-emerald-50 text-emerald-600', icon: Truck },
    cancelled: { label: 'Annulée', color: 'bg-rose-50 text-rose-600', icon: XCircle },
}

function formatCurrency(amount: number) {
    return new Intl.NumberFormat('fr-FR', {
        style: 'currency',
        currency: 'XOF',
        minimumFractionDigits: 0,
    }).format(amount)
}

export default function SaleDetailPage() {
    const params = useParams()
    const router = useRouter()
    const [sale, setSale] = useState<SaleDetail | null>(null)
    const [loading, setLoading] = useState(true)

    useEffect(() => {
        async function fetchSale() {
            try {
                const res = await fetch(`/api/sales/${params.id}`)
                const data = await res.json()
                if (data.success) {
                    setSale(data.data)
                }
            } catch (error) {
                console.error('Error fetching sale:', error)
            }
            setLoading(false)
        }
        fetchSale()
    }, [params.id])

    async function updateStatus(newStatus: string) {
        try {
            const res = await fetch(`/api/sales/${params.id}`, {
                method: 'PATCH',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ status: newStatus }),
            })
            const data = await res.json()
            if (data.success) {
                setSale((prev) => prev ? { ...prev, status: newStatus } : prev)
            }
        } catch (error) {
            console.error('Error updating status:', error)
        }
    }

    if (loading) {
        return (
            <div className="flex items-center justify-center min-h-screen bg-zinc-50/50">
                <div className="text-slate-400 font-bold animate-pulse">Chargement...</div>
            </div>
        )
    }

    if (!sale) {
        return (
            <div className="flex flex-col items-center justify-center min-h-screen bg-zinc-50/50 gap-4">
                <h2 className="text-2xl font-semibold text-slate-950">Commande introuvable</h2>
                <Button onClick={() => router.back()} variant="outline" className="rounded-md">
                    <ArrowLeft className="h-4 w-4 mr-2" /> Retour
                </Button>
            </div>
        )
    }

    const remaining = Number(sale.total_amount) - Number(sale.paid_amount)
    const remainingProducts = Number(sale.subtotal) - Number(sale.paid_amount_products || 0)
    const remainingPackaging = Number(sale.packaging_total) - Number(sale.paid_amount_packaging || 0)
    const status = statusConfig[sale.status] || statusConfig.pending
    const StatusIcon = status.icon

    return (
        <div className="flex flex-col min-h-screen bg-zinc-50/50">
            <DashboardHeader
                title={`Commande ${sale.order_number}`}
                description={`Créée le ${new Date(sale.created_at).toLocaleDateString('fr-FR', { day: '2-digit', month: 'long', year: 'numeric', hour: '2-digit', minute: '2-digit' })}`}
                actions={
                    <Button variant="outline" asChild className="rounded-md h-11 px-6 font-bold">
                        <Link href="/dashboard/sales">
                            <ArrowLeft className="h-4 w-4 mr-2" /> Retour aux ventes
                        </Link>
                    </Button>
                }
            />

            <main className="flex-1 p-4 lg:p-6 space-y-8 ">
                {/* Header cards */}
                <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-4">
                    {/* Status */}
                    <Card className="rounded-[2rem] border-slate-200/60 shadow-sm">
                        <CardContent className="p-6 flex items-center gap-4">
                            <div className={`h-14 w-14 rounded-md flex items-center justify-center ${status.color}`}>
                                <StatusIcon className="h-7 w-7" />
                            </div>
                            <div>
                                <p className="text-[11px] font-semibold uppercase tracking-wider text-slate-400">Statut</p>
                                <p className="text-lg font-semibold text-slate-950">{status.label}</p>
                            </div>
                        </CardContent>
                    </Card>

                    {/* Client */}
                    <Card className="rounded-[2rem] border-slate-200/60 shadow-sm">
                        <CardContent className="p-6 flex items-center gap-4">
                            <div className="h-14 w-14 rounded-md bg-blue-50 flex items-center justify-center text-blue-600">
                                <User className="h-7 w-7" />
                            </div>
                            <div>
                                <p className="text-[11px] font-semibold uppercase tracking-wider text-slate-400">Client</p>
                                <p className="text-lg font-semibold text-slate-950">{sale.client_name || 'Client Passager'}</p>
                            </div>
                        </CardContent>
                    </Card>

                    {/* Total */}
                    <Card className="rounded-[2rem] border-slate-200/60 shadow-sm">
                        <CardContent className="p-6 flex items-center gap-4">
                            <div className="h-14 w-14 rounded-md bg-emerald-50 flex items-center justify-center text-emerald-600">
                                <CreditCard className="h-7 w-7" />
                            </div>
                            <div>
                                <p className="text-[11px] font-semibold uppercase tracking-wider text-slate-400">Total</p>
                                <p className="text-lg font-semibold text-slate-950">{formatCurrency(Number(sale.total_amount))}</p>
                            </div>
                        </CardContent>
                    </Card>

                    {/* Remaining */}
                    <Card className="rounded-[2rem] border-slate-200/60 shadow-sm">
                        <CardContent className="p-6 flex items-center gap-4">
                            <div className={`h-14 w-14 rounded-md flex items-center justify-center ${remaining > 0 ? 'bg-rose-50 text-rose-600' : 'bg-emerald-50 text-emerald-600'}`}>
                                <CreditCard className="h-7 w-7" />
                            </div>
                            <div>
                                <p className="text-[11px] font-semibold uppercase tracking-wider text-slate-400">Reste à payer</p>
                                <p className={`text-lg font-semibold ${remaining > 0 ? 'text-rose-600' : 'text-emerald-600'}`}>
                                    {remaining > 0 ? formatCurrency(remaining) : 'Soldé ✓'}
                                </p>
                            </div>
                        </CardContent>
                    </Card>
                </div>

                {/* Debt breakdown */}
                {remaining > 0 && (
                    <Card className="rounded-[2rem] border-amber-200/60 bg-amber-50/30 shadow-sm">
                        <CardContent className="p-6">
                            <p className="text-sm font-semibold text-slate-600 mb-4">Détail des impayés</p>
                            <div className="grid gap-4 sm:grid-cols-3">
                                <div>
                                    <p className="text-[10px] font-semibold uppercase tracking-wider text-slate-400">Dette Produits</p>
                                    <p className={`text-xl font-semibold ${remainingProducts > 0 ? 'text-rose-600' : 'text-emerald-600'}`}>
                                        {remainingProducts > 0 ? formatCurrency(remainingProducts) : 'Soldé ✓'}
                                    </p>
                                </div>
                                <div>
                                    <p className="text-[10px] font-semibold uppercase tracking-wider text-slate-400">Dette Emballages</p>
                                    <p className={`text-xl font-semibold ${remainingPackaging > 0 ? 'text-amber-600' : 'text-emerald-600'}`}>
                                        {remainingPackaging > 0 ? formatCurrency(remainingPackaging) : 'Soldé ✓'}
                                    </p>
                                </div>
                                <div>
                                    <p className="text-[10px] font-semibold uppercase tracking-wider text-slate-400">Total Restant</p>
                                    <p className="text-xl font-semibold text-rose-600">{formatCurrency(remaining)}</p>
                                </div>
                            </div>
                        </CardContent>
                    </Card>
                )}

                {/* Status actions */}
                {sale.status !== 'cancelled' && sale.status !== 'delivered' && (
                    <Card className="rounded-[2rem] border-slate-200/60 shadow-sm">
                        <CardContent className="p-6 flex flex-wrap gap-3">
                            <p className="text-sm font-bold text-slate-500 mr-4 self-center">Changer le statut :</p>
                            {sale.status === 'pending' && (
                                <Button onClick={() => updateStatus('confirmed')} className="rounded-md bg-blue-600 hover:bg-blue-700 font-bold">
                                    Confirmer la commande
                                </Button>
                            )}
                            {sale.status === 'confirmed' && (
                                <Button onClick={() => updateStatus('preparing')} className="rounded-md bg-amber-600 hover:bg-amber-700 font-bold">
                                    Mettre en préparation
                                </Button>
                            )}
                            {sale.status === 'preparing' && (
                                <Button onClick={() => updateStatus('ready')} className="rounded-md bg-indigo-600 hover:bg-indigo-700 font-bold">
                                    Marquer comme prête
                                </Button>
                            )}
                            {sale.status === 'ready' && (
                                <Button onClick={() => updateStatus('delivered')} className="rounded-md bg-emerald-600 hover:bg-emerald-700 font-bold">
                                    Marquer comme livrée
                                </Button>
                            )}
                            <Button onClick={() => updateStatus('cancelled')} variant="destructive" className="rounded-md font-bold ml-auto">
                                Annuler
                            </Button>
                        </CardContent>
                    </Card>
                )}

                {/* Products table */}
                <Card className="rounded-[2rem] border-slate-200/60 shadow-sm overflow-hidden">
                    <CardHeader className="px-8 py-6 border-b border-slate-100">
                        <CardTitle className="text-xl font-semibold text-slate-950 flex items-center gap-3">
                            <Package className="h-5 w-5 text-blue-600" /> Produits commandés
                        </CardTitle>
                    </CardHeader>
                    <CardContent className="p-0">
                        <Table>
                            <TableHeader className="bg-slate-50/50">
                                <TableRow className="border-none">
                                    <TableHead className="py-4 font-semibold uppercase text-[10px] tracking-wider text-slate-400 pl-8">Produit</TableHead>
                                    <TableHead className="py-4 font-semibold uppercase text-[10px] tracking-wider text-slate-400">Format</TableHead>
                                    <TableHead className="py-4 font-semibold uppercase text-[10px] tracking-wider text-slate-400 text-right">Qté</TableHead>
                                    <TableHead className="py-4 font-semibold uppercase text-[10px] tracking-wider text-slate-400 text-right">P.U.</TableHead>
                                    <TableHead className="py-4 font-semibold uppercase text-[10px] tracking-wider text-slate-400 text-right pr-8">Total</TableHead>
                                </TableRow>
                            </TableHeader>
                            <TableBody>
                                {sale.items.map((item) => (
                                    <TableRow key={item.id} className="border-b border-slate-50">
                                        <TableCell className="py-5 pl-8">
                                            <div className="flex flex-col">
                                                <span className="font-semibold text-slate-950">{item.product_name}</span>
                                                {item.brand && <span className="text-[11px] text-slate-400 font-bold">{item.brand}</span>}
                                            </div>
                                        </TableCell>
                                        <TableCell className="py-5">
                                            <Badge className="rounded-lg bg-blue-50 text-blue-600 border-none font-bold text-[10px]">
                                                {item.packaging_name || 'Standard'}
                                            </Badge>
                                        </TableCell>
                                        <TableCell className="py-5 text-right font-semibold text-slate-950">{item.quantity}</TableCell>
                                        <TableCell className="py-5 text-right font-bold text-slate-600">{formatCurrency(Number(item.unit_price))}</TableCell>
                                        <TableCell className="py-5 text-right font-semibold text-slate-950 pr-8">{formatCurrency(Number(item.total_price))}</TableCell>
                                    </TableRow>
                                ))}
                                {/* Subtotal row */}
                                <TableRow className="bg-slate-50/50 border-none">
                                    <TableCell colSpan={4} className="py-4 pl-8 font-semibold text-slate-600 text-right">Sous-total produits :</TableCell>
                                    <TableCell className="py-4 text-right font-semibold text-slate-950 pr-8">{formatCurrency(Number(sale.subtotal))}</TableCell>
                                </TableRow>
                            </TableBody>
                        </Table>
                    </CardContent>
                </Card>

                {/* Packaging items */}
                {sale.packagingItems && sale.packagingItems.length > 0 && (
                    <Card className="rounded-[2rem] border-slate-200/60 shadow-sm overflow-hidden">
                        <CardHeader className="px-8 py-6 border-b border-slate-100">
                            <CardTitle className="text-xl font-semibold text-slate-950 flex items-center gap-3">
                                <BoxesIcon className="h-5 w-5 text-amber-600" /> Emballages
                            </CardTitle>
                        </CardHeader>
                        <CardContent className="p-0">
                            <Table>
                                <TableHeader className="bg-slate-50/50">
                                    <TableRow className="border-none">
                                        <TableHead className="py-4 font-semibold uppercase text-[10px] tracking-wider text-slate-400 pl-8">Emballage</TableHead>
                                        <TableHead className="py-4 font-semibold uppercase text-[10px] tracking-wider text-slate-400 text-right">Sortie</TableHead>
                                        <TableHead className="py-4 font-semibold uppercase text-[10px] tracking-wider text-slate-400 text-right">Retour</TableHead>
                                        <TableHead className="py-4 font-semibold uppercase text-[10px] tracking-wider text-slate-400 text-right pr-8">Consigne</TableHead>
                                    </TableRow>
                                </TableHeader>
                                <TableBody>
                                    {sale.packagingItems.map((pkg) => (
                                        <TableRow key={pkg.id} className="border-b border-slate-50">
                                            <TableCell className="py-5 pl-8 font-semibold text-slate-950">{pkg.packaging_name}</TableCell>
                                            <TableCell className="py-5 text-right font-bold text-rose-600">{pkg.quantity_out}</TableCell>
                                            <TableCell className="py-5 text-right font-bold text-emerald-600">{pkg.quantity_in}</TableCell>
                                            <TableCell className="py-5 text-right font-semibold text-slate-950 pr-8">
                                                {formatCurrency((Number(pkg.quantity_out) - Number(pkg.quantity_in)) * Number(pkg.unit_price))}
                                            </TableCell>
                                        </TableRow>
                                    ))}
                                </TableBody>
                            </Table>
                        </CardContent>
                    </Card>
                )}

                {/* Payments */}
                <Card className="rounded-[2rem] border-slate-200/60 shadow-sm overflow-hidden">
                    <CardHeader className="px-8 py-6 border-b border-slate-100">
                        <CardTitle className="text-xl font-semibold text-slate-950 flex items-center gap-3">
                            <CreditCard className="h-5 w-5 text-emerald-600" /> Paiements
                        </CardTitle>
                    </CardHeader>
                    <CardContent className="p-0">
                        {sale.payments.length === 0 ? (
                            <div className="text-center py-12 text-slate-400 font-medium">Aucun paiement enregistré</div>
                        ) : (
                            <Table>
                                <TableHeader className="bg-slate-50/50">
                                    <TableRow className="border-none">
                                        <TableHead className="py-4 font-semibold uppercase text-[10px] tracking-wider text-slate-400 pl-8">Date</TableHead>
                                        <TableHead className="py-4 font-semibold uppercase text-[10px] tracking-wider text-slate-400">Méthode</TableHead>
                                        <TableHead className="py-4 font-semibold uppercase text-[10px] tracking-wider text-slate-400">Référence</TableHead>
                                        <TableHead className="py-4 font-semibold uppercase text-[10px] tracking-wider text-slate-400 text-right pr-8">Montant</TableHead>
                                    </TableRow>
                                </TableHeader>
                                <TableBody>
                                    {sale.payments.map((p) => (
                                        <TableRow key={p.id} className="border-b border-slate-50">
                                            <TableCell className="py-5 pl-8 font-bold text-slate-600">
                                                {new Date(p.created_at).toLocaleDateString('fr-FR', { day: '2-digit', month: 'short', year: 'numeric' })}
                                            </TableCell>
                                            <TableCell className="py-5">
                                                <Badge className="rounded-lg bg-slate-100 text-slate-600 border-none font-bold text-[10px] uppercase">
                                                    {p.payment_method}
                                                </Badge>
                                            </TableCell>
                                            <TableCell className="py-5 text-sm font-mono text-slate-500">{p.reference || '—'}</TableCell>
                                            <TableCell className="py-5 text-right font-semibold text-emerald-600 pr-8">{formatCurrency(Number(p.amount))}</TableCell>
                                        </TableRow>
                                    ))}
                                </TableBody>
                            </Table>
                        )}
                    </CardContent>
                </Card>

                {/* Notes */}
                {sale.notes && (
                    <Card className="rounded-[2rem] border-slate-200/60 shadow-sm">
                        <CardHeader className="px-8 py-6 border-b border-slate-100">
                            <CardTitle className="text-xl font-semibold text-slate-950">Notes</CardTitle>
                        </CardHeader>
                        <CardContent className="p-8">
                            <p className="text-slate-600 font-medium leading-relaxed">{sale.notes}</p>
                        </CardContent>
                    </Card>
                )}
            </main>
        </div>
    )
}
