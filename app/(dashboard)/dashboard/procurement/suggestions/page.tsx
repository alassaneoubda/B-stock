'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { ArrowLeft, ClipboardList, Gauge, Loader2, PackageCheck, PackageSearch, ShoppingCart } from 'lucide-react'
import { toast } from 'sonner'
import { DashboardHeader } from '@/components/dashboard/header'
import { PageShell, Panel, StatCard } from '@/components/app/blocks'
import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/checkbox'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Switch } from '@/components/ui/switch'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Table, TableBody, TableCell, TableFooter, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { EmptyState, ErrorState, PageSkeleton } from '@/components/states'
import { apiFetch, errorMessage, toastError } from '@/lib/api-client'
import { formatMoney, formatNumber } from '@/lib/format'
import { cn } from '@/lib/utils'

type Row = {
  depot_id: string
  depot_name: string
  product_variant_id: string
  product_name: string
  packaging_name: string | null
  sold_qty: number
  avg_daily_sales: number
  stock: number
  on_order: number
  coverage_days: number | null
  suggested_qty: number
  supplier_id: string | null
  supplier_name: string | null
  unit_price: number
}

type Data = { coverageDays: number; windowDays: number; rows: Row[] }
type Line = { selected: boolean; qty: string; price: string }

const rowKey = (r: Row) => `${r.depot_id}:${r.product_variant_id}`
const NO_SUPPLIER = 'none'

function coverageTone(days: number | null, target: number) {
  if (days === null) return 'text-muted-foreground'
  if (days < Math.min(3, target)) return 'font-semibold text-destructive'
  if (days < target) return 'font-medium text-warning-foreground'
  return 'text-success'
}

