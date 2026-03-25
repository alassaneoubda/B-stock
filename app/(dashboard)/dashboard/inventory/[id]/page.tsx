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
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogClose,
} from '@/components/ui/dialog'
import {
  ClipboardList, Loader2, CheckCircle2, AlertTriangle, Save, ArrowLeft,
  Download, Package, Box,
} from 'lucide-react'

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

function fmt(n: number) { return new Intl.NumberFormat('fr-FR', { minimumFractionDigits: 0 }).format(n) + ' FCFA' }

export default function InventoryDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const resolvedParams = use(params)
  const router = useRouter()
  const [session, setSession] = useState<InventorySession | null>(null)
  const [items, setItems] = useState<InventoryItem[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [completing, setCompleting] = useState(false)
  const [openComplete, setOpenComplete] = useState(false)
  const [applyAdjustments, setApplyAdjustments] = useState(true)
  const [completionNotes, setCompletionNotes] = useState('')

  const fetchData = useCallback(async () => {
    try {
      const res = await fetch(`/api/inventory/${resolvedParams.id}`)
      const json = await res.json()
      setSession(json.data?.session || null)
      setItems(json.data?.items || [])
    } catch (e) { console.error(e) }
    finally { setIsLoading(false) }
  }, [resolvedParams.id])

  useEffect(() => { fetchData() }, [fetchData])

  async function handleSave() {
    setSaving(true)
    try {
      await fetch(`/api/inventory/${resolvedParams.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          items: items.map(item => ({
            id: item.id,
            counted_quantity: item.counted_quantity,
            notes: item.notes,
          })),
        }),
      })
      fetchData()
    } finally { setSaving(false) }
  }

  async function handleComplete() {
    setCompleting(true)
    try {
      await fetch(`/api/inventory/${resolvedParams.id}/complete`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ apply_adjustments: applyAdjustments, notes: completionNotes }),
      })
      router.push('/dashboard/inventory')
    } finally { setCompleting(false) }
  }

  const itemsWithVariance = items.filter(i => i.counted_quantity != null && Number(i.counted_quantity) !== Number(i.system_quantity))
  const totalVarianceValue = itemsWithVariance.reduce((sum, i) => sum + Number(i.variance_value || 0), 0)

  if (isLoading) {
    return (
      <div className="flex flex-col min-h-screen bg-zinc-50/50">
        <DashboardHeader title="Inventaire" />
        <div className="flex-1 flex items-center justify-center"><Loader2 className="h-6 w-6 animate-spin text-zinc-400" /></div>
      </div>
    )
  }

  if (!session) {
    return (
      <div className="flex flex-col min-h-screen bg-zinc-50/50">
        <DashboardHeader title="Inventaire" />
        <div className="flex-1 flex items-center justify-center text-sm text-zinc-500">Inventaire introuvable</div>
      </div>
    )
  }

  return (
    <div className="flex flex-col min-h-screen bg-zinc-50/50">
      <DashboardHeader title={`Inventaire — ${session.session_number}`} />
      <main className="flex-1 p-4 lg:p-6 space-y-6 max-w-[1400px] mx-auto w-full">

        {/* Header */}
        <Card>
          <CardContent className="p-4 sm:p-6">
            <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
              <div className="flex items-center gap-3">
                <div className="h-10 w-10 rounded-lg bg-blue-100 flex items-center justify-center">
                  <ClipboardList className="h-5 w-5 text-blue-600" />
                </div>
                <div>
                  <p className="font-semibold text-zinc-950">{session.session_number}</p>
                  <p className="text-sm text-zinc-500">
                    {session.depot_name} — {session.inventory_type === 'full' ? 'Complet' : session.inventory_type === 'partial' ? 'Partiel' : 'Contrôle ponctuel'}
                  </p>
                  <p className="text-xs text-zinc-400">
                    Par {session.started_by_name} le {new Date(session.started_at).toLocaleDateString('fr-FR', { day: 'numeric', month: 'short', year: 'numeric' })}
                  </p>
                </div>
              </div>
              <div className="flex gap-2">
                {session.status === 'in_progress' && (
                  <>
                    <Button size="sm" variant="outline" onClick={handleSave} disabled={saving}>
                      {saving ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <Save className="h-4 w-4 mr-2" />} Sauvegarder
                    </Button>
                    <Button size="sm" onClick={() => setOpenComplete(true)} disabled={items.filter(i => i.counted_quantity != null).length === 0}>
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
              <div className="bg-white rounded-lg border p-3">
                <div className="text-xs text-zinc-500 mb-1">Total articles</div>
                <div className="text-lg font-bold text-zinc-950">{session.total_items}</div>
              </div>
              <div className="bg-white rounded-lg border p-3">
                <div className="text-xs text-zinc-500 mb-1">Comptés</div>
                <div className="text-lg font-bold text-blue-600">{items.filter(i => i.counted_quantity != null).length}</div>
              </div>
              <div className="bg-white rounded-lg border p-3">
                <div className="text-xs text-zinc-500 mb-1">Écarts</div>
                <div className="text-lg font-bold text-amber-600">{itemsWithVariance.length}</div>
              </div>
              <div className="bg-white rounded-lg border p-3">
                <div className="text-xs text-zinc-500 mb-1">Valeur écarts</div>
                <div className={`text-lg font-bold ${totalVarianceValue < 0 ? 'text-red-600' : 'text-emerald-600'}`}>
                  {fmt(totalVarianceValue)}
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
                        <Badge variant="outline" className={item.item_type === 'product' ? 'border-blue-200 text-blue-700' : 'border-purple-200 text-purple-700'}>
                          {item.item_type === 'product' ? 'Produit' : 'Emballage'}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-center text-sm">{item.system_quantity}</TableCell>
                      <TableCell className="text-center">
                        {session.status === 'in_progress' ? (
                          <Input
                            type="number"
                            value={item.counted_quantity || ''}
                            onChange={(e) => {
                              const newItems = items.map(i =>
                                i.id === item.id ? { ...i, counted_quantity: e.target.value ? Number(e.target.value) : null } : i
                              )
                              setItems(newItems)
                            }}
                            className="w-20 h-8 text-center text-sm"
                            placeholder="0"
                          />
                        ) : (
                          <span className="text-sm">{item.counted_quantity || '-'}</span>
                        )}
                      </TableCell>
                      <TableCell className={`text-center text-sm font-medium ${variance < 0 ? 'text-red-600' : variance > 0 ? 'text-emerald-600' : ''}`}>
                        {item.counted_quantity != null ? (variance > 0 ? '+' : '') + variance : '-'}
                      </TableCell>
                      <TableCell className={`text-right text-sm ${varianceValue < 0 ? 'text-red-600' : varianceValue > 0 ? 'text-emerald-600' : ''}`}>
                        {item.counted_quantity != null ? fmt(varianceValue) : '-'}
                      </TableCell>
                      <TableCell>
                        {session.status === 'in_progress' ? (
                          <Input
                            value={item.notes || ''}
                            onChange={(e) => {
                              const newItems = items.map(i =>
                                i.id === item.id ? { ...i, notes: e.target.value } : i
                              )
                              setItems(newItems)
                            }}
                            className="w-32 h-8 text-xs"
                            placeholder="Notes..."
                          />
                        ) : (
                          <span className="text-xs text-zinc-500">{item.notes || '-'}</span>
                        )}
                      </TableCell>
                    </TableRow>
                  )
                })}
              </TableBody>
            </Table>
          </CardContent>
        </Card>

        {/* Complete dialog */}
        <Dialog open={openComplete} onOpenChange={setOpenComplete}>
          <DialogContent>
            <DialogHeader><DialogTitle>Finaliser l'inventaire</DialogTitle></DialogHeader>
            <div className="space-y-4 py-4">
              <div className="bg-zinc-50 rounded-lg p-3 space-y-2 text-sm">
                <div className="flex justify-between"><span>Articles totaux</span><span className="font-medium">{session.total_items}</span></div>
                <div className="flex justify-between text-amber-600"><span>Écarts détectés</span><span className="font-medium">{itemsWithVariance.length}</span></div>
                <div className="flex justify-between"><span>Valeur totale écarts</span><span className={`font-medium ${totalVarianceValue < 0 ? 'text-red-600' : 'text-emerald-600'}`}>{fmt(totalVarianceValue)}</span></div>
              </div>
              <div className="flex items-center gap-2">
                <input
                  type="checkbox"
                  id="apply"
                  checked={applyAdjustments}
                  onChange={(e) => setApplyAdjustments(e.target.checked)}
                  className="rounded border-zinc-300"
                />
                <Label htmlFor="apply" className="text-sm">Appliquer les ajustements au stock</Label>
              </div>
              <div>
                <Label>Notes (optionnel)</Label>
                <Textarea value={completionNotes} onChange={(e) => setCompletionNotes(e.target.value)} placeholder="Observations..." className="mt-1" />
              </div>
            </div>
            <DialogFooter>
              <DialogClose asChild><Button variant="outline">Annuler</Button></DialogClose>
              <Button onClick={handleComplete} disabled={completing}>
                {completing ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <CheckCircle2 className="h-4 w-4 mr-2" />} Finaliser
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </main>
    </div>
  )
}
