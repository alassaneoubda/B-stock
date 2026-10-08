'use client'

import { useCallback, useEffect, useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { toast } from 'sonner'
import { ArrowLeft, CalendarCheck, CheckCircle2, ClipboardList, Loader2 } from 'lucide-react'
import { DashboardHeader } from '@/components/dashboard/header'
import { PageShell, Panel, StatCard, StatusBadge } from '@/components/app/blocks'
import { EmptyState, ErrorState, TableSkeleton } from '@/components/states'
import { Button } from '@/components/ui/button'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { apiFetch, toastError } from '@/lib/api-client'
import { formatDateShort, formatMoney, formatNumber } from '@/lib/format'

interface DueItem {
  variant_id: string
  product_id: string
  product_name: string
  category: string | null
  brand: string | null
  packaging_name: string | null
  quantity: number
  value: number
  last_counted_at: string | null
}

interface DueData {
  depotId: string
  cycleWeeks: number
  totalVariants: number
  neverCounted: number
  countedThisWeek: number
  weeklyQuota: number
  items: DueItem[]
}

interface Depot {
  id: string
  name: string
}

/** « À compter cette semaine » : inventaire tournant, chaque article compté au moins une fois par cycle. */
export default function InventoryDuePage() {
  const router = useRouter()
  const [depots, setDepots] = useState<Depot[]>([])
  const [depotId, setDepotId] = useState<string>('')
  const [weeks, setWeeks] = useState('4')
  const [data, setData] = useState<DueData | null>(null)
  const [error, setError] = useState(false)
  const [starting, setStarting] = useState(false)

  useEffect(() => {
    apiFetch<{ data: Depot[] }>('/api/depots')
      .then((res) => setDepots(Array.isArray(res.data) ? res.data : []))
      .catch(() => {})
  }, [])

  const load = useCallback(async () => {
    setError(false)
    setData(null)
    try {
      const params = new URLSearchParams({ weeks })
      if (depotId) params.set('depotId', depotId)
      const res = await apiFetch<{ data: DueData }>(`/api/inventory/due?${params}`)
      setData(res.data)
      if (!depotId) setDepotId(res.data.depotId)
    } catch {
      setError(true)
    }
  }, [depotId, weeks])

  useEffect(() => {
    void load()
  }, [load])

  async function start() {
    if (!data || data.items.length === 0) return
    setStarting(true)
    try {
      const res = await apiFetch<{ data: { id: string } }>('/api/inventory', {
        method: 'POST',
        body: {
          depot_id: data.depotId,
          inventory_type: 'partial',
          scope: { type: 'selection', variantIds: data.items.map((i) => i.variant_id) },
          notes: 'Inventaire tournant de la semaine',
        },
      })
      toast.success('Inventaire tournant démarré')
      router.push(`/dashboard/inventory/${res.data.id}`)
    } catch (e) {
      toastError(e, "Impossible de démarrer l'inventaire")
    } finally {
      setStarting(false)
    }
  }

  const progress = data && data.weeklyQuota > 0 ? Math.min(data.countedThisWeek / data.weeklyQuota, 1) : 0

  return (
    <div className="flex min-h-screen flex-col">
      <DashboardHeader
        title="À compter cette semaine"
        description="Inventaire tournant : quelques articles chaque semaine plutôt qu'un inventaire complet"
        actions={
          <Button variant="brand" size="sm" className="h-9" onClick={() => void start()} disabled={starting || !data || data.items.length === 0}>
            {starting ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" /> : <ClipboardList className="h-4 w-4" aria-hidden="true" />}
            <span className="hidden sm:inline">Compter ces articles</span>
            <span className="sm:hidden">Compter</span>
          </Button>
        }
      />
      <PageShell>
        <div className="flex flex-wrap items-center gap-3">
          <Button variant="ghost" size="sm" asChild className="-ml-2">
            <Link href="/dashboard/inventory">
              <ArrowLeft aria-hidden="true" />
              Inventaires
            </Link>
          </Button>
          <div className="ml-auto flex flex-wrap gap-3">
            {depots.length > 1 && (
              <Select value={depotId} onValueChange={setDepotId}>
                <SelectTrigger className="h-10 w-48" aria-label="Dépôt">
                  <SelectValue placeholder="Dépôt" />
                </SelectTrigger>
                <SelectContent>
                  {depots.map((d) => (
                    <SelectItem key={d.id} value={d.id}>
                      {d.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            )}
            <Select value={weeks} onValueChange={setWeeks}>
              <SelectTrigger className="h-10 w-56" aria-label="Durée du cycle">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="1">Tout compter chaque semaine</SelectItem>
                <SelectItem value="2">Tout compter en 2 semaines</SelectItem>
                <SelectItem value="4">Tout compter en 4 semaines</SelectItem>
                <SelectItem value="8">Tout compter en 8 semaines</SelectItem>
                <SelectItem value="13">Tout compter par trimestre</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>

        {error ? (
          <ErrorState description="La liste des articles à compter n'a pas pu être chargée." onRetry={() => void load()} />
        ) : !data ? (
          <div className="rounded-xl border border-border bg-card p-5">
            <TableSkeleton rows={6} columns={5} />
          </div>
        ) : (
          <>
            <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
              <StatCard label="Objectif de la semaine" value={formatNumber(data.weeklyQuota)} hint={`Sur ${formatNumber(data.totalVariants)} articles`} icon={CalendarCheck} />
              <StatCard
                label="Comptés cette semaine"
                value={formatNumber(data.countedThisWeek)}
                hint={`${Math.round(progress * 100)} % de l'objectif`}
                icon={CheckCircle2}
                tone={progress >= 1 ? 'success' : 'default'}
              />
              <StatCard label="Restant à compter" value={formatNumber(data.items.length)} hint="Les moins récemment comptés" icon={ClipboardList} tone={data.items.length > 0 ? 'warning' : 'success'} />
              <StatCard label="Jamais comptés" value={formatNumber(data.neverCounted)} hint="Dans ce dépôt" icon={ClipboardList} tone={data.neverCounted > 0 ? 'danger' : 'default'} />
            </div>

            {data.items.length === 0 ? (
              <EmptyState
                icon={CheckCircle2}
                title={data.totalVariants === 0 ? 'Aucun article' : 'Objectif de la semaine atteint'}
                description={
                  data.totalVariants === 0
                    ? 'Créez des produits pour commencer.'
                    : 'Tous les articles prévus cette semaine ont été comptés.'
                }
              />
            ) : (
              <Panel title="Articles à compter" description="Jamais comptés d'abord, puis les plus anciens comptages">
                <div className="overflow-x-auto">
                  <Table>
                    <TableHeader>
                      <TableRow className="hover:bg-transparent">
                        <TableHead className="pl-5">Produit</TableHead>
                        <TableHead className="hidden sm:table-cell">Catégorie</TableHead>
                        <TableHead className="text-right">Stock</TableHead>
                        <TableHead className="hidden text-right sm:table-cell">Valeur (CMP)</TableHead>
                        <TableHead className="pr-5">Dernier comptage</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {data.items.map((i) => (
                        <TableRow key={i.variant_id}>
                          <TableCell className="pl-5">
                            <Link href={`/dashboard/products/${i.product_id}`} className="text-sm font-medium text-foreground hover:underline">
                              {i.product_name}
                            </Link>
                            <p className="text-xs text-muted-foreground">{[i.packaging_name, i.brand].filter(Boolean).join(' · ') || '—'}</p>
                          </TableCell>
                          <TableCell className="hidden text-sm text-muted-foreground sm:table-cell">{i.category || '—'}</TableCell>
                          <TableCell className="tabular text-right text-sm">{formatNumber(i.quantity)}</TableCell>
                          <TableCell className="tabular hidden text-right text-sm text-muted-foreground sm:table-cell">{formatMoney(i.value)}</TableCell>
                          <TableCell className="pr-5">
                            {i.last_counted_at ? (
                              <span className="tabular text-sm text-muted-foreground">{formatDateShort(i.last_counted_at)}</span>
                            ) : (
                              <StatusBadge label="Jamais" tone="warning" />
                            )}
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              </Panel>
            )}
          </>
        )}
      </PageShell>
    </div>
  )
}
