'use client'

import { useState, useEffect, useCallback } from 'react'
import { DashboardHeader } from '@/components/dashboard/header'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from '@/components/ui/select'
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
import { useRouter } from 'next/navigation'
import { apiFetch, toastError } from '@/lib/api-client'
import { formatDateShort, formatMoney, formatNumber } from '@/lib/format'
import { useDebouncedValue } from '@/hooks/use-debounced-value'
import { EmptyState, ErrorState, TableSkeleton } from '@/components/states'
import { PageShell, StatCard, StatusBadge } from '@/components/app/blocks'

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

type Tone = 'default' | 'brand' | 'success' | 'warning' | 'danger' | 'info'

const statusConfig: Record<string, { label: string; tone: Tone }> = {
    paid: { label: 'Payée', tone: 'success' },
    partial: { label: 'Partielle', tone: 'warning' },
    draft: { label: 'Brouillon', tone: 'default' },
    sent: { label: 'Envoyée', tone: 'info' },
    cancelled: { label: 'Annulée', tone: 'danger' },
}

function getStatus(status: string): { label: string; tone: Tone } {
    return statusConfig[status] || { label: status, tone: 'default' }
}

export default function InvoicesPage() {
    const router = useRouter()
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

    const resetFilters = () => { setSearchTerm(''); setFilterType('all'); setFilterStatus('all') }

    return (
        <div className="flex min-h-screen flex-col">
            <DashboardHeader
                title="Factures"
                description="Factures clients et fournisseurs, paiements et encours"
            />

            <PageShell>
                {!isLoading && !loadError && invoices.length > 0 && (
                    <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
                        <StatCard
                            label="Encours à recouvrer"
                            value={formatCurrency(totalRemaining)}
                            hint="Reste à payer sur les factures affichées"
                            icon={Clock}
                            emphasis
                        />
                        <StatCard
                            label="Montant facturé"
                            value={formatCurrency(totalAmount)}
                            hint={`Dont ${formatCurrency(totalPaid)} encaissés`}
                            icon={Banknote}
                        />
                        <StatCard
                            label="Factures"
                            value={formatNumber(invoices.length)}
                            hint="Selon les filtres actifs"
                            icon={Receipt}
                        />
                        <StatCard
                            label="Factures soldées"
                            value={formatNumber(paidCount)}
                            hint={`sur ${formatNumber(invoices.length)}`}
                            icon={CheckCircle2}
                            tone="success"
                        />
                    </div>
                )}

                {/* Barre d'outils */}
                <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
                    <div className="relative w-full sm:max-w-sm">
                        <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" aria-hidden="true" />
                        <Input
                            placeholder="N° de facture, client, fournisseur…"
                            aria-label="Rechercher une facture"
                            value={searchTerm}
                            onChange={(e) => setSearchTerm(e.target.value)}
                            className="h-10 pl-9"
                        />
                    </div>
                    <div className="flex items-center gap-2">
                        <Select value={filterType} onValueChange={setFilterType}>
                            <SelectTrigger className="h-10 w-full sm:w-[160px]" aria-label="Filtrer par type">
                                <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                                <SelectItem value="all">Tous les types</SelectItem>
                                <SelectItem value="client">Client</SelectItem>
                                <SelectItem value="supplier">Fournisseur</SelectItem>
                            </SelectContent>
                        </Select>
                        <Select value={filterStatus} onValueChange={setFilterStatus}>
                            <SelectTrigger className="h-10 w-full sm:w-[160px]" aria-label="Filtrer par statut">
                                <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                                <SelectItem value="all">Tous les statuts</SelectItem>
                                <SelectItem value="paid">Payée</SelectItem>
                                <SelectItem value="partial">Partielle</SelectItem>
                                <SelectItem value="draft">Brouillon</SelectItem>
                                <SelectItem value="sent">Envoyée</SelectItem>
                                <SelectItem value="cancelled">Annulée</SelectItem>
                            </SelectContent>
                        </Select>
                    </div>
                    {hasFilters && (
                        <Button variant="ghost" size="sm" onClick={resetFilters} className="self-start sm:self-auto">
                            Réinitialiser
                        </Button>
                    )}
                </div>

                {isLoading ? (
                    <div className="rounded-xl border border-border bg-card p-4">
                        <TableSkeleton rows={6} columns={5} />
                    </div>
                ) : loadError ? (
                    <ErrorState title="Impossible de charger les factures" onRetry={() => fetchInvoices()} />
                ) : invoices.length === 0 ? (
                    hasFilters ? (
                        <EmptyState
                            icon={Search}
                            title="Aucune facture ne correspond"
                            description="Modifiez la recherche ou les filtres."
                            action={{ label: 'Réinitialiser les filtres', onClick: resetFilters }}
                        />
                    ) : (
                        <EmptyState
                            icon={FileText}
                            title="Aucune facture"
                            description="Les factures sont générées automatiquement lors de la création de ventes."
                            action={{ label: 'Nouvelle vente', href: '/dashboard/sales/new' }}
                        />
                    )
                ) : (
                    <div className="overflow-hidden rounded-xl border border-border bg-card">
                        {/* Tableau (desktop) */}
                        <div className="hidden overflow-x-auto md:block">
                            <Table>
                                <TableHeader>
                                    <TableRow className="hover:bg-transparent">
                                        <TableHead className="pl-5">N° facture</TableHead>
                                        <TableHead>Client / fournisseur</TableHead>
                                        <TableHead>Type</TableHead>
                                        <TableHead>Date</TableHead>
                                        <TableHead className="text-right">Montant</TableHead>
                                        <TableHead className="text-right">Reste</TableHead>
                                        <TableHead>Statut</TableHead>
                                        <TableHead className="w-12 pr-5"><span className="sr-only">Actions</span></TableHead>
                                    </TableRow>
                                </TableHeader>
                                <TableBody>
                                    {invoices.map((inv) => {
                                        const status = getStatus(inv.status)
                                        return (
                                            <TableRow
                                                key={inv.id}
                                                className="cursor-pointer"
                                                onClick={() => router.push(`/dashboard/invoices/${inv.id}`)}
                                            >
                                                <TableCell className="pl-5">
                                                    <Link
                                                        href={`/dashboard/invoices/${inv.id}`}
                                                        onClick={(e) => e.stopPropagation()}
                                                        className="rounded-sm font-mono text-sm font-medium text-foreground hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                                                    >
                                                        {inv.invoice_number}
                                                    </Link>
                                                </TableCell>
                                                <TableCell className="text-sm text-foreground">
                                                    {inv.client_name || inv.supplier_name || '—'}
                                                </TableCell>
                                                <TableCell>
                                                    <StatusBadge
                                                        label={inv.type === 'client' ? 'Client' : 'Fournisseur'}
                                                        tone={inv.type === 'client' ? 'brand' : 'info'}
                                                    />
                                                </TableCell>
                                                <TableCell className="text-sm text-muted-foreground">
                                                    {formatDateShort(inv.created_at)}
                                                </TableCell>
                                                <TableCell className="tabular text-right text-sm font-medium text-foreground">
                                                    {formatCurrency(Number(inv.total_amount))}
                                                </TableCell>
                                                <TableCell className="tabular text-right text-sm">
                                                    {Number(inv.remaining_amount) > 0 ? (
                                                        <span className="font-medium text-destructive">
                                                            {formatCurrency(Number(inv.remaining_amount))}
                                                        </span>
                                                    ) : (
                                                        <span className="text-muted-foreground">Soldé</span>
                                                    )}
                                                </TableCell>
                                                <TableCell>
                                                    <StatusBadge label={status.label} tone={status.tone} />
                                                </TableCell>
                                                <TableCell className="pr-5 text-right" onClick={(e) => e.stopPropagation()}>
                                                    <DropdownMenu>
                                                        <DropdownMenuTrigger asChild>
                                                            <Button variant="ghost" size="icon" className="h-8 w-8" aria-label={`Actions pour la facture ${inv.invoice_number}`}>
                                                                <MoreHorizontal className="h-4 w-4 text-muted-foreground" />
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

                        {/* Cartes (mobile) */}
                        <ul className="divide-y divide-border md:hidden">
                            {invoices.map((inv) => {
                                const status = getStatus(inv.status)
                                return (
                                    <li key={inv.id}>
                                        <Link
                                            href={`/dashboard/invoices/${inv.id}`}
                                            className="flex items-start justify-between gap-3 px-4 py-3.5 transition-colors hover:bg-muted/50 focus-visible:bg-muted/50 focus-visible:outline-none"
                                        >
                                            <div className="min-w-0 space-y-1">
                                                <p className="truncate text-sm font-medium text-foreground">
                                                    {inv.client_name || inv.supplier_name || 'Sans nom'}
                                                </p>
                                                <p className="truncate text-xs text-muted-foreground">
                                                    <span className="font-mono">{inv.invoice_number}</span> · {formatDateShort(inv.created_at)} · {inv.type === 'client' ? 'Client' : 'Fournisseur'}
                                                </p>
                                                <StatusBadge label={status.label} tone={status.tone} />
                                            </div>
                                            <div className="shrink-0 text-right">
                                                <p className="tabular text-sm font-semibold text-foreground">{formatCurrency(Number(inv.total_amount))}</p>
                                                {Number(inv.remaining_amount) > 0 && (
                                                    <p className="tabular text-xs text-destructive">Reste {formatCurrency(Number(inv.remaining_amount))}</p>
                                                )}
                                            </div>
                                        </Link>
                                    </li>
                                )
                            })}
                        </ul>
                    </div>
                )}
            </PageShell>
        </div>
    )
}
