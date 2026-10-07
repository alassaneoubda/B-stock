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
    Search,
    FileText,
    Eye,
    MoreHorizontal,
    Printer,
    Receipt,
    Banknote,
    Clock,
    CheckCircle2,
} from 'lucide-react'
import Link from 'next/link'
import { apiFetch, toastError } from '@/lib/api-client'
import { formatDateShort, formatMoney, formatNumber } from '@/lib/format'
import { useDebouncedValue } from '@/hooks/use-debounced-value'
import { EmptyState, ErrorState, TableSkeleton } from '@/components/states'

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
    paid: { label: 'Payée', color: 'bg-success-soft text-success' },
    partial: { label: 'Partielle', color: 'bg-warning-soft text-warning-foreground' },
    draft: { label: 'Brouillon', color: 'bg-muted text-muted-foreground' },
    sent: { label: 'Envoyée', color: 'bg-brand-soft text-brand-strong' },
    cancelled: { label: 'Annulée', color: 'bg-destructive/10 text-destructive' },
}

export default function InvoicesPage() {
    const [invoices, setInvoices] = useState<Invoice[]>([])
    const [isLoading, setIsLoading] = useState(true)
    const [searchTerm, setSearchTerm] = useState('')
    const [filterType, setFilterType] = useState<string>('all')
    const [filterStatus, setFilterStatus] = useState<string>('all')
    const [loadError, setLoadError] = useState(false)
    const debouncedSearch = useDebouncedValue(searchTerm.trim(), 300)

    const fetchInvoices = useCallback(async (signal?: AbortSignal) => {
        setIsLoading(true)
        setLoadError(false)
        try {
            const params = new URLSearchParams()
            if (filterType !== 'all') params.set('type', filterType)
            if (filterStatus !== 'all') params.set('status', filterStatus)
            if (debouncedSearch) params.set('search', debouncedSearch)

            const data = await apiFetch(`/api/invoices?${params}`, { signal })
            setInvoices(data.data || [])
        } catch (error) {
            if ((error as Error)?.name === 'AbortError') return
            setLoadError(true)
            toastError(error, 'Impossible de charger les factures')
        } finally {
            if (!signal?.aborted) setIsLoading(false)
        }
    }, [filterType, filterStatus, debouncedSearch])

    useEffect(() => {
        const controller = new AbortController()
        fetchInvoices(controller.signal)
        return () => controller.abort()
    }, [fetchInvoices])

    const formatCurrency = formatMoney
    const hasFilters = filterType !== 'all' || filterStatus !== 'all' || debouncedSearch !== ''

    const totalAmount = invoices.reduce((s, i) => s + Number(i.total_amount), 0)
    const totalPaid = invoices.reduce((s, i) => s + Number(i.amount_paid), 0)
    const totalRemaining = invoices.reduce((s, i) => s + Number(i.remaining_amount), 0)
    const paidCount = invoices.filter(i => i.status === 'paid').length

    const statsData = [
        { title: 'Total factures', value: formatNumber(invoices.length), icon: Receipt, color: 'bg-primary/10 text-brand-strong', desc: 'factures générées' },
        { title: 'Montant total', value: formatCurrency(totalAmount), icon: Banknote, color: 'bg-success/10 text-success', desc: 'chiffre d\'affaires' },
        { title: 'Encours impayé', value: formatCurrency(totalRemaining), icon: Clock, color: 'bg-warning/10 text-warning-foreground', desc: 'à recouvrer' },
        { title: 'Factures soldées', value: formatNumber(paidCount), icon: CheckCircle2, color: 'bg-success/10 text-success', desc: `sur ${invoices.length}` },
    ]

    return (
        <div className="flex flex-col min-h-screen bg-muted/30">
            <DashboardHeader
                title="Factures"
                description="Gestion des factures clients et fournisseurs"
            />

            <main className="flex-1 p-4 lg:p-6 space-y-4 lg:space-y-6">
                {/* Stats */}
                <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
                    {statsData.map((stat) => (
                        <div key={stat.title} className="bg-card rounded-lg border border-border p-4">
                            <div className="flex items-center justify-between mb-3">
                                <span className="text-xs font-medium text-muted-foreground">{stat.title}</span>
                                <stat.icon className="h-3.5 w-3.5 text-muted-foreground/70" />
                            </div>
                            <p className="text-lg sm:text-xl font-bold text-foreground tracking-tight truncate">{stat.value}</p>
                            <p className="text-xs text-muted-foreground mt-1">{stat.desc}</p>
                        </div>
                    ))}
                </div>

                {/* Filters + Search */}
                <div className="bg-card rounded-lg border border-border overflow-hidden">
                    <div className="px-4 py-3 border-b border-border flex flex-col sm:flex-row sm:items-center gap-3">
                        <div className="relative flex-1 max-w-sm">
                            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground/70" aria-hidden="true" />
                            <Input
                                placeholder="Rechercher..."
                                aria-label="Rechercher une facture"
                                value={searchTerm}
                                onChange={(e) => setSearchTerm(e.target.value)}
                                className="pl-9 h-9 text-sm"
                            />
                        </div>
                        <div className="flex items-center gap-2 overflow-x-auto">
                            <select
                                value={filterType}
                                onChange={(e) => setFilterType(e.target.value)}
                                aria-label="Filtrer par type"
                                className="h-9 rounded-md border border-border bg-card px-3 text-xs font-medium text-muted-foreground"
                            >
                                <option value="all">Tous types</option>
                                <option value="client">Client</option>
                                <option value="supplier">Fournisseur</option>
                            </select>
                            <select
                                value={filterStatus}
                                onChange={(e) => setFilterStatus(e.target.value)}
                                aria-label="Filtrer par statut"
                                className="h-9 rounded-md border border-border bg-card px-3 text-xs font-medium text-muted-foreground"
                            >
                                <option value="all">Tous statuts</option>
                                <option value="paid">Payée</option>
                                <option value="partial">Partielle</option>
                                <option value="draft">Brouillon</option>
                                <option value="sent">Envoyée</option>
                                <option value="cancelled">Annulée</option>
                            </select>
                        </div>
                    </div>

                    {isLoading ? (
                        <div className="p-4">
                            <TableSkeleton rows={6} columns={5} />
                        </div>
                    ) : loadError ? (
                        <ErrorState className="m-4" title="Impossible de charger les factures" onRetry={() => fetchInvoices()} />
                    ) : invoices.length === 0 ? (
                        hasFilters ? (
                            <EmptyState
                                icon={Search}
                                className="m-4"
                                title="Aucune facture ne correspond"
                                description="Modifiez la recherche ou les filtres."
                                action={{ label: 'Réinitialiser les filtres', onClick: () => { setSearchTerm(''); setFilterType('all'); setFilterStatus('all') } }}
                            />
                        ) : (
                            <EmptyState
                                icon={FileText}
                                className="m-4"
                                title="Aucune facture"
                                description="Les factures sont générées automatiquement lors de la création de ventes."
                                action={{ label: 'Nouvelle vente', href: '/dashboard/sales/new' }}
                            />
                        )
                    ) : (
                        <>
                            {/* Desktop table */}
                            <div className="hidden md:block overflow-x-auto">
                                <Table>
                                    <TableHeader>
                                        <TableRow className="hover:bg-transparent">
                                            <TableHead className="text-xs font-medium text-muted-foreground pl-4">N° Facture</TableHead>
                                            <TableHead className="text-xs font-medium text-muted-foreground">Type</TableHead>
                                            <TableHead className="text-xs font-medium text-muted-foreground">Client / Fournisseur</TableHead>
                                            <TableHead className="text-xs font-medium text-muted-foreground">Date</TableHead>
                                            <TableHead className="text-xs font-medium text-muted-foreground text-right">Montant</TableHead>
                                            <TableHead className="text-xs font-medium text-muted-foreground text-right">Reste</TableHead>
                                            <TableHead className="text-xs font-medium text-muted-foreground">Statut</TableHead>
                                            <TableHead className="pr-4"></TableHead>
                                        </TableRow>
                                    </TableHeader>
                                    <TableBody>
                                        {invoices.map((inv) => {
                                            const status = statusConfig[inv.status] || { label: inv.status, color: 'bg-muted text-muted-foreground' }
                                            return (
                                                <TableRow key={inv.id} className="group">
                                                    <TableCell className="pl-4">
                                                        <span className="text-sm font-medium text-foreground font-mono">{inv.invoice_number}</span>
                                                    </TableCell>
                                                    <TableCell>
                                                        <span className={`text-[10px] font-medium px-2 py-0.5 rounded ${inv.type === 'client' ? 'bg-brand-soft text-brand-strong' : 'bg-info-soft text-info'}`}>
                                                            {inv.type === 'client' ? 'Client' : 'Fournisseur'}
                                                        </span>
                                                    </TableCell>
                                                    <TableCell>
                                                        <span className="text-sm text-foreground/80">
                                                            {inv.client_name || inv.supplier_name || '—'}
                                                        </span>
                                                    </TableCell>
                                                    <TableCell>
                                                        <span className="text-xs text-muted-foreground">
                                                            {formatDateShort(inv.created_at)}
                                                        </span>
                                                    </TableCell>
                                                    <TableCell className="text-right">
                                                        <span className="text-sm font-semibold text-foreground">
                                                            {formatCurrency(Number(inv.total_amount))}
                                                        </span>
                                                    </TableCell>
                                                    <TableCell className="text-right">
                                                        {Number(inv.remaining_amount) > 0 ? (
                                                            <span className="text-sm font-medium text-destructive">
                                                                {formatCurrency(Number(inv.remaining_amount))}
                                                            </span>
                                                        ) : (
                                                            <span className="text-xs font-medium text-success">Soldé</span>
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
                                                                <Button variant="ghost" size="icon" className="h-8 w-8 rounded-md" aria-label={`Actions pour la facture ${inv.invoice_number}`}>
                                                                    <MoreHorizontal className="h-4 w-4 text-muted-foreground/70" />
                                                                </Button>
                                                            </DropdownMenuTrigger>
                                                            <DropdownMenuContent align="end" className="w-48">
                                                                <DropdownMenuItem asChild className="cursor-pointer">
                                                                    <Link href={`/dashboard/invoices/${inv.id}`} className="flex items-center gap-2">
                                                                        <Eye className="h-4 w-4 text-muted-foreground" />
                                                                        <span className="text-sm">Voir la facture</span>
                                                                    </Link>
                                                                </DropdownMenuItem>
                                                                <DropdownMenuItem asChild className="cursor-pointer">
                                                                    <Link href={`/dashboard/invoices/${inv.id}?print=1`} className="flex items-center gap-2">
                                                                        <Printer className="h-4 w-4 text-muted-foreground" />
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
                            <div className="md:hidden divide-y divide-border">
                                {invoices.map((inv) => {
                                    const status = statusConfig[inv.status] || { label: inv.status, color: 'bg-muted text-muted-foreground' }
                                    return (
                                        <Link
                                            key={inv.id}
                                            href={`/dashboard/invoices/${inv.id}`}
                                            className="block p-4 active:bg-muted/50 transition-colors"
                                        >
                                            <div className="flex items-start justify-between mb-2">
                                                <div className="min-w-0 flex-1">
                                                    <p className="text-sm font-semibold text-foreground truncate">
                                                        {inv.client_name || inv.supplier_name || 'Sans nom'}
                                                    </p>
                                                    <p className="text-xs text-muted-foreground/70 font-mono">
                                                        {inv.invoice_number} · {formatDateShort(inv.created_at)}
                                                    </p>
                                                </div>
                                                <Badge className={`text-[10px] font-medium ml-2 shrink-0 ${status.color} border-none`}>
                                                    {status.label}
                                                </Badge>
                                            </div>
                                            <div className="flex items-center justify-between">
                                                <span className={`text-[10px] font-medium px-2 py-0.5 rounded ${inv.type === 'client' ? 'bg-brand-soft text-brand-strong' : 'bg-info-soft text-info'}`}>
                                                    {inv.type === 'client' ? 'Client' : 'Fournisseur'}
                                                </span>
                                                <div className="text-right">
                                                    <p className="text-sm font-bold text-foreground">{formatCurrency(Number(inv.total_amount))}</p>
                                                    {Number(inv.remaining_amount) > 0 && (
                                                        <p className="text-xs font-medium text-destructive">Reste: {formatCurrency(Number(inv.remaining_amount))}</p>
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
