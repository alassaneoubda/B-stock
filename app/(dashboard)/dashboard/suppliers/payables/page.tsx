'use client'

import { useCallback, useEffect, useState } from 'react'
import Link from 'next/link'
import { AlertTriangle, Banknote, CalendarClock, Landmark, Search, Wallet } from 'lucide-react'
import { DashboardHeader } from '@/components/dashboard/header'
import { PageShell, Panel, StatCard, StatusBadge } from '@/components/app/blocks'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { EmptyState, ErrorState, PageSkeleton } from '@/components/states'
import { apiFetch, errorMessage } from '@/lib/api-client'
import { formatDateShort, formatMoney, formatNumber } from '@/lib/format'
import { cn } from '@/lib/utils'
import {
  PAYABLE_STATUS,
  SupplierPaymentDialog,
  type Payable,
  type PaymentTarget,
} from '@/components/procurement/supplier-payment-dialog'

type Summary = {
  totalDue: number
  overdue: number
  dueSoon: number
  openCount: number
  overdueCount: number
  dueSoonCount: number
}
type SupplierDebt = { supplier_id: string; supplier_name: string; remaining: number; overdue: number }
type Data = { summary: Summary; rows: Payable[]; suppliers: SupplierDebt[] }

const STATUS_FILTERS = [
  { value: 'open', label: 'Reste à payer' },
  { value: 'overdue', label: 'En retard' },
  { value: 'due_soon', label: 'À échoir sous 7 jours' },
  { value: 'unpaid', label: 'Non payées' },
  { value: 'partial', label: 'Partiellement payées' },
  { value: 'paid', label: 'Payées' },
  { value: 'all', label: 'Toutes' },
]

