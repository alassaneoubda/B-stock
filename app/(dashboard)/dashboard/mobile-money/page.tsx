'use client'

import { useCallback, useEffect, useState } from 'react'
import Link from 'next/link'
import { AlertTriangle, CheckCircle2, Clock, Smartphone } from 'lucide-react'
import { DashboardHeader } from '@/components/dashboard/header'
import { PageShell, StatCard, StatusBadge } from '@/components/app/blocks'
import { EmptyState, ErrorState, TableSkeleton } from '@/components/states'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { MobileMoneyDialog, type MobileMoneyRequest } from '@/components/payments/mobile-money-dialog'
import { apiFetch, errorMessage } from '@/lib/api-client'
import { formatDateTime, formatMoney, formatNumber } from '@/lib/format'
import { MOBILE_MONEY_STATUS, providerMethodLabel } from '@/lib/mobile-money/labels'

type Row = MobileMoneyRequest & {
    sales_order_id: string | null
    credit_note_id: string | null
    order_number: string | null
    credit_number: string | null
    created_by_name: string | null
}
type Totals = { pending_count: number; pending_amount: string; paid_count: number; paid_amount: string; unapplied_count: number }

export default function MobileMoneyPage() {
    const [rows, setRows] = useState<Row[]>([])
    const [totals, setTotals] = useState<Totals | null>(null)
    const [loading, setLoading] = useState(true)
    const [error, setError] = useState<string | null>(null)
    const [status, setStatus] = useState('all')
    const [from, setFrom] = useState('')
    const [to, setTo] = useState('')
    const [selected, setSelected] = useState<Row | null>(null)

    const load = useCallback(async () => {
        setLoading(true)
        setError(null)
        const qs = new URLSearchParams()
        if (status !== 'all') qs.set('status', status)
        if (from) qs.set('from', from)
        if (to) qs.set('to', to)
        try {
            const res = await apiFetch<{ data: Row[]; totals: Totals }>(`/api/payments/mobile-money?${qs}`)
            setRows(res.data)
            setTotals(res.totals)
        } catch (e) {
            setError(errorMessage(e))
        } finally {
            setLoading(false)
        }
    }, [status, from, to])

    useEffect(() => {
        load()
    }, [load])

    const filtered = status !== 'all' || from || to

    return (
        <div className="flex min-h-screen flex-col">
            <DashboardHeader title="Suivi Mobile Money" description="Demandes de paiement envoyées à vos clients et paiements reçus" />
            <PageShell>
                <div className="grid grid-cols-2 gap-4 lg:grid-cols-3">
                    <StatCard label="En attente" value={formatMoney(Number(totals?.pending_amount || 0))} hint={`${formatNumber(totals?.pending_count || 0)} demande(s)`} icon={Clock} tone="warning" />
                    <StatCard label="Payé" value={formatMoney(Number(totals?.paid_amount || 0))} hint={`${formatNumber(totals?.paid_count || 0)} paiement(s)`} icon={CheckCircle2} tone="success" emphasis />
                    <StatCard label="À imputer manuellement" value={formatNumber(totals?.unapplied_count || 0)} hint="Payés mais non enregistrés sur une dette" icon={AlertTriangle} tone="danger" />
                </div>

                <div className="flex flex-wrap items-end gap-3">
                    <div className="space-y-1.5">
                        <Label htmlFor="mm-status">Statut</Label>
                        <Select value={status} onValueChange={setStatus}>
                            <SelectTrigger id="mm-status" className="w-44"><SelectValue /></SelectTrigger>
                            <SelectContent>
                                <SelectItem value="all">Tous</SelectItem>
                                {['pending', 'paid', 'failed', 'expired', 'cancelled'].map((s) => (
                                    <SelectItem key={s} value={s}>{MOBILE_MONEY_STATUS[s].label}</SelectItem>
                                ))}
                            </SelectContent>
                        </Select>
                    </div>
                    <div className="space-y-1.5">
                        <Label htmlFor="mm-from">Du</Label>
                        <Input id="mm-from" type="date" value={from} onChange={(e) => setFrom(e.target.value)} className="w-40" />
                    </div>
                    <div className="space-y-1.5">
                        <Label htmlFor="mm-to">Au</Label>
                        <Input id="mm-to" type="date" value={to} onChange={(e) => setTo(e.target.value)} className="w-40" />
                    </div>
                    {filtered && (
                        <Button variant="ghost" size="sm" onClick={() => { setStatus('all'); setFrom(''); setTo('') }}>
                            Effacer les filtres
                        </Button>
                    )}
                </div>

                {error ? (
                    <ErrorState title="Impossible de charger les paiements Mobile Money" description={error} onRetry={load} />
                ) : loading && rows.length === 0 ? (
                    <TableSkeleton rows={5} columns={6} />
                ) : rows.length === 0 ? (
                    <EmptyState
                        icon={Smartphone}
                        title={filtered ? 'Aucune demande pour ces filtres' : 'Aucune demande de paiement'}
                        description={filtered ? undefined : 'Créez une demande depuis une vente ou une créance avec le bouton « Paiement Mobile Money ».'}
                    />
                ) : (
                    <div className="overflow-x-auto rounded-xl border border-border bg-card shadow-[0_1px_2px_0_rgb(15_23_42/0.04)]">
                        <Table>
                            <TableHeader>
                                <TableRow className="hover:bg-transparent">
                                    <TableHead className="pl-5">Date</TableHead>
                                    <TableHead>Client</TableHead>
                                    <TableHead>Objet</TableHead>
                                    <TableHead className="text-right">Montant</TableHead>
                                    <TableHead>Statut</TableHead>
                                    <TableHead className="pr-5"><span className="sr-only">Actions</span></TableHead>
                                </TableRow>
                            </TableHeader>
                            <TableBody>
                                {rows.map((r) => {
                                    const st = MOBILE_MONEY_STATUS[r.status] ?? MOBILE_MONEY_STATUS.pending
                                    const method = providerMethodLabel(r.provider_method)
                                    return (
                                        <TableRow key={r.id}>
                                            <TableCell className="tabular pl-5 text-sm text-muted-foreground">
                                                {formatDateTime(r.created_at)}
                                                {r.created_by_name && <div className="text-xs">par {r.created_by_name}</div>}
                                            </TableCell>
                                            <TableCell className="text-sm font-medium text-foreground">{r.client_name || '—'}</TableCell>
                                            <TableCell className="text-sm">
                                                {r.sales_order_id ? (
                                                    <Link href={`/dashboard/sales/${r.sales_order_id}`} className="font-mono hover:underline">{r.order_number ?? 'Vente'}</Link>
                                                ) : (
                                                    <span className="font-mono">{r.credit_number ?? 'Créance'}</span>
                                                )}
                                                {r.provider_reference && <div className="font-mono text-xs text-muted-foreground">{r.provider_reference}</div>}
                                            </TableCell>
                                            <TableCell className="tabular text-right text-sm font-semibold">{formatMoney(Number(r.amount))}</TableCell>
                                            <TableCell>
                                                <div className="flex flex-wrap items-center gap-1">
                                                    <StatusBadge label={st.label} tone={st.tone} />
                                                    {r.environment === 'sandbox' && <StatusBadge label="Test" tone="info" />}
                                                    {r.status === 'paid' && !r.applied_payment_id && <StatusBadge label="À imputer" tone="danger" />}
                                                </div>
                                                {method && <div className="mt-0.5 text-xs text-muted-foreground">{method}</div>}
                                            </TableCell>
                                            <TableCell className="pr-5 text-right">
                                                <Button size="sm" variant="outline" onClick={() => setSelected(r)}>Détails</Button>
                                            </TableCell>
                                        </TableRow>
                                    )
                                })}
                            </TableBody>
                        </Table>
                    </div>
                )}

                <MobileMoneyDialog
                    open={!!selected}
                    onOpenChange={(o) => { if (!o) { setSelected(null); load() } }}
                    initialRequest={selected}
                    clientName={selected?.client_name}
                />
            </PageShell>
        </div>
    )
}
