'use client'

import { useState, useEffect } from 'react'
import { DashboardHeader } from '@/components/dashboard/header'
import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import {
    Table,
    TableBody,
    TableCell,
    TableHead,
    TableHeader,
    TableRow
} from '@/components/ui/table'
import { Badge } from '@/components/ui/badge'
import { Loader2, Search, FileText, Download } from 'lucide-react'

// Utiliser le type de vente défini par l'API
type Sale = {
    id: string
    reference: string
    date: string
    client: { name: string } | null
    total_amount: number
    amount_paid: number
    payment_status: 'pending' | 'partial' | 'paid'
    status: string
}

export default function InvoicesPage() {
    const [invoices, setInvoices] = useState<Sale[]>([])
    const [isLoading, setIsLoading] = useState(true)
    const [searchTerm, setSearchTerm] = useState('')

    useEffect(() => {
        fetchInvoices()
    }, [])

    async function fetchInvoices() {
        try {
            // Nous utilisons l'API des ventes existante car une facture est générée depuis une vente
            const response = await fetch('/api/sales')
            if (response.ok) {
                const data = await response.json()
                setInvoices(data.sales || [])
            }
        } catch (error) {
            console.error('Erreur lors du chargement des factures:', error)
        } finally {
            setIsLoading(false)
        }
    }

    const filteredInvoices = invoices.filter(invoice =>
        invoice.reference?.toLowerCase().includes(searchTerm.toLowerCase()) ||
        invoice.client?.name?.toLowerCase().includes(searchTerm.toLowerCase())
    )

    const formatCurrency = (amount: number) => {
        return new Intl.NumberFormat('fr-CI', { style: 'currency', currency: 'XOF' }).format(amount)
    }

    const getStatusBadge = (status: string) => {
        switch (status) {
            case 'paid': return <Badge className="bg-emerald-100 text-emerald-800 hover:bg-emerald-100">Payée</Badge>
            case 'partial': return <Badge className="bg-amber-100 text-amber-800 hover:bg-amber-100">Partielle</Badge>
            case 'pending': return <Badge variant="outline" className="text-slate-600">En attente</Badge>
            default: return <Badge variant="outline">{status}</Badge>
        }
    }

    return (
        <div className="flex flex-col min-h-screen">
            <DashboardHeader
                title="Factures"
                description="Gérez vos factures clients et paiements"
            />
            <main className="flex-1 p-4 lg:p-6 ">
                <Card className="rounded-lg border-slate-200/60 shadow-sm overflow-hidden">
                    <div className="px-8 py-6 border-b border-slate-100 flex flex-col sm:flex-row sm:items-center justify-between gap-4 bg-slate-50/50">
                        <div className="relative max-w-sm w-full">
                            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
                            <Input
                                placeholder="Rechercher une facture..."
                                value={searchTerm}
                                onChange={(e) => setSearchTerm(e.target.value)}
                                className="pl-9 bg-white"
                            />
                        </div>
                    </div>

                    <CardContent className="p-0">
                        {isLoading ? (
                            <div className="flex justify-center items-center h-64">
                                <Loader2 className="h-8 w-8 animate-spin text-slate-400" />
                            </div>
                        ) : filteredInvoices.length === 0 ? (
                            <div className="flex flex-col items-center justify-center h-64 text-center px-4">
                                <div className="h-12 w-12 rounded-full bg-slate-100 flex items-center justify-center mb-4">
                                    <FileText className="h-6 w-6 text-slate-400" />
                                </div>
                                <h3 className="text-lg font-semibold text-slate-900 mb-1">Aucune facture trouvée</h3>
                                <p className="text-slate-500 max-w-sm">
                                    {searchTerm ? 'Aucun résultat pour votre recherche.' : 'Les factures apparaîtront ici une fois que vous aurez créé des ventes.'}
                                </p>
                            </div>
                        ) : (
                            <div className="overflow-x-auto">
                                <Table>
                                    <TableHeader className="bg-slate-50">
                                        <TableRow>
                                            <TableHead className="w-[120px] font-semibold">Référence</TableHead>
                                            <TableHead className="font-semibold">Date</TableHead>
                                            <TableHead className="font-semibold">Client</TableHead>
                                            <TableHead className="text-right font-semibold">Montant Total</TableHead>
                                            <TableHead className="text-right font-semibold">Reste à Payer</TableHead>
                                            <TableHead className="font-semibold">Statut</TableHead>
                                            <TableHead className="text-right font-semibold">Actions</TableHead>
                                        </TableRow>
                                    </TableHeader>
                                    <TableBody>
                                        {filteredInvoices.map((invoice) => {
                                            const remainingAmount = Number(invoice.total_amount) - Number(invoice.amount_paid || 0)
                                            return (
                                                <TableRow key={invoice.id} className="cursor-pointer hover:bg-slate-50/50 transition-colors">
                                                    <TableCell className="font-medium text-slate-900">
                                                        {invoice.reference}
                                                    </TableCell>
                                                    <TableCell className="text-slate-600">
                                                        {new Date(invoice.date).toLocaleDateString('fr-FR')}
                                                    </TableCell>
                                                    <TableCell className="text-slate-600">
                                                        {invoice.client?.name || 'Client Passager'}
                                                    </TableCell>
                                                    <TableCell className="text-right font-medium">
                                                        {formatCurrency(invoice.total_amount)}
                                                    </TableCell>
                                                    <TableCell className="text-right font-medium text-amber-600">
                                                        {remainingAmount > 0 ? formatCurrency(remainingAmount) : '-'}
                                                    </TableCell>
                                                    <TableCell>
                                                        {getStatusBadge(invoice.payment_status)}
                                                    </TableCell>
                                                    <TableCell className="text-right">
                                                        <Button variant="ghost" size="icon" className="h-8 w-8 text-slate-400 hover:text-blue-600">
                                                            <Download className="h-4 w-4" />
                                                        </Button>
                                                    </TableCell>
                                                </TableRow>
                                            )
                                        })}
                                    </TableBody>
                                </Table>
                            </div>
                        )}
                    </CardContent>
                </Card>
            </main>
        </div>
    )
}