export default function PurchaseSuggestionsPage() {
  const router = useRouter()
  const [days, setDays] = useState('14')
  const [appliedDays, setAppliedDays] = useState(14)
  const [depotId, setDepotId] = useState('all')
  const [showAll, setShowAll] = useState(false)
  const [data, setData] = useState<Data | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [depots, setDepots] = useState<{ id: string; name: string }[]>([])
  const [suppliers, setSuppliers] = useState<{ id: string; name: string }[]>([])
  const [lines, setLines] = useState<Record<string, Line>>({})
  // Fournisseur choisi par groupe (clé = fournisseur proposé + dépôt)
  const [groupSupplier, setGroupSupplier] = useState<Record<string, string>>({})
  const [creating, setCreating] = useState<string | null>(null)

  useEffect(() => {
    Promise.all([apiFetch('/api/depots'), apiFetch('/api/suppliers')])
      .then(([d, s]) => {
        setDepots(d.data || d.depots || [])
        setSuppliers(s.data || s.suppliers || [])
      })
      .catch(() => {})
  }, [])

  // Validation différée du nombre de jours (évite une requête par frappe)
  useEffect(() => {
    const n = Number(days)
    if (!Number.isInteger(n) || n < 1 || n > 180) return
    const t = setTimeout(() => setAppliedDays(n), 400)
    return () => clearTimeout(t)
  }, [days])

  const load = useCallback(async () => {
    setLoading(true)
    setError(null)
    const qs = new URLSearchParams({ days: String(appliedDays) })
    if (depotId !== 'all') qs.set('depotId', depotId)
    if (showAll) qs.set('all', '1')
    try {
      const res = await apiFetch<{ data: Data }>(`/api/procurement/suggestions?${qs}`)
      setData(res.data)
      const next: Record<string, Line> = {}
      for (const r of res.data.rows) {
        next[rowKey(r)] = { selected: r.suggested_qty > 0, qty: String(r.suggested_qty), price: String(r.unit_price) }
      }
      setLines(next)
    } catch (e) {
      setError(errorMessage(e))
    } finally {
      setLoading(false)
    }
  }, [appliedDays, depotId, showAll])

  useEffect(() => {
    load()
  }, [load])

  const groups = useMemo(() => {
    const map = new Map<string, { key: string; supplierId: string | null; supplierName: string | null; depotId: string; depotName: string; rows: Row[] }>()
    for (const r of data?.rows ?? []) {
      const key = `${r.supplier_id ?? NO_SUPPLIER}|${r.depot_id}`
      let g = map.get(key)
      if (!g) {
        g = { key, supplierId: r.supplier_id, supplierName: r.supplier_name, depotId: r.depot_id, depotName: r.depot_name, rows: [] }
        map.set(key, g)
      }
      g.rows.push(r)
    }
    // Groupes avec fournisseur d'abord, puis par nom
    return [...map.values()].sort((a, b) =>
      a.supplierId === null ? 1 : b.supplierId === null ? -1 : (a.supplierName ?? '').localeCompare(b.supplierName ?? '')
    )
  }, [data])

  function updateLine(key: string, patch: Partial<Line>) {
    setLines((prev) => ({ ...prev, [key]: { ...prev[key], ...patch } }))
  }

  function selectedItems(rows: Row[]) {
    return rows
      .map((r) => ({ r, line: lines[rowKey(r)] }))
      .filter(({ line }) => line?.selected && Number(line.qty) > 0)
      .map(({ r, line }) => ({
        productVariantId: r.product_variant_id,
        quantityOrdered: Math.round(Number(line.qty)),
        unitPrice: Math.max(0, Number(line.price) || 0),
      }))
  }

  async function createOrder(group: (typeof groups)[number]) {
    const supplierId = groupSupplier[group.key] ?? group.supplierId
    if (!supplierId) {
      toast.error('Choisissez un fournisseur pour ce groupe')
      return
    }
    const items = selectedItems(group.rows)
    if (items.length === 0) {
      toast.error('Aucune ligne sélectionnée avec une quantité')
      return
    }
    setCreating(group.key)
    try {
      // Réutilise la création standard de bon de commande
      const res = await apiFetch<{ data: { id: string; order_number: string } }>('/api/procurement', {
        method: 'POST',
        body: {
          supplierId,
          depotId: group.depotId,
          notes: `Généré depuis « À commander » : couverture de ${appliedDays} jours (ventes moyennes sur ${data?.windowDays ?? 28} jours).`,
          items,
        },
      })
      toast.success(`Bon de commande ${res.data.order_number} créé`)
      router.push(`/dashboard/procurement/${res.data.id}`)
    } catch (e) {
      toastError(e, 'Bon de commande non créé')
    } finally {
      setCreating(null)
    }
  }

  const header = (
    <DashboardHeader title="À commander" description="Suggestions de réapprovisionnement d'après les ventes récentes" />
  )

  if (loading && !data) return <PageSkeleton />

  if (!data) {
    return (
      <div className="flex min-h-screen flex-col">
        {header}
        <PageShell>
          <ErrorState title="Impossible de calculer les suggestions" description={error ?? undefined} onRetry={load} />
        </PageShell>
      </div>
    )
  }

  const toOrder = data.rows.filter((r) => r.suggested_qty > 0)
  const critical = toOrder.filter((r) => r.coverage_days !== null && r.coverage_days < 3)
  const estimated = data.rows.reduce((s, r) => {
    const l = lines[rowKey(r)]
    return l?.selected ? s + (Number(l.qty) || 0) * (Number(l.price) || 0) : s
  }, 0)

  return (
    <div className="flex min-h-screen flex-col">
      {header}
      <PageShell>
        <Button variant="ghost" size="sm" asChild className="-ml-2 w-fit text-muted-foreground">
          <Link href="/dashboard/procurement">
            <ArrowLeft className="h-4 w-4" aria-hidden="true" /> Approvisionnement
          </Link>
        </Button>

        <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
          <StatCard label="Produits à commander" value={formatNumber(toOrder.length)} hint={`Pour couvrir ${appliedDays} jours`} icon={ShoppingCart} emphasis />
          <StatCard
            label="Rupture imminente"
            value={formatNumber(critical.length)}
            hint="Moins de 3 jours de stock"
            icon={Gauge}
            tone={critical.length > 0 ? 'danger' : 'default'}
          />
          <StatCard label="Fournisseurs concernés" value={formatNumber(groups.filter((g) => g.supplierId).length)} hint="Un bon par fournisseur et dépôt" icon={PackageSearch} />
          <StatCard label="Montant estimé" value={formatMoney(estimated)} hint="Lignes sélectionnées" icon={PackageCheck} />
        </div>

        <div className="flex flex-wrap items-end gap-4">
          <div className="space-y-1.5">
            <Label htmlFor="cov-days">Jours de couverture visés</Label>
            <Input
              id="cov-days"
              type="number"
              min={1}
              max={180}
              value={days}
              onChange={(e) => setDays(e.target.value)}
              className="h-10 w-32"
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="sg-depot">Dépôt</Label>
            <Select value={depotId} onValueChange={setDepotId}>
              <SelectTrigger id="sg-depot" className="h-10 w-56">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Tous les dépôts</SelectItem>
                {depots.map((d) => (
                  <SelectItem key={d.id} value={d.id}>
                    {d.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="flex h-10 items-center gap-2">
            <Switch id="sg-all" checked={showAll} onCheckedChange={setShowAll} />
            <Label htmlFor="sg-all">Afficher aussi les produits suffisamment stockés</Label>
          </div>
          {loading && <Loader2 className="mb-3 h-4 w-4 animate-spin text-muted-foreground" aria-label="Calcul en cours" />}
        </div>
        <p className="text-xs text-muted-foreground">
          Quantité suggérée = ventes moyennes par jour sur les {data.windowDays} derniers jours × {appliedDays} jours − stock
          disponible − quantités déjà en commande, arrondie à l&apos;unité supérieure. Modifiez les quantités avant de créer le bon.
        </p>

        {groups.length === 0 ? (
          <EmptyState
            icon={PackageCheck}
            title="Rien à commander"
            description={`Le stock couvre au moins ${appliedDays} jours de ventes pour tous les produits vendus récemment.`}
          />
        ) : (
          groups.map((g) => {
            const chosen = groupSupplier[g.key] ?? g.supplierId ?? ''
            const count = selectedItems(g.rows).length
            const groupTotal = g.rows.reduce((s, r) => {
              const l = lines[rowKey(r)]
              return l?.selected ? s + (Number(l.qty) || 0) * (Number(l.price) || 0) : s
            }, 0)
            return (
              <Panel
                key={g.key}
                title={g.supplierName ?? 'Sans fournisseur habituel'}
                description={`Dépôt : ${g.depotName}${g.supplierId ? ' · fournisseur du dernier achat' : ''}`}
                action={
                  <div className="flex flex-wrap items-center gap-2">
                    <Select value={chosen} onValueChange={(v) => setGroupSupplier((prev) => ({ ...prev, [g.key]: v }))}>
                      <SelectTrigger className="h-9 w-48" aria-label="Fournisseur du bon de commande">
                        <SelectValue placeholder="Choisir un fournisseur" />
                      </SelectTrigger>
                      <SelectContent>
                        {suppliers.map((s) => (
                          <SelectItem key={s.id} value={s.id}>
                            {s.name}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <Button variant="brand" size="sm" disabled={!chosen || count === 0 || creating !== null} onClick={() => createOrder(g)}>
                      {creating === g.key ? (
                        <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
                      ) : (
                        <ClipboardList className="h-4 w-4" aria-hidden="true" />
                      )}
                      Créer le bon ({count})
                    </Button>
                  </div>
                }
              >
                <div className="overflow-x-auto">
                  <Table>
                    <TableHeader>
                      <TableRow className="hover:bg-transparent">
                        <TableHead className="w-10 pl-5">
                          <span className="sr-only">Inclure</span>
                        </TableHead>
                        <TableHead>Produit</TableHead>
                        <TableHead className="text-right">Ventes / jour</TableHead>
                        <TableHead className="text-right">Stock</TableHead>
                        <TableHead className="text-right">En commande</TableHead>
                        <TableHead className="text-right">Couverture</TableHead>
                        <TableHead className="text-right">Qté suggérée</TableHead>
                        <TableHead className="text-right">Prix d&apos;achat</TableHead>
                        <TableHead className="pr-5 text-right">Total</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {g.rows.map((r) => {
                        const key = rowKey(r)
                        const line = lines[key] ?? { selected: false, qty: '0', price: '0' }
                        return (
                          <TableRow key={key} className={cn(!line.selected && 'opacity-60')}>
                            <TableCell className="pl-5">
                              <Checkbox
                                checked={line.selected}
                                onCheckedChange={(v) => updateLine(key, { selected: v === true })}
                                aria-label={`Inclure ${r.product_name}`}
                              />
                            </TableCell>
                            <TableCell className="text-sm">
                              <span className="font-medium text-foreground">{r.product_name}</span>
                              {r.packaging_name && <span className="block text-xs text-muted-foreground">{r.packaging_name}</span>}
                            </TableCell>
                            <TableCell className="tabular text-right text-sm">{formatNumber(r.avg_daily_sales)}</TableCell>
                            <TableCell className="tabular text-right text-sm">{formatNumber(r.stock)}</TableCell>
                            <TableCell className="tabular text-right text-sm text-muted-foreground">{r.on_order > 0 ? formatNumber(r.on_order) : '—'}</TableCell>
                            <TableCell className={cn('tabular text-right text-sm', coverageTone(r.coverage_days, appliedDays))}>
                              {r.coverage_days === null ? 'Aucune vente' : `${formatNumber(r.coverage_days)} j`}
                            </TableCell>
                            <TableCell className="text-right">
                              <Input
                                type="number"
                                min={0}
                                step={1}
                                value={line.qty}
                                onChange={(e) => updateLine(key, { qty: e.target.value, selected: Number(e.target.value) > 0 })}
                                className="tabular ml-auto h-8 w-24 text-right"
                                aria-label={`Quantité à commander pour ${r.product_name}`}
                              />
                            </TableCell>
                            <TableCell className="text-right">
                              <Input
                                type="number"
                                min={0}
                                value={line.price}
                                onChange={(e) => updateLine(key, { price: e.target.value })}
                                className="tabular ml-auto h-8 w-28 text-right"
                                aria-label={`Prix d'achat unitaire de ${r.product_name}`}
                              />
                            </TableCell>
                            <TableCell className="tabular pr-5 text-right text-sm font-medium">
                              {line.selected ? formatMoney((Number(line.qty) || 0) * (Number(line.price) || 0)) : '—'}
                            </TableCell>
                          </TableRow>
                        )
                      })}
                    </TableBody>
                    <TableFooter>
                      <TableRow className="hover:bg-transparent">
                        <TableCell colSpan={8} className="pl-5 text-sm font-medium">
                          Total du bon
                        </TableCell>
                        <TableCell className="tabular pr-5 text-right font-semibold">{formatMoney(groupTotal)}</TableCell>
                      </TableRow>
                    </TableFooter>
                  </Table>
                </div>
              </Panel>
            )
          })
        )}
      </PageShell>
    </div>
  )
}
