'use client'

import { useCallback, useEffect, useState } from 'react'
import Link from 'next/link'
import { AlertTriangle, Banknote, CalendarClock, LineChart, ReceiptText, Wallet } from 'lucide-react'
import { Panel, StatCard, StatusBadge } from '@/components/app/blocks'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Table, TableBody, TableCell, TableFooter, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { EmptyState, ErrorState, TableSkeleton } from '@/components/states'
import { apiFetch, errorMessage } from '@/lib/api-client'
import { formatDateShort, formatMoney, formatNumber, formatSignedMoney } from '@/lib/format'
import { cn } from '@/lib/utils'
import {
  PAYABLE_STATUS,
  SupplierPaymentDialog,
  type Payable,
  type PaymentTarget,
} from '@/components/procurement/supplier-payment-dialog'

type Entry = {
  date: string
  type: 'purchase' | 'return' | 'credit_note' | 'payment' | 'payment_cancelled'
  reference: string
  label: string
  purchase_order_id: string | null
  debit: number
  credit: number
  balance: number
}

type Statement = {
  supplier: { id: string; name: string; payment_terms_days: number }
  balance: number
  openingBalance: number
  closingBalance: number
  totals: { debit: number; credit: number }
  entries: Entry[]
  summary: { totalDue: number; overdue: number; dueSoon: number; openCount: number; overdueCount: number; dueSoonCount: number }
  overdue: Payable[]
  upcoming: Payable[]
}

type PriceProduct = {
  product_variant_id: string
  product_name: string
  packaging_name: string | null
  last_price: number
  last_date: string
  last_change_pct: number | null
  min_price: number
  max_price: number
  avg_price: number
  purchases: number
  history: { purchase_order_id: string; order_number: string; date: string; quantity: number; unit_price: number; change_pct: number | null }[]
}

const ENTRY_LABELS: Record<Entry['type'], string> = {
  purchase: 'Achat',
  return: 'Retour',
  credit_note: 'Avoir',
  payment: 'Règlement',
  payment_cancelled: 'Annulation',
}

function ChangeBadge({ pct }: { pct: number | null }) {
  if (pct === null || pct === 0) return <span className="text-xs text-muted-foreground">—</span>
  return (
    <span className={cn('tabular text-xs font-medium', pct > 0 ? 'text-destructive' : 'text-success')}>
      {pct > 0 ? '+' : ''}
      {String(pct).replace('.', ',')} %
    </span>
  )
}

function PayablesTable({ rows, onPay }: { rows: Payable[]; onPay: (p: PaymentTarget) => void }) {
  return (
    <div className="overflow-x-auto">
      <Table>
        <TableHeader>
          <TableRow className="hover:bg-transparent">
            <TableHead className="pl-5">Commande</TableHead>
            <TableHead>Échéance</TableHead>
            <TableHead className="text-right">Dû</TableHead>
            <TableHead className="text-right">Reste</TableHead>
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
                  <Link href={`/dashboard/procurement/${r.purchase_order_id}`} className="font-mono text-sm font-medium hover:underline">
                    {r.order_number}
                  </Link>
                </TableCell>
                <TableCell className={cn('tabular text-sm', r.payment_status === 'overdue' && 'font-medium text-destructive')}>
                  {r.due_date ? formatDateShort(r.due_date) : '—'}
                  {r.days_overdue > 0 && <span className="text-xs"> · {r.days_overdue} j</span>}
                </TableCell>
                <TableCell className="tabular text-right text-sm">{formatMoney(r.amount_due)}</TableCell>
                <TableCell className="tabular text-right text-sm font-semibold">{formatMoney(r.remaining)}</TableCell>
                <TableCell>
                  <StatusBadge label={st.label} tone={st.tone} />
                </TableCell>
                <TableCell className="pr-5 text-right">
                  <Button size="sm" variant="outline" onClick={() => onPay(r)}>
                    <Banknote className="h-4 w-4" aria-hidden="true" /> Régler
                  </Button>
                </TableCell>
              </TableRow>
            )
          })}
        </TableBody>
      </Table>
    </div>
  )
}

