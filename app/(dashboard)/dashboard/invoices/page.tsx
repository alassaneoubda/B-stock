'use client'

import { useState, useEffect, useCallback } from 'react'
import { DashboardHeader } from '@/components/dashboard/header'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Badge } from '@/components/ui/badge'
import {
    Table,
    TableBody,
    TableCell,
    TableHead,
    TableHeader,
    TableRow
} from '@/components/ui/table'
import {
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuItem,
    DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import {
    Loader2,
    Search,
    FileText,
    Eye,
    Download,
    MoreHorizontal,
    Filter,
    Printer,
    Receipt,
    Banknote,
    Clock,
    CheckCircle2,
} from 'lucide-react'
import Link from 'next/link'

type Invoice = {
    id: string
    invoice_number: string
    type: 'client' | 'supplier'
    total_amount: number
    amount_paid: number
    remaining_amount: number
    status: string
    client_name: string | null
    supplier_name: string | null
    created_at: string
}

const statusConfig: Record<string, { label: string; color: string }> = {
    paid: { label: 'Payée', color: 'bg-emerald-50 text-emerald-700' },
    partial: { label: 'Partielle', color: 'bg-amber-50 text-amber-700' },
    draft: { label: 'Brouillon', color: 'bg-zinc-100 text-zinc-600' },
    sent: { label: 'Envoyée', color: 'bg-blue-50 text-blue-700' },
    cancelled: { label: 'Annulée', color: 'bg-red-50 text-red-600' },
}

export default function InvoicesPage() {
    const [invoices, setInvoices] = useState<Invoice[]>([])
    const [isLoading, setIsLoading] = useState(true)
    const [searchTerm, setSearchTerm] = useState('')
    const [filterType, setFilterType] = useState<string>('all')
    const [filterStatus, setFilterStatus] = useState<string>('all')

    const fetchInvoices = useCallback(async () => {
        setIsLoading(true)
        try {
            const params = new URLSearchParams()
            if (filterType !== 'all') params.set('type', filterType)
            if (filterStatus !== 'all') params.set('status', filterStatus)
            if (searchTerm) params.set('search', searchTerm)

            const response = await fetch(`/api/invoices?${params}`)
            if (response.ok) {
                const data = await response.json()
                setInvoices(data.data || [])
            }
        } catch (error) {
            console.error('Error fetching invoices:', error)
        } finally {
            setIsLoading(false)
        }
    }, [filterType, filterStatus, searchTerm])

    useEffect(() => {
        fetchInvoices()
    }, [fetchInvoices])

    const formatCurrency = (amount: number) =>
        new Intl.NumberFormat('fr-FR', { style: 'currency', currency: 'XOF', minimumFractionDigits: 0 }).format(amount)

    const totalAmount = invoices.reduce((s, i) => s + Number(i.total_amount), 0)
    const totalPaid = invoices.reduce((s, i) => s + Number(i.amount_paid), 0)
    const totalRemaining = invoices.reduce((s, i) => s + Number(i.remaining_amount), 0)
    const paidCount = invoices.filter(i => i.status === 'paid').length

    const statsData = [
        { title: 'Total factures', value: invoices.length.toString(), icon: Receipt, color: 'bg-blue-500/10 text-blue-600', desc: 'factures générées' },
        { title: 'Montant total', value: formatCurrency(totalAmount), icon: Banknote, color: 'bg-emerald-500/10 text-emerald-600', desc: 'chiffre d\'affaires' },
        { title: 'Encours impayé', value: formatCurrency(totalRemaining), icon: Clock, color: 'bg-amber-500/10 text-amber-600', desc: 'à recouvrer' },
        { title: 'Factures soldées', value: paidCount.toString(), icon: CheckCircle2, color: 'bg-emerald-500/10 text-emerald-600', desc: `sur ${invoices.length}` },
    ]

    return (
        <div className="flex flex-col min-h-screen bg-zinc-50/50">
            <DashboardHeader
                title="Factures"
                description="Gestion des factures clients et fournisseurs"
            />

            <main className="flex-1 p-4 lg:p-6 space-y-4 lg:space-y-6">
                {/* Stats */}
                <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
                    {statsData.map((stat) => (
                        <div key={stat.title} className="bg-white rounded-lg border border-zinc-200/80 p-4">
                            <div className="flex items-center justify-between mb-3">
                                <span className="text-xs font-medium text-zinc-500">{stat.title}</span>
                                <stat.icon className="h-3.5 w-3.5 text-zinc-400" />
                            </div>
                            <p className="text-lg sm:text-xl font-bold text-zinc-950 tracking-tight truncate">{stat.value}</p>
                            <p className="text-xs text-zinc-500 mt-1">{stat.desc}</p>
                        </div>
                    ))}
                </div>

                {/* Filters + Search */}
                <div className="bg-white rounded-lg border border-zinc-200/80 overflow-hidden">
                    <div className="px-4 py-3 border-b border-zinc-100 flex flex-col sm:flex-row sm:items-center gap-3">
                        <div className="relative flex-1 max-w-sm">
                            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-zinc-400" />
                            <Input
                                placeholder="Rechercher..."
                                value={searchTerm}
                                onChange={(e) => setSearchTerm(e.target.value)}
                                className="pl-9 h-9 text-sm"
                            />
                        </div>
                        <div className="flex items-center gap-2 overflow-x-auto">
                            <select
                                value={filterType}
                                onChange={(e) => setFilterType(e.target.value)}
                                className="h-9 rounded-md border border-zinc-200 bg-white px-3 text-xs font-medium text-zinc-600"
                            >
                                <option value="all">Tous types</option>
                                <option value="client">Client</option>
                                <option value="supplier">Fournisseur</option>
                            </select>
                            <select
                                value={filterStatus}
                                onChange={(e) => setFilterStatus(e.target.value)}
                                className="h-9 rounded-md border border-zinc-200 bg-white px-3 text-xs font-medium text-zinc-600"
                            >
                                <option value="all">Tous statuts</option>
                                <option value="paid">Payée</option>
                                <option value="partial">Partielle</option>
                                <option value="draft">Brouillon</option>
                            </select>
                        </div>
                    </div>

                    {isLoading ? (
                        <div className="flex justify-center items-center h-48">
                            <Loader2 className="h-6 w-6 animate-spin text-zinc-400" />
                        </div>
                    ) : invoices.length === 0 ? (
                        <div className="text-center py-16 flex flex-col items-center px-4">
                            <div className="h-12 w-12 rounded-lg bg-zinc-100 flex items-center justify-center mb-4">
                                <FileText className="h-6 w-6 text-zinc-400" />
                            </div>
                            <h3 className="text-sm font-semibold text-zinc-950">Aucune facture</h3>
                            <p className="mt-1 text-sm text-zinc-500 max-w-xs">
                                Les factures seront générées automatiquement lors de la création de ventes.
                            </p>
                        </div>
                    ) : (
                        <>
                            {/* Desktop table */}
                            <div className="hidden md:block overflow-x-auto">
                                <Table>
                                    <TableHeader>
                                        <TableRow className="hover:bg-transparent">
                                            <TableHead className="text-xs font-medium text-zinc-500 pl-4">N° Facture</TableHead>
                                            <TableHead className="text-xs font-medium text-zinc-500">Type</TableHead>
                                            <TableHead className="text-xs font-medium text-zinc-500">Client / Fournisseur</TableHead>
                                            <TableHead className="text-xs font-medium text-zinc-500">Date</TableHead>
                                            <TableHead className="text-xs font-medium text-zinc-500 text-right">Montant</TableHead>
                                            <TableHead className="text-xs font-medium text-zinc-500 text-right">Reste</TableHead>
                                            <TableHead className="text-xs font-medium text-zinc-500">Statut</TableHead>
                                            <TableHead className="pr-4"></TableHead>
                                        </TableRow>
                                    </TableHeader>
                                    <TableBody>
                                        {invoices.map((inv) => {
                                            const status = statusConfig[inv.status] || { label: inv.status, color: 'bg-zinc-100 text-zinc-600' }
                                            return (
                                                <TableRow key={inv.id} className="group">
                                                    <TableCell className="pl-4">
                                                        <span className="text-sm font-medium text-zinc-950 font-mono">{inv.invoice_number}</span>
                                                    </TableCell>
                                                    <TableCell>
                                                        <span className={`text-[10px] font-medium px-2 py-0.5 rounded ${inv.type === 'client' ? 'bg-blue-50 text-blue-600' : 'bg-purple-50 text-purple-600'}`}>
                                                            {inv.type === 'client' ? 'Client' : 'Fournisseur'}
                                                        </span>
                                                    </TableCell>
                                                    <TableCell>
                                                        <span className="text-sm text-zinc-700">
                                                            {inv.client_name || inv.supplier_name || '—'}
                                                        </span>
                                                    </TableCell>
                                                    <TableCell>
                                                        <span className="text-xs text-zinc-500">
                                                            {new Date(inv.created_at).toLocaleDateString('fr-FR', { day: '2-digit', month: 'short', year: 'numeric' })}
                                                        </span>
                                                    </TableCell>
                                                    <TableCell className="text-right">
                                                        <span className="text-sm font-semibold text-zinc-950">
                                                            {formatCurrency(Number(inv.total_amount))}
                                                        </span>
                                                    </TableCell>
                                                    <TableCell className="text-right">
                                                        {Number(inv.remaining_amount) > 0 ? (
                                                            <span className="text-sm font-medium text-red-600">
                                                                {formatCurrency(Number(inv.remaining_amount))}
                                                            </span>
                                                        ) : (
                                                            <span className="text-xs font-medium text-emerald-600">Soldé</span>
                                                        )}
                                                    </TableCell>
                                                    <TableCell>
                                                        <Badge className={`text-[10px] font-medium ${status.color} border-none`}>
                                                            {status.label}
                                                        </Badge>
                                                    </TableCell>
                                                    <TableCell className="pr-4 text-right">
                                                        <DropdownMenu>
                                                            <DropdownMenuTrigger asChild>
                                                                <Button variant="ghost" size="icon" className="h-8 w-8 rounded-md">
                                                                    <MoreHorizontal className="h-4 w-4 text-zinc-400" />
                                                                </Button>
                                                            </DropdownMenuTrigger>
                                                            <DropdownMenuContent align="end" className="w-48">
                                                                <DropdownMenuItem asChild className="cursor-pointer">
                                                                    <Link href={`/dashboard/invoices/${inv.id}`} className="flex items-center gap-2">
                                                                        <Eye className="h-4 w-4 text-zinc-500" />
                                                                        <span className="text-sm">Voir la facture</span>
                                                                    </Link>
                                                                </DropdownMenuItem>
                                                                <DropdownMenuItem asChild className="cursor-pointer">
                                                                    <Link href={`/dashboard/invoices/${inv.id}?print=1`} className="flex items-center gap-2">
                                                                        <Printer className="h-4 w-4 text-zinc-500" />
                                                                        <span className="text-sm">Imprimer / PDF</span>
                                                                    </Link>
                                                                </DropdownMenuItem>
                                                            </DropdownMenuContent>
                                                        </DropdownMenu>
                                                    </TableCell>
                                                </TableRow>
                                            )
                                        })}
                                    </TableBody>
                                </Table>
                            </div>

                            {/* Mobile cards */}
                            <div className="md:hidden divide-y divide-zinc-100">
                                {invoices.map((inv) => {
                                    const status = statusConfig[inv.status] || { label: inv.status, color: 'bg-zinc-100 text-zinc-600' }
                                    return (
                                        <Link
                                            key={inv.id}
                                            href={`/dashboard/invoices/${inv.id}`}
                                            className="block p-4 active:bg-zinc-50 transition-colors"
                                        >
                                            <div className="flex items-start justify-between mb-2">
                                                <div className="min-w-0 flex-1">
                                                    <p className="text-sm font-semibold text-zinc-950 truncate">
                                                        {inv.client_name || inv.supplier_name || 'Sans nom'}
                                                    </p>
                                                    <p className="text-xs text-zinc-400 font-mono">
                                                        {inv.invoice_number} · {new Date(inv.created_at).toLocaleDateString('fr-FR', { day: '2-digit', month: 'short' })}
                                                    </p>
                                                </div>
                                                <Badge className={`text-[10px] font-medium ml-2 shrink-0 ${status.color} border-none`}>
                                                    {status.label}
                                                </Badge>
                                            </div>
                                            <div className="flex items-center justify-between">
                                                <span className={`text-[10px] font-medium px-2 py-0.5 rounded ${inv.type === 'client' ? 'bg-blue-50 text-blue-600' : 'bg-purple-50 text-purple-600'}`}>
                                                    {inv.type === 'client' ? 'Client' : 'Fournisseur'}
                                                </span>
                                                <div className="text-right">
                                                    <p className="text-sm font-bold text-zinc-950">{formatCurrency(Number(inv.total_amount))}</p>
                                                    {Number(inv.remaining_amount) > 0 && (
                                                        <p className="text-xs font-medium text-red-500">Reste: {formatCurrency(Number(inv.remaining_amount))}</p>
                                                    )}
                                                </div>
                                            </div>
                                        </Link>
                                    )
                                })}
                            </div>
                        </>
                    )}
                </div>
            </main>
        </div>
    )
}
