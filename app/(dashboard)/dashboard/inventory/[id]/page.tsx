'use client'

import { useState, useEffect, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import { use } from 'react'
import { DashboardHeader } from '@/components/dashboard/header'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import Link from 'next/link'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { Textarea } from '@/components/ui/textarea'
import { Label } from '@/components/ui/label'
import {
  AlertDialog, AlertDialogCancel, AlertDialogContent, AlertDialogDescription,
  AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from '@/components/ui/alert-dialog'
import {
  ClipboardList, Loader2, CheckCircle2, Save, ArrowLeft,
  Download, Package,
} from 'lucide-react'
import { toast } from 'sonner'
import { ApiError, apiFetch, errorMessage, toastError, toastWarnings } from '@/lib/api-client'
import { formatDateShort, formatNumber, formatSignedMoney } from '@/lib/format'
import { EmptyState, ErrorState, PageSkeleton } from '@/components/states'
import { PageShell, Panel, StatusBadge } from '@/components/app/blocks'
import { cn } from '@/lib/utils'

interface InventorySession {
  id: string; session_number: string; inventory_type: string; depot_name: string
  status: string; total_items: number; items_with_variance: number
  total_variance_value: number; started_by_name: string; started_at: string
}

const STATUS: Record<string, { label: string; tone: 'brand' | 'success' | 'default' }> = {
  in_progress: { label: 'En cours', tone: 'brand' },
  completed: { label: 'Terminé', tone: 'success' },
  cancelled: { label: 'Annulé', tone: 'default' },
}

interface InventoryItem {
  id: string; item_type: string; product_name: string; packaging_name: string
  system_quantity: number; counted_quantity: number | null; variance: number
  unit_value: number; variance_value: number; notes: string | null
}

export default function InventoryDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const resolvedParams = use(params)
  const router = useRouter()
  const [session, setSession] = useState<InventorySession | null>(null)
  const [items, setItems] = useState<InventoryItem[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [loadError, setLoadError] = useState<{ status: number; message: string } | null>(null)
  const [saving, setSaving] = useState(false)
  const [dirty, setDirty] = useState(false)
  const [completing, setCompleting] = useState(false)
  const [openComplete, setOpenComplete] = useState(false)
  const [applyAdjustments, setApplyAdjustments] = useState(true)
  const [completionNotes, setCompletionNotes] = useState('')

  const fetchData = useCallback(async () => {
    setLoadError(null)
    try {
      const json = await apiFetch<{ data: { session: InventorySession; items: InventoryItem[] } }>(
        `/api/inventory/${resolvedParams.id}`
      )
      setSession(json.data?.session || null)
      setItems(json.data?.items || [])
      setDirty(false)
    } catch (e) {
      setLoadError({ status: e instanceof ApiError ? e.status : 0, message: errorMessage(e) })
    } finally {
      setIsLoading(false)
    }
  }, [resolvedParams.id])

  useEffect(() => { fetchData() }, [fetchData])

  /** Enregistre les quantités saisies. Renvoie false en cas d'échec (erreur déjà affichée). */
  async function saveCounts(): Promise<boolean> {
    try {
      await apiFetch(`/api/inventory/${resolvedParams.id}`, {
        method: 'PUT',
        body: {
          items: items.map(item => ({
            id: item.id,
            counted_quantity: item.counted_quantity,
            notes: item.notes,
          })),
        },
      })
      setDirty(false)
      return true
    } catch (e) {
      toastError(e, 'Enregistrement impossible')
      // Inventaire finalisé entre-temps : on recharge l'état réel
      if (e instanceof ApiError && e.status === 409) fetchData()
      return false
    }
  }

  async function handleSave() {
    setSaving(true)
    try {
      if (await saveCounts()) {
        toast.success('Comptage enregistré')
        fetchData()
      }
    } finally { setSaving(false) }
  }

  async function handleComplete() {
    setCompleting(true)
    try {
      // La finalisation lit les quantités en base : on enregistre d'abord la saisie en cours
      if (dirty && !(await saveCounts())) return
      const res = await apiFetch<{ warnings?: unknown }>(`/api/inventory/${resolvedParams.id}/complete`, {
        method: 'POST',
        body: { apply_adjustments: applyAdjustments, notes: completionNotes },
      })
      toast.success(applyAdjustments ? 'Inventaire finalisé, stock ajusté' : 'Inventaire finalisé')
      toastWarnings(res?.warnings)
      setOpenComplete(false)
      router.push('/dashboard/inventory')
    } catch (e) {
      // 409 « Inventaire déjà finalisé » : message serveur + rechargement de l'état réel
      toastError(e, 'Finalisation impossible')
      if (e instanceof ApiError && e.status === 409) {
        setOpenComplete(false)
        fetchData()
      }
    } finally { setCompleting(false) }
  }

  function updateItem(id: string, patch: Partial<InventoryItem>) {
    setItems(prev => prev.map(i => (i.id === id ? { ...i, ...patch } : i)))
    setDirty(true)
  }

  const countedCount = items.filter(i => i.counted_quantity != null).length
  const itemsWithVariance = items.filter(i => i.counted_quantity != null && Number(i.counted_quantity) !== Number(i.system_quantity))
  const totalVarianceValue = itemsWithVariance.reduce(
    (sum, i) => sum + (Number(i.counted_quantity) - Number(i.system_quantity)) * Number(i.unit_value || 0),
    0
  )

  const backLink = (
    <Button variant="ghost" size="sm" className="-ml-2 text-muted-foreground" asChild>
      <Link href="/dashboard/inventory">
        <ArrowLeft className="h-4 w-4" aria-hidden="true" />
        Inventaires
      </Link>
    </Button>
  )

  if (isLoading) {
    return <PageSkeleton />
  }

  if (loadError || !session) {
    return (
      <div className="flex min-h-screen flex-col">
        <DashboardHeader title="Inventaire" />
        <PageShell>
          {backLink}
          {!loadError || loadError.status === 404 ? (
            <EmptyState
              icon={ClipboardList}
              title="Inventaire introuvable"
              description="Cet inventaire n'existe pas ou a été supprimé."
              action={{ label: 'Retour aux inventaires', href: '/dashboard/inventory' }}
            />
          ) : (
            <ErrorState description={loadError.message} onRetry={fetchData} />
          )}
        </PageShell>
      </div>
    )
  }

  const isOpen = session.status === 'in_progress'
  const st = STATUS[session.status] || STATUS.in_progress
  const typeLabel = session.inventory_type === 'full' ? 'Complet' : session.inventory_type === 'partial' ? 'Partiel' : 'Contrôle ponctuel'
  const progress = items.length > 0 ? Math.round((countedCount / items.length) * 100) : 0
  const signTone = (n: number) => (n < 0 ? 'text-destructive' : n > 0 ? 'text-success' : 'text-foreground')

  return (
    <div className="flex min-h-screen flex-col">
      <DashboardHeader title={`Inventaire ${session.session_number}`} description={`${session.depot_name} · ${typeLabel}`} />
      <PageShell>
        {/* En-tête de détail */}
        <div className="space-y-3">
          {backLink}
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div className="min-w-0 space-y-1">
              <div className="flex flex-wrap items-center gap-2">
                <h2 className="text-2xl font-semibold tracking-tight text-foreground">{session.session_number}</h2>
                <StatusBadge label={st.label} tone={st.tone} />
              </div>
              <p className="text-sm text-muted-foreground">
                {session.depot_name} · {typeLabel} · démarré par {session.started_by_name} le {formatDateShort(session.started_at)}
              </p>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              {isOpen && (
                <>
                  <Button variant="outline" onClick={handleSave} disabled={saving || completing}>
                    {saving ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" /> : <Save className="h-4 w-4" aria-hidden="true" />}
                    Sauvegarder
                  </Button>
                  <Button variant="brand" onClick={() => setOpenComplete(true)} disabled={saving || completing || countedCount === 0}>
                    <CheckCircle2 className="h-4 w-4" aria-hidden="true" />
                    Finaliser
                  </Button>
                </>
              )}
              {session.status === 'completed' && (
                <Button variant="outline" onClick={() => window.open(`/api/export/pdf?type=inventory&id=${session.id}`, '_blank')}>
                  <Download className="h-4 w-4" aria-hidden="true" />
                  Télécharger le PDF
                </Button>
              )}
            </div>
          </div>
        </div>

        <div className="grid gap-6 lg:grid-cols-3">
          {/* Articles */}
          <Panel
            className="lg:col-span-2"
            title={isOpen ? 'Articles à compter' : 'Articles comptés'}
            description={`${formatNumber(items.length)} article${items.length > 1 ? 's' : ''}${isOpen && dirty ? ' · modifications non enregistrées' : ''}`}
          >
            {items.length === 0 ? (
              <EmptyState
                className="m-5"
                icon={Package}
                title="Aucun article à compter"
                description="Le dépôt ne contenait aucun stock au démarrage de cet inventaire."
              />
            ) : (
              <>
                {/* Mobile : cartes */}
                <ul className="divide-y divide-border md:hidden">
                  {items.map((item) => {
                    const variance = item.counted_quantity != null ? Number(item.counted_quantity) - Number(item.system_quantity) : 0
                    const varianceValue = item.counted_quantity != null ? variance * Number(item.unit_value || 0) : 0
                    const name = item.product_name || item.packaging_name || '-'
                    return (
                      <li key={item.id} className="space-y-3 px-5 py-4">
                        <div className="flex items-start justify-between gap-3">
                          <div className="min-w-0">
                            <p className="truncate text-sm font-medium text-foreground">{name}</p>
                            <p className="tabular text-xs text-muted-foreground">
                              {item.item_type === 'product' ? 'Produit' : 'Emballage'} · système {formatNumber(item.system_quantity)}
                            </p>
                          </div>
                          <div className="shrink-0 text-right">
                            <p className={cn('tabular text-sm font-medium', signTone(variance))}>
                              {item.counted_quantity != null ? (variance > 0 ? '+' : '') + formatNumber(variance) : '—'}
                            </p>
                            <p className={cn('tabular text-xs', item.counted_quantity != null ? signTone(varianceValue) : 'text-muted-foreground')}>
                              {item.counted_quantity != null ? formatSignedMoney(varianceValue) : 'Non compté'}
                            </p>
                          </div>
                        </div>
                        {isOpen ? (
                          <div className="grid grid-cols-[6rem_1fr] gap-2">
                            <Input
                              type="number"
                              inputMode="numeric"
                              min={0}
                              step={1}
                              aria-label={`Quantité comptée pour ${name}`}
                              value={item.counted_quantity ?? ''}
                              onChange={(e) => {
                                const raw = e.target.value
                                const n = Math.floor(Number(raw))
                                updateItem(item.id, {
                                  counted_quantity: raw === '' || !Number.isFinite(n) ? null : Math.max(0, n),
                                })
                              }}
                              className="tabular h-10 text-right"
                              placeholder="0"
                            />
                            <Input
                              aria-label={`Notes pour ${name}`}
                              value={item.notes || ''}
                              onChange={(e) => updateItem(item.id, { notes: e.target.value })}
                              className="h-10"
                              placeholder="Notes…"
                            />
                          </div>
                        ) : (
                          <p className="text-xs text-muted-foreground">
                            Compté : <span className="tabular text-foreground">{item.counted_quantity != null ? formatNumber(item.counted_quantity) : '—'}</span>
                            {item.notes ? ` · ${item.notes}` : ''}
                          </p>
                        )}
                      </li>
                    )
                  })}
                </ul>

                {/* Bureau : tableau */}
                <div className="hidden md:block">
                  <Table>
                    <TableHeader>
                      <TableRow className="hover:bg-transparent">
                        <TableHead className="pl-5">Article</TableHead>
                        <TableHead className="text-right">Système</TableHead>
                        <TableHead className="text-right">Compté</TableHead>
                        <TableHead className="text-right">Écart</TableHead>
                        <TableHead className="text-right">Valeur écart</TableHead>
                        <TableHead className="pr-5">Notes</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {items.map((item) => {
                        const variance = item.counted_quantity != null ? Number(item.counted_quantity) - Number(item.system_quantity) : 0
                        const varianceValue = item.counted_quantity != null ? variance * Number(item.unit_value || 0) : 0
                        const name = item.product_name || item.packaging_name || '-'
                        return (
                          <TableRow key={item.id}>
                            <TableCell className="pl-5">
                              <p className="font-medium text-foreground">{name}</p>
                              <p className="text-xs text-muted-foreground">{item.item_type === 'product' ? 'Produit' : 'Emballage'}</p>
                            </TableCell>
                            <TableCell className="tabular text-right">{formatNumber(item.system_quantity)}</TableCell>
                            <TableCell className="text-right">
                              {isOpen ? (
                                <Input
                                  type="number"
                                  inputMode="numeric"
                                  min={0}
                                  step={1}
                                  aria-label={`Quantité comptée pour ${name}`}
                                  value={item.counted_quantity ?? ''}
                                  onChange={(e) => {
                                    const raw = e.target.value
                                    const n = Math.floor(Number(raw))
                                    updateItem(item.id, {
                                      counted_quantity: raw === '' || !Number.isFinite(n) ? null : Math.max(0, n),
                                    })
                                  }}
                                  className="tabular ml-auto h-9 w-20 text-right"
                                  placeholder="0"
                                />
                              ) : (
                                <span className="tabular">{item.counted_quantity != null ? formatNumber(item.counted_quantity) : '—'}</span>
                              )}
                            </TableCell>
                            <TableCell className={cn('tabular text-right font-medium', signTone(variance))}>
                              {item.counted_quantity != null ? (variance > 0 ? '+' : '') + formatNumber(variance) : '—'}
                            </TableCell>
                            <TableCell className={cn('tabular text-right', signTone(varianceValue))}>
                              {item.counted_quantity != null ? formatSignedMoney(varianceValue) : '—'}
                            </TableCell>
                            <TableCell className="pr-5">
                              {isOpen ? (
                                <Input
                                  aria-label={`Notes pour ${name}`}
                                  value={item.notes || ''}
                                  onChange={(e) => updateItem(item.id, { notes: e.target.value })}
                                  className="h-9 w-36"
                                  placeholder="Notes…"
                                />
                              ) : (
                                <span className="text-xs text-muted-foreground">{item.notes || '—'}</span>
                              )}
                            </TableCell>
                          </TableRow>
                        )
                      })}
                    </TableBody>
                  </Table>
                </div>
              </>
            )}
          </Panel>

          {/* Résumé */}
          <div className="space-y-6">
            <Panel title="Résumé" bodyClassName="space-y-3 px-5 py-4">
              {isOpen && (
                <div className="space-y-1.5 pb-1">
                  <div className="flex justify-between text-sm">
                    <span className="text-muted-foreground">Progression</span>
                    <span className="tabular font-medium text-foreground">{progress} %</span>
                  </div>
                  <div className="h-1.5 overflow-hidden rounded-full bg-muted" role="progressbar" aria-valuenow={progress} aria-valuemin={0} aria-valuemax={100} aria-label="Progression du comptage">
                    <div className="h-full rounded-full bg-brand transition-[width]" style={{ width: `${progress}%` }} />
                  </div>
                </div>
              )}
              <div className="flex justify-between text-sm">
                <span className="text-muted-foreground">Total articles</span>
                <span className="tabular font-medium text-foreground">{formatNumber(session.total_items)}</span>
              </div>
              <div className="flex justify-between text-sm">
                <span className="text-muted-foreground">Comptés</span>
                <span className="tabular font-medium text-foreground">{formatNumber(countedCount)}</span>
              </div>
              <div className="flex justify-between text-sm">
                <span className="text-muted-foreground">Lignes avec écart</span>
                <span className={cn('tabular font-medium', itemsWithVariance.length > 0 ? 'text-warning-foreground' : 'text-foreground')}>
                  {formatNumber(itemsWithVariance.length)}
                </span>
              </div>
              <div className="flex justify-between border-t border-border pt-3 text-sm">
                <span className="font-medium text-foreground">Valeur des écarts</span>
                <span className={cn('tabular font-semibold', signTone(totalVarianceValue))}>{formatSignedMoney(totalVarianceValue)}</span>
              </div>
            </Panel>

            <Panel title="Informations" bodyClassName="space-y-3 px-5 py-4">
              <div className="flex justify-between gap-3 text-sm">
                <span className="text-muted-foreground">Dépôt</span>
                <span className="truncate text-right font-medium text-foreground">{session.depot_name}</span>
              </div>
              <div className="flex justify-between gap-3 text-sm">
                <span className="text-muted-foreground">Type</span>
                <span className="text-right text-foreground">{typeLabel}</span>
              </div>
              <div className="flex justify-between gap-3 text-sm">
                <span className="text-muted-foreground">Démarré par</span>
                <span className="truncate text-right text-foreground">{session.started_by_name}</span>
              </div>
              <div className="flex justify-between gap-3 text-sm">
                <span className="text-muted-foreground">Date</span>
                <span className="tabular text-right text-foreground">{formatDateShort(session.started_at)}</span>
              </div>
            </Panel>
          </div>
        </div>

        {/* Confirmation de finalisation */}
        <AlertDialog open={openComplete} onOpenChange={(o) => { if (!completing) setOpenComplete(o) }}>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Finaliser l&apos;inventaire ?</AlertDialogTitle>
              <AlertDialogDescription>
                {applyAdjustments && itemsWithVariance.length > 0
                  ? `${itemsWithVariance.length} ligne(s) présentent un écart : le stock du dépôt ${session.depot_name} sera remplacé par les quantités comptées. `
                  : applyAdjustments
                    ? 'Aucun écart détecté : le stock du dépôt ne changera pas. '
                    : 'Les écarts seront enregistrés sans modifier le stock du dépôt. '}
                L&apos;inventaire ne pourra plus être modifié.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <div className="space-y-4">
              <div className="space-y-2 rounded-lg border border-border bg-muted/40 p-3 text-sm">
                <div className="flex justify-between"><span className="text-muted-foreground">Articles totaux</span><span className="tabular font-medium">{formatNumber(session.total_items)}</span></div>
                <div className="flex justify-between"><span className="text-muted-foreground">Articles comptés</span><span className="tabular font-medium">{formatNumber(countedCount)}</span></div>
                <div className="flex justify-between"><span className="text-muted-foreground">Lignes avec écart</span><span className={cn('tabular font-medium', itemsWithVariance.length > 0 && 'text-warning-foreground')}>{formatNumber(itemsWithVariance.length)}</span></div>
                <div className="flex justify-between"><span className="text-muted-foreground">Valeur totale écarts</span><span className={cn('tabular font-medium', signTone(totalVarianceValue))}>{formatSignedMoney(totalVarianceValue)}</span></div>
              </div>
              <div className="flex items-center gap-2">
                <input
                  type="checkbox"
                  id="apply"
                  checked={applyAdjustments}
                  onChange={(e) => setApplyAdjustments(e.target.checked)}
                  className="h-4 w-4 rounded border-border accent-primary"
                />
                <Label htmlFor="apply" className="text-sm font-normal">Appliquer les ajustements au stock</Label>
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="completion-notes">Notes (optionnel)</Label>
                <Textarea id="completion-notes" value={completionNotes} onChange={(e) => setCompletionNotes(e.target.value)} placeholder="Observations…" />
              </div>
            </div>
            <AlertDialogFooter>
              <AlertDialogCancel disabled={completing}>Annuler</AlertDialogCancel>
              <Button onClick={handleComplete} disabled={completing}>
                {completing ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" /> : <CheckCircle2 className="h-4 w-4" aria-hidden="true" />}
                Finaliser
              </Button>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </PageShell>
    </div>
  )
}