/** Compte fournisseur : solde dû, relevé, échéances, historique des prix d'achat. */
export function SupplierAccount({ supplierId }: { supplierId: string }) {
  const [statement, setStatement] = useState<Statement | null>(null)
  const [prices, setPrices] = useState<PriceProduct[] | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [from, setFrom] = useState('')
  const [to, setTo] = useState('')
  const [payTarget, setPayTarget] = useState<PaymentTarget | null>(null)
  const [openVariant, setOpenVariant] = useState<string | null>(null)

  const load = useCallback(async () => {
    setError(null)
    const qs = new URLSearchParams()
    if (from) qs.set('from', from)
    if (to) qs.set('to', to)
    try {
      const [s, p] = await Promise.all([
        apiFetch<{ data: Statement }>(`/api/suppliers/${supplierId}/statement?${qs}`),
        apiFetch<{ data: PriceProduct[] }>(`/api/suppliers/${supplierId}/price-history`),
      ])
      setStatement(s.data)
      setPrices(p.data)
    } catch (e) {
      setError(errorMessage(e))
    }
  }, [supplierId, from, to])

  useEffect(() => {
    load()
  }, [load])

  if (error && !statement) {
    return <ErrorState title="Impossible de charger le compte fournisseur" description={error} onRetry={load} />
  }
  if (!statement || !prices) return <TableSkeleton rows={4} columns={4} />

  const s = statement
  const open = [...s.overdue, ...s.upcoming]

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <StatCard
          label="Solde dû"
          value={formatMoney(Math.max(s.balance, 0))}
          hint={s.balance < 0 ? `Avance chez le fournisseur : ${formatMoney(-s.balance)}` : `${formatNumber(s.summary.openCount)} commande(s) à payer`}
          icon={Wallet}
          emphasis
        />
        <StatCard
          label="En retard"
          value={formatMoney(s.summary.overdue)}
          hint={`${formatNumber(s.summary.overdueCount)} échéance(s) dépassée(s)`}
          icon={AlertTriangle}
          tone={s.summary.overdueCount > 0 ? 'danger' : 'default'}
        />
        <StatCard
          label="À échoir sous 7 jours"
          value={formatMoney(s.summary.dueSoon)}
          hint={`${formatNumber(s.summary.dueSoonCount)} échéance(s)`}
          icon={CalendarClock}
          tone={s.summary.dueSoonCount > 0 ? 'warning' : 'default'}
        />
        <StatCard
          label="Conditions de paiement"
          value={s.supplier.payment_terms_days > 0 ? `${s.supplier.payment_terms_days} jours` : 'Comptant'}
          hint="Après réception"
          icon={ReceiptText}
        />
      </div>

      <Tabs defaultValue={open.length > 0 ? 'due' : 'statement'}>
        <TabsList>
          <TabsTrigger value="due">Échéances{open.length > 0 ? ` (${open.length})` : ''}</TabsTrigger>
          <TabsTrigger value="statement">Relevé</TabsTrigger>
          <TabsTrigger value="prices">Prix d&apos;achat</TabsTrigger>
        </TabsList>

        <TabsContent value="due" className="space-y-6">
          {open.length === 0 ? (
            <EmptyState icon={Wallet} title="Aucune facture à payer" description="Toutes les commandes reçues de ce fournisseur sont réglées." />
          ) : (
            <>
              {s.overdue.length > 0 && (
                <Panel title="En retard" description="Échéance dépassée">
                  <PayablesTable rows={s.overdue} onPay={setPayTarget} />
                </Panel>
              )}
              {s.upcoming.length > 0 && (
                <Panel title="À venir" description="Par date d'échéance">
                  <PayablesTable rows={s.upcoming} onPay={setPayTarget} />
                </Panel>
              )}
            </>
          )}
        </TabsContent>

        <TabsContent value="statement">
          <Panel
            title="Relevé de compte"
            description="Achats reçus, retours, avoirs et règlements"
            action={
              <div className="flex flex-wrap items-end gap-2">
                <div className="space-y-1">
                  <Label htmlFor="st-from" className="text-xs">
                    Du
                  </Label>
                  <Input id="st-from" type="date" value={from} onChange={(e) => setFrom(e.target.value)} className="h-8 w-36" />
                </div>
                <div className="space-y-1">
                  <Label htmlFor="st-to" className="text-xs">
                    Au
                  </Label>
                  <Input id="st-to" type="date" value={to} onChange={(e) => setTo(e.target.value)} className="h-8 w-36" />
                </div>
              </div>
            }
          >
            {s.entries.length === 0 && !from ? (
              <div className="p-5">
                <EmptyState icon={ReceiptText} title="Aucune écriture" description="Les réceptions et règlements apparaîtront ici." />
              </div>
            ) : (
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow className="hover:bg-transparent">
                      <TableHead className="pl-5">Date</TableHead>
                      <TableHead>Opération</TableHead>
                      <TableHead>Pièce</TableHead>
                      <TableHead className="text-right">Débit (dû)</TableHead>
                      <TableHead className="text-right">Crédit</TableHead>
                      <TableHead className="pr-5 text-right">Solde</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {from && (
                      <TableRow className="bg-muted/30 hover:bg-muted/30">
                        <TableCell className="pl-5 text-sm text-muted-foreground" colSpan={5}>
                          Solde au {formatDateShort(from)}
                        </TableCell>
                        <TableCell className="tabular pr-5 text-right text-sm font-medium">{formatSignedMoney(s.openingBalance)}</TableCell>
                      </TableRow>
                    )}
                    {s.entries.map((e, i) => (
                      <TableRow key={`${e.type}-${e.reference}-${e.date}-${i}`}>
                        <TableCell className="tabular pl-5 text-sm text-muted-foreground">{formatDateShort(e.date)}</TableCell>
                        <TableCell className="text-sm">
                          <span className="font-medium text-foreground">{ENTRY_LABELS[e.type]}</span>
                          <span className="block text-xs text-muted-foreground">{e.label}</span>
                        </TableCell>
                        <TableCell className="font-mono text-xs">
                          {e.purchase_order_id ? (
                            <Link href={`/dashboard/procurement/${e.purchase_order_id}`} className="hover:underline">
                              {e.reference}
                            </Link>
                          ) : (
                            e.reference
                          )}
                        </TableCell>
                        <TableCell className="tabular text-right text-sm">{e.debit > 0 ? formatMoney(e.debit) : ''}</TableCell>
                        <TableCell className="tabular text-right text-sm text-success">{e.credit > 0 ? formatMoney(e.credit) : ''}</TableCell>
                        <TableCell className="tabular pr-5 text-right text-sm font-medium">{formatMoney(e.balance)}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                  <TableFooter>
                    <TableRow className="hover:bg-transparent">
                      <TableCell colSpan={3} className="pl-5 font-medium">
                        Totaux de la période
                      </TableCell>
                      <TableCell className="tabular text-right font-semibold">{formatMoney(s.totals.debit)}</TableCell>
                      <TableCell className="tabular text-right font-semibold text-success">{formatMoney(s.totals.credit)}</TableCell>
                      <TableCell className="tabular pr-5 text-right font-semibold">{formatMoney(s.closingBalance)}</TableCell>
                    </TableRow>
                  </TableFooter>
                </Table>
              </div>
            )}
          </Panel>
        </TabsContent>

        <TabsContent value="prices">
          <Panel title="Historique des prix d'achat" description="Par produit, d'après les bons de commande">
            {prices.length === 0 ? (
              <div className="p-5">
                <EmptyState icon={LineChart} title="Aucun achat" description="Les prix apparaîtront après la première commande." />
              </div>
            ) : (
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow className="hover:bg-transparent">
                      <TableHead className="pl-5">Produit</TableHead>
                      <TableHead className="text-right">Dernier prix</TableHead>
                      <TableHead className="text-right">Variation</TableHead>
                      <TableHead className="text-right">Min / Max</TableHead>
                      <TableHead className="text-right">Prix moyen</TableHead>
                      <TableHead className="pr-5 text-right">Achats</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {prices.flatMap((p) => {
                      const expanded = openVariant === p.product_variant_id
                      const main = (
                        <TableRow
                          key={p.product_variant_id}
                          className="cursor-pointer hover:bg-muted/40"
                          onClick={() => setOpenVariant(expanded ? null : p.product_variant_id)}
                          aria-expanded={expanded}
                        >
                          <TableCell className="pl-5 text-sm">
                            <span className="font-medium text-foreground">{p.product_name}</span>
                            {p.packaging_name && <span className="block text-xs text-muted-foreground">{p.packaging_name}</span>}
                          </TableCell>
                          <TableCell className="tabular text-right text-sm font-medium">
                            {formatMoney(p.last_price)}
                            <span className="block text-xs font-normal text-muted-foreground">{formatDateShort(p.last_date)}</span>
                          </TableCell>
                          <TableCell className="text-right">
                            <ChangeBadge pct={p.last_change_pct} />
                          </TableCell>
                          <TableCell className="tabular text-right text-sm text-muted-foreground">
                            {formatMoney(p.min_price)} / {formatMoney(p.max_price)}
                          </TableCell>
                          <TableCell className="tabular text-right text-sm">{formatMoney(p.avg_price)}</TableCell>
                          <TableCell className="tabular pr-5 text-right text-sm">{formatNumber(p.purchases)}</TableCell>
                        </TableRow>
                      )
                      if (!expanded) return [main]
                      return [
                        main,
                        ...p.history.map((h, i) => (
                          <TableRow key={`${p.product_variant_id}-${h.purchase_order_id}-${i}`} className="bg-muted/30 hover:bg-muted/30">
                            <TableCell className="pl-10 text-xs text-muted-foreground">
                              {formatDateShort(h.date)} ·{' '}
                              <Link href={`/dashboard/procurement/${h.purchase_order_id}`} className="font-mono hover:underline">
                                {h.order_number}
                              </Link>
                            </TableCell>
                            <TableCell className="tabular text-right text-xs">{formatMoney(h.unit_price)}</TableCell>
                            <TableCell className="text-right">
                              <ChangeBadge pct={h.change_pct} />
                            </TableCell>
                            <TableCell colSpan={2} className="tabular text-right text-xs text-muted-foreground">
                              {formatNumber(h.quantity)} unité(s)
                            </TableCell>
                            <TableCell className="pr-5" />
                          </TableRow>
                        )),
                      ]
                    })}
                  </TableBody>
                </Table>
              </div>
            )}
          </Panel>
        </TabsContent>
      </Tabs>

      <SupplierPaymentDialog target={payTarget} onClose={() => setPayTarget(null)} onPaid={load} />
    </div>
  )
}