export default function SupplierPayablesPage() {
  const [data, setData] = useState<Data | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [status, setStatus] = useState('open')
  const [supplierId, setSupplierId] = useState('all')
  const [search, setSearch] = useState('')
  const [debouncedSearch, setDebouncedSearch] = useState('')
  const [payTarget, setPayTarget] = useState<PaymentTarget | null>(null)
  const [suppliers, setSuppliers] = useState<{ id: string; name: string }[]>([])

  useEffect(() => {
    const t = setTimeout(() => setDebouncedSearch(search.trim()), 250)
    return () => clearTimeout(t)
  }, [search])

  useEffect(() => {
    apiFetch<{ data: { id: string; name: string }[] }>('/api/suppliers')
      .then((r) => setSuppliers(r.data ?? []))
      .catch(() => setSuppliers([]))
  }, [])

  const load = useCallback(async () => {
    setError(null)
    const qs = new URLSearchParams({ status })
    if (supplierId !== 'all') qs.set('supplierId', supplierId)
    if (debouncedSearch) qs.set('q', debouncedSearch)
    try {
      const res = await apiFetch<{ data: Data }>(`/api/suppliers/payables?${qs}`)
      setData(res.data)
    } catch (e) {
      setError(errorMessage(e))
    }
  }, [status, supplierId, debouncedSearch])

  useEffect(() => {
    load()
  }, [load])

  if (!data && !error) return <PageSkeleton />

  const header = <DashboardHeader title="Dettes fournisseurs" description="Factures à payer, échéances et retards" />

  if (!data) {
    return (
      <div className="flex min-h-screen flex-col">
        {header}
        <PageShell>
          <ErrorState title="Impossible de charger les dettes fournisseurs" description={error ?? undefined} onRetry={load} />
        </PageShell>
      </div>
    )
  }

  const { summary, rows } = data
  const filtersActive = status !== 'open' || supplierId !== 'all' || debouncedSearch !== ''

  return (
    <div className="flex min-h-screen flex-col">
      {header}
      <PageShell>
        <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
          <StatCard
            label="Total dû"
            value={formatMoney(summary.totalDue)}
            hint={`${formatNumber(summary.openCount)} commande(s) à payer`}
            icon={Wallet}
            emphasis
          />
          <StatCard
            label="En retard"
            value={formatMoney(summary.overdue)}
            hint={`${formatNumber(summary.overdueCount)} échéance(s) dépassée(s)`}
            icon={AlertTriangle}
            tone={summary.overdueCount > 0 ? 'danger' : 'default'}
          />
          <StatCard
            label="À échoir sous 7 jours"
            value={formatMoney(summary.dueSoon)}
            hint={`${formatNumber(summary.dueSoonCount)} échéance(s)`}
            icon={CalendarClock}
            tone={summary.dueSoonCount > 0 ? 'warning' : 'default'}
          />
          <StatCard
            label="Fournisseurs créanciers"
            value={formatNumber(data.suppliers.length)}
            hint={data.suppliers[0] ? `Principal : ${data.suppliers[0].supplier_name}` : 'Aucune dette'}
            icon={Landmark}
          />
        </div>

        <div className="flex flex-wrap items-center gap-3">
          <div className="relative w-full sm:w-72">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" aria-hidden="true" />
            <Input
              type="search"
              aria-label="Rechercher une commande ou un fournisseur"
              placeholder="N° de commande ou fournisseur…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="h-10 pl-9"
            />
          </div>
          <Select value={status} onValueChange={setStatus}>
            <SelectTrigger className="h-10 w-full sm:w-56" aria-label="Filtrer par statut">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {STATUS_FILTERS.map((f) => (
                <SelectItem key={f.value} value={f.value}>
                  {f.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Select value={supplierId} onValueChange={setSupplierId}>
            <SelectTrigger className="h-10 w-full sm:w-56" aria-label="Filtrer par fournisseur">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Tous les fournisseurs</SelectItem>
              {suppliers.map((s) => (
                <SelectItem key={s.id} value={s.id}>
                  {s.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          {error && <p className="text-sm text-destructive">{error}</p>}
        </div>

        <div className="grid gap-6 xl:grid-cols-4">
          <div className="xl:col-span-3">
            {rows.length === 0 ? (
              <EmptyState
                icon={filtersActive ? Search : Wallet}
                title={filtersActive ? 'Aucune dette ne correspond aux filtres' : 'Aucune dette fournisseur'}
                description={
                  filtersActive ? undefined : 'Les commandes réceptionnées et non réglées apparaîtront ici.'
                }
                action={
                  filtersActive
                    ? {
                        label: 'Réinitialiser les filtres',
                        onClick: () => {
                          setStatus('open')
                          setSupplierId('all')
                          setSearch('')
                        },
                      }
                    : undefined
                }
              />
            ) : (
              <div className="overflow-hidden rounded-xl border border-border bg-card shadow-[0_1px_2px_0_rgb(15_23_42/0.04)]">
                <div className="hidden overflow-x-auto md:block">
                  <Table>
                    <TableHeader>
                      <TableRow className="hover:bg-transparent">
                        <TableHead className="pl-5">Commande</TableHead>
                        <TableHead>Fournisseur</TableHead>
                        <TableHead className="text-right">Dû</TableHead>
                        <TableHead className="text-right">Payé</TableHead>
                        <TableHead className="text-right">Reste</TableHead>
                        <TableHead>Échéance</TableHead>
                        <TableHead>Statut</TableHead>
                        <TableHead className="pr-5">
                          <span className="sr-only">Actions</span>
                        </TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {rows.map((r) => {
                        const st = PAYABLE_STATUS[r.payment_status]
                        return (
                          <TableRow key={r.purchase_order_id}>
                            <TableCell className="pl-5">
                              <Link
                                href={`/dashboard/procurement/${r.purchase_order_id}`}
                                className="font-mono text-sm font-medium text-foreground hover:underline"
                              >
                                {r.order_number}
                              </Link>
                              <div className="text-xs text-muted-foreground">
                                {r.received_on ? `Reçue le ${formatDateShort(r.received_on)}` : 'Non reçue'}
                                {r.order_status === 'partial' && ' · réception partielle'}
                              </div>
                            </TableCell>
                            <TableCell className="text-sm">
                              {r.supplier_id ? (
                                <Link href={`/dashboard/suppliers/${r.supplier_id}`} className="font-medium text-foreground hover:underline">
                                  {r.supplier_name}
                                </Link>
                              ) : (
                                <span className="text-muted-foreground">—</span>
                              )}
                            </TableCell>
                            <TableCell className="tabular text-right text-sm">{formatMoney(r.amount_due)}</TableCell>
                            <TableCell className="tabular text-right text-sm text-muted-foreground">{formatMoney(r.paid_amount)}</TableCell>
                            <TableCell className="tabular text-right text-sm font-semibold text-foreground">
                              {r.remaining > 0 ? formatMoney(r.remaining) : <span className="font-normal text-muted-foreground">—</span>}
                            </TableCell>
                            <TableCell className="tabular text-sm">
                              {r.due_date ? (
                                <span className={cn(r.payment_status === 'overdue' ? 'font-medium text-destructive' : r.due_soon ? 'text-warning-foreground' : 'text-foreground')}>
                                  {formatDateShort(r.due_date)}
                                  {r.days_overdue > 0 && <span className="text-xs"> · {r.days_overdue} j de retard</span>}
                                </span>
                              ) : (
                                <span className="text-muted-foreground">—</span>
                              )}
                            </TableCell>
                            <TableCell>
                              <StatusBadge label={st.label} tone={st.tone} />
                            </TableCell>
                            <TableCell className="pr-5 text-right">
                              {r.remaining > 0 && (
                                <Button size="sm" variant="outline" onClick={() => setPayTarget(r)}>
                                  <Banknote className="h-4 w-4" aria-hidden="true" /> Régler
                                </Button>
                              )}
                            </TableCell>
                          </TableRow>
                        )
                      })}
                    </TableBody>
                  </Table>
                </div>

                <ul className="divide-y divide-border md:hidden">
                  {rows.map((r) => {
                    const st = PAYABLE_STATUS[r.payment_status]
                    return (
                      <li key={r.purchase_order_id} className="space-y-3 px-4 py-3.5">
                        <div className="flex items-start justify-between gap-3">
                          <div className="min-w-0 flex-1">
                            <div className="flex items-center gap-2">
                              <p className="truncate text-sm font-medium text-foreground">{r.supplier_name ?? '—'}</p>
                              <StatusBadge label={st.label} tone={st.tone} />
                            </div>
                            <p className="mt-0.5 truncate text-xs text-muted-foreground">
                              <Link href={`/dashboard/procurement/${r.purchase_order_id}`} className="font-mono hover:underline">
                                {r.order_number}
                              </Link>
                              {r.due_date && (
                                <span className={cn(r.payment_status === 'overdue' && 'text-destructive')}>
                                  {' · '}Échéance {formatDateShort(r.due_date)}
                                  {r.days_overdue > 0 && ` (${r.days_overdue} j)`}
                                </span>
                              )}
                            </p>
                          </div>
                          <div className="shrink-0 text-right">
                            <p className="tabular text-sm font-semibold text-foreground">{r.remaining > 0 ? formatMoney(r.remaining) : '—'}</p>
                            <p className="tabular text-xs text-muted-foreground">sur {formatMoney(r.amount_due)}</p>
                          </div>
                        </div>
                        {r.remaining > 0 && (
                          <Button size="sm" variant="outline" className="w-full" onClick={() => setPayTarget(r)}>
                            <Banknote className="h-4 w-4" aria-hidden="true" /> Régler
                          </Button>
                        )}
                      </li>
                    )
                  })}
                </ul>
              </div>
            )}
          </div>

          <Panel title="Par fournisseur" description="Reste à payer" bodyClassName={data.suppliers.length > 0 ? undefined : 'p-5'}>
            {data.suppliers.length === 0 ? (
              <p className="text-sm text-muted-foreground">Aucune dette en cours.</p>
            ) : (
              <ul className="divide-y divide-border">
                {data.suppliers.map((s) => (
                  <li key={s.supplier_id}>
                    <Link
                      href={`/dashboard/suppliers/${s.supplier_id}`}
                      className="flex items-center justify-between gap-3 px-5 py-3 transition-colors hover:bg-muted/40"
                    >
                      <span className="min-w-0 truncate text-sm font-medium text-foreground">{s.supplier_name}</span>
                      <span className="shrink-0 text-right">
                        <span className="tabular block text-sm font-semibold text-foreground">{formatMoney(s.remaining)}</span>
                        {s.overdue > 0 && (
                          <span className="tabular block text-xs text-destructive">dont {formatMoney(s.overdue)} en retard</span>
                        )}
                      </span>
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </Panel>
        </div>

        <SupplierPaymentDialog target={payTarget} onClose={() => setPayTarget(null)} onPaid={load} />
      </PageShell>
    </div>
  )
}
