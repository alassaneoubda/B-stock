'use client'

import { useState, useEffect, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import { use } from 'react'
import { DashboardHeader } from '@/components/dashboard/header'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Badge } from '@/components/ui/badge'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
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

interface InventorySession {
  id: string; session_number: string; inventory_type: string; depot_name: string
  status: string; total_items: number; items_with_variance: number
  total_variance_value: number; started_by_name: string; started_at: string
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

  if (isLoading) {
    return <PageSkeleton />
  }

  if (loadError || !session) {
    return (
      <div className="flex flex-col min-h-screen bg-muted/30">
        <DashboardHeader title="Inventaire" />
        <main className="flex-1 p-4 lg:p-6 max-w-[1400px] mx-auto w-full">
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
        </main>
      </div>
    )
  }

  const isOpen = session.status === 'in_progress'

  return (
    <div className="flex flex-col min-h-screen bg-muted/30">
      <DashboardHeader title={`Inventaire — ${session.session_number}`} />
      <main className="flex-1 p-4 lg:p-6 space-y-6 max-w-[1400px] mx-auto w-full">

        {/* Header */}
        <Card>
          <CardContent className="p-4 sm:p-6">
            <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
              <div className="flex items-center gap-3">
                <div className="h-10 w-10 rounded-lg bg-brand-soft flex items-center justify-center">
                  <ClipboardList className="h-5 w-5 text-brand-strong" aria-hidden="true" />
                </div>
                <div>
                  <p className="font-semibold text-foreground">{session.session_number}</p>
                  <p className="text-sm text-muted-foreground">
                    {session.depot_name} — {session.inventory_type === 'full' ? 'Complet' : session.inventory_type === 'partial' ? 'Partiel' : 'Contrôle ponctuel'}
                  </p>
                  <p className="text-xs text-muted-foreground/70">
                    Par {session.started_by_name} le {formatDateShort(session.started_at)}
                  </p>
                </div>
              </div>
              <div className="flex gap-2">
                {isOpen && (
                  <>
                    <Button size="sm" variant="outline" onClick={handleSave} disabled={saving || completing}>
                      {saving ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <Save className="h-4 w-4 mr-2" />} Sauvegarder
                    </Button>
                    <Button size="sm" onClick={() => setOpenComplete(true)} disabled={saving || completing || countedCount === 0}>
                      <CheckCircle2 className="h-4 w-4 mr-2" /> Finaliser
                    </Button>
                  </>
                )}
                {session.status === 'completed' && (
                  <Button size="sm" variant="outline" onClick={() => window.open(`/api/export/pdf?type=inventory&id=${session.id}`, '_blank')}>
                    <Download className="h-4 w-4 mr-2" /> PDF
                  </Button>
                )}
                <Button size="sm" variant="ghost" onClick={() => router.back()}>
                  <ArrowLeft className="h-4 w-4 mr-2" /> Retour
                </Button>
              </div>
            </div>

            {/* Summary */}
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mt-4">
              <div className="bg-card rounded-lg border p-3">
                <div className="text-xs text-muted-foreground mb-1">Total articles</div>
                <div className="text-lg font-bold text-foreground">{formatNumber(session.total_items)}</div>
              </div>
              <div className="bg-card rounded-lg border p-3">
                <div className="text-xs text-muted-foreground mb-1">Comptés</div>
                <div className="text-lg font-bold text-brand-strong">{formatNumber(countedCount)}</div>
              </div>
              <div className="bg-card rounded-lg border p-3">
                <div className="text-xs text-muted-foreground mb-1">Écarts</div>
                <div className="text-lg font-bold text-warning-foreground">{formatNumber(itemsWithVariance.length)}</div>
              </div>
              <div className="bg-card rounded-lg border p-3">
                <div className="text-xs text-muted-foreground mb-1">Valeur écarts</div>
                <div className={`text-lg font-bold ${totalVarianceValue < 0 ? 'text-destructive' : 'text-success'}`}>
                  {formatSignedMoney(totalVarianceValue)}
                </div>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Items table */}
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-semibold">Articles à compter</CardTitle>
          </CardHeader>
          <CardContent className="p-0">
            {items.length === 0 ? (
              <EmptyState
                className="m-4"
                icon={Package}
                title="Aucun article à compter"
                description="Le dépôt ne contenait aucun stock au démarrage de cet inventaire."
              />
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Article</TableHead>
                    <TableHead>Type</TableHead>
                    <TableHead className="text-center">Stock système</TableHead>
                    <TableHead className="text-center">Compté</TableHead>
                    <TableHead className="text-center">Écart</TableHead>
                    <TableHead className="text-right">Valeur écart</TableHead>
                    <TableHead>Notes</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {items.map((item) => {
                    const variance = item.counted_quantity != null ? Number(item.counted_quantity) - Number(item.system_quantity) : 0
                    const varianceValue = item.counted_quantity != null ? variance * Number(item.unit_value || 0) : 0
                    const name = item.product_name || item.packaging_name || '-'
                    return (
                      <TableRow key={item.id}>
                        <TableCell className="text-sm">{name}</TableCell>
                        <TableCell>
                          <Badge variant="outline" className={item.item_type === 'product' ? 'border-brand/40 text-brand-strong' : 'border-info/30 text-info'}>
                            {item.item_type === 'product' ? 'Produit' : 'Emballage'}
                          </Badge>
                        </TableCell>
                        <TableCell className="text-center text-sm">{formatNumber(item.system_quantity)}</TableCell>
                        <TableCell className="text-center">
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
                              className="w-20 h-8 text-center text-sm"
                              placeholder="0"
                            />
                          ) : (
                            <span className="text-sm">{item.counted_quantity != null ? formatNumber(item.counted_quantity) : '-'}</span>
                          )}
                        </TableCell>
                        <TableCell className={`text-center text-sm font-medium ${variance < 0 ? 'text-destructive' : variance > 0 ? 'text-success' : ''}`}>
                          {item.counted_quantity != null ? (variance > 0 ? '+' : '') + formatNumber(variance) : '-'}
                        </TableCell>
                        <TableCell className={`text-right text-sm ${varianceValue < 0 ? 'text-destructive' : varianceValue > 0 ? 'text-success' : ''}`}>
                          {item.counted_quantity != null ? formatSignedMoney(varianceValue) : '-'}
                        </TableCell>
                        <TableCell>
                          {isOpen ? (
                            <Input
                              aria-label={`Notes pour ${name}`}
                              value={item.notes || ''}
                              onChange={(e) => updateItem(item.id, { notes: e.target.value })}
                              className="w-32 h-8 text-xs"
                              placeholder="Notes..."
                            />
                          ) : (
                            <span className="text-xs text-muted-foreground">{item.notes || '-'}</span>
                          )}
                        </TableCell>
                      </TableRow>
                    )
                  })}
                </TableBody>
              </Table>
            )}
          </CardContent>
        </Card>

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
              <div className="bg-muted/50 rounded-lg p-3 space-y-2 text-sm">
                <div className="flex justify-between"><span>Articles totaux</span><span className="font-medium">{formatNumber(session.total_items)}</span></div>
                <div className="flex justify-between"><span>Articles comptés</span><span className="font-medium">{formatNumber(countedCount)}</span></div>
                <div className="flex justify-between text-warning-foreground"><span>Lignes avec écart</span><span className="font-medium">{formatNumber(itemsWithVariance.length)}</span></div>
                <div className="flex justify-between"><span>Valeur totale écarts</span><span className={`font-medium ${totalVarianceValue < 0 ? 'text-destructive' : 'text-success'}`}>{formatSignedMoney(totalVarianceValue)}</span></div>
              </div>
              <div className="flex items-center gap-2">
                <input
                  type="checkbox"
                  id="apply"
                  checked={applyAdjustments}
                  onChange={(e) => setApplyAdjustments(e.target.checked)}
                  className="rounded border-border"
                />
                <Label htmlFor="apply" className="text-sm">Appliquer les ajustements au stock</Label>
              </div>
              <div>
                <Label htmlFor="completion-notes">Notes (optionnel)</Label>
                <Textarea id="completion-notes" value={completionNotes} onChange={(e) => setCompletionNotes(e.target.value)} placeholder="Observations..." className="mt-1" />
              </div>
            </div>
            <AlertDialogFooter>
              <AlertDialogCancel disabled={completing}>Annuler</AlertDialogCancel>
              <Button onClick={handleComplete} disabled={completing}>
                {completing ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <CheckCircle2 className="h-4 w-4 mr-2" />} Finaliser
              </Button>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </main>
    </div>
  )
}
